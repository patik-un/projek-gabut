import threading
import time
import signal
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from capture.capture import start_camera
from detect.detect import start_detector
from queue_db import start_upload_worker


system_running = True


def signal_handler(sig, frame):
    global system_running
    print("\n🛑 Stopping system...")
    system_running = False
    sys.exit(0)


signal.signal(signal.SIGINT, signal_handler)


def main():

    global system_running

    print("🚀 AUTO PHOTO SYSTEM STARTING...")

    # =========================
    # START UPLOAD WORKER (ONLY ONCE)
    # =========================
    workers = start_upload_worker(worker_count=3)
    print("✅ Upload worker aktif")

    # =========================
    # DETECTOR
    # =========================
    detector_thread = threading.Thread(
        target=start_detector,
        daemon=True
    )
    detector_thread.start()

    print("✅ Detector aktif")

    # =========================
    # CAMERA
    # =========================
    try:
        start_camera()

    except Exception as e:
        print(f"❌ Camera crash: {e}")

    finally:
        system_running = False
        print("🧹 System shutdown complete")


if __name__ == "__main__":
    main()