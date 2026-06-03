from PIL import Image, ImageDraw, ImageFont, ImageOps
import os
import time
import threading
import json

from queue_db import add_to_queue
from runtime_paths import get_backend_dir

# =========================
# CONFIG
# =========================
BASE_DIR = get_backend_dir(__file__)

PROCESSED_FOLDER = os.path.join(BASE_DIR, "processed")

WATERMARK_FILE = os.path.join(
    BASE_DIR,
    "watermark",
    "active_watermark.png"
)

WATERMARK_FILES = {
    "landscape": os.path.join(BASE_DIR, "watermark", "active_watermark_landscape.png"),
    "portrait": os.path.join(BASE_DIR, "watermark", "active_watermark_portrait.png")
}

WATERMARK_SETTINGS_FILE = os.path.join(
    BASE_DIR,
    "watermark",
    "settings.json"
)

COUNTER_FILE = os.path.join(BASE_DIR, "counter.txt")
OUTPUT_SETTINGS_FILE = os.path.join(BASE_DIR, "database", "output_settings.json")

counter_lock = threading.Lock()

WATERMARK_TEXT = "AUTO PHOTO SYSTEM"

# Preserve source resolution for event/gallery uploads. The previous 1280x720
# resize made 2 MB camera files collapse into tiny KB-sized outputs.
MAX_SIZE = None

JPEG_QUALITY = 100
JPEG_SUBSAMPLING = 0
JPEG_OPTIMIZE = False
OUTPUT_COMPRESSION_QUALITIES = {10, 20, 30, 40, 50, 60, 70, 80, 90}
DEFAULT_OUTPUT_SETTINGS = {
    "compression_enabled": False,
    "compression_quality": 70
}

DEFAULT_WATERMARK_SETTINGS = {
    "fit": "manual",
    "position": "bottom-right",
    "scale": 24,
    "rotation": 0,
    "opacity": 100,
    "frame_scale": 100,
    "frame_x": 0,
    "frame_y": 0,
    "photo_scale": 100,
    "photo_x": 0,
    "photo_y": 0
}

DEFAULT_WATERMARK_PROFILES = {
    "landscape": DEFAULT_WATERMARK_SETTINGS.copy(),
    "portrait": {
        **DEFAULT_WATERMARK_SETTINGS,
        "position": "bottom-center",
        "scale": 32
    }
}


def normalize_output_settings(settings=None):
    settings = settings or {}
    quality = settings.get(
        "compression_quality",
        settings.get(
            "outputCompressionQuality",
            DEFAULT_OUTPUT_SETTINGS["compression_quality"]
        )
    )

    try:
        quality = int(quality)
    except (TypeError, ValueError):
        quality = DEFAULT_OUTPUT_SETTINGS["compression_quality"]

    if quality not in OUTPUT_COMPRESSION_QUALITIES:
        quality = DEFAULT_OUTPUT_SETTINGS["compression_quality"]

    return {
        "compression_enabled": bool(
            settings.get(
                "compression_enabled",
                settings.get(
                    "outputCompressionEnabled",
                    DEFAULT_OUTPUT_SETTINGS["compression_enabled"]
                )
            )
        ),
        "compression_quality": quality
    }


def load_output_settings():
    if not os.path.exists(OUTPUT_SETTINGS_FILE):
        return DEFAULT_OUTPUT_SETTINGS.copy()

    try:
        with open(OUTPUT_SETTINGS_FILE, "r") as file:
            return normalize_output_settings(json.load(file))
    except (OSError, json.JSONDecodeError):
        return DEFAULT_OUTPUT_SETTINGS.copy()


def write_output_settings(settings):
    normalized = normalize_output_settings(settings)
    os.makedirs(os.path.dirname(OUTPUT_SETTINGS_FILE), exist_ok=True)

    with open(OUTPUT_SETTINGS_FILE, "w") as file:
        json.dump(normalized, file, indent=2)

    return normalized


def get_output_jpeg_options():
    settings = load_output_settings()
    quality = (
        settings["compression_quality"]
        if settings["compression_enabled"]
        else JPEG_QUALITY
    )

    return {
        "quality": quality,
        "subsampling": JPEG_SUBSAMPLING,
        "optimize": JPEG_OPTIMIZE
    }


def normalize_watermark_settings(settings):
    position = settings.get("position", DEFAULT_WATERMARK_SETTINGS["position"])
    fit = settings.get("fit", DEFAULT_WATERMARK_SETTINGS["fit"])
    scale = settings.get("scale", DEFAULT_WATERMARK_SETTINGS["scale"])
    rotation = settings.get("rotation", DEFAULT_WATERMARK_SETTINGS["rotation"])
    opacity = settings.get("opacity", DEFAULT_WATERMARK_SETTINGS["opacity"])
    frame_scale = settings.get(
        "frame_scale",
        DEFAULT_WATERMARK_SETTINGS["frame_scale"]
    )
    frame_x = settings.get("frame_x", DEFAULT_WATERMARK_SETTINGS["frame_x"])
    frame_y = settings.get("frame_y", DEFAULT_WATERMARK_SETTINGS["frame_y"])
    photo_scale = settings.get(
        "photo_scale",
        DEFAULT_WATERMARK_SETTINGS["photo_scale"]
    )
    photo_x = settings.get("photo_x", DEFAULT_WATERMARK_SETTINGS["photo_x"])
    photo_y = settings.get("photo_y", DEFAULT_WATERMARK_SETTINGS["photo_y"])

    if fit not in {"manual", "frame"}:
        fit = DEFAULT_WATERMARK_SETTINGS["fit"]

    if position not in {
        "top-left",
        "top-center",
        "top-right",
        "center-left",
        "center",
        "center-right",
        "bottom-left",
        "bottom-center",
        "bottom-right",
    }:
        position = DEFAULT_WATERMARK_SETTINGS["position"]

    try:
        scale = int(scale)
    except (TypeError, ValueError):
        scale = DEFAULT_WATERMARK_SETTINGS["scale"]

    try:
        rotation = int(rotation)
    except (TypeError, ValueError):
        rotation = DEFAULT_WATERMARK_SETTINGS["rotation"]

    try:
        opacity = int(opacity)
    except (TypeError, ValueError):
        opacity = DEFAULT_WATERMARK_SETTINGS["opacity"]

    try:
        frame_scale = int(frame_scale)
    except (TypeError, ValueError):
        frame_scale = DEFAULT_WATERMARK_SETTINGS["frame_scale"]

    try:
        frame_x = int(frame_x)
    except (TypeError, ValueError):
        frame_x = DEFAULT_WATERMARK_SETTINGS["frame_x"]

    try:
        frame_y = int(frame_y)
    except (TypeError, ValueError):
        frame_y = DEFAULT_WATERMARK_SETTINGS["frame_y"]

    try:
        photo_scale = int(photo_scale)
    except (TypeError, ValueError):
        photo_scale = DEFAULT_WATERMARK_SETTINGS["photo_scale"]

    try:
        photo_x = int(photo_x)
    except (TypeError, ValueError):
        photo_x = DEFAULT_WATERMARK_SETTINGS["photo_x"]

    try:
        photo_y = int(photo_y)
    except (TypeError, ValueError):
        photo_y = DEFAULT_WATERMARK_SETTINGS["photo_y"]

    return {
        "fit": fit,
        "position": position,
        "scale": min(100, max(5, scale)),
        "rotation": min(180, max(-180, rotation)),
        "opacity": min(100, max(0, opacity)),
        "frame_scale": min(200, max(20, frame_scale)),
        "frame_x": min(100, max(-100, frame_x)),
        "frame_y": min(100, max(-100, frame_y)),
        "photo_scale": min(200, max(50, photo_scale)),
        "photo_x": min(100, max(-100, photo_x)),
        "photo_y": min(100, max(-100, photo_y))
    }


def normalize_watermark_profiles(settings):
    if "portrait" not in settings and "landscape" not in settings:
        normalized = normalize_watermark_settings(settings)

        return {
            "landscape": normalized,
            "portrait": {
                **normalized,
                "position": "bottom-center"
            }
        }

    return {
        "landscape": normalize_watermark_settings({
            **DEFAULT_WATERMARK_PROFILES["landscape"],
            **settings.get("landscape", {})
        }),
        "portrait": normalize_watermark_settings({
            **DEFAULT_WATERMARK_PROFILES["portrait"],
            **settings.get("portrait", {})
        })
    }


def load_watermark_profiles():
    if not os.path.exists(WATERMARK_SETTINGS_FILE):
        return {
            "landscape": DEFAULT_WATERMARK_PROFILES["landscape"].copy(),
            "portrait": DEFAULT_WATERMARK_PROFILES["portrait"].copy()
        }

    try:
        with open(WATERMARK_SETTINGS_FILE, "r") as file:
            return normalize_watermark_profiles(json.load(file))
    except (OSError, json.JSONDecodeError):
        return {
            "landscape": DEFAULT_WATERMARK_PROFILES["landscape"].copy(),
            "portrait": DEFAULT_WATERMARK_PROFILES["portrait"].copy()
        }


def load_watermark_settings(orientation="landscape"):
    profiles = load_watermark_profiles()

    return profiles.get(
        orientation,
        profiles["landscape"]
    )


def load_active_watermark_items(orientation="landscape"):
    watermark_file = WATERMARK_FILES.get(orientation)

    if not watermark_file or not os.path.exists(watermark_file):
        watermark_file = WATERMARK_FILE

    if not os.path.exists(watermark_file):
        return []

    return [{
        "path": watermark_file
    }]


def get_watermark_position(position, base_size, overlay_size, margin):
    base_width, base_height = base_size
    overlay_width, overlay_height = overlay_size

    x_positions = {
        "left": margin,
        "center": (base_width - overlay_width) // 2,
        "right": base_width - overlay_width - margin,
    }
    y_positions = {
        "top": margin,
        "center": (base_height - overlay_height) // 2,
        "bottom": base_height - overlay_height - margin,
    }

    if position == "center":
        vertical = "center"
        horizontal = "center"
    else:
        vertical, horizontal = position.split("-")

    x = x_positions[horizontal]
    y = y_positions[vertical]

    return (
        min(max(0, x), max(0, base_width - overlay_width)),
        min(max(0, y), max(0, base_height - overlay_height))
    )


def resize_image(image, size):
    resampling = getattr(Image, "Resampling", Image).LANCZOS
    return image.resize(size, resampling)


def apply_opacity(overlay, opacity):
    if opacity >= 100:
        return overlay

    alpha = overlay.getchannel("A")
    alpha = alpha.point(lambda value: int(value * opacity / 100))
    overlay = overlay.copy()
    overlay.putalpha(alpha)

    return overlay


def apply_single_watermark(base, watermark_path, settings, opacity):
    with Image.open(watermark_path) as watermark:
        overlay = watermark.convert("RGBA")

    base_width, base_height = base.size
    overlay_width, overlay_height = overlay.size


    if settings["fit"] == "frame":
        overlay = resize_image(
            overlay,
            (base_width, base_height)
        )
        base.paste(overlay, (0, 0), overlay)
        return base

    reference_size = min(base_width, base_height)
    target_width = max(32, int(reference_size * settings["scale"] / 100))
    target_height = int(target_width * overlay_height / overlay_width)

    overlay = resize_image(
        overlay,
        (target_width, target_height)
    )
    overlay = overlay.rotate(
        settings["rotation"],
        expand=True,
        resample=getattr(Image, "Resampling", Image).BICUBIC
    )
    overlay = apply_opacity(overlay, opacity)

    margin = max(18, int(base_width * 0.025))
    position = get_watermark_position(
        settings["position"],
        base.size,
        overlay.size,
        margin
    )

    base.alpha_composite(overlay, position)
    return base


def apply_uploaded_watermark(image):
    base = image.convert("RGBA")
    base_width, base_height = base.size
    orientation = "portrait" if base_height > base_width else "landscape"
    active_watermarks = load_active_watermark_items(orientation)

    if not active_watermarks:
        return False

    print(
        f"🧭 Watermark orientation: {orientation} "
        f"({base_width}x{base_height}px)"
    )
    settings = load_watermark_settings(orientation)

    if settings["fit"] == "frame":
        photo_width = max(1, int(base_width * settings["photo_scale"] / 100))
        photo_height = max(1, int(base_height * settings["photo_scale"] / 100))
        photo_offset_x = int(base_width * settings["photo_x"] / 100)
        photo_offset_y = int(base_height * settings["photo_y"] / 100)
        photo = resize_image(base, (photo_width, photo_height))
        adjusted_base = Image.new("RGBA", base.size, (0, 0, 0, 255))
        adjusted_base.paste(
            photo,
            (
                ((base_width - photo_width) // 2) + photo_offset_x,
                ((base_height - photo_height) // 2) + photo_offset_y
            ),
            photo
        )
        base = adjusted_base

    for watermark_item in active_watermarks:
        base = apply_single_watermark(
            base,
            watermark_item["path"],
            settings,
            settings["opacity"]
        )

    image.paste(base.convert("RGB"))

    return True


# =========================
# GET NEXT ID (THREAD SAFE)
# =========================
def get_next_id():

    with counter_lock:

        # create file if not exists
        if not os.path.exists(COUNTER_FILE):
            with open(COUNTER_FILE, "w") as f:
                f.write("0")

        # read current number
        with open(COUNTER_FILE, "r") as f:
            content = f.read().strip()

            if not content:
                current = 0
            else:
                current = int(content)

        next_number = current + 1

        # write new number
        with open(COUNTER_FILE, "w") as f:
            f.write(str(next_number))

        return next_number


# =========================
# PROCESS IMAGE
# =========================
def process_image(image_path, drive_folder_id=None, source="photobooth"):

    print(f"🛠 Processing: {image_path}")

    os.makedirs(PROCESSED_FOLDER, exist_ok=True)

    try:

        # =========================
        # SAFETY DELAY
        # =========================
        time.sleep(0.4)

        # =========================
        # VALIDATE FILE
        # =========================
        if not os.path.exists(image_path):
            raise Exception(f"File not found: {image_path}")

        # =========================
        # OPEN IMAGE SAFELY
        # =========================
        with Image.open(image_path) as img:
            image = ImageOps.exif_transpose(img).convert("RGB")
            original_size = image.size

        # =========================
        # PRESERVE SOURCE RESOLUTION
        # =========================
        if MAX_SIZE:
            image.thumbnail(MAX_SIZE)

        # =========================
        # WATERMARK
        # =========================
        if not apply_uploaded_watermark(image):
            draw = ImageDraw.Draw(image)

            try:
                font = ImageFont.truetype("Arial.ttf", 30)
            except:
                font = ImageFont.load_default()

            draw.text(
                (20, 20),
                WATERMARK_TEXT,
                fill=(255, 255, 255),
                font=font
            )

        if image.size != original_size:
            raise Exception(
                "Output image size changed unexpectedly: "
                f"{original_size[0]}x{original_size[1]} -> "
                f"{image.size[0]}x{image.size[1]}"
            )

        # =========================
        # GENERATE FILE NAME
        # =========================
        seq_id = get_next_id()

        timestamp = time.strftime("%Y%m%d_%H%M%S")

        output_name = f"{seq_id:06d}_{timestamp}.jpg"

        output_path = os.path.join(
            PROCESSED_FOLDER,
            output_name
        )

        # =========================
        # SAVE IMAGE
        # =========================
        jpeg_options = get_output_jpeg_options()
        image.save(
            output_path,
            "JPEG",
            **jpeg_options
        )

        print(f"✅ Process selesai: {output_path}")
        print(f"🗜 JPEG quality: {jpeg_options['quality']}")

        # =========================
        # VERIFY OUTPUT
        # =========================
        if not os.path.exists(output_path):
            raise Exception("Output image failed to save")

        with Image.open(output_path) as saved_image:
            saved_size = saved_image.size

        if saved_size != original_size:
            raise Exception(
                "Saved image size changed unexpectedly: "
                f"{original_size[0]}x{original_size[1]} -> "
                f"{saved_size[0]}x{saved_size[1]}"
            )

        print(
            "📐 Pixel dipertahankan: "
            f"{original_size[0]}x{original_size[1]}"
        )

        # =========================
        # ADD TO SQLITE QUEUE
        # =========================
        queue_id = add_to_queue(
            output_path,
            drive_folder_id=drive_folder_id,
            source=source
        )

        print("📥 File masuk ke upload queue")
        return queue_id

    except Exception as e:

        print("❌ Process gagal")
        print(f"Detail error: {e}")
        return None
