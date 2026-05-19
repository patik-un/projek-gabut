import os
import pickle

from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request


# =========================
# CONFIG
# =========================
SCOPES = ["https://www.googleapis.com/auth/drive.file"]

CLIENT_SECRET_FILE = "backend/auth/client_secrets.json"
TOKEN_FILE = "backend/auth/token.pickle"

DRIVE_FOLDER_ID = "1Y-A_3AIaLYGn2nrlKiIA9-OEFZPo9neE"
os.makedirs("backend/auth", exist_ok=True)


# =========================
# CACHE SERVICE (IMPORTANT FIX)
# =========================
_drive_service = None


# =========================
# AUTH FUNCTION
# =========================
def get_drive_service():

    global _drive_service

    if _drive_service:
        return _drive_service

    creds = None

    # load token
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, "rb") as token:
            creds = pickle.load(token)

    # refresh or login
    if not creds or not creds.valid:

        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                CLIENT_SECRET_FILE,
                SCOPES
            )
            creds = flow.run_local_server(port=0)

        # save token
        with open(TOKEN_FILE, "wb") as token:
            pickle.dump(creds, token)

    _drive_service = build("drive", "v3", credentials=creds)

    return _drive_service


# =========================
# UPLOAD FUNCTION
# =========================
def upload_to_drive(file_path):

    if not os.path.exists(file_path):
        print(f"❌ File tidak ditemukan: {file_path}")
        return None

    service = get_drive_service()

    file_name = os.path.basename(file_path)

    file_metadata = {"name": file_name}

    if DRIVE_FOLDER_ID:
        file_metadata["parents"] = [DRIVE_FOLDER_ID]

    media = MediaFileUpload(file_path, resumable=True)

    for attempt in range(3):
        try:
            file = service.files().create(
                body=file_metadata,
                media_body=media,
                fields="id"
            ).execute()

            file_id = file.get("id")
            print(f"✅ Upload sukses ID: {file_id}")

            return file_id   # 🔥 PENTING

        except Exception as e:
            print(f"⚠️ Upload gagal percobaan {attempt+1}: {e}")

    return None