import cv2
import time
import os
import uuid

OUTPUT_FOLDER = "output"
last_capture = 0


def start_camera():

    global last_capture

    print("📸 start_camera dipanggil")

    os.makedirs(OUTPUT_FOLDER, exist_ok=True)

    print("📂 Folder output siap")

    # buka kamera MacBook
    cap = cv2.VideoCapture(0, cv2.CAP_AVFOUNDATION)

    print("🎥 Mencoba membuka kamera...")

    if not cap.isOpened():
        print("❌ Camera gagal dibuka")
        cap.release()
        return

    print("✅ Camera berhasil dibuka")
    print("SPACE = Capture")
    print("Q = Quit")

    while True:

        ret, frame = cap.read()

        if not ret:
            print("❌ Gagal membaca frame")
            break

        cv2.imshow("MacBook Camera", frame)

        key = cv2.waitKey(1)

        # SPACE key
        if key == 32:

            now = time.time()

            # debounce capture (anti spam)
            if now - last_capture < 1:
                continue

            last_capture = now

            filename = f"{OUTPUT_FOLDER}/capture_{uuid.uuid4()}.jpg"

            cv2.imwrite(filename, frame)

            print(f"✅ Foto disimpan: {filename}")

        elif key == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()