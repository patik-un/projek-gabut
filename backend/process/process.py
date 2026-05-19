from PIL import Image, ImageDraw, ImageFont
import os
import uuid
import time

COUNTER_FILE = "counter.txt"
from queue_db import add_to_queue

PROCESSED_FOLDER = "processed"


def process_image(image_path):

    print(f"🛠 Processing: {image_path}")

    os.makedirs(PROCESSED_FOLDER, exist_ok=True)

    try:
        # =========================
        # delay safety (file write lock fix)
        # =========================
        time.sleep(0.4)

        # =========================
        # open image safely
        # =========================
        with Image.open(image_path) as img:
            image = img.convert("RGB")

        # =========================
        # resize maintain ratio
        # =========================
        image.thumbnail((1280, 720))

        # =========================
        # watermark
        # =========================
        draw = ImageDraw.Draw(image)

        text = "AUTO PHOTO SYSTEM"

        # font safe fallback
        try:
            font = ImageFont.truetype("Arial.ttf", 30)
        except:
            font = ImageFont.load_default()

        draw.text(
            (20, 20),
            text,
            fill=(255, 255, 255),
            font=font
        )

        # =========================
        # output file
        # =========================
        seq_id = get_next_id()

        output_name = f"{seq_id:06d}_{int(time.time())}.jpg"
        output_path = os.path.join(PROCESSED_FOLDER, output_name)

        image.save(output_path, "JPEG", quality=95, optimize=True)

        print(f"✅ Process selesai: {output_path}")

        # =========================
        # queue upload
        # =========================
        add_to_queue(output_path)

        print("📥 File masuk ke upload queue")

    except Exception as e:
        print("❌ Process gagal")
        print(f"Detail error: {e}")

def get_next_id():

    if not os.path.exists(COUNTER_FILE):
        with open(COUNTER_FILE, "w") as f:
            f.write("1")

    with open(COUNTER_FILE, "r") as f:
        number = int(f.read().strip())

    next_number = number + 1

    with open(COUNTER_FILE, "w") as f:
        f.write(str(next_number))

    return next_number