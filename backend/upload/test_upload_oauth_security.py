import json
import os
import pickle
import stat
import tempfile
import threading
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

from google.oauth2.credentials import Credentials

from upload import upload_oauth


class DriveTokenSecurityTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        patches = mock.patch.multiple(
            upload_oauth,
            AUTH_DIR=self.directory.name,
            CLIENT_SECRET_FILE=os.path.join(self.directory.name, "client_secrets.json"),
            TOKEN_FILE=os.path.join(self.directory.name, "token.json"),
            LEGACY_TOKEN_FILE=os.path.join(self.directory.name, "token.pickle"),
            _drive_service=None,
            _auth_generation=0,
            _pending_auth_generation=None,
            _pending_auth_started=False,
            create=True,
        )
        patches.start()
        self.addCleanup(patches.stop)

    def credentials(self):
        return Credentials(
            token="access-token",
            refresh_token="refresh-token",
            token_uri="https://oauth2.googleapis.com/token",
            client_id="client-id",
            client_secret="client-secret",
            scopes=upload_oauth.SCOPES,
            expiry=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=1),
        )

    def test_credentials_are_saved_as_restricted_json(self):
        os.chmod(upload_oauth.AUTH_DIR, 0o755)
        with open(upload_oauth.CLIENT_SECRET_FILE, "w", encoding="utf-8") as config:
            config.write("{}")
        os.chmod(upload_oauth.CLIENT_SECRET_FILE, 0o644)

        upload_oauth.save_credentials(self.credentials())

        with open(upload_oauth.TOKEN_FILE, "r", encoding="utf-8") as token:
            payload = json.load(token)

        self.assertEqual(payload["refresh_token"], "refresh-token")
        self.assertEqual(
            stat.S_IMODE(os.stat(upload_oauth.TOKEN_FILE).st_mode),
            stat.S_IRUSR | stat.S_IWUSR,
        )
        self.assertEqual(stat.S_IMODE(os.stat(upload_oauth.AUTH_DIR).st_mode), 0o700)
        self.assertEqual(
            stat.S_IMODE(os.stat(upload_oauth.CLIENT_SECRET_FILE).st_mode),
            0o600,
        )
        self.assertEqual(
            upload_oauth.load_saved_credentials().refresh_token,
            "refresh-token",
        )

    def test_legacy_pickle_is_never_deserialized(self):
        with open(upload_oauth.LEGACY_TOKEN_FILE, "wb") as token:
            token.write(b"not a safe pickle")

        self.assertIsNone(upload_oauth.load_saved_credentials())
        status = upload_oauth.get_drive_auth_status()
        self.assertFalse(status["token_exists"])
        self.assertTrue(status.get("legacy_token_requires_login"))

    def test_successful_json_save_removes_legacy_pickle(self):
        with open(upload_oauth.LEGACY_TOKEN_FILE, "wb") as token:
            token.write(b"legacy")

        upload_oauth.save_credentials(self.credentials())

        self.assertFalse(os.path.exists(upload_oauth.LEGACY_TOKEN_FILE))

    def test_pickle_data_in_json_token_is_never_deserialized(self):
        sentinel = os.path.join(self.directory.name, "pickle-executed")

        class LegacyToken:
            def __reduce__(self):
                return os.mkdir, (sentinel,)

        with open(upload_oauth.TOKEN_FILE, "wb") as token:
            token.write(pickle.dumps(LegacyToken()))

        self.assertIsNone(upload_oauth.load_saved_credentials())
        self.assertFalse(os.path.exists(sentinel))

    def test_failed_save_keeps_existing_credentials_and_legacy_file(self):
        with open(upload_oauth.TOKEN_FILE, "w", encoding="utf-8") as token:
            token.write(self.credentials().to_json())
        with open(upload_oauth.LEGACY_TOKEN_FILE, "wb") as token:
            token.write(b"legacy")
        new_credentials = self.credentials()
        new_credentials.token = "new-access-token"

        with mock.patch.object(upload_oauth.os, "replace", side_effect=OSError("disk error")):
            with self.assertRaises(OSError):
                upload_oauth.save_credentials(new_credentials)

        self.assertEqual(upload_oauth.load_saved_credentials().token, "access-token")
        self.assertTrue(os.path.exists(upload_oauth.LEGACY_TOKEN_FILE))
        self.assertEqual(sorted(os.listdir(self.directory.name)), ["token.json", "token.pickle"])

    def test_invalid_json_credentials_require_login(self):
        for contents in ("not json", "[]", "{}"):
            with self.subTest(contents=contents):
                with open(upload_oauth.TOKEN_FILE, "w", encoding="utf-8") as token:
                    token.write(contents)

                self.assertIsNone(upload_oauth.load_saved_credentials())
                self.assertFalse(upload_oauth.get_drive_auth_status()["valid"])

    def test_force_login_persists_json_and_invalidates_cached_service(self):
        upload_oauth._drive_service = object()
        with mock.patch.object(upload_oauth.InstalledAppFlow, "from_client_secrets_file") as make_flow:
            make_flow.return_value.run_local_server.return_value = self.credentials()

            upload_oauth.force_drive_login()

        self.assertIsNone(upload_oauth._drive_service)
        self.assertEqual(upload_oauth.load_saved_credentials().token, "access-token")
        with open(upload_oauth.TOKEN_FILE, "rb") as token:
            contents = token.read()
        self.assertTrue(contents.startswith(b"{"), "credentials must use JSON")
        self.assertEqual(json.loads(contents)["refresh_token"], "refresh-token")

    def test_first_service_login_persists_json(self):
        service = object()
        with (
            mock.patch.object(upload_oauth.InstalledAppFlow, "from_client_secrets_file") as make_flow,
            mock.patch.object(upload_oauth, "build", return_value=service),
        ):
            make_flow.return_value.run_local_server.return_value = self.credentials()

            self.assertIs(upload_oauth.get_drive_service(), service)

        self.assertEqual(upload_oauth.load_saved_credentials().token, "access-token")
        with open(upload_oauth.TOKEN_FILE, "rb") as token:
            contents = token.read()
        self.assertTrue(contents.startswith(b"{"), "credentials must use JSON")
        self.assertEqual(json.loads(contents)["refresh_token"], "refresh-token")

    def test_refreshed_service_credentials_are_persisted_as_json(self):
        credentials = self.credentials()
        credentials.expiry -= timedelta(hours=2)
        with open(upload_oauth.TOKEN_FILE, "w", encoding="utf-8") as token:
            token.write(credentials.to_json())

        def refresh(creds, request):
            creds.token = "refreshed-access-token"
            creds.expiry = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=1)

        with (
            mock.patch.object(Credentials, "refresh", autospec=True, side_effect=refresh),
            mock.patch.object(
                upload_oauth.InstalledAppFlow,
                "from_client_secrets_file",
                side_effect=AssertionError("refreshable credentials must not open OAuth login"),
            ),
            mock.patch.object(upload_oauth, "build", return_value=object()),
        ):
            upload_oauth.get_drive_service()

        self.assertEqual(upload_oauth.load_saved_credentials().token, "refreshed-access-token")

    def start_background(self, callback):
        results, errors = [], []
        finished = threading.Event()

        def run():
            try:
                results.append(callback())
            except Exception as error:
                errors.append(error)
            finally:
                finished.set()

        thread = threading.Thread(target=run, daemon=True)
        thread.start()
        return thread, finished, results, errors

    def paused_result(self, result):
        started, release = threading.Event(), threading.Event()

        def wait(*args, **kwargs):
            started.set()
            if not release.wait(timeout=3):
                raise AssertionError("test did not release the paused Google operation")
            return result

        return wait, started, release

    def assert_logout_cancels_paused_call(self, operation, started, release):
        login, login_finished, _, login_errors = self.start_background(operation)
        logout = None
        try:
            self.assertTrue(started.wait(timeout=1), "Google operation did not start")
            logout, logout_finished, logout_results, logout_errors = self.start_background(
                upload_oauth.remove_drive_token
            )
            self.assertTrue(
                logout_finished.wait(timeout=1),
                "logout must finish while the Google operation is still waiting",
            )
        finally:
            release.set()
            login.join(timeout=2)
            if logout is not None:
                logout.join(timeout=2)

        self.assertTrue(login_finished.is_set())
        self.assertEqual(logout_results, [True])
        self.assertEqual(logout_errors, [])
        self.assertEqual(len(login_errors), 1)
        self.assertIsInstance(login_errors[0], upload_oauth.DriveUploadError)
        self.assertFalse(login_errors[0].retryable)
        self.assertFalse(os.path.exists(upload_oauth.TOKEN_FILE))
        self.assertIsNone(upload_oauth._drive_service)

    def test_logout_cancels_pending_force_login_without_waiting_for_browser(self):
        wait, started, release = self.paused_result(self.credentials())
        with mock.patch.object(upload_oauth.InstalledAppFlow, "from_client_secrets_file") as make_flow:
            make_flow.return_value.run_local_server.side_effect = wait

            self.assert_logout_cancels_paused_call(upload_oauth.force_drive_login, started, release)

    def test_logout_cancels_pending_initial_service_login(self):
        wait, started, release = self.paused_result(self.credentials())
        with (
            mock.patch.object(upload_oauth.InstalledAppFlow, "from_client_secrets_file") as make_flow,
            mock.patch.object(upload_oauth, "build", return_value=object()),
        ):
            make_flow.return_value.run_local_server.side_effect = wait

            self.assert_logout_cancels_paused_call(upload_oauth.get_drive_service, started, release)

    def test_logout_cancels_pending_service_build(self):
        upload_oauth.save_credentials(self.credentials())
        wait, started, release = self.paused_result(object())
        with mock.patch.object(upload_oauth, "build", side_effect=wait):
            self.assert_logout_cancels_paused_call(upload_oauth.get_drive_service, started, release)

    def test_new_force_login_supersedes_pending_browser_result(self):
        old_credentials, new_credentials = self.credentials(), self.credentials()
        old_credentials.token = "old-login-token"
        new_credentials.token = "new-login-token"
        wait, started, release = self.paused_result(old_credentials)
        old_flow, new_flow = mock.Mock(), mock.Mock()
        old_flow.run_local_server.side_effect = wait
        new_flow.run_local_server.return_value = new_credentials

        with mock.patch.object(
            upload_oauth.InstalledAppFlow,
            "from_client_secrets_file",
            side_effect=[old_flow, new_flow],
        ):
            old_login, _, _, old_errors = self.start_background(upload_oauth.force_drive_login)
            new_login = None
            try:
                self.assertTrue(started.wait(timeout=1))
                new_login, new_finished, _, new_errors = self.start_background(
                    upload_oauth.force_drive_login
                )
                self.assertTrue(
                    new_finished.wait(timeout=1),
                    "a new login must not wait for the superseded browser flow",
                )
            finally:
                release.set()
                old_login.join(timeout=2)
                if new_login is not None:
                    new_login.join(timeout=2)

        self.assertEqual(new_errors, [])
        self.assertEqual(len(old_errors), 1)
        self.assertIsInstance(old_errors[0], upload_oauth.DriveUploadError)
        self.assertEqual(upload_oauth.load_saved_credentials().token, "new-login-token")

    def test_service_helper_does_not_open_oauth_during_forced_login(self):
        forced_credentials, implicit_credentials = self.credentials(), self.credentials()
        forced_credentials.token = "forced-account"
        implicit_credentials.token = "worker-account"
        wait, started, release = self.paused_result(forced_credentials)
        forced_flow, implicit_flow = mock.Mock(), mock.Mock()
        forced_flow.run_local_server.side_effect = wait
        implicit_flow.run_local_server.return_value = implicit_credentials
        service = object()

        with (
            mock.patch.object(
                upload_oauth.InstalledAppFlow,
                "from_client_secrets_file",
                side_effect=[forced_flow, implicit_flow],
            ),
            mock.patch.object(upload_oauth, "build", return_value=service),
        ):
            login, finished, _, errors = self.start_background(upload_oauth.force_drive_login)
            try:
                self.assertTrue(started.wait(timeout=1))
                with self.assertRaises(upload_oauth.DriveUploadError) as raised:
                    upload_oauth.get_drive_service()
                self.assertTrue(raised.exception.retryable)
                self.assertFalse(os.path.exists(upload_oauth.TOKEN_FILE))
            finally:
                release.set()
                login.join(timeout=2)

            self.assertTrue(finished.is_set())
            self.assertEqual(errors, [])
            self.assertIs(upload_oauth.get_drive_service(), service)

        self.assertEqual(upload_oauth.load_saved_credentials().token, "forced-account")

    def test_service_helper_rejects_implicit_login_before_reserved_worker_starts(self):
        generation = upload_oauth.reserve_drive_login()
        with (
            mock.patch.object(upload_oauth.InstalledAppFlow, "from_client_secrets_file") as make_flow,
            mock.patch.object(upload_oauth, "build", return_value=object()),
        ):
            make_flow.return_value.run_local_server.return_value = self.credentials()
            with self.assertRaises(upload_oauth.DriveUploadError) as raised:
                upload_oauth.get_drive_service()
            self.assertTrue(raised.exception.retryable)
            self.assertFalse(os.path.exists(upload_oauth.TOKEN_FILE))

            upload_oauth.force_drive_login(expected_generation=generation)

        self.assertEqual(upload_oauth.load_saved_credentials().token, "access-token")

    def test_only_one_initial_service_login_runs_at_a_time(self):
        first_credentials, second_credentials = self.credentials(), self.credentials()
        first_credentials.token = "first-account"
        second_credentials.token = "second-account"
        wait, started, release = self.paused_result(first_credentials)
        first_flow, second_flow = mock.Mock(), mock.Mock()
        first_flow.run_local_server.side_effect = wait
        second_flow.run_local_server.return_value = second_credentials
        service = object()

        with (
            mock.patch.object(
                upload_oauth.InstalledAppFlow,
                "from_client_secrets_file",
                side_effect=[first_flow, second_flow],
            ),
            mock.patch.object(upload_oauth, "build", return_value=service),
        ):
            login, finished, results, errors = self.start_background(upload_oauth.get_drive_service)
            try:
                self.assertTrue(started.wait(timeout=1))
                with self.assertRaises(upload_oauth.DriveUploadError) as raised:
                    upload_oauth.get_drive_service()
                self.assertTrue(raised.exception.retryable)
                self.assertFalse(os.path.exists(upload_oauth.TOKEN_FILE))
            finally:
                release.set()
                login.join(timeout=2)

            self.assertTrue(finished.is_set())
            self.assertEqual(errors, [])
            self.assertEqual(results, [service])
            self.assertIs(upload_oauth.get_drive_service(), service)

        self.assertEqual(upload_oauth.load_saved_credentials().token, "first-account")

    def test_failed_force_login_allows_a_later_service_login(self):
        service = object()
        with (
            mock.patch.object(upload_oauth.InstalledAppFlow, "from_client_secrets_file") as make_flow,
            mock.patch.object(upload_oauth, "build", return_value=service),
        ):
            make_flow.return_value.run_local_server.side_effect = [
                RuntimeError("browser failed"), self.credentials()
            ]
            with self.assertRaisesRegex(RuntimeError, "browser failed"):
                upload_oauth.force_drive_login()

            self.assertIs(upload_oauth.get_drive_service(), service)

        self.assertEqual(upload_oauth.load_saved_credentials().token, "access-token")

    def test_failed_service_login_allows_a_later_attempt(self):
        service = object()
        with (
            mock.patch.object(upload_oauth.InstalledAppFlow, "from_client_secrets_file") as make_flow,
            mock.patch.object(upload_oauth, "build", return_value=service),
        ):
            make_flow.return_value.run_local_server.side_effect = [
                RuntimeError("browser failed"), self.credentials()
            ]
            with self.assertRaisesRegex(RuntimeError, "browser failed"):
                upload_oauth.get_drive_service()

            self.assertIs(upload_oauth.get_drive_service(), service)

        self.assertEqual(upload_oauth.load_saved_credentials().token, "access-token")

    def test_superseded_worker_does_not_clear_the_new_login_reservation(self):
        old_wait, old_started, old_release = self.paused_result(self.credentials())
        new_credentials = self.credentials()
        new_credentials.token = "new-account"
        new_wait, new_started, new_release = self.paused_result(new_credentials)
        old_flow, new_flow, implicit_flow = mock.Mock(), mock.Mock(), mock.Mock()
        old_flow.run_local_server.side_effect = old_wait
        new_flow.run_local_server.side_effect = new_wait
        implicit_flow.run_local_server.return_value = self.credentials()

        with (
            mock.patch.object(
                upload_oauth.InstalledAppFlow,
                "from_client_secrets_file",
                side_effect=[old_flow, new_flow, implicit_flow],
            ),
            mock.patch.object(upload_oauth, "build", return_value=object()),
        ):
            old_login, old_finished, _, old_errors = self.start_background(upload_oauth.force_drive_login)
            new_login = None
            try:
                self.assertTrue(old_started.wait(timeout=1))
                new_login, new_finished, _, new_errors = self.start_background(upload_oauth.force_drive_login)
                self.assertTrue(new_started.wait(timeout=1))
                old_release.set()
                self.assertTrue(old_finished.wait(timeout=1))
                with self.assertRaises(upload_oauth.DriveUploadError) as raised:
                    upload_oauth.get_drive_service()
                self.assertTrue(raised.exception.retryable)
                self.assertFalse(os.path.exists(upload_oauth.TOKEN_FILE))
            finally:
                old_release.set()
                new_release.set()
                old_login.join(timeout=2)
                if new_login is not None:
                    new_login.join(timeout=2)

        self.assertTrue(new_finished.is_set())
        self.assertEqual(len(old_errors), 1)
        self.assertIsInstance(old_errors[0], upload_oauth.DriveUploadError)
        self.assertEqual(new_errors, [])
        self.assertEqual(upload_oauth.load_saved_credentials().token, "new-account")

    def assert_reserved_login_invalidated(self, invalidate):
        upload_oauth.save_credentials(self.credentials())
        generation = upload_oauth.reserve_drive_login()
        self.assertFalse(os.path.exists(upload_oauth.TOKEN_FILE))
        invalidate()

        with mock.patch.object(
            upload_oauth.InstalledAppFlow,
            "from_client_secrets_file",
            side_effect=AssertionError("cancelled reservation must not open OAuth"),
        ):
            with self.assertRaises(upload_oauth.DriveUploadError) as raised:
                upload_oauth.force_drive_login(expected_generation=generation)

        self.assertFalse(raised.exception.retryable)
        self.assertFalse(os.path.exists(upload_oauth.TOKEN_FILE))
        self.assertIsNone(upload_oauth._drive_service)

    def test_logout_invalidates_reserved_login_before_worker_starts(self):
        self.assert_reserved_login_invalidated(upload_oauth.remove_drive_token)

    def test_new_reservation_supersedes_login_before_worker_starts(self):
        self.assert_reserved_login_invalidated(upload_oauth.reserve_drive_login)

    def test_logout_removes_both_token_formats_and_cached_service(self):
        for path in (upload_oauth.TOKEN_FILE, upload_oauth.LEGACY_TOKEN_FILE):
            with open(path, "w", encoding="utf-8") as token:
                token.write("credentials")
        upload_oauth._drive_service = object()

        self.assertTrue(upload_oauth.remove_drive_token())

        self.assertFalse(os.path.exists(upload_oauth.TOKEN_FILE))
        self.assertFalse(os.path.exists(upload_oauth.LEGACY_TOKEN_FILE))
        self.assertIsNone(upload_oauth._drive_service)

    def test_logout_without_token_still_clears_cached_service(self):
        upload_oauth._drive_service = object()

        self.assertTrue(upload_oauth.remove_drive_token())

        self.assertIsNone(upload_oauth._drive_service)


if __name__ == "__main__":
    unittest.main()
