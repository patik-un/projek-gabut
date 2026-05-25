import cv2
import time
import os
import uuid
import sys

BASE_DIR = os.path.abspath(
    os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        ".."
    )
)

OUTPUT_FOLDER = os.path.join(BASE_DIR, "output")

last_capture = 0

# =========================
# GLOBAL FRAME
# =========================
latest_frame = None

# =========================
# GLOBAL CAMERA
# =========================
camera = None


def get_latest_frame():
    return latest_frame


def start_camera():

    global last_capture
    global latest_frame
    global camera

    print("📸 start_camera dipanggil")

    os.makedirs(OUTPUT_FOLDER, exist_ok=True)

    print("📂 Folder output siap")

    # =========================
    # OPEN CAMERA
    # =========================
    if sys.platform == "win32":
        camera_backend = cv2.CAP_DSHOW
    elif sys.platform == "darwin":
        camera_backend = cv2.CAP_AVFOUNDATION
    else:
        camera_backend = cv2.CAP_ANY

    camera = cv2.VideoCapture(
        2,
        camera_backend
    )

    print("🎥 Mencoba membuka kamera...")

    if not camera.isOpened():
        print("❌ Camera gagal dibuka")
        camera.release()
        return

    print("✅ Camera berhasil dibuka")
    print("SPACE = Capture")
    print("Q = Quit")

    try:
        while True:

            ret, frame = camera.read()

            if not ret:
                print("❌ Gagal membaca frame")
                break

            # =========================
            # SAVE GLOBAL FRAME
            # =========================
            latest_frame = frame.copy()

            # =========================
            # REMOVE OPENCV WINDOW
            # =========================
            # cv2.imshow("MacBook Camera", frame)

            key = cv2.waitKey(1)

            # =========================
            # SPACE = CAPTURE
            # =========================
            if key == 32:

                now = time.time()

                # debounce
                if now - last_capture < 1:
                    continue

                last_capture = now

                filename = os.path.join(
                    OUTPUT_FOLDER,
                    f"capture_{uuid.uuid4()}.jpg"
                )

                cv2.imwrite(filename, frame)

                print(f"✅ Foto disimpan: {filename}")

            elif key == ord('q'):
                break

    finally:
        camera.release()
        cv2.destroyAllWindows()
