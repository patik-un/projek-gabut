from watchdog.observers.polling import PollingObserver
from watchdog.events import FileSystemEventHandler
import time
import os
import threading
import json

from process.process import process_image
from runtime_paths import get_backend_dir

BASE_DIR = get_backend_dir(__file__)

WATCH_FOLDER = os.path.join(BASE_DIR, "output")
AUTO_WATCH_CONFIG_FILE = os.path.join(BASE_DIR, "database", "auto_watch.json")
AUTO_WATCH_LOCK = threading.Lock()
AUTO_PROCESS_LOCK = threading.Lock()
AUTO_PROCESSING_FILES = set()
IMAGE_EXTENSIONS = (".jpg", ".jpeg")


def normalize_folder_path(folder_path):
    return os.path.abspath(os.path.expanduser(folder_path.strip()))


def image_file_info(path):
    try:
        stat = os.stat(path)
    except OSError:
        return None

    return {
        "path": path,
        "name": os.path.basename(path),
        "size": stat.st_size,
        "mtime": stat.st_mtime
    }


def list_folder_images(folder_path):
    if not folder_path or not os.path.isdir(folder_path):
        return []

    images = []

    for name in os.listdir(folder_path):
        path = os.path.join(folder_path, name)

        if (
            os.path.isfile(path)
            and path.lower().endswith(IMAGE_EXTENSIONS)
        ):
            info = image_file_info(path)

            if info:
                images.append(info)

    return sorted(images, key=lambda item: item["mtime"])


def normalize_pending_files(files):
    pending = []
    seen = set()

    for item in files or []:
        path = item.get("path") if isinstance(item, dict) else str(item)

        if not path:
            continue

        normalized_path = normalize_folder_path(path)

        if normalized_path in seen or not os.path.isfile(normalized_path):
            continue

        if not normalized_path.lower().endswith(IMAGE_EXTENSIONS):
            continue

        info = image_file_info(normalized_path)

        if info:
            pending.append(info)
            seen.add(normalized_path)

    return pending


def load_auto_watch_config():
    if not os.path.exists(AUTO_WATCH_CONFIG_FILE):
        return {
            "folder_path": "",
            "drive_folder_id": "",
            "enabled": False,
            "auto_upload_enabled": False,
            "known_files": [],
            "pending_files": []
        }

    try:
        with open(AUTO_WATCH_CONFIG_FILE, "r") as file:
            data = json.load(file)
    except (OSError, json.JSONDecodeError):
        data = {}

    folder_path = data.get("folder_path") or ""

    return {
        "folder_path": folder_path,
        "drive_folder_id": data.get("drive_folder_id") or "",
        "enabled": bool(data.get("enabled") and folder_path),
        "auto_upload_enabled": bool(data.get("auto_upload_enabled")),
        "known_files": list(data.get("known_files") or []),
        "pending_files": normalize_pending_files(data.get("pending_files"))
    }


def save_auto_watch_config(
    folder_path,
    drive_folder_id=None,
    enabled=True,
    auto_upload_enabled=False,
    known_files=None,
    pending_files=None
):
    os.makedirs(os.path.dirname(AUTO_WATCH_CONFIG_FILE), exist_ok=True)

    config = {
        "folder_path": folder_path,
        "drive_folder_id": drive_folder_id or "",
        "enabled": bool(enabled and folder_path),
        "auto_upload_enabled": bool(auto_upload_enabled and enabled),
        "known_files": sorted(set(known_files or [])),
        "pending_files": normalize_pending_files(pending_files or [])
    }

    with AUTO_WATCH_LOCK:
        with open(AUTO_WATCH_CONFIG_FILE, "w") as file:
            json.dump(config, file, indent=2)

    return config


def set_auto_watch_folder(folder_path, drive_folder_id=None):
    target_folder = normalize_folder_path(folder_path)

    if not os.path.isdir(target_folder):
        raise ValueError(f"Folder tidak ditemukan: {target_folder}")

    return save_auto_watch_config(
        target_folder,
        drive_folder_id=drive_folder_id,
        enabled=True,
        auto_upload_enabled=False,
        known_files=[
            item["path"]
            for item in list_folder_images(target_folder)
        ],
        pending_files=[]
    )


def disable_auto_watch_folder():
    config = load_auto_watch_config()

    return save_auto_watch_config(
        config["folder_path"],
        drive_folder_id=config["drive_folder_id"],
        enabled=False,
        auto_upload_enabled=False,
        known_files=config["known_files"],
        pending_files=config["pending_files"]
    )


def process_auto_watch_file(path, drive_folder_id=None):
    normalized_path = normalize_folder_path(path)

    with AUTO_PROCESS_LOCK:
        if normalized_path in AUTO_PROCESSING_FILES:
            return

        AUTO_PROCESSING_FILES.add(normalized_path)

    def run():
        try:
            process_image(
                normalized_path,
                drive_folder_id=drive_folder_id,
                source="auto_upload"
            )
        finally:
            with AUTO_PROCESS_LOCK:
                AUTO_PROCESSING_FILES.discard(normalized_path)

    threading.Thread(target=run, daemon=True).start()


def register_auto_watch_file(path, wait_ready=False, allow_auto_process=True):
    normalized_path = normalize_folder_path(path)

    if wait_ready and not wait_until_file_ready(normalized_path, timeout=8):
        return load_auto_watch_config()

    config = load_auto_watch_config()

    if not config["enabled"]:
        return config

    known_files = set(config["known_files"])
    pending_files = config["pending_files"]
    pending_paths = {item["path"] for item in pending_files}

    if normalized_path in known_files or normalized_path in pending_paths:
        return config

    info = image_file_info(normalized_path)

    if not info:
        return config

    known_files.add(normalized_path)

    if config["auto_upload_enabled"]:
        saved_config = save_auto_watch_config(
            config["folder_path"],
            drive_folder_id=config["drive_folder_id"],
            enabled=config["enabled"],
            auto_upload_enabled=config["auto_upload_enabled"],
            known_files=known_files,
            pending_files=pending_files
        )

        if allow_auto_process:
            process_auto_watch_file(
                normalized_path,
                drive_folder_id=config["drive_folder_id"] or None
            )

        return saved_config

    pending_files.append(info)

    return save_auto_watch_config(
        config["folder_path"],
        drive_folder_id=config["drive_folder_id"],
        enabled=config["enabled"],
        auto_upload_enabled=config["auto_upload_enabled"],
        known_files=known_files,
        pending_files=pending_files
    )


def reconcile_auto_watch_folder(allow_auto_process=True):
    config = load_auto_watch_config()

    if (
        not config["enabled"]
        or not config["folder_path"]
        or not os.path.isdir(config["folder_path"])
    ):
        return config

    if config["auto_upload_enabled"] and not allow_auto_process:
        return config

    for item in list_folder_images(config["folder_path"]):
        current_config = load_auto_watch_config()
        known_files = set(current_config["known_files"])
        pending_paths = {
            pending["path"]
            for pending in current_config["pending_files"]
        }

        if item["path"] in known_files or item["path"] in pending_paths:
            continue

        register_auto_watch_file(
            item["path"],
            wait_ready=True,
            allow_auto_process=allow_auto_process
        )

    return load_auto_watch_config()


def commit_pending_auto_watch_files(drive_folder_id=None):
    config = load_auto_watch_config()
    pending_files = config["pending_files"]
    queue_ids = []
    target_drive_folder_id = (
        drive_folder_id.strip()
        if drive_folder_id
        else config["drive_folder_id"]
    )

    save_auto_watch_config(
        config["folder_path"],
        drive_folder_id=target_drive_folder_id,
        enabled=config["enabled"],
        auto_upload_enabled=True,
        known_files=config["known_files"],
        pending_files=[]
    )

    for item in pending_files:
        queue_id = process_image(
            item["path"],
            drive_folder_id=target_drive_folder_id or None,
            source="auto_upload"
        )

        if queue_id:
            queue_ids.append(queue_id)

    return {
        "files": pending_files,
        "queue_ids": queue_ids
    }


def get_auto_watch_status():
    config = reconcile_auto_watch_folder(allow_auto_process=False)
    folder_path = config["folder_path"]

    return {
        **config,
        "exists": bool(folder_path and os.path.isdir(folder_path)),
        "pending_count": len(config["pending_files"]),
        "default_watch_folder": WATCH_FOLDER
    }


# =========================
# helper: tunggu file siap
# =========================
def wait_until_file_ready(path, timeout=5):
    start = time.time()
    last_size = -1

    while time.time() - start < timeout:
        if not os.path.exists(path):
            time.sleep(0.2)
            continue

        size = os.path.getsize(path)

        # file sudah stabil
        if size == last_size and size > 0:
            return True

        last_size = size
        time.sleep(0.3)

    return False


# =========================
# handler
# =========================
class NewFileHandler(FileSystemEventHandler):

    def __init__(self, source="photobooth", drive_folder_id=None):
        super().__init__()
        self.source = source
        self.drive_folder_id = drive_folder_id
        self.processed = set()

    def on_created(self, event):

        if event.is_directory:
            return

        path = event.src_path

        # filter non jpg
        if not path.lower().endswith(IMAGE_EXTENSIONS):
            return

        # anti duplicate event
        if path in self.processed:
            return

        self.processed.add(path)

        print(f"\n📸 File baru terdeteksi: {path}")

        # tunggu file selesai ditulis
        if not wait_until_file_ready(path):
            print("⚠️ File tidak stabil, skip")
            return

        print("✅ JPG siap diproses")

        if self.source == "auto_upload":
            config = register_auto_watch_file(path)

            if not config["auto_upload_enabled"]:
                print("📌 File masuk daftar pending auto upload")

            return

        # jalankan di thread (non-blocking)
        threading.Thread(
            target=process_image,
            args=(path,),
            kwargs={
                "drive_folder_id": self.drive_folder_id,
                "source": self.source
            },
            daemon=True
        ).start()

    def on_moved(self, event):
        if event.is_directory:
            return

        event.src_path = event.dest_path
        self.on_created(event)


def start_observer(folder_path, source="photobooth", drive_folder_id=None):
    os.makedirs(folder_path, exist_ok=True)

    observer = PollingObserver()
    event_handler = NewFileHandler(
        source=source,
        drive_folder_id=drive_folder_id
    )

    observer.schedule(
        event_handler,
        folder_path,
        recursive=False
    )

    observer.start()
    return observer


# =========================
# start detector
# =========================
def start_detector():

    observer = None
    auto_observer = None
    active_auto_key = None

    print("👀 Detector aktif")
    print("📂 Photobooth output watcher nonaktif; upload dilakukan setelah edit strip")

    try:
        while True:
            config = load_auto_watch_config()
            auto_key = (
                config["folder_path"],
                config["drive_folder_id"],
                config["enabled"],
                config["auto_upload_enabled"]
            )

            if auto_key != active_auto_key:
                if auto_observer:
                    auto_observer.stop()
                    auto_observer.join()
                    auto_observer = None
                    print("🛑 Auto upload folder watcher berhenti")

                active_auto_key = auto_key

                if (
                    config["enabled"]
                    and config["folder_path"]
                    and os.path.isdir(config["folder_path"])
                    and os.path.abspath(config["folder_path"]) != os.path.abspath(WATCH_FOLDER)
                ):
                    auto_observer = start_observer(
                        config["folder_path"],
                        source="auto_upload",
                        drive_folder_id=config["drive_folder_id"] or None
                    )
                    print("👀 Auto upload folder watcher aktif")
                    print(f"📂 Monitoring auto folder: {config['folder_path']}")

            reconcile_auto_watch_folder(allow_auto_process=True)
            time.sleep(1)

    except KeyboardInterrupt:
        print("\n🛑 Stopping detector...")
        if observer:
            observer.stop()
        if auto_observer:
            auto_observer.stop()

    if observer:
        observer.join()
    if auto_observer:
        auto_observer.join()
