import threading
import time
import signal
import sys
import os
import subprocess
import atexit
import uvicorn

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from detect.detect import start_detector
from queue_db import start_upload_worker
from api.server import app as fastapi_app


system_running = True
api_process = None
api_server = None
api_thread = None


def signal_handler(sig, frame):
    global system_running
    print("\n🛑 Stopping system...")
    system_running = False
    cleanup_api_server()
    raise SystemExit(0)


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


def cleanup_api_server():
    global api_process, api_server

    if api_server is not None:
        print("🛑 Stopping API server...")
        api_server.should_exit = True
        api_server = None

    if api_process is None:
        return

    if api_process.poll() is not None:
        api_process = None
        return

    print("🛑 Stopping API server...")
    api_process.terminate()

    try:
        api_process.wait(timeout=5)
        print("✅ API server stopped")
    except subprocess.TimeoutExpired:
        api_process.kill()
        api_process.wait()
        print("✅ API server killed")

    api_process = None


atexit.register(cleanup_api_server)


def start_api_server():
    global api_process, api_server, api_thread
    api_port = os.environ.get("EVENT_BOOTH_BACKEND_PORT", "8000")

    if getattr(sys, "frozen", False):
        config = uvicorn.Config(
            fastapi_app,
            host="127.0.0.1",
            port=int(api_port),
            log_level="info",
        )
        api_server = uvicorn.Server(config)
        api_thread = threading.Thread(
            target=api_server.run,
            daemon=True,
        )
        api_thread.start()
        print("✅ API server aktif")
        return

    api_process = subprocess.Popen([
        sys.executable,
        "-m",
        "uvicorn",
        "api.server:app",
        "--host",
        "127.0.0.1",
        "--port",
        api_port
    ])

    print("✅ API server aktif")


def main():
    global system_running

    print("🚀 AUTO PHOTO SYSTEM STARTING...")

    start_api_server()

    start_upload_worker(worker_count=1)
    print("✅ Upload worker aktif")

    detector_thread = threading.Thread(
        target=start_detector,
        daemon=True
    )
    detector_thread.start()

    print("✅ Detector aktif")

    try:
        while system_running:
            time.sleep(1)

    except Exception as e:
        print(f"❌ Main crash: {e}")

    finally:
        system_running = False
        print("🧹 System shutdown complete")


if __name__ == "__main__":
    main()
