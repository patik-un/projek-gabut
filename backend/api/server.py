import sqlite3
import os
import glob
import cv2
import time
import threading
import uuid
import base64
import binascii
import json
import numpy as np
import shutil
import subprocess
import sys
import platform
import math
from api.editor_catalog import normalize_editor_catalog
from api.sticker_processing import MAX_REQUEST_BYTES, SegmentationError, remove_background
from api.gif_rendering import MAX_GIF_REQUEST_BYTES, MAX_UPLOAD_REQUEST_BYTES, render_gif, validate_gif_files
from starlette.concurrency import run_in_threadpool

from fastapi import FastAPI, Request
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import (
    FileResponse,
    HTMLResponse,
    JSONResponse,
    StreamingResponse
)
from fastapi.staticfiles import StaticFiles

from process.process import (
    DEFAULT_WATERMARK_PROFILES,
    OUTPUT_SETTINGS_FILE,
    WATERMARK_FILES,
    WATERMARK_SETTINGS_FILE,
    get_next_id,
    load_output_settings,
    normalize_watermark_profiles,
    process_edit_image,
    write_output_settings,
)
from queue_db import (
    DB_FILE,
    add_to_queue,
    clear_queue,
    init_db,
    retry_failed_queue,
)
from upload.upload_oauth import (
    DriveUploadError,
    create_drive_folder,
    force_drive_login,
    get_drive_auth_status,
    get_drive_service,
    get_drive_user_profile,
    share_drive_file,
    remove_drive_token,
    reserve_drive_login,
)
from detect.detect import (
    commit_pending_auto_watch_files,
    disable_auto_watch_folder,
    get_auto_watch_status,
    register_auto_watch_file,
    set_auto_watch_drive_folder,
    set_auto_watch_folder,
)
from runtime_paths import get_backend_dir

# =========================
# FASTAPI
# =========================
app = FastAPI()

LOCAL_APP_ORIGINS = [
    "http://localhost:1420",
    "http://127.0.0.1:1420",
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=LOCAL_APP_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def enforce_local_app_origin(request: Request, call_next):
    origin = request.headers.get("origin")
    if origin is not None and origin not in LOCAL_APP_ORIGINS:
        return JSONResponse(
            status_code=403,
            content={"success": False, "message": "Origin tidak diizinkan"},
        )
    return await call_next(request)


DEFAULT_CAMERA_INDEX = "auto"
latest_frame = None
latest_frame_lock = threading.Lock()
camera_stream_enabled = False
camera_stream_lock = threading.Lock()
camera_props = {}
camera_props_lock = threading.Lock()


def set_camera_stream_enabled(enabled):
    global camera_stream_enabled

    with camera_stream_lock:
        camera_stream_enabled = enabled


def is_camera_stream_enabled():
    with camera_stream_lock:
        return camera_stream_enabled


def get_camera_candidates():
    raw_index = os.environ.get("PHOTOBOOTH_CAMERA_INDEX", DEFAULT_CAMERA_INDEX)

    if raw_index.lower() not in ("auto", "external"):
        try:
            requested_index = int(raw_index)
            return [requested_index]
        except ValueError:
            print(
                f"⚠️ PHOTOBOOTH_CAMERA_INDEX tidak valid: {raw_index}. "
                "Memakai mode auto."
            )

    # Prioritaskan external camera. Di macOS biasanya kamera bawaan index 0.
    return [1, 2, 3, 4, 5, 6, 7, 8, 0]


def get_camera_backend():
    if sys.platform == "win32":
        return cv2.CAP_DSHOW
    elif sys.platform == "darwin":
        return cv2.CAP_AVFOUNDATION
    else:
        return cv2.CAP_ANY


def open_camera():
    backend = get_camera_backend()
    for camera_index in get_camera_candidates():
        cap = cv2.VideoCapture(camera_index, backend)

        if not cap.isOpened():
            cap.release()
            print(f"❌ Kamera index {camera_index} tidak bisa dibuka")
            continue

        for _ in range(12):
            ret, frame = cap.read()

            if ret and frame is not None:
                with latest_frame_lock:
                    global latest_frame
                    latest_frame = frame.copy()

                print(f"✅ Kamera index {camera_index} aktif")
                with camera_props_lock:
                    for prop_id, value in camera_props.items():
                        try:
                            cap.set(prop_id, value)
                        except Exception:
                            pass
                return cap

            time.sleep(0.05)

        cap.release()
        print(f"❌ Kamera index {camera_index} terbuka tapi tidak mengirim frame")

    return None


def get_frame_snapshot(timeout_seconds=2):
    global latest_frame

    start = time.time()

    while time.time() - start < timeout_seconds:
        with latest_frame_lock:
            if latest_frame is not None:
                return latest_frame.copy()

        time.sleep(0.05)

    cap = open_camera()

    if cap is None:
        return None

    try:
        for _ in range(12):
            ret, frame = cap.read()

            if ret and frame is not None:
                with latest_frame_lock:
                    latest_frame = frame.copy()

                return frame

            time.sleep(0.05)

    finally:
        cap.release()

    return None

# =========================
# PATH
# =========================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

BACKEND_DIR = get_backend_dir(__file__)

PROCESSED_DIR = os.path.join(
    BACKEND_DIR,
    "processed"
)

OUTPUT_DIR = os.path.join(
    BACKEND_DIR,
    "output"
)

WATERMARK_DIR = os.path.join(
    BACKEND_DIR,
    "watermark"
)

PHOTOBOOTH_TEMPLATE_FILE = os.path.join(
    WATERMARK_DIR,
    "photobooth_template.png"
)
PHOTOBOOTH_TEMPLATE_MAX_SLOTS = 10
PHOTOBOOTH_SETTINGS_FILE = os.path.join(WATERMARK_DIR, "photobooth_settings.json")
PHOTOBOOTH_EDITOR_SETTINGS_FILE = os.path.join(WATERMARK_DIR, "photobooth_editor_settings.json")
PHOTOBOOTH_SETTINGS_LOCK = threading.RLock()
PHOTOBOOTH_TEMPLATE_FILES = {
    slot_count: os.path.join(
        WATERMARK_DIR,
        f"photobooth_template_{slot_count}.png"
    )
    for slot_count in range(1, 4)
}

PHOTOBOOTH_STRIP_DIR = os.path.join(
    BACKEND_DIR,
    "photobooth_strips"
)

MANUAL_UPLOAD_DIR = os.path.join(
    BACKEND_DIR,
    "manual_uploads"
)

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)
os.makedirs(WATERMARK_DIR, exist_ok=True)
os.makedirs(PHOTOBOOTH_STRIP_DIR, exist_ok=True)
os.makedirs(MANUAL_UPLOAD_DIR, exist_ok=True)
init_db()


def public_url(path):
    filename = os.path.basename(path)
    port = int(os.environ.get("EVENT_BOOTH_BACKEND_PORT", "8000"))
    base_url = f"http://127.0.0.1:{port}"

    if path.startswith(WATERMARK_DIR):
        return f"{base_url}/watermark-files/{filename}"

    if path.startswith(PHOTOBOOTH_STRIP_DIR):
        return f"{base_url}/photobooth-strips/{filename}"

    if path.startswith(PROCESSED_DIR):
        return f"{base_url}/processed/{filename}"

    return f"{base_url}/output/{filename}"


def startup_check_item(name, status, message, repair=None, required=False):
    return {
        "name": name,
        "status": status,
        "message": message,
        "repair": repair,
        "required": required
    }


def check_directory_ready(path, label):
    try:
        os.makedirs(path, exist_ok=True)
        test_path = os.path.join(path, ".startup_check")
        with open(test_path, "w") as file:
            file.write("ok")
        os.remove(test_path)
        return startup_check_item(
            label,
            "ok",
            "Folder siap dipakai",
            required=True
        )
    except OSError as error:
        return startup_check_item(
            label,
            "error",
            f"Folder tidak bisa ditulis: {error}",
            "Cek permission folder data backend atau jalankan ulang aplikasi.",
            required=True
        )


def check_json_file(path, label, optional=True):
    if not os.path.exists(path):
        return startup_check_item(
            label,
            "warning" if optional else "error",
            "File belum ada, app akan memakai default.",
            "Buka admin panel lalu simpan ulang pengaturan.",
            required=not optional
        )

    try:
        with open(path, "r") as file:
            json.load(file)
        return startup_check_item(label, "ok", "File konfigurasi valid")
    except (OSError, json.JSONDecodeError) as error:
        return startup_check_item(
            label,
            "error" if not optional else "warning",
            f"File konfigurasi rusak: {error}",
            "Simpan ulang pengaturan dari admin panel. Jika masih gagal, pindahkan file rusak sebagai backup lalu restart app.",
            required=not optional
        )


def check_image_file(path, label, optional=True):
    if not os.path.exists(path):
        return startup_check_item(
            label,
            "warning" if optional else "error",
            "File belum ada, app akan memakai default.",
            "Upload ulang file dari admin panel bila diperlukan.",
            required=not optional
        )

    try:
        image = cv2.imread(path, cv2.IMREAD_UNCHANGED)
        if image is None or image.size == 0:
            raise ValueError("gambar tidak bisa dibaca")
        return startup_check_item(label, "ok", "File gambar valid")
    except Exception as error:
        return startup_check_item(
            label,
            "warning" if optional else "error",
            f"File gambar rusak: {error}",
            "Upload ulang file dari admin panel. App akan memakai default sampai file diganti.",
            required=not optional
        )


def decode_base64_image(data_base64):
    if not data_base64:
        raise ValueError("Data file kosong")

    if "," in data_base64:
        data_base64 = data_base64.split(",", 1)[1]

    try:
        return base64.b64decode(data_base64)
    except (binascii.Error, ValueError) as error:
        raise ValueError("Data file tidak valid") from error


def save_base64_file(data_base64, target_path):
    image_bytes = decode_base64_image(data_base64)

    with open(target_path, "wb") as file:
        file.write(image_bytes)

    return target_path


def get_watermark_image_urls():
    return {
        orientation: (
            f"{public_url(path)}?v={int(os.path.getmtime(path))}"
            if os.path.exists(path)
            else None
        )
        for orientation, path in WATERMARK_FILES.items()
    }


def load_watermark_settings_response():
    if not os.path.exists(WATERMARK_SETTINGS_FILE):
        return {
            "landscape": DEFAULT_WATERMARK_PROFILES["landscape"].copy(),
            "portrait": DEFAULT_WATERMARK_PROFILES["portrait"].copy(),
        }

    try:
        with open(WATERMARK_SETTINGS_FILE, "r") as file:
            return normalize_watermark_profiles(json.load(file))
    except (OSError, json.JSONDecodeError):
        return {
            "landscape": DEFAULT_WATERMARK_PROFILES["landscape"].copy(),
            "portrait": DEFAULT_WATERMARK_PROFILES["portrait"].copy(),
        }


def write_watermark_settings(settings):
    normalized = normalize_watermark_profiles(settings)

    with open(WATERMARK_SETTINGS_FILE, "w") as file:
        json.dump(normalized, file, indent=2)

    return normalized


def output_settings_response():
    settings = load_output_settings()

    return {
        **settings,
        "configured": os.path.exists(OUTPUT_SETTINGS_FILE)
    }


def safe_filename(filename, fallback="upload.jpg"):
    cleaned = os.path.basename(filename or fallback).strip()
    cleaned = "".join(
        char if char.isalnum() or char in (" ", ".", "-", "_") else "_"
        for char in cleaned
    ).strip()

    return cleaned or fallback


def get_capture_files():
    return sorted(
        glob.glob(os.path.join(OUTPUT_DIR, "*.jpg")),
        key=os.path.getmtime,
        reverse=True
    )


def clear_capture_files():
    deleted = 0

    for file_path in get_capture_files():
        try:
            os.remove(file_path)
            deleted += 1
        except OSError as error:
            print(f"⚠️ Gagal menghapus capture {file_path}: {error}")

    with latest_frame_lock:
        global latest_frame
        latest_frame = None

    return deleted

# =========================
# STATIC FILES
# =========================
app.mount(
    "/processed",
    StaticFiles(directory=PROCESSED_DIR),
    name="processed"
)

app.mount(
    "/output",
    StaticFiles(directory=OUTPUT_DIR),
    name="output"
)

app.mount(
    "/watermark-files",
    StaticFiles(directory=WATERMARK_DIR),
    name="watermark-files"
)

app.mount(
    "/photobooth-strips",
    StaticFiles(directory=PHOTOBOOTH_STRIP_DIR),
    name="photobooth-strips"
)

import threading

# ... existing imports ...

@app.post("/auth/drive/login-trigger")
def trigger_drive_login():
    if not get_drive_auth_status().get("configured"):
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "message": "Konfigurasi Google Drive belum tersedia. Siapkan client_secrets.json sebelum login.",
            },
        )

    try:
        reserved_generation = reserve_drive_login()
    except OSError as error:
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Gagal menyiapkan login Google Drive: {error}"},
        )

    def run_login():
        try:
            # Paksa login browser yang baru, bukan memakai akun/token lama.
            force_drive_login(expected_generation=reserved_generation)
        except Exception as e:
            print(f"Error during background login: {e}")

    thread = threading.Thread(target=run_login, daemon=True)
    thread.start()

    return {"success": True, "message": "Proses login telah dimulai. Silakan cek browser Anda."}

@app.get("/")
def root():

    return {
        "status": "running"
    }


@app.get("/startup/checks")
def startup_checks():
    checks = [
        check_directory_ready(OUTPUT_DIR, "Capture output"),
        check_directory_ready(PROCESSED_DIR, "Processed output"),
        check_directory_ready(WATERMARK_DIR, "Watermark assets"),
        check_directory_ready(PHOTOBOOTH_STRIP_DIR, "Photobooth strips"),
        check_directory_ready(MANUAL_UPLOAD_DIR, "Manual upload cache"),
        check_json_file(WATERMARK_SETTINGS_FILE, "Watermark settings"),
        check_json_file(OUTPUT_SETTINGS_FILE, "Output settings", optional=True),
        check_json_file(os.path.join(BACKEND_DIR, "database", "auto_watch.json"), "Auto watch settings"),
    ]

    for orientation, path in WATERMARK_FILES.items():
        checks.append(
            check_image_file(path, f"Watermark {orientation}", optional=True)
        )

    for slot_count, path in PHOTOBOOTH_TEMPLATE_FILES.items():
        checks.append(
            check_image_file(path, f"Template photobooth {slot_count} slot", optional=True)
        )

    error_count = sum(1 for item in checks if item["status"] == "error")
    warning_count = sum(1 for item in checks if item["status"] == "warning")
    blocking_count = sum(
        1
        for item in checks
        if item["status"] == "error" and item["required"]
    )

    return {
        "success": blocking_count == 0,
        "can_continue": blocking_count == 0,
        "error_count": error_count,
        "warning_count": warning_count,
        "checks": checks
    }


GOOGLE_CLIENT_ID = "486128462254-l7i58vevgf6n6lrou922b7nu57ol0e16.apps.googleusercontent.com"


@app.post("/auth/google")
async def auth_google(request: Request):
    payload = await request.json()
    token = payload.get("id_token")

    if not token:
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": "Token kosong"}
        )

    try:
        info = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            GOOGLE_CLIENT_ID
        )
    except ValueError as e:
        return JSONResponse(
            status_code=401,
            content={"success": False, "message": f"Token tidak valid: {e}"}
        )

    return {
        "success": True,
        "user": {
            "email": info.get("email"),
            "name": info.get("name"),
            "picture": info.get("picture"),
        }
    }


@app.get("/auth/drive/status")
def auth_drive_status():
    return {
        "success": True,
        "drive": get_drive_auth_status()
    }


@app.post("/auth/drive/connect")
def auth_drive_connect():
    try:
        user = get_drive_user_profile()
        status = get_drive_auth_status()

        if not status["token_exists"] or not status["valid"]:
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "message": "Login diperlukan",
                    "drive": status
                }
            )

        return {
            "success": True,
            "drive": status,
            "user": user
        }
    except Exception as error:
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Gagal auth Google Drive: {error}",
                "drive": get_drive_auth_status()
            }
        )


@app.post("/auth/drive/logout")
def auth_drive_logout():
    if remove_drive_token():
        return {"success": True, "message": "Sesi Drive berhasil dihapus"}
    return JSONResponse(
        status_code=500,
        content={"success": False, "message": "Gagal menghapus sesi Drive"}
    )

# =========================
# GET QUEUE
# =========================
@app.get("/queue")
def get_queue(request: Request):
    source = request.query_params.get("source")

    conn = sqlite3.connect(DB_FILE)

    cur = conn.cursor()

    if source:
        cur.execute("""
            SELECT
                id,
                file_path,
                status,
                retry,
                created_at,
                source,
                last_error,
                next_attempt_at,
                drive_folder_id
            FROM queue
            WHERE source = ?
            ORDER BY id DESC
            LIMIT 100
        """, (source,))
    else:
        cur.execute("""
            SELECT
                id,
                file_path,
                status,
                retry,
                created_at,
                source,
                last_error,
                next_attempt_at,
                drive_folder_id
            FROM queue
            ORDER BY id DESC
            LIMIT 100
        """)

    rows = cur.fetchall()

    conn.close()

    data = []

    for row in rows:

        filename = os.path.basename(
            row[1]
        )

        data.append({
            "id": row[0],
            "filename": filename,
            "file": row[1],
            "status": row[2],
            "retry": row[3],
            "created_at": row[4],
            "source": row[5],
            "last_error": row[6],
            "next_attempt_at": row[7],
            "drive_folder_id": row[8],
            "image_url": public_url(row[1]) if row[1] else None
        })

    return JSONResponse(content=data)

# =========================
# LATEST CAPTURE
# =========================
@app.get("/latest-capture")
def latest_capture():

    files = glob.glob(
        os.path.join(
            OUTPUT_DIR,
            "*.jpg"
        )
    )

    if not files:

        return {
            "image_url": None
        }

    latest_file = max(
        files,
        key=os.path.getmtime
    )

    return {
        "image_url": public_url(latest_file)
    }


@app.get("/captures")
def get_captures():
    data = []

    for index, file_path in enumerate(get_capture_files()):
        filename = os.path.basename(file_path)

        data.append({
            "id": filename,
            "filename": filename,
            "image_url": public_url(file_path),
            "created_at": os.path.getmtime(file_path),
            "slot": index + 1
        })

    return JSONResponse(content=data)


@app.post("/photobooth/session/start")
async def start_photobooth_session(request: Request):
    raw_body = await request.body()
    try:
        payload = json.loads(raw_body) if raw_body else {}
    except (json.JSONDecodeError, UnicodeDecodeError):
        payload = {}
    drive_folder_id = (payload.get("drive_folder_id") or "").strip() or "LOCAL_SESSION"

    deleted = clear_capture_files()

    return {
        "success": True,
        "deleted": deleted,
        "drive_folder_id": drive_folder_id
    }


@app.post("/photobooth/session/finish")
def finish_photobooth_session():
    deleted = clear_capture_files()

    return {
        "success": True,
        "deleted": deleted
    }


@app.get("/photobooth/next-job-id")
def get_next_photobooth_job_id():
    job_id = get_next_id()
    return {
        "success": True,
        "job_id": job_id
    }


@app.get("/watermark")
def get_watermark():
    image_urls = get_watermark_image_urls()
    image_url = image_urls.get("landscape") or image_urls.get("portrait")

    return {
        "success": True,
        "active": bool(image_url),
        "image_url": image_url,
        "image_urls": image_urls,
        "settings": load_watermark_settings_response()
    }


@app.get("/output-settings")
def get_output_settings():
    return {
        "success": True,
        "settings": output_settings_response()
    }


@app.post("/output-settings")
async def save_output_settings(request: Request):
    payload = await request.json()
    settings = payload.get("settings") or payload

    try:
        normalized = write_output_settings(settings)
    except OSError as error:
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Gagal menyimpan setting output: {error}"
            }
        )

    return {
        "success": True,
        "settings": {
            **normalized,
            "configured": True
        }
    }


@app.post("/watermark")
async def upload_watermark(request: Request):
    try:
        payload = await request.json()
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "message": "Payload upload watermark harus JSON"
            }
        )
    orientation = payload.get("orientation", "landscape")

    if orientation not in WATERMARK_FILES:
        orientation = "landscape"

    try:
        save_base64_file(payload.get("data_base64"), WATERMARK_FILES[orientation])
    except ValueError as error:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "message": str(error)
            }
        )

    image_urls = get_watermark_image_urls()

    return {
        "success": True,
        "active": True,
        "orientation": orientation,
        "image_url": image_urls[orientation],
        "image_urls": image_urls,
        "settings": load_watermark_settings_response()
    }


@app.post("/watermark/settings")
async def save_watermark_settings(request: Request):
    payload = await request.json()
    settings = payload.get("settings")

    if settings is None and payload.get("orientation") in {"landscape", "portrait"}:
        orientation = payload["orientation"]
        current = load_watermark_settings_response()
        settings = {
            **current,
            orientation: {
                **current.get(orientation, {}),
                **{
                    key: value
                    for key, value in payload.items()
                    if key != "orientation"
                }
            }
        }
    elif settings is None:
        settings = payload

    try:
        normalized = write_watermark_settings(settings)
    except OSError as error:
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Gagal menyimpan setting watermark: {error}"
            }
        )

    return {
        "success": True,
        "settings": normalized
    }


def detect_template_slot_rects(image_path):
    img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        print("detect_template_slots: cannot read", image_path)
        return {
            "count": 1,
            "slots": [],
            "width": None,
            "height": None
        }

    h, w = img.shape[:2]
    channel_count = img.shape[2] if len(img.shape) > 2 else 1
    print(f"detect_template_slots: {w}x{h}, channels={channel_count}")

    def normalize_slots(raw_slots):
        raw_slots.sort(key=lambda r: (r[1], r[0]))
        raw_slots = raw_slots[:PHOTOBOOTH_TEMPLATE_MAX_SLOTS]

        return [
            {
                "left": float(left / w) * 100,
                "top": float(top / h) * 100,
                "width": float(cw / w) * 100,
                "height": float(ch / h) * 100,
            }
            for left, top, cw, ch in raw_slots
        ]

    def detect_white_panel_slots():
        if channel_count == 1:
            bgr = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
            alpha_ok = np.ones((h, w), dtype=np.uint8) * 255
        else:
            bgr = img[:, :, :3]
            alpha_ok = (
                cv2.threshold(img[:, :, 3], 30, 255, cv2.THRESH_BINARY)[1]
                if channel_count == 4
                else np.ones((h, w), dtype=np.uint8) * 255
            )

        b, g, r = cv2.split(bgr)
        white = (
            (r >= 235) &
            (g >= 235) &
            (b >= 235) &
            (alpha_ok > 0)
        ).astype(np.uint8) * 255

        kernel_size = max(7, int(min(w, h) * 0.012))
        if kernel_size % 2 == 0:
            kernel_size += 1

        kernel = cv2.getStructuringElement(
            cv2.MORPH_RECT,
            (kernel_size, kernel_size)
        )
        white = cv2.morphologyEx(white, cv2.MORPH_CLOSE, kernel)
        white = cv2.morphologyEx(white, cv2.MORPH_OPEN, kernel)

        num_white_labels, white_labels, white_stats, _ = (
            cv2.connectedComponentsWithStats(white, connectivity=8)
        )
        print(f"Found {num_white_labels - 1} white panel candidate(s)")

        detected_slots = []
        min_panel_area = w * h * 0.06

        for label_index in range(1, num_white_labels):
            area = white_stats[label_index, cv2.CC_STAT_AREA]
            left = white_stats[label_index, cv2.CC_STAT_LEFT]
            top = white_stats[label_index, cv2.CC_STAT_TOP]
            cw = white_stats[label_index, cv2.CC_STAT_WIDTH]
            ch = white_stats[label_index, cv2.CC_STAT_HEIGHT]
            print(f"  white panel {label_index}: area={area} at ({left},{top}) {cw}x{ch}")

            if area < min_panel_area:
                print("    panel too small")
                continue
            if cw < w * 0.35 or ch < h * 0.16:
                print(f"    panel dimensions too small: {cw}x{ch}")
                continue

            print(f"    PASS panel slot ({left},{top}) {cw}x{ch}")
            detected_slots.append((left, top, cw, ch))

        return detected_slots

    if channel_count == 4:
        alpha = img[:, :, 3]
        _, opaque = cv2.threshold(alpha, 30, 255, cv2.THRESH_BINARY)
    else:
        gray = img if channel_count == 1 else cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        _, opaque = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)

    inv = cv2.bitwise_not(opaque)
    fill_mask = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(inv, fill_mask, (0, 0), 128)
    _, holes = cv2.threshold(inv, 200, 255, cv2.THRESH_BINARY)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    holes = cv2.morphologyEx(holes, cv2.MORPH_OPEN, kernel)

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(holes, connectivity=8)
    print(f"Found {num_labels - 1} hole(s)")

    min_area = w * h * 0.002
    max_area = w * h * 0.6
    slots = []
    for i in range(1, num_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        left = stats[i, cv2.CC_STAT_LEFT]
        top = stats[i, cv2.CC_STAT_TOP]
        cw = stats[i, cv2.CC_STAT_WIDTH]
        ch = stats[i, cv2.CC_STAT_HEIGHT]
        print(f"  hole {i}: area={area} at ({left},{top}) {cw}x{ch}")
        if area < min_area or area > max_area:
            print(f"    area out of range")
            continue
        if cw < w * 0.02 or ch < h * 0.02:
            print(f"    too small: {cw}x{ch}")
            continue
        aspect = cw / ch if ch > 0 else 0
        if aspect < 0.15 or aspect > 6.0:
            print(f"    bad aspect: {aspect:.2f}")
            continue
        print(f"    PASS")
        slots.append((left, top, cw, ch))

    if not slots:
        slots = detect_white_panel_slots()

    result = len(slots) or 1
    print(f"Detected {result} slot(s)")

    return {
        "count": result,
        "slots": normalize_slots(slots),
        "width": w,
        "height": h
    }


def detect_template_slots(image_path):
    return detect_template_slot_rects(image_path)["count"]


def photobooth_template_payload(slot_count):
    template_path = PHOTOBOOTH_TEMPLATE_FILES[slot_count]
    has_image = os.path.exists(template_path)
    detected = (
        detect_template_slot_rects(template_path)
        if has_image
        else {
            "count": slot_count,
            "slots": [],
            "width": None,
            "height": None
        }
    )

    return {
        "id": f"photobooth-strip-{slot_count}",
        "name": f"Strip {slot_count} Pose",
        "active": True,
        "slot_count": slot_count,
        "pose_count": slot_count,
        "detected_slot_count": detected["count"],
        "slots": detected["slots"],
        "width": detected["width"],
        "height": detected["height"],
        "image_url": (
            f"{public_url(template_path)}?v={int(os.path.getmtime(template_path))}"
            if has_image
            else None
        )
    }


def normalize_photobooth_settings(payload):
    if not isinstance(payload, dict):
        raise ValueError("Pengaturan strip harus berupa objek")
    options = payload.get("strip_options")
    if not isinstance(options, list) or not options:
        raise ValueError("Minimal satu strip harus tersedia")
    strips, identifiers = [], set()
    for strip in options:
        if not isinstance(strip, dict):
            raise ValueError("Data strip tidak valid")
        strip_id, name = strip.get("id"), strip.get("name")
        if not isinstance(strip_id, str) or not strip_id.strip() or strip_id in identifiers:
            raise ValueError("ID strip harus unik dan tidak kosong")
        if not isinstance(name, str) or not name.strip():
            raise ValueError("Nama strip wajib diisi")
        for key in ("pose_count", "slot_count"):
            count = strip.get(key, strip.get("pose_count"))
            if type(count) is not int or not 1 <= count <= PHOTOBOOTH_TEMPLATE_MAX_SLOTS:
                raise ValueError("Jumlah pose dan slot harus antara 1 sampai 10")
        slots = strip.get("slots", [])
        if not isinstance(slots, list) or len(slots) > PHOTOBOOTH_TEMPLATE_MAX_SLOTS:
            raise ValueError("Slot strip tidak valid")
        for slot in slots:
            if not isinstance(slot, dict):
                raise ValueError("Posisi slot tidak valid")
            for key in ("left", "top", "width", "height"):
                value = slot.get(key)
                if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 100:
                    raise ValueError("Posisi slot harus antara 0 sampai 100")
        if type(strip.get("active", True)) is not bool:
            raise ValueError("Status aktif strip tidak valid")
        image_url = strip.get("image_url")
        if image_url is not None and not isinstance(image_url, str):
            raise ValueError("Gambar strip tidak valid")
        normalized = {
            "id": strip_id, "name": name.strip(), "image_url": image_url,
            "slot_count": strip.get("slot_count", strip["pose_count"]),
            "pose_count": strip["pose_count"], "slots": slots,
            "active": strip.get("active", True),
        }
        for key in ("width", "height"):
            value = strip.get(key)
            if value is not None and (type(value) not in (int, float) or not math.isfinite(value) or value <= 0):
                raise ValueError("Ukuran gambar strip tidak valid")
            normalized[key] = value
        identifiers.add(strip_id)
        strips.append(normalized)
    preferences = payload.get("strip_settings", {})
    if not isinstance(preferences, dict):
        raise ValueError("Pengaturan cetak strip tidak valid")
    strip_settings = {}
    for strip in strips:
        setting = preferences.get(strip["id"], {})
        if not isinstance(setting, dict) or setting.get("paper_size", "4r") not in ("3r", "4r"):
            raise ValueError("Ukuran kertas harus 3R atau 4R")
        if type(setting.get("double_strip_enabled", False)) is not bool:
            raise ValueError("Pengaturan dua strip tidak valid")
        strip_settings[strip["id"]] = {
            "paper_size": setting.get("paper_size", "4r"),
            "double_strip_enabled": setting.get("double_strip_enabled", False),
        }
    active_ids = [strip["id"] for strip in strips if strip["active"]]
    default_id = payload.get("default_strip_id")
    return {
        "strip_options": strips,
        "default_strip_id": default_id if default_id in active_ids else next(iter(active_ids), None),
        "strip_settings": strip_settings,
    }


def load_photobooth_settings():
    with PHOTOBOOTH_SETTINGS_LOCK:
        try:
            with open(PHOTOBOOTH_SETTINGS_FILE, encoding="utf-8") as file:
                return normalize_photobooth_settings(json.load(file))
        except (FileNotFoundError, ValueError, TypeError):
            return normalize_photobooth_settings({
                "strip_options": [photobooth_template_payload(count) for count in PHOTOBOOTH_TEMPLATE_FILES],
            })


def write_photobooth_settings(payload):
    settings = normalize_photobooth_settings(payload)
    with PHOTOBOOTH_SETTINGS_LOCK:
        for strip in settings["strip_options"]:
            if (strip["image_url"] or "").startswith("data:image/png;base64,"):
                image_data = store_photobooth_png(strip["image_url"])
                # Empty slots mean pending detection. A later pose edit supplies
                # an explicit layout that must survive offline synchronization.
                if strip["slots"]:
                    image_data = {key: image_data[key] for key in ("image_url", "width", "height")}
                strip.update(image_data)
        temp_path = f"{PHOTOBOOTH_SETTINGS_FILE}.{uuid.uuid4().hex}.tmp"
        try:
            with open(temp_path, "w", encoding="utf-8") as file:
                json.dump(settings, file, ensure_ascii=False, allow_nan=False)
            os.replace(temp_path, PHOTOBOOTH_SETTINGS_FILE)
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)
    return settings


def store_photobooth_png(data_base64):
    image_bytes = decode_base64_image(data_base64)
    if not image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("Template strip harus berupa PNG yang valid")
    temp_path = os.path.join(WATERMARK_DIR, f"photobooth_template_upload_{uuid.uuid4().hex}.png")
    try:
        with open(temp_path, "wb") as file:
            file.write(image_bytes)
        detected = detect_template_slot_rects(temp_path)
        if not 1 <= detected["count"] <= PHOTOBOOTH_TEMPLATE_MAX_SLOTS or not detected["width"] or not detected["height"]:
            raise ValueError("PNG harus memiliki 1 sampai 10 slot foto")
        target = os.path.join(WATERMARK_DIR, f"photobooth_custom_{uuid.uuid4().hex}.png")
        os.replace(temp_path, target)
        return {"image_url": f"{public_url(target)}?v={time.time_ns()}",
                "pose_count": detected["count"], "slot_count": detected["count"],
                "slots": detected["slots"], "width": detected["width"], "height": detected["height"]}
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


def photobooth_settings_response(settings=None):
    settings = settings if settings is not None else load_photobooth_settings()
    active = next((strip for strip in settings["strip_options"]
                   if strip["id"] == settings["default_strip_id"]), settings["strip_options"][0])
    return {"success": True, "configured": os.path.exists(PHOTOBOOTH_SETTINGS_FILE), **settings, "active": active["active"],
            "slot_count": active["slot_count"], "image_url": active["image_url"],
            "templates": {str(strip["pose_count"]): strip for strip in settings["strip_options"]}}


async def read_bounded_json(request, maximum):
    content_length = request.headers.get("content-length")
    if content_length is not None and (int(content_length) < 0 or int(content_length) > maximum):
        raise ValueError("Data permintaan terlalu besar")
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > maximum:
            raise ValueError("Data permintaan terlalu besar")
        body.extend(chunk)
    try:
        payload = json.loads(body)
    except (ValueError, UnicodeDecodeError, RecursionError) as error:
        raise ValueError("Data JSON tidak valid") from error
    if not isinstance(payload, dict):
        raise ValueError("Permintaan harus berupa objek JSON")
    return payload


@app.post("/photobooth/gif")
async def create_photobooth_gif(request: Request):
    try:
        payload = await read_bounded_json(request, MAX_GIF_REQUEST_BYTES)
        return await run_in_threadpool(render_gif, payload)
    except ValueError as error:
        return JSONResponse(status_code=400, content={"success": False, "message": str(error)})


@app.post("/photobooth/sticker/remove-background")
async def remove_sticker_background(request: Request):
    try:
        # Stream into a bounded buffer, including requests without Content-Length.
        content_length = request.headers.get("content-length")
        if content_length is not None and (int(content_length) < 0 or int(content_length) > MAX_REQUEST_BYTES):
            raise ValueError("Data permintaan terlalu besar; gambar maksimal 4 MB")
        body = bytearray()
        async for chunk in request.stream():
            if len(body) + len(chunk) > MAX_REQUEST_BYTES:
                raise ValueError("Data permintaan terlalu besar; gambar maksimal 4 MB")
            body.extend(chunk)
        payload = json.loads(body)
        if not isinstance(payload, dict):
            raise ValueError("Permintaan harus berupa objek JSON dengan image_data")
        if "rect" in payload and payload["rect"] is None:
            raise ValueError("rect harus berisi x, y, width, height antara 0 dan 1")
        return await run_in_threadpool(remove_background, payload.get("image_data"), payload.get("rect"))
    except (ValueError, UnicodeDecodeError) as error:
        return JSONResponse(status_code=400, content={"success": False, "message": str(error)})
    except SegmentationError as error:
        return JSONResponse(status_code=422, content={"success": False, "message": str(error), "recoverable": True})


@app.get("/photobooth/editor-settings")
def get_photobooth_editor_settings():
    with PHOTOBOOTH_SETTINGS_LOCK:
        try:
            with open(PHOTOBOOTH_EDITOR_SETTINGS_FILE, encoding="utf-8") as file:
                settings = normalize_editor_catalog(json.load(file))
        except FileNotFoundError:
            settings = None
        except (ValueError, TypeError, OSError):
            return JSONResponse(status_code=500, content={"success": False, "message": "Gagal membaca katalog edit"})
    return {"success": True, "schema_version": 2, "settings": settings}


@app.post("/photobooth/editor-settings")
async def save_photobooth_editor_settings(request: Request):
    try:
        settings = normalize_editor_catalog(await request.json())
    except (ValueError, TypeError) as error:
        return JSONResponse(status_code=400, content={"success": False, "message": str(error)})
    temp_path = f"{PHOTOBOOTH_EDITOR_SETTINGS_FILE}.{uuid.uuid4().hex}.tmp"
    try:
        with PHOTOBOOTH_SETTINGS_LOCK:
            os.makedirs(os.path.dirname(PHOTOBOOTH_EDITOR_SETTINGS_FILE), exist_ok=True)
            with open(temp_path, "w", encoding="utf-8") as file:
                json.dump(settings, file, ensure_ascii=False)
            os.replace(temp_path, PHOTOBOOTH_EDITOR_SETTINGS_FILE)
    except OSError:
        return JSONResponse(status_code=500, content={"success": False, "message": "Gagal menyimpan katalog edit"})
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
    return {"success": True, "schema_version": 2, "settings": settings}


@app.get("/photobooth/settings")
@app.get("/photobooth/template")
def get_photobooth_template():
    return photobooth_settings_response()


@app.post("/photobooth/settings")
async def save_photobooth_settings(request: Request):
    try:
        return photobooth_settings_response(write_photobooth_settings(await request.json()))
    except (ValueError, TypeError) as error:
        return JSONResponse(status_code=400, content={"success": False, "message": str(error)})


@app.post("/photobooth/template")
async def upload_photobooth_template(request: Request):
    try:
        payload = await request.json()
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "message": "Payload upload template harus JSON"
            }
        )

    if not isinstance(payload, dict):
        return JSONResponse(status_code=400, content={"success": False, "message": "Data template tidak valid"})
    settings = load_photobooth_settings()
    strip_id = payload.get("strip_id")
    if strip_id is not None and not any(strip["id"] == strip_id for strip in settings["strip_options"]):
        return JSONResponse(status_code=404, content={"success": False, "message": "Strip tidak ditemukan"})
    try:
        image_data = store_photobooth_png(payload.get("data_base64"))
    except (ValueError, TypeError) as error:
        return JSONResponse(status_code=400, content={"success": False, "message": str(error)})
    slot_count = image_data["slot_count"]
    strip_id = strip_id or f"photobooth-strip-{slot_count}"
    with PHOTOBOOTH_SETTINGS_LOCK:
        settings = load_photobooth_settings()
        existing = next((strip for strip in settings["strip_options"] if strip["id"] == strip_id), None)
        uploaded = {**(existing or {"id": strip_id, "name": f"Strip {slot_count} Pose", "active": True}), **image_data}
        settings["strip_options"] = [uploaded if strip["id"] == strip_id else strip for strip in settings["strip_options"]]
        if existing is None:
            settings["strip_options"].append(uploaded)
        saved = write_photobooth_settings(settings)
    return {**photobooth_settings_response(saved), "slot_count": slot_count, "image_url": image_data["image_url"]}


@app.delete("/photobooth/template/by-id/{strip_id}")
def reset_photobooth_template_by_id(strip_id: str):
    with PHOTOBOOTH_SETTINGS_LOCK:
        settings = load_photobooth_settings()
        strip = next((strip for strip in settings["strip_options"] if strip["id"] == strip_id), None)
        if strip is None:
            return JSONResponse(status_code=404, content={"success": False, "message": "Strip tidak ditemukan"})
        strip.update(image_url=None, slots=[], width=None, height=None)
        return photobooth_settings_response(write_photobooth_settings(settings))


@app.delete("/photobooth/template/{slot_count}")
def delete_photobooth_template(slot_count: int):
    if slot_count not in PHOTOBOOTH_TEMPLATE_FILES:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "message": "Jumlah slot tidak valid"
            }
        )

    return reset_photobooth_template_by_id(f"photobooth-strip-{slot_count}")


@app.post("/photobooth/drive-upload")
async def upload_photobooth_drive(request: Request):
    try:
        payload = await read_bounded_json(request, MAX_UPLOAD_REQUEST_BYTES)
        gif_files = await run_in_threadpool(validate_gif_files, payload.get("gif_files"))
    except ValueError as error:
        return JSONResponse(status_code=400, content={"success": False, "message": str(error)})
    email = (payload.get("email") or "").strip()
    filename = payload.get("filename") or "photobooth-strip.jpg"
    parent_drive_folder_id = (payload.get("parent_drive_folder_id") or "").strip() or None
    if not parent_drive_folder_id:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "message": "Drive Awal Photobooth wajib diisi sebelum upload"
            }
        )

    folder_name = (payload.get("folder_name") or "").strip()
    if not folder_name:
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        folder_name = f"job_{timestamp}"
    strip_filename = f"{folder_name}_{os.path.basename(filename)}"
    strip_path = os.path.join(PHOTOBOOTH_STRIP_DIR, strip_filename)

    try:
        save_base64_file(payload.get("data_base64"), strip_path)
    except ValueError as error:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "message": str(error)
            }
        )

    try:
        folder = create_drive_folder(folder_name, parent_folder_id=parent_drive_folder_id)
    except DriveUploadError as error:
        return JSONResponse(
            status_code=502,
            content={
                "success": False,
                "message": f"Gagal membuat folder Google Drive: {error}"
            }
        )

    share_warning = None

    if email:
        try:
            share_drive_file(folder["id"], email)
        except DriveUploadError as error:
            share_warning = str(error)

    queue_id = add_to_queue(
        strip_path,
        drive_folder_id=folder["id"],
        source="photobooth"
    )

    gif_queue_ids = []
    for index, (gif_filename, gif_bytes) in enumerate(gif_files):
        attachment_name = f"{safe_filename(folder_name)}_{uuid.uuid4().hex[:12]}_{index}_{gif_filename}"
        attachment_path = os.path.join(PHOTOBOOTH_STRIP_DIR, attachment_name)
        with open(attachment_path, "wb") as attachment:
            attachment.write(gif_bytes)
        gif_queue_ids.append(add_to_queue(attachment_path, drive_folder_id=folder["id"], source="photobooth"))

    return {
        "success": True,
        "gif_queue_ids": gif_queue_ids,
        "folder_name": folder_name,
        "folder_id": folder["id"],
        "folder_url": folder.get("webViewLink"),
        "shared_to": email if email and not share_warning else None,
        "share_warning": share_warning,
        "queue_id": queue_id,
        "image_url": public_url(strip_path)
    }


@app.get("/printers")
def get_printers():
    if sys.platform == "win32":
        return get_printers_windows()
    else:
        return get_printers_unix()


def get_printers_unix():
    try:
        printers_output = subprocess.run(
            ["lpstat", "-p"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        default_output = subprocess.run(
            ["lpstat", "-d"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as error:
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Gagal membaca printer: {error}",
                "printers": [],
                "default_printer": None,
            },
        )

    printers = []

    for line in printers_output.stdout.splitlines():
        parts = line.split()

        if len(parts) >= 2 and parts[0] == "printer":
            printers.append({
                "name": parts[1],
                "status": " ".join(parts[2:]),
            })

    default_printer = None
    default_line = default_output.stdout.strip()

    if ":" in default_line:
        default_printer = default_line.split(":", 1)[1].strip() or None
    elif default_line.lower().startswith("system default destination:"):
        default_printer = default_line.split(":", 1)[1].strip() or None

    if default_printer and not any(printer["name"] == default_printer for printer in printers):
        printers.insert(0, {
            "name": default_printer,
            "status": "default",
        })

    return {
        "success": printers_output.returncode == 0 or bool(printers),
        "printers": printers,
        "default_printer": default_printer,
        "message": printers_output.stderr.strip() if printers_output.returncode != 0 else "",
    }


def get_printers_windows():
    try:
        import win32print
    except ImportError:
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": "win32print tidak tersedia. Install pywin32.",
                "printers": [],
                "default_printer": None,
            },
        )

    try:
        raw_printers = win32print.EnumPrinters(2)
        printers = []
        default_name = None

        for p in raw_printers:
            printers.append({
                "name": p[2],
                "status": "ready" if p[4] == 0 else "busy",
            })

        default_printer_handle = win32print.GetDefaultPrinter()
        default_name = default_printer_handle

        return {
            "success": True,
            "printers": printers,
            "default_printer": default_name,
            "message": "",
        }
    except Exception as error:
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Gagal membaca printer: {error}",
                "printers": [],
                "default_printer": None,
            },
        )


@app.post("/photobooth/print")
async def print_photobooth_strip(request: Request):
    payload = await request.json()
    printer_name = str(payload.get("printer_name") or "").strip()
    paper_size = str(payload.get("paper_size") or "4r").strip().lower()
    if paper_size not in ("3r", "4r"):
        paper_size = "4r"
    filename = safe_filename(payload.get("filename"), "photobooth-strip.jpg")
    print_id = uuid.uuid4().hex
    print_file = os.path.join(
        PHOTOBOOTH_STRIP_DIR,
        f"print_{print_id}_{filename}"
    )

    if not printer_name:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "message": "Pilih printer dulu di admin panel"
            }
        )

    try:
        save_base64_file(payload.get("data_base64"), print_file)
    except ValueError as error:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "message": str(error)
            }
        )

    if sys.platform == "win32":
        result = print_file_windows(printer_name, print_file, paper_size=paper_size)
    else:
        result = print_file_unix(printer_name, print_file, paper_size=paper_size)

    if result is not None:
        return result

    return {
        "success": True,
        "printer_name": printer_name,
        "paper_size": paper_size,
        "file": print_file,
    }


def print_file_unix(printer_name, print_file, paper_size="4r"):
    cups_media_by_size = {
        "3r": "Custom.3.5x5in",
        "4r": "Custom.4x6in",
    }
    cups_media = cups_media_by_size.get(paper_size, cups_media_by_size["4r"])

    try:
        result = subprocess.run(
            [
                "lpr",
                "-P",
                printer_name,
                "-o",
                f"media={cups_media}",
                "-o",
                "fit-to-page",
                print_file,
            ],
            capture_output=True,
            text=True,
            timeout=12,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as error:
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Gagal mengirim ke printer: {error}"
            }
        )

    if result.returncode != 0:
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": result.stderr.strip() or "Printer menolak job"
            }
        )

    return None


def print_file_windows(printer_name, print_file, paper_size="4r"):
    try:
        import win32api
    except ImportError:
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": "pywin32 tidak tersedia. Install pywin32."
            }
        )

    try:
        win32api.SetDefaultPrinter(printer_name)
        win32api.ShellExecute(
            0,
            "print",
            print_file,
            None,
            ".",
            0
        )
    except Exception as error:
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Gagal mencetak: {error}"
            }
        )

    return None


@app.post("/queue/clear")
async def clear_queue_endpoint(request: Request):
    payload = await request.json()
    source = payload.get("source", "photobooth")

    deleted = clear_queue(source)

    return {
        "success": True,
        "deleted": deleted
    }


@app.post("/queue/retry-failed")
async def retry_failed_queue_endpoint(request: Request):
    payload = await request.json()
    source = payload.get("source", "photobooth")

    retried = retry_failed_queue(source)

    return {
        "success": True,
        "retried": retried
    }


@app.get("/auto-watch-folder")
def get_auto_watch_folder_endpoint():
    return get_auto_watch_status()


@app.post("/auto-watch-folder")
async def set_auto_watch_folder_endpoint(request: Request):
    payload = await request.json()
    folder_path = (payload.get("folder_path") or "").strip()

    if not folder_path:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "message": "Folder path kosong"
            }
        )

    try:
        set_auto_watch_folder(
            folder_path,
            drive_folder_id=payload.get("drive_folder_id")
        )
    except ValueError as error:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "message": str(error)
            }
        )

    return {
        "success": True,
        "watch": get_auto_watch_status()
    }


@app.delete("/auto-watch-folder")
def disable_auto_watch_folder_endpoint():
    disable_auto_watch_folder()

    return {
        "success": True,
        "watch": get_auto_watch_status()
    }


@app.patch("/auto-watch-folder")
async def update_auto_watch_drive_folder_endpoint(request: Request):
    try:
        payload = await request.json()
    except ValueError:
        payload = None

    if (
        not isinstance(payload, dict)
        or "drive_folder_id" not in payload
        or not isinstance(payload["drive_folder_id"], (str, type(None)))
    ):
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": "Google Drive Folder ID tidak valid"},
        )

    set_auto_watch_drive_folder(payload["drive_folder_id"])
    return {"success": True, "watch": get_auto_watch_status()}


@app.get("/auto-watch-folder/file")
def get_auto_watch_file(request: Request):
    path = request.query_params.get("path") or ""
    normalized_path = os.path.abspath(os.path.expanduser(path))
    watch = get_auto_watch_status()
    folder_path = watch.get("folder_path") or ""

    if (
        not folder_path
        or not normalized_path.startswith(os.path.abspath(folder_path) + os.sep)
        or not os.path.isfile(normalized_path)
        or not normalized_path.lower().endswith((".jpg", ".jpeg", ".png"))
    ):
        return JSONResponse(
            status_code=404,
            content={
                "success": False,
                "message": "File tidak ditemukan"
            }
        )

    return FileResponse(normalized_path)


@app.post("/auto-watch-folder/commit-pending")
async def commit_auto_watch_pending_endpoint(request: Request):
    payload = await request.json()
    result = commit_pending_auto_watch_files(
        drive_folder_id=payload.get("drive_folder_id")
    )

    return {
        "success": True,
        "committed": len(result["queue_ids"]),
        "queue_ids": result["queue_ids"],
        "files": result["files"],
        "watch": get_auto_watch_status()
    }


@app.post("/manual-upload")
async def manual_upload_endpoint(request: Request):
    filename = safe_filename(request.query_params.get("filename"))
    drive_folder_id = request.query_params.get("drive_folder_id") or None
    batch_id = request.query_params.get("batch_id") or f"manual-{uuid.uuid4()}"
    batch_dir = os.path.join(MANUAL_UPLOAD_DIR, batch_id)
    os.makedirs(batch_dir, exist_ok=True)

    upload_path = os.path.join(
        batch_dir,
        f"{int(time.time() * 1000)}_{filename}"
    )

    body = await request.body()

    if not body:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "message": "File upload kosong"
            }
        )

    with open(upload_path, "wb") as file:
        file.write(body)

    edit_params = {
        "brightness": request.query_params.get("brightness"),
        "contrast": request.query_params.get("contrast"),
        "saturation": request.query_params.get("saturation"),
        "sharpness": request.query_params.get("sharpness"),
        "filter": request.query_params.get("filter"),
        "resize_mode": request.query_params.get("resize_mode"),
        "width": request.query_params.get("width"),
        "height": request.query_params.get("height"),
        "rotation": request.query_params.get("rotation"),
        "flip_h": request.query_params.get("flip_h"),
        "flip_v": request.query_params.get("flip_v"),
        "crop": request.query_params.get("crop"),
        "temperature": request.query_params.get("temperature"),
        "tint": request.query_params.get("tint"),
        "vignette": request.query_params.get("vignette"),
        "text_overlays": request.query_params.get("text_overlays"),
    }

    has_edit = any(
        value not in (None, "", "null")
        for value in edit_params.values()
    )

    queued_path = upload_path

    if has_edit:
        try:
            queued_path = process_edit_image(
                upload_path,
                output_dir=batch_dir,
                edit_settings=edit_params
            )
            if queued_path != upload_path:
                os.remove(upload_path)
        except Exception as error:
            print(f"❌ Edit processing gagal, file raw diupload: {error}")

    queue_id = add_to_queue(
        queued_path,
        drive_folder_id=drive_folder_id,
        source="auto_upload",
        status="staged",
        batch_id=batch_id
    )

    return {
        "success": True,
        "queue_id": queue_id,
        "batch_id": batch_id,
        "file_path": queued_path,
        "edited": has_edit
    }


@app.post("/manual-upload/commit")
async def manual_upload_commit_endpoint(request: Request):
    payload = await request.json()
    batch_id = payload.get("batch_id")

    if not batch_id:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "message": "Batch ID kosong"
            }
        )

    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    cur.execute("""
        UPDATE queue
        SET status = 'pending',
            updated_at = CURRENT_TIMESTAMP,
            last_error = NULL
        WHERE batch_id = ?
        AND source = 'auto_upload'
        AND status = 'staged'
    """, (batch_id,))
    committed = cur.rowcount
    conn.commit()
    conn.close()

    return {
        "success": True,
        "committed": committed
    }


@app.post("/manual-upload/cancel")
async def manual_upload_cancel_endpoint(request: Request):
    payload = await request.json()
    batch_id = payload.get("batch_id")

    if not batch_id:
        return {
            "success": True,
            "deleted": 0
        }

    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    cur.execute("""
        SELECT file_path
        FROM queue
        WHERE batch_id = ?
        AND source = 'auto_upload'
        AND status = 'staged'
    """, (batch_id,))
    paths = [row[0] for row in cur.fetchall()]
    cur.execute("""
        DELETE FROM queue
        WHERE batch_id = ?
        AND source = 'auto_upload'
        AND status = 'staged'
    """, (batch_id,))
    deleted = cur.rowcount
    conn.commit()
    conn.close()

    for path in paths:
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass

    batch_dir = os.path.join(MANUAL_UPLOAD_DIR, batch_id)

    if os.path.isdir(batch_dir):
        shutil.rmtree(batch_dir, ignore_errors=True)

    return {
        "success": True,
        "deleted": deleted
    }


@app.post("/maintenance/manual-uploads/cleanup")
async def cleanup_manual_uploads_endpoint(request: Request):
    payload = await request.json()
    max_age_seconds = int(payload.get("max_age_seconds", 86400))
    now = time.time()
    deleted = 0

    for root, _, files in os.walk(MANUAL_UPLOAD_DIR):
        for filename in files:
            path = os.path.join(root, filename)

            try:
                if now - os.path.getmtime(path) >= max_age_seconds:
                    os.remove(path)
                    deleted += 1
            except OSError:
                pass

    for root, dirs, _ in os.walk(MANUAL_UPLOAD_DIR, topdown=False):
        for dirname in dirs:
            path = os.path.join(root, dirname)

            try:
                if not os.listdir(path):
                    os.rmdir(path)
            except OSError:
                pass

    return {
        "success": True,
        "deleted": deleted
    }

def generate_camera_frames():

    global latest_frame

    set_camera_stream_enabled(True)

    cap = open_camera()

    if cap is None:
        print("❌ Kamera gagal dibuka dari server.py")
        return

    print("✅ Kamera stream aktif dari server.py")

    try:
        while is_camera_stream_enabled():

            ret, frame = cap.read()

            if not ret:
                time.sleep(0.05)
                continue

            with latest_frame_lock:
                latest_frame = frame.copy()

            success, buffer = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 100])

            if not success:
                time.sleep(0.05)
                continue

            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" +
                buffer.tobytes() +
                b"\r\n"
            )

            time.sleep(0.06)

    finally:
        cap.release()
        set_camera_stream_enabled(False)


# =========================
# CAPTURE PHOTO
# =========================
@app.post("/capture")
async def capture_photo(request: Request):
    current_captures = glob.glob(os.path.join(OUTPUT_DIR, "*.jpg"))

    payload = {}

    try:
        payload = await request.json()
    except Exception:
        payload = {}

    try:
        max_captures = int(payload.get("max_photo_count") or 6)
    except (TypeError, ValueError):
        max_captures = 6

    max_captures = min(PHOTOBOOTH_TEMPLATE_MAX_SLOTS * 2, max(1, max_captures))

    if len(current_captures) >= max_captures:
        return JSONResponse(
            status_code=409,
            content={
                "success": False,
                "message": f"Batas {max_captures} foto per sesi sudah tercapai"
            }
        )

    data_base64 = payload.get("data_base64")

    if data_base64:
        try:
            if "," in data_base64:
                data_base64 = data_base64.split(",", 1)[1]

            image_bytes = base64.b64decode(data_base64)
        except (binascii.Error, ValueError):
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "Data foto dari kamera tidak valid"
                }
            )

        filename = f"capture_{uuid.uuid4()}.jpg"
        output_path = os.path.join(OUTPUT_DIR, filename)

        with open(output_path, "wb") as file:
            file.write(image_bytes)

        return {
            "success": True,
            "filename": filename,
            "image_url": public_url(output_path)
        }

    frame = get_frame_snapshot()

    if frame is None:
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "message": "Camera frame belum tersedia"
            }
        )

    filename = f"capture_{uuid.uuid4()}.jpg"
    output_path = os.path.join(OUTPUT_DIR, filename)
    frame = cv2.flip(frame, 1)

    success = cv2.imwrite(
        output_path,
        frame,
        [int(cv2.IMWRITE_JPEG_QUALITY), 100]
    )

    if not success:
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": "Gagal menyimpan foto"
            }
        )

    return {
        "success": True,
        "filename": filename,
        "image_url": public_url(output_path)
    }


# =========================
# CAMERA CONTROL API
# =========================
@app.post("/camera/start")
def start_camera_stream():
    set_camera_stream_enabled(True)

    return {
        "success": True,
        "camera_stream_enabled": True
    }


@app.post("/camera/stop")
def stop_camera_stream():
    set_camera_stream_enabled(False)

    return {
        "success": True,
        "camera_stream_enabled": False
    }


@app.get("/camera/settings")
def get_camera_settings():
    with camera_props_lock:
        return {
            "success": True,
            "settings": dict(camera_props)
        }


@app.post("/camera/settings")
async def set_camera_settings(request: Request):
    payload = await request.json()

    with camera_props_lock:
        camera_props.clear()
        for key, value in payload.items():
            if key.startswith("CAP_PROP_"):
                prop_id = getattr(cv2, key, None)
                if prop_id is not None:
                    camera_props[prop_id] = value
            else:
                camera_props[key] = value

    return {
        "success": True,
        "settings": dict(camera_props)
    }

# =========================
# CAMERA STREAM API
# =========================
@app.get("/camera-stream")
def camera_stream():

    return StreamingResponse(
        generate_camera_frames(),
        media_type=(
            "multipart/x-mixed-replace;"
            " boundary=frame"
        )
    )
