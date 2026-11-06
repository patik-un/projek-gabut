import json
import os
import subprocess
import sys
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from detect import detect


CHILD_AUTO_WATCH_ACTION = """
import json
import os
import sys
from detect import detect

config_path, action, image_path, status_path, result_path = sys.argv[1:]
detect.AUTO_WATCH_CONFIG_FILE = config_path
targets = []

def process_image(path, drive_folder_id=None, source=None):
    targets.append(drive_folder_id)
    return 202

detect.process_image = process_image
detect.process_auto_watch_file = lambda path, drive_folder_id=None: targets.append(drive_folder_id)

if action in ('register', 'commit'):
    suffix = '.commit.lock' if action == 'commit' else '.lock'
    with open(config_path + suffix, 'a+b') as lock_file:
        if os.name == 'nt':
            import msvcrt
            if lock_file.tell() == 0:
                lock_file.write(b'0')
                lock_file.flush()
            lock_file.seek(0)
            try:
                msvcrt.locking(lock_file.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError:
                blocked = True
            else:
                blocked = False
                msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            try:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                blocked = True
            else:
                blocked = False
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
    if blocked:
        with open(status_path, 'w') as status:
            status.write('blocked')

if action == 'register':
    result = detect.register_auto_watch_file(image_path)
elif action == 'commit':
    result = detect.commit_pending_auto_watch_files()
else:
    detect.set_auto_watch_drive_folder('DRIVE_B')
    result = detect.disable_auto_watch_folder()

with open(result_path, 'w') as output:
    json.dump({'result': result, 'targets': targets}, output)
with open(status_path, 'w') as status:
    status.write('done')
"""


class AutoWatchConfigTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.original_config_path = detect.AUTO_WATCH_CONFIG_FILE
        detect.AUTO_WATCH_CONFIG_FILE = os.path.join(
            self.directory.name,
            "database",
            "auto_watch.json",
        )
        self.addCleanup(self.restore_config_path)
        self.child_processes = []

    def start_child_action(self, action, image_path=""):
        child_index = len(self.child_processes)
        status_path = os.path.join(self.directory.name, f"child-{child_index}.status")
        result_path = os.path.join(self.directory.name, f"child-{child_index}.json")
        process = subprocess.Popen(
            [
                sys.executable,
                "-c",
                CHILD_AUTO_WATCH_ACTION,
                detect.AUTO_WATCH_CONFIG_FILE,
                action,
                image_path,
                status_path,
                result_path,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=os.path.dirname(os.path.dirname(detect.__file__)),
        )
        child = (process, status_path, result_path)
        self.child_processes.append(child)
        self.addCleanup(self.stop_child_process, process)
        return child

    def stop_child_process(self, process):
        if process.poll() is None:
            process.kill()
        process.communicate()

    def wait_for_child_progress(self, child):
        process, status_path, _ = child
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if os.path.exists(status_path):
                with open(status_path) as status:
                    if status.read() in ("blocked", "done"):
                        return
            if process.poll() is not None:
                _, error = process.communicate()
                self.fail(f"Child exited before reporting progress: {error}")
            time.sleep(0.005)
        self.fail("Child did not reach the concurrent config operation")

    def finish_child_action(self, child):
        process, _, result_path = child
        _, error = process.communicate(timeout=5)
        self.assertEqual(process.returncode, 0, error)
        with open(result_path) as result:
            return json.load(result)

    def restore_config_path(self):
        detect.AUTO_WATCH_CONFIG_FILE = self.original_config_path

    def make_watch_folder(self, name):
        path = os.path.join(self.directory.name, name)
        os.makedirs(path, exist_ok=True)
        return path

    def touch_image(self, folder, name):
        path = os.path.join(folder, name)
        with open(path, "wb") as image:
            image.write(b"image")
        return path

    def test_disable_preserves_pending_and_blocks_new_files_until_reenabled(self):
        folder = self.make_watch_folder("watch")
        self.touch_image(folder, "before-disable.jpg")

        active = detect.set_auto_watch_folder(folder, drive_folder_id="DRIVE_A")

        self.assertTrue(active["enabled"])
        self.assertEqual(active["drive_folder_id"], "DRIVE_A")
        self.assertEqual(len(active["pending_files"]), 1)

        disabled = detect.disable_auto_watch_folder()

        self.assertFalse(disabled["enabled"])
        self.assertFalse(disabled["auto_upload_enabled"])
        self.assertEqual(disabled["drive_folder_id"], "DRIVE_A")
        self.assertEqual(len(disabled["pending_files"]), 1)

        self.touch_image(folder, "after-disable.jpg")
        unchanged = detect.reconcile_auto_watch_folder()

        self.assertFalse(unchanged["enabled"])
        self.assertEqual(len(unchanged["pending_files"]), 1)

        updated_drive = detect.set_auto_watch_drive_folder("DRIVE_B")

        self.assertFalse(updated_drive["enabled"])
        self.assertFalse(updated_drive["auto_upload_enabled"])
        self.assertEqual(updated_drive["drive_folder_id"], "DRIVE_B")
        self.assertEqual(
            [item["name"] for item in updated_drive["pending_files"]],
            ["before-disable.jpg"],
        )
        self.assertEqual(detect.load_auto_watch_config(), updated_drive)

        next_folder = self.make_watch_folder("next-watch")
        reenabled = detect.set_auto_watch_folder(
            next_folder,
            drive_folder_id="DRIVE_C",
        )

        self.assertTrue(reenabled["enabled"])
        self.assertEqual(reenabled["folder_path"], next_folder)
        self.assertEqual(reenabled["drive_folder_id"], "DRIVE_C")

    def test_drive_folder_update_preserves_active_upload_and_file_tracking(self):
        folder = self.make_watch_folder("watch")
        known_path = self.touch_image(folder, "known.jpg")
        pending_path = self.touch_image(folder, "pending.jpg")
        detect.save_auto_watch_config(
            folder,
            drive_folder_id="DRIVE_A",
            enabled=True,
            auto_upload_enabled=True,
            known_files=[known_path],
            pending_files=[{"path": pending_path}],
        )
        self.touch_image(folder, "unregistered.jpg")

        updated = detect.set_auto_watch_drive_folder("  DRIVE_B  ")

        self.assertEqual(updated["drive_folder_id"], "DRIVE_B")
        self.assertEqual(updated["folder_path"], folder)
        self.assertTrue(updated["enabled"])
        self.assertTrue(updated["auto_upload_enabled"])
        self.assertEqual(updated["known_files"], [known_path])
        self.assertEqual(
            [item["path"] for item in updated["pending_files"]],
            [pending_path],
        )
        self.assertEqual(detect.load_auto_watch_config(), updated)

    def test_drive_folder_can_be_cleared_without_enabling_a_watcher(self):
        for empty_value in (None, "", "  "):
            with self.subTest(drive_folder_id=empty_value):
                detect.set_auto_watch_drive_folder("DRIVE_A")

                updated = detect.set_auto_watch_drive_folder(empty_value)

                self.assertEqual(updated["drive_folder_id"], "")
                self.assertEqual(updated["folder_path"], "")
                self.assertFalse(updated["enabled"])
                self.assertFalse(updated["auto_upload_enabled"])
                self.assertEqual(detect.load_auto_watch_config(), updated)

    def test_committed_initial_files_are_not_processed_again_on_reconciliation(self):
        folder = self.make_watch_folder("watch")
        image_path = self.touch_image(folder, "initial.jpg")
        detect.set_auto_watch_folder(folder, drive_folder_id="DRIVE_A")

        def process_pending_image(path, drive_folder_id, source):
            self.assertEqual(path, image_path)
            self.assertEqual(drive_folder_id, "DRIVE_A")
            self.assertEqual(source, "auto_upload")
            detect.reconcile_auto_watch_folder()
            return 101

        with patch.object(
            detect,
            "process_auto_watch_file",
            side_effect=AssertionError("Committed file was processed again"),
        ), patch.object(detect, "process_image", side_effect=process_pending_image):
            committed = detect.commit_pending_auto_watch_files()
            reconciled = detect.reconcile_auto_watch_folder()

        self.assertEqual(committed["queue_ids"], [101])
        self.assertEqual(reconciled["known_files"], [image_path])
        self.assertEqual(reconciled["pending_files"], [])
        self.assertTrue(reconciled["auto_upload_enabled"])

    def test_failed_pending_file_can_be_retried_without_reprocessing_successes(self):
        folder = self.make_watch_folder("watch")
        successful_path = self.touch_image(folder, "success.jpg")
        failed_path = self.touch_image(folder, "failed.jpg")
        detect.set_auto_watch_folder(folder, drive_folder_id="DRIVE_A")

        def process_first_attempt(path, drive_folder_id, source):
            self.assertEqual(drive_folder_id, "DRIVE_A")
            self.assertEqual(source, "auto_upload")
            return 101 if path == successful_path else None

        with patch.object(detect, "process_image", side_effect=process_first_attempt):
            first_commit = detect.commit_pending_auto_watch_files()

        after_failure = detect.load_auto_watch_config()
        self.assertEqual(first_commit["queue_ids"], [101])
        self.assertEqual(after_failure["known_files"], [successful_path])
        self.assertEqual(
            [item["path"] for item in after_failure["pending_files"]],
            [failed_path],
        )

        with patch.object(detect, "process_image", return_value=102):
            retried = detect.commit_pending_auto_watch_files()

        self.assertEqual(retried["queue_ids"], [102])
        self.assertEqual(
            [item["path"] for item in retried["files"]],
            [failed_path],
        )
        after_retry = detect.load_auto_watch_config()
        self.assertEqual(
            set(after_retry["known_files"]),
            {successful_path, failed_path},
        )
        self.assertEqual(after_retry["pending_files"], [])

    def test_commit_preserves_drive_change_and_disable_during_processing(self):
        folder = self.make_watch_folder("watch")
        image_path = self.touch_image(folder, "initial.jpg")
        detect.set_auto_watch_folder(folder, drive_folder_id="DRIVE_A")

        def process_with_settings_change(path, drive_folder_id, source):
            self.assertEqual(path, image_path)
            self.assertEqual(drive_folder_id, "DRIVE_A")
            self.assertEqual(source, "auto_upload")
            detect.set_auto_watch_drive_folder("DRIVE_B")
            detect.disable_auto_watch_folder()
            return 101

        with patch.object(
            detect,
            "process_image",
            side_effect=process_with_settings_change,
        ):
            detect.commit_pending_auto_watch_files()

        after_commit = detect.load_auto_watch_config()
        self.assertFalse(after_commit["enabled"])
        self.assertFalse(after_commit["auto_upload_enabled"])
        self.assertEqual(after_commit["drive_folder_id"], "DRIVE_B")
        self.assertEqual(after_commit["known_files"], [image_path])
        self.assertEqual(after_commit["pending_files"], [])

    def test_commit_does_not_add_old_files_to_a_replacement_watch_folder(self):
        folder = self.make_watch_folder("watch")
        self.touch_image(folder, "initial.jpg")
        next_folder = self.make_watch_folder("next-watch")
        next_image_path = self.touch_image(next_folder, "next.jpg")
        detect.set_auto_watch_folder(folder, drive_folder_id="DRIVE_A")

        def process_with_folder_change(path, drive_folder_id, source):
            detect.set_auto_watch_folder(next_folder, drive_folder_id="DRIVE_B")
            return 101

        with patch.object(
            detect,
            "process_image",
            side_effect=process_with_folder_change,
        ):
            committed = detect.commit_pending_auto_watch_files()

        self.assertEqual(committed["queue_ids"], [101])
        after_commit = detect.load_auto_watch_config()
        self.assertEqual(after_commit["folder_path"], next_folder)
        self.assertEqual(after_commit["drive_folder_id"], "DRIVE_B")
        self.assertTrue(after_commit["enabled"])
        self.assertFalse(after_commit["auto_upload_enabled"])
        self.assertEqual(after_commit["known_files"], [])
        self.assertEqual(
            [item["path"] for item in after_commit["pending_files"]],
            [next_image_path],
        )

    def test_drive_update_and_other_process_registration_preserve_tracking(self):
        folder = self.make_watch_folder("watch")
        detect.save_auto_watch_config(
            folder,
            drive_folder_id="DRIVE_A",
            auto_upload_enabled=True,
        )
        image_path = self.touch_image(folder, "new.jpg")
        original_load = detect.load_auto_watch_config
        children = []

        def register_after_snapshot():
            config = original_load()
            if not children:
                children.append(self.start_child_action("register", image_path))
                self.wait_for_child_progress(children[0])
            return config

        with patch.object(detect, "load_auto_watch_config", side_effect=register_after_snapshot):
            detect.set_auto_watch_drive_folder("DRIVE_B")

        child_result = self.finish_child_action(children[0])
        targets = child_result["targets"]
        with patch.object(
            detect,
            "process_auto_watch_file",
            side_effect=lambda path, drive_folder_id=None: targets.append(drive_folder_id),
        ):
            reconciled = detect.reconcile_auto_watch_folder()

        self.assertEqual(targets, ["DRIVE_B"])
        self.assertEqual(reconciled["known_files"], [image_path])
        self.assertEqual(reconciled["drive_folder_id"], "DRIVE_B")

    def test_commit_completion_preserves_other_process_registration(self):
        folder = self.make_watch_folder("watch")
        initial_path = self.touch_image(folder, "initial.jpg")
        detect.set_auto_watch_folder(folder, drive_folder_id="DRIVE_A")
        new_path = self.touch_image(folder, "new.jpg")
        original_load = detect.load_auto_watch_config
        read_count = 0
        children = []

        def register_after_completion_snapshot():
            nonlocal read_count
            config = original_load()
            read_count += 1
            if read_count == 2:
                children.append(self.start_child_action("register", new_path))
                self.wait_for_child_progress(children[0])
            return config

        with patch.object(
            detect, "load_auto_watch_config", side_effect=register_after_completion_snapshot
        ), patch.object(detect, "process_image", return_value=101):
            detect.commit_pending_auto_watch_files()

        child_result = self.finish_child_action(children[0])
        targets = child_result["targets"]
        with patch.object(
            detect,
            "process_auto_watch_file",
            side_effect=lambda path, drive_folder_id=None: targets.append(drive_folder_id),
        ):
            reconciled = detect.reconcile_auto_watch_folder()

        self.assertEqual(targets, ["DRIVE_A"])
        self.assertEqual(set(reconciled["known_files"]), {initial_path, new_path})
        self.assertEqual(reconciled["pending_files"], [])

    def test_concurrent_process_commits_submit_once_and_allow_settings_updates(self):
        folder = self.make_watch_folder("watch")
        image_path = self.touch_image(folder, "initial.jpg")
        detect.set_auto_watch_folder(folder, drive_folder_id="DRIVE_A")
        competing_commits = []

        def process_while_other_processes_update(path, drive_folder_id, source):
            self.assertEqual(path, image_path)
            self.assertEqual(drive_folder_id, "DRIVE_A")
            self.assertEqual(source, "auto_upload")
            competing_commits.append(self.start_child_action("commit"))
            self.wait_for_child_progress(competing_commits[0])
            settings_update = self.start_child_action("settings")
            self.finish_child_action(settings_update)
            return 101

        with patch.object(
            detect,
            "process_image",
            side_effect=process_while_other_processes_update,
        ):
            committed = detect.commit_pending_auto_watch_files()

        competing_result = self.finish_child_action(competing_commits[0])
        self.assertEqual(committed["queue_ids"], [101])
        self.assertEqual(competing_result["result"]["queue_ids"], [])
        self.assertEqual(competing_result["targets"], [])
        config = detect.load_auto_watch_config()
        self.assertEqual(config["known_files"], [image_path])
        self.assertEqual(config["pending_files"], [])
        self.assertEqual(config["drive_folder_id"], "DRIVE_B")
        self.assertFalse(config["enabled"])
        self.assertFalse(config["auto_upload_enabled"])

    def test_folder_change_during_readiness_does_not_process_the_old_folder_file(self):
        first_folder = self.make_watch_folder("first")
        second_folder = self.make_watch_folder("second")
        detect.set_auto_watch_folder(first_folder, drive_folder_id="DRIVE_A")
        old_path = self.touch_image(first_folder, "late.jpg")
        known_path = self.touch_image(second_folder, "known.jpg")
        pending_path = self.touch_image(second_folder, "pending.jpg")

        def change_folder_while_waiting(path, timeout):
            self.assertEqual(path, old_path)
            detect.save_auto_watch_config(
                second_folder,
                drive_folder_id="DRIVE_B",
                auto_upload_enabled=True,
                known_files=[known_path],
                pending_files=[{"path": pending_path}],
            )
            return True

        with patch.object(
            detect, "wait_until_file_ready", side_effect=change_folder_while_waiting
        ), patch.object(
            detect,
            "process_auto_watch_file",
            side_effect=AssertionError("Old folder file was uploaded to the new target"),
        ):
            registered = detect.register_auto_watch_file(old_path, wait_ready=True)

        self.assertEqual(registered["folder_path"], second_folder)
        self.assertEqual(registered["drive_folder_id"], "DRIVE_B")
        self.assertEqual(registered["known_files"], [known_path])
        self.assertEqual(
            [item["path"] for item in registered["pending_files"]],
            [pending_path],
        )

    def test_stale_observer_callback_does_not_add_old_folder_file_to_pending(self):
        first_folder = self.make_watch_folder("first")
        second_folder = self.make_watch_folder("second")
        old_path = self.touch_image(first_folder, "late.jpg")
        current_path = self.touch_image(second_folder, "current.jpg")
        detect.set_auto_watch_folder(second_folder, drive_folder_id="DRIVE_B")
        handler = detect.NewFileHandler(source="auto_upload", drive_folder_id="DRIVE_A")

        with patch.object(detect, "wait_until_file_ready", return_value=True), patch("builtins.print"):
            handler.on_created(SimpleNamespace(is_directory=False, src_path=old_path))

        registered = detect.load_auto_watch_config()
        self.assertEqual(registered["known_files"], [])
        self.assertEqual(
            [item["path"] for item in registered["pending_files"]],
            [current_path],
        )

    def test_registration_accepts_only_normalized_direct_children_of_current_folder(self):
        folder = self.make_watch_folder("watch folder")
        nested_folder = self.make_watch_folder(os.path.join("watch folder", "child"))
        prefix_folder = self.make_watch_folder("watch folder-other")
        direct_path = self.touch_image(folder, "direct.jpg")
        nested_path = self.touch_image(nested_folder, "nested.jpg")
        prefix_path = self.touch_image(prefix_folder, "outside.jpg")
        normalized_input = "  " + os.path.join(folder, ".", "child", "..", "direct.jpg") + "  "

        for incoming_path, expected_paths in (
            (normalized_input, [direct_path]),
            (nested_path, []),
            (prefix_path, []),
        ):
            with self.subTest(path=incoming_path):
                detect.save_auto_watch_config(folder, drive_folder_id="DRIVE_B")

                registered = detect.register_auto_watch_file(incoming_path)

                self.assertEqual(registered["known_files"], expected_paths)
                self.assertEqual(
                    [item["path"] for item in registered["pending_files"]],
                    expected_paths,
                )


if __name__ == "__main__":
    unittest.main()
