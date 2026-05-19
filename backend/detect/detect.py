from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import time
import os
import threading

from process.process import process_image

WATCH_FOLDER = "output"


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

    def __init__(self):
        super().__init__()
        self.processed = set()

    def on_created(self, event):

        if event.is_directory:
            return

        path = event.src_path

        # filter non jpg
        if not path.lower().endswith(".jpg"):
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

        # jalankan di thread (non-blocking)
        threading.Thread(
            target=process_image,
            args=(path,),
            daemon=True
        ).start()


# =========================
# start detector
# =========================
def start_detector():

    observer = Observer()
    event_handler = NewFileHandler()

    observer.schedule(
        event_handler,
        WATCH_FOLDER,
        recursive=False
    )

    observer.start()

    print("👀 Detector aktif")
    print(f"📂 Monitoring folder: {WATCH_FOLDER}")

    try:
        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        print("\n🛑 Stopping detector...")
        observer.stop()

    observer.join()