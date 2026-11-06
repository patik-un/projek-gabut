import os
import tempfile
import threading
import time
import traceback
import json

import httplib2
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from googleapiclient.errors import HttpError
from google_auth_httplib2 import AuthorizedHttp
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

from runtime_paths import get_backend_dir


# =========================
# CONFIG
# =========================
# Full Drive scope is needed because the app uploads into a folder ID typed by
# the user. Tokens created with drive.file can be valid but still cannot write
# into arbitrary folders.
SCOPES = ["https://www.googleapis.com/auth/drive"]

BASE_DIR = get_backend_dir(__file__)

AUTH_DIR = os.path.join(BASE_DIR, "auth")

CLIENT_SECRET_FILE = os.path.join(AUTH_DIR, "client_secrets.json")
TOKEN_FILE = os.path.join(AUTH_DIR, "token.json")
LEGACY_TOKEN_FILE = os.path.join(AUTH_DIR, "token.pickle")

DRIVE_FOLDER_ID = "1Y-A_3AIaLYGn2nrlKiIA9-OEFZPo9neE"
DRIVE_HTTP_TIMEOUT_SECONDS = 180
DRIVE_UPLOAD_CHUNK_SIZE = 1 * 1024 * 1024
DRIVE_SIMPLE_UPLOAD_MAX_SIZE = 50 * 1024 * 1024


# =========================
# CACHE SERVICE (IMPORTANT FIX)
# =========================
_drive_service = None
_auth_generation = 0
_pending_auth_generation = None
_pending_auth_started = False
_drive_lock = threading.Lock()
_upload_lock = threading.Lock()


class DriveUploadError(Exception):
    def __init__(self, message, retryable=True):
        super().__init__(message)
        self.retryable = retryable


def credentials_have_required_scopes(creds):
    if not creds:
        return False

    try:
        return creds.has_scopes(SCOPES)
    except AttributeError:
        token_scopes = set(getattr(creds, "scopes", None) or [])
        return set(SCOPES).issubset(token_scopes)


def reset_drive_service():
    global _drive_service
    with _drive_lock:
        _drive_service = None


def _clear_drive_auth_locked():
    global _drive_service, _auth_generation
    global _pending_auth_generation, _pending_auth_started
    _auth_generation += 1
    _pending_auth_generation = None
    _pending_auth_started = False
    _drive_service = None
    removed = True
    for path in (TOKEN_FILE, LEGACY_TOKEN_FILE):
        try:
            os.remove(path)
        except FileNotFoundError:
            pass
        except OSError:
            removed = False
    return removed


def remove_drive_token():
    with _drive_lock:
        return _clear_drive_auth_locked()


def reserve_drive_login():
    """Reserve a login before dispatch so logout can cancel an unstarted worker."""
    global _pending_auth_generation
    with _drive_lock:
        if not _clear_drive_auth_locked():
            raise OSError("Gagal menghapus sesi Google Drive sebelumnya")
        _pending_auth_generation = _auth_generation
        return _auth_generation


def _check_auth_generation_locked(generation):
    if generation != _auth_generation:
        raise DriveUploadError(
            "Login Google Drive dibatalkan karena sesi telah berubah.",
            retryable=False,
        )


def _auth_in_progress_error():
    return DriveUploadError(
        "Login Google Drive sedang berlangsung. Tunggu sampai selesai.",
        retryable=True,
    )


def _finish_auth_attempt(generation):
    global _pending_auth_generation, _pending_auth_started
    with _drive_lock:
        if _pending_auth_generation == generation:
            _pending_auth_generation = None
            _pending_auth_started = False


def _ensure_auth_directory():
    os.makedirs(AUTH_DIR, mode=0o700, exist_ok=True)
    if os.name != "nt":
        os.chmod(AUTH_DIR, 0o700)
        if os.path.exists(CLIENT_SECRET_FILE):
            os.chmod(CLIENT_SECRET_FILE, 0o600)


def save_credentials(creds):
    _ensure_auth_directory()
    descriptor, temporary_path = tempfile.mkstemp(
        prefix=".token-", suffix=".json", dir=AUTH_DIR
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as token:
            token.write(creds.to_json())
        os.replace(temporary_path, TOKEN_FILE)
    finally:
        try:
            os.remove(temporary_path)
        except FileNotFoundError:
            pass

    try:
        os.remove(LEGACY_TOKEN_FILE)
    except FileNotFoundError:
        pass


def load_saved_credentials():
    if not os.path.exists(TOKEN_FILE):
        return None

    try:
        _ensure_auth_directory()
        if os.name != "nt":
            os.chmod(TOKEN_FILE, 0o600)
        with open(TOKEN_FILE, "r", encoding="utf-8") as token:
            payload = json.load(token)
        if not isinstance(payload, dict):
            return None
        return Credentials.from_authorized_user_info(payload)
    except (OSError, ValueError, TypeError, AttributeError):
        return None


def force_drive_login(expected_generation=None):
    """Jalankan OAuth Google di browser secara paksa dan simpan token baru.

    Reservasi dari pemanggil menjaga agar logout sebelum worker berjalan juga
    membatalkan login. OAuth tidak memegang lock yang diperlukan oleh logout.
    """
    global _drive_service, _pending_auth_generation, _pending_auth_started
    generation = (
        reserve_drive_login()
        if expected_generation is None
        else expected_generation
    )
    with _drive_lock:
        _check_auth_generation_locked(generation)
        if _pending_auth_generation != generation:
            raise DriveUploadError("Reservasi login Google Drive sudah selesai.", retryable=False)
        if _pending_auth_started:
            raise _auth_in_progress_error()
        _pending_auth_started = True

    try:
        flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_FILE, SCOPES)
        creds = flow.run_local_server(port=0, prompt="select_account")

        with _drive_lock:
            _check_auth_generation_locked(generation)
            save_credentials(creds)
            _drive_service = None
            _pending_auth_generation = None
            _pending_auth_started = False
    finally:
        _finish_auth_attempt(generation)


def get_drive_auth_status():
    creds = load_saved_credentials()

    return {
        "configured": os.path.exists(CLIENT_SECRET_FILE),
        "token_exists": os.path.exists(TOKEN_FILE),
        "legacy_token_requires_login": bool(not creds and os.path.exists(LEGACY_TOKEN_FILE)),
        "valid": bool(creds and creds.valid),
        "expired": bool(creds and creds.expired),
        "has_refresh_token": bool(creds and creds.refresh_token),
        "has_required_scopes": credentials_have_required_scopes(creds),
        "scopes": list(getattr(creds, "scopes", None) or []),
    }


def get_drive_user_profile():
    service = get_drive_service()
    if service is None:
        return {
            "email": None,
            "name": "Operator",
            "picture": None,
        }

    try:
        about = service.about().get(
            fields="user(displayName,emailAddress,photoLink)"
        ).execute()
        user = about.get("user") or {}
        return {
            "email": user.get("emailAddress"),
            "name": user.get("displayName") or user.get("emailAddress") or "Operator",
            "picture": user.get("photoLink"),
        }
    except Exception:
        return {
            "email": None,
            "name": "Operator",
            "picture": None,
        }


def get_http_error_detail(error):
    status_code = getattr(error.resp, "status", None)
    reason = getattr(error.resp, "reason", None)
    content = getattr(error, "content", b"")
    message = str(error)

    try:
        if isinstance(content, bytes):
            content = content.decode("utf-8", errors="replace")

        payload = json.loads(content)
        error_payload = payload.get("error", {})
        message = error_payload.get("message") or message
        reason = (
            error_payload.get("errors", [{}])[0].get("reason")
            or error_payload.get("status")
            or reason
        )
    except Exception:
        pass

    return status_code, reason, message


def explain_http_failure(status_code, reason, message):
    if status_code == 400:
        return "Request upload tidak valid. Cek Google Drive Folder ID dan metadata file."

    if status_code == 401:
        return "Token Google tidak valid/expired. Login ulang Google Drive diperlukan."

    if status_code == 403:
        return (
            "Akses ditolak Google Drive. Biasanya folder ID tidak bisa ditulis, "
            "izin akun salah, quota habis, atau rate limit."
        )

    if status_code == 404:
        return "Folder Google Drive tidak ditemukan. Cek Folder ID yang dipakai."

    if status_code in {429, 500, 502, 503, 504}:
        return "Gangguan sementara/rate limit Google Drive. Sistem akan retry otomatis."

    return f"Google Drive menolak upload: {reason or message}"


def is_redirect_missing_location(error):
    return isinstance(
        error,
        getattr(getattr(httplib2, "error", object), "RedirectMissingLocation", ()),
    )


def get_drive_service():
    global _drive_service, _auth_generation
    global _pending_auth_generation, _pending_auth_started
    with _drive_lock:
        if _drive_service:
            return _drive_service
        if _pending_auth_generation is not None:
            raise _auth_in_progress_error()
        # Each initialization owns its cleanup, even within the same login session.
        _auth_generation += 1
        generation = _auth_generation
        _pending_auth_generation = generation
        _pending_auth_started = True

    try:
        creds = load_saved_credentials()
        if creds and not credentials_have_required_scopes(creds):
            print("🔐 Token Google Drive scope lama terdeteksi, login ulang diperlukan.")
            creds = None
        credentials_changed = not creds or not creds.valid
        if credentials_changed:
            if creds and creds.expired and creds.refresh_token:
                try:
                    creds.refresh(Request())
                except RefreshError:
                    print("🔐 Refresh token Google gagal, login ulang diperlukan.")
                    creds = None
            if not creds or not creds.valid:
                flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_FILE, SCOPES)
                creds = flow.run_local_server(port=0, prompt="select_account")

        http = httplib2.Http(timeout=DRIVE_HTTP_TIMEOUT_SECONDS)
        authorized_http = AuthorizedHttp(creds, http=http)
        service = build("drive", "v3", http=authorized_http)

        with _drive_lock:
            _check_auth_generation_locked(generation)
            if credentials_changed:
                save_credentials(creds)
            _drive_service = service
            _pending_auth_generation = None
            _pending_auth_started = False
            return _drive_service
    finally:
        _finish_auth_attempt(generation)


# =========================
# UPLOAD FUNCTION
# =========================
def upload_to_drive(file_path, drive_folder_id=None):

    with _upload_lock:
        if not os.path.exists(file_path):
            message = f"File lokal tidak ditemukan: {file_path}"
            print("❌ DRIVE UPLOAD FAILED")
            print(f"   Reason : {message}")
            print(f"   File   : {file_path}")
            raise DriveUploadError(message, retryable=False)

        file_name = os.path.basename(file_path)
        file_size = os.path.getsize(file_path)

        file_metadata = {"name": file_name}

        target_folder_id = drive_folder_id or DRIVE_FOLDER_ID

        if target_folder_id:
            file_metadata["parents"] = [target_folder_id]

        last_error = "Tidak ada response error dari Google Drive"

        print("📤 DRIVE UPLOAD START")
        print(f"   File      : {file_name}")
        print(f"   Path      : {file_path}")
        print(f"   Size      : {file_size} bytes")
        print(f"   Folder ID : {target_folder_id or 'default/root'}")

        for attempt in range(8):
            try:
                print(f"🔁 Drive attempt {attempt + 1}/8: {file_name}")
                service = get_drive_service()

                if file_size <= DRIVE_SIMPLE_UPLOAD_MAX_SIZE:
                    media = MediaFileUpload(
                        file_path,
                        resumable=False,
                    )
                    response = service.files().create(
                        body=file_metadata,
                        media_body=media,
                        fields="id",
                        supportsAllDrives=True
                    ).execute(num_retries=3)

                    file_id = response.get("id") if response else None

                    if not file_id:
                        raise DriveUploadError(
                            "Google Drive tidak mengembalikan file ID",
                            retryable=True
                        )

                    print(f"✅ Upload sukses ID: {file_id}")
                    return file_id

                media = MediaFileUpload(
                    file_path,
                    resumable=True,
                    chunksize=DRIVE_UPLOAD_CHUNK_SIZE
                )
                request = service.files().create(
                    body=file_metadata,
                    media_body=media,
                    fields="id",
                    supportsAllDrives=True
                )
                response = None
                chunk_timeout_count = 0

                while response is None:
                    try:
                        status, response = request.next_chunk()
                        chunk_timeout_count = 0
                    except TimeoutError as e:
                        chunk_timeout_count += 1
                        last_error = (
                            "Timeout saat menunggu response Google Drive "
                            f"untuk chunk upload ({chunk_timeout_count}/5)"
                        )
                        print("⏳ DRIVE CHUNK TIMEOUT")
                        print(f"   Attempt : {attempt + 1}/8")
                        print(f"   Chunk   : {chunk_timeout_count}/5")
                        print(f"   Advice  : Koneksi lambat, retry chunk yang sama.")

                        if chunk_timeout_count >= 5:
                            raise e

                        time.sleep(min(15, 2 ** chunk_timeout_count))
                        continue
                    except HttpError as e:
                        status_code, reason, message = get_http_error_detail(e)
                        if status_code == 401 and attempt == 0:
                            reset_drive_service()
                        raise

                    if status:
                        percent = int(status.progress() * 100)
                        print(f"⬆️ Upload progress {file_name}: {percent}%")

                file_id = response.get("id") if response else None

                if not file_id:
                    raise DriveUploadError(
                        "Google Drive tidak mengembalikan file ID",
                        retryable=True
                    )

                print(f"✅ Upload sukses ID: {file_id}")

                return file_id   # 🔥 PENTING

            except HttpError as e:
                status_code, reason, message = get_http_error_detail(e)
                readable_reason = explain_http_failure(
                    status_code,
                    reason,
                    message
                )
                last_error = (
                    f"HTTP {status_code} ({reason}) - {message}. "
                    f"{readable_reason}"
                )
                print("⚠️ DRIVE ATTEMPT FAILED")
                print(f"   Attempt : {attempt + 1}/8")
                print(f"   HTTP    : {status_code}")
                print(f"   Reason  : {reason}")
                print(f"   Message : {message}")
                print(f"   Advice  : {readable_reason}")
                traceback.print_exc()
                reset_drive_service()

                if status_code in {400, 403, 404}:
                    print("⛔ Error tidak diretry karena butuh perbaikan akses/ID/token.")
                    raise DriveUploadError(last_error, retryable=False)

                if status_code == 401:
                    remove_drive_token()
                    print("🔐 Token Google dihapus agar login ulang pada attempt berikutnya.")

                time.sleep(min(30, 2 ** attempt))

            except DriveUploadError:
                raise

            except Exception as e:
                if is_redirect_missing_location(e) and file_size <= DRIVE_SIMPLE_UPLOAD_MAX_SIZE:
                    last_error = (
                        "Google Drive resumable upload mengembalikan redirect "
                        "tanpa Location. Sistem akan retry dengan upload biasa."
                    )
                    print("⚠️ DRIVE RESUMABLE REDIRECT FAILED")
                    print(f"   Attempt : {attempt + 1}/8")
                    print(f"   Error   : {type(e).__name__}: {e}")
                    reset_drive_service()
                    time.sleep(min(30, 2 ** attempt))
                    continue

                last_error = f"{type(e).__name__}: {e}"
                print("⚠️ DRIVE ATTEMPT FAILED")
                print(f"   Attempt : {attempt + 1}/8")
                print(f"   Error   : {last_error}")
                traceback.print_exc()
                reset_drive_service()
                time.sleep(min(30, 2 ** attempt))

        print("❌ DRIVE UPLOAD FAILED FINAL")
        print(f"   File      : {file_name}")
        print(f"   Path      : {file_path}")
        print(f"   Folder ID : {target_folder_id or 'default/root'}")
        print(f"   Reason    : {last_error}")

        raise DriveUploadError(last_error, retryable=True)


def create_drive_folder(folder_name, parent_folder_id=None, use_default_parent=True):
    with _upload_lock:
        service = get_drive_service()
        metadata = {
            "name": folder_name,
            "mimeType": "application/vnd.google-apps.folder"
        }
        target_parent = (
            parent_folder_id
            if parent_folder_id is not None
            else DRIVE_FOLDER_ID if use_default_parent else None
        )

        if target_parent:
            metadata["parents"] = [target_parent]

        try:
            folder = service.files().create(
                body=metadata,
                fields="id, webViewLink",
                supportsAllDrives=True
            ).execute()
        except HttpError as error:
            status_code, reason, message = get_http_error_detail(error)
            raise DriveUploadError(
                f"HTTP {status_code} ({reason}) - {message}. "
                f"{explain_http_failure(status_code, reason, message)}",
                retryable=status_code not in {400, 403, 404}
            )

        return {
            "id": folder.get("id"),
            "webViewLink": folder.get("webViewLink")
        }


def share_drive_file(file_id, email):
    if not email:
        return None

    with _upload_lock:
        service = get_drive_service()

        try:
            permission = service.permissions().create(
                fileId=file_id,
                body={
                    "type": "user",
                    "role": "reader",
                    "emailAddress": email
                },
                fields="id",
                sendNotificationEmail=True,
                supportsAllDrives=True
            ).execute()
        except HttpError as error:
            status_code, reason, message = get_http_error_detail(error)
            raise DriveUploadError(
                f"HTTP {status_code} ({reason}) - {message}. "
                f"{explain_http_failure(status_code, reason, message)}",
                retryable=status_code not in {400, 403, 404}
            )

        return permission.get("id")
