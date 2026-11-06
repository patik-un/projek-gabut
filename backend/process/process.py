from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageEnhance
import numpy as np
import os
import time
import threading
import json
import gc

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
# PHOTO EDIT PIPELINE (EDIT & OPTIMASI)
# =========================
DEFAULT_PHOTO_EDIT_SETTINGS = {
    "brightness": 100,
    "contrast": 100,
    "saturation": 100,
    "sharpness": 0,
    "filter": "none",
    "resize_mode": "keep",
    "width": None,
    "height": None,
    "rotation": 0,
    "flip_h": False,
    "flip_v": False,
    "crop": None,
    "temperature": 0,
    "tint": 0,
    "vignette": 0,
    "text_overlays": [],
}

PHOTO_FILTER_IDS = {
    "none", "grayscale", "sepia", "vintage", "noir",
    "cool", "warm", "vivid", "faded",
}

PHOTO_RESIZE_MODES = {"keep", "width", "height", "stretch", "cover", "contain"}

TEXT_OVERLAY_FONTS = {
    "arial": [
        "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "Arial.ttf",
    ],
    "helvetica": [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Supplemental/Helvetica.ttc",
        "Helvetica.ttc",
    ],
    "verdana": [
        "/Library/Fonts/Verdana.ttf",
        "/System/Library/Fonts/Supplemental/Verdana.ttf",
        "Verdana.ttf",
    ],
    "georgia": [
        "/Library/Fonts/Georgia.ttf",
        "/System/Library/Fonts/Supplemental/Georgia.ttf",
        "Georgia.ttf",
    ],
    "times": [
        "/Library/Fonts/Times New Roman.ttf",
        "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
        "Times New Roman.ttf",
    ],
    "impact": [
        "/Library/Fonts/Impact.ttf",
        "/System/Library/Fonts/Supplemental/Impact.ttf",
        "Impact.ttf",
    ],
    "courier": [
        "/Library/Fonts/Courier New.ttf",
        "/System/Library/Fonts/Supplemental/Courier New.ttf",
        "Courier New.ttf",
    ],
    "comic": [
        "/Library/Fonts/Comic Sans MS.ttf",
        "/System/Library/Fonts/Supplemental/Comic Sans MS.ttf",
        "Comic Sans MS.ttf",
    ],
}


def _clamp_edit_value(value, minimum, maximum, fallback, cast=int):
    if value in (None, "", "null"):
        return fallback
    try:
        number = cast(value)
    except (TypeError, ValueError):
        return fallback
    return min(maximum, max(minimum, number))


def _normalize_crop(value):
    if value in (None, "", "null"):
        return None
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except (ValueError, TypeError):
            return None
    else:
        parsed = value
    if not isinstance(parsed, (list, tuple)) or len(parsed) != 4:
        return None
    x = _clamp_edit_value(parsed[0], 0, 1, 0, cast=float)
    y = _clamp_edit_value(parsed[1], 0, 1, 0, cast=float)
    crop_width = _clamp_edit_value(parsed[2], 0.01, 1, 1, cast=float)
    crop_height = _clamp_edit_value(parsed[3], 0.01, 1, 1, cast=float)
    crop_width = min(crop_width, 1 - x)
    crop_height = min(crop_height, 1 - y)
    if crop_width < 0.01 or crop_height < 0.01:
        return None
    return [x, y, crop_width, crop_height]


def _normalize_text_overlays(value):
    if value in (None, "", "null", []):
        return []
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except (ValueError, TypeError):
            return []
    else:
        parsed = value
    if not isinstance(parsed, list):
        return []

    overlays = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        text = str(item.get("text") or "").strip()
        if not text:
            continue
        font = str(item.get("font") or "arial").lower()
        if font not in TEXT_OVERLAY_FONTS:
            font = "arial"
        overlays.append({
            "text": text,
            "font": font,
            "size": _clamp_edit_value(item.get("size"), 1, 100, 5),
            "color": str(item.get("color") or "#ffffff"),
            "opacity": _clamp_edit_value(item.get("opacity"), 0, 100, 100),
            "x": _clamp_edit_value(item.get("x"), 0, 100, 50),
            "y": _clamp_edit_value(item.get("y"), 0, 100, 50),
            "align": item.get("align") if item.get("align") in {"left", "center", "right"} else "center",
        })
    return overlays


def normalize_photo_edit_settings(settings=None):
    settings = settings or {}
    return {
        "brightness": _clamp_edit_value(settings.get("brightness"), 0, 200, 100),
        "contrast": _clamp_edit_value(settings.get("contrast"), 0, 200, 100),
        "saturation": _clamp_edit_value(settings.get("saturation"), 0, 200, 100),
        "sharpness": _clamp_edit_value(settings.get("sharpness"), -100, 100, 0),
        "filter": settings.get("filter") if settings.get("filter") in PHOTO_FILTER_IDS else "none",
        "resize_mode": settings.get("resize_mode") if settings.get("resize_mode") in PHOTO_RESIZE_MODES else "keep",
        "width": _clamp_edit_value(settings.get("width"), 1, 20000, None),
        "height": _clamp_edit_value(settings.get("height"), 1, 20000, None),
        "rotation": _clamp_edit_value(settings.get("rotation"), -360, 360, 0),
        "flip_h": settings.get("flip_h") in (True, 1, "1", "true", "True", "on"),
        "flip_v": settings.get("flip_v") in (True, 1, "1", "true", "True", "on"),
        "crop": _normalize_crop(settings.get("crop")),
        "temperature": _clamp_edit_value(settings.get("temperature"), -100, 100, 0),
        "tint": _clamp_edit_value(settings.get("tint"), -100, 100, 0),
        "vignette": _clamp_edit_value(settings.get("vignette"), 0, 100, 0),
        "text_overlays": _normalize_text_overlays(settings.get("text_overlays")),
    }


def apply_photo_enhance(image, settings):
    output = image
    if settings["brightness"] != 100:
        output = ImageEnhance.Brightness(output).enhance(settings["brightness"] / 100)
    if settings["contrast"] != 100:
        output = ImageEnhance.Contrast(output).enhance(settings["contrast"] / 100)
    if settings["saturation"] != 100:
        output = ImageEnhance.Color(output).enhance(settings["saturation"] / 100)
    if settings["sharpness"] != 0:
        output = ImageEnhance.Sharpness(output).enhance(1 + settings["sharpness"] / 100)
    return output


def _sepia_image(image):
    array = np.array(image.convert("RGB"), dtype=np.float32)
    red = array[:, :, 0] * 0.393 + array[:, :, 1] * 0.769 + array[:, :, 2] * 0.189
    green = array[:, :, 0] * 0.349 + array[:, :, 1] * 0.686 + array[:, :, 2] * 0.168
    blue = array[:, :, 0] * 0.272 + array[:, :, 1] * 0.534 + array[:, :, 2] * 0.131
    output = np.stack([red, green, blue], axis=2).clip(0, 255).astype(np.uint8)
    return Image.fromarray(output)


def apply_photo_filter(image, filter_id):
    if filter_id == "grayscale":
        return ImageOps.grayscale(image).convert("RGB")

    if filter_id == "sepia":
        return _sepia_image(image)

    if filter_id == "noir":
        gray = ImageOps.grayscale(image).convert("RGB")
        return ImageEnhance.Contrast(gray).enhance(1.35)

    if filter_id == "vintage":
        sepia = _sepia_image(image)
        return ImageEnhance.Contrast(ImageEnhance.Brightness(sepia).enhance(1.06)).enhance(0.92)

    if filter_id == "warm":
        color = ImageEnhance.Color(image).enhance(1.2)
        return ImageEnhance.Brightness(Image.blend(color, _sepia_image(image), alpha=0.22)).enhance(1.04)

    if filter_id == "cool":
        color = np.array(ImageEnhance.Color(image).enhance(1.15).convert("RGB"), dtype=np.float32)
        color[:, :, 0] = np.clip(color[:, :, 0] * 0.94, 0, 255)
        color[:, :, 2] = np.clip(color[:, :, 2] * 1.06, 0, 255)
        return Image.fromarray(color.astype(np.uint8))

    if filter_id == "vivid":
        return ImageEnhance.Contrast(ImageEnhance.Color(image).enhance(1.35)).enhance(1.08)

    if filter_id == "faded":
        output = ImageEnhance.Color(image).enhance(0.75)
        output = ImageEnhance.Brightness(output).enhance(1.12)
        return ImageEnhance.Contrast(output).enhance(0.88)

    return image


def apply_white_balance(image, temperature, tint):
    if temperature == 0 and tint == 0:
        return image

    array = np.array(image.convert("RGB"), dtype=np.float32)
    temperature_factor = temperature * 0.0012
    tint_factor = tint * 0.0012

    array[:, :, 0] *= 1 + temperature_factor + tint_factor
    array[:, :, 1] *= 1 - tint_factor * 1.6
    array[:, :, 2] *= 1 - temperature_factor + tint_factor

    return Image.fromarray(array.clip(0, 255).astype(np.uint8))


def apply_photo_transform(image, settings):
    rotation = settings["rotation"] % 360

    if rotation == 90:
        image = image.transpose(Image.ROTATE_270)
    elif rotation == 180:
        image = image.transpose(Image.ROTATE_180)
    elif rotation == 270:
        image = image.transpose(Image.ROTATE_90)

    if settings["flip_h"]:
        image = image.transpose(Image.FLIP_LEFT_RIGHT)
    if settings["flip_v"]:
        image = image.transpose(Image.FLIP_TOP_BOTTOM)

    return image


def apply_photo_crop(image, crop):
    if not crop:
        return image

    width, height = image.size
    left = max(0, round(crop[0] * width))
    top = max(0, round(crop[1] * height))
    right = min(width, round((crop[0] + crop[2]) * width))
    bottom = min(height, round((crop[1] + crop[3]) * height))

    if right - left < 2 or bottom - top < 2:
        return image

    return image.crop((left, top, right, bottom))


def apply_vignette(image, intensity):
    if intensity <= 0:
        return image

    width, height = image.size
    y_positions, x_positions = np.mgrid[0:height, 0:width]
    dx = (x_positions - width / 2) / (width / 2)
    dy = (y_positions - height / 2) / (height / 2)
    distance = np.sqrt(dx * dx + dy * dy)
    strength = np.clip((intensity / 100) * 1.25 * (distance - 0.35), 0, 1)
    mask = Image.fromarray((strength * 255).astype(np.uint8), "L")
    return Image.composite(Image.new("RGB", (width, height), (0, 0, 0)), image, mask)


def _load_overlay_font(font_name, size):
    candidates = TEXT_OVERLAY_FONTS.get(font_name, TEXT_OVERLAY_FONTS["arial"])
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def _parse_hex_color(value, fallback):
    if not isinstance(value, str):
        return fallback
    color = value.strip().lstrip("#")
    if len(color) == 3:
        color = "".join(channel * 2 for channel in color)
    if len(color) != 6:
        return fallback
    try:
        return tuple(int(color[index:index + 2], 16) for index in (0, 2, 4))
    except ValueError:
        return fallback


def apply_text_overlays(image, overlays):
    if not overlays:
        return image

    draw = ImageDraw.Draw(image, "RGBA")
    width, height = image.size

    for overlay in overlays:
        text = overlay.get("text") or ""
        if not text:
            continue

        size = max(8, round(min(width, height) * overlay["size"] / 100))
        font = _load_overlay_font(overlay["font"], size)
        color = _parse_hex_color(overlay["color"], (255, 255, 255))
        alpha = round(255 * overlay["opacity"] / 100)
        x = width * overlay["x"] / 100
        y = height * overlay["y"] / 100

        if overlay["align"] == "left":
            anchor = "lm"
        elif overlay["align"] == "right":
            anchor = "rm"
        else:
            anchor = "mm"

        draw.text((x, y), text, font=font, fill=(*color, alpha), anchor=anchor)

    return image


def _cover_resize(image, width, height):
    original_width, original_height = image.size
    scale = max(width / original_width, height / original_height)
    resized = image.resize(
        (max(1, round(original_width * scale)), max(1, round(original_height * scale))),
        Image.LANCZOS,
    )
    resized_width, resized_height = resized.size
    left = (resized_width - width) // 2
    top = (resized_height - height) // 2
    return resized.crop((left, top, left + width, top + height))


def resize_output_image(image, settings):
    mode = settings["resize_mode"]
    width = settings["width"]
    height = settings["height"]

    if mode == "keep" or (width is None and height is None):
        return image

    original_width, original_height = image.size

    if mode == "width" and width:
        scale = width / original_width
        return image.resize((width, max(1, round(original_height * scale))), Image.LANCZOS)

    if mode == "height" and height:
        scale = height / original_height
        return image.resize((max(1, round(original_width * scale)), height), Image.LANCZOS)

    if mode == "stretch" and width and height:
        return image.resize((width, height), Image.LANCZOS)

    if mode == "contain" and width and height:
        thumbnail = image.copy()
        thumbnail.thumbnail((width, height), Image.LANCZOS)
        return thumbnail

    if mode == "cover" and width and height:
        return _cover_resize(image, width, height)

    return image


def process_edit_image(input_path, output_dir=None, edit_settings=None):
    settings = normalize_photo_edit_settings(edit_settings)
    output_dir = output_dir or PROCESSED_FOLDER
    os.makedirs(output_dir, exist_ok=True)

    with Image.open(input_path) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGB")

    image = apply_white_balance(image, settings["temperature"], settings["tint"])
    image = apply_photo_enhance(image, settings)
    image = apply_photo_filter(image, settings["filter"])
    image = apply_photo_transform(image, settings)
    image = apply_photo_crop(image, settings["crop"])
    image = apply_vignette(image, settings["vignette"])
    image = apply_text_overlays(image, settings["text_overlays"])
    image = resize_output_image(image, settings)

    watermark_applied = apply_uploaded_watermark(image)

    base_name = os.path.splitext(os.path.basename(input_path))[0]
    output_path = os.path.join(output_dir, f"edit_{int(time.time() * 1000)}_{base_name}.jpg")
    jpeg_options = get_output_jpeg_options()
    image.save(output_path, "JPEG", **jpeg_options)

    print(
        f"🖼️  Edit diproses -> {output_path} "
        f"(watermark={watermark_applied}, q={jpeg_options.get('quality', 100)}, "
        f"brightness={settings['brightness']}, contrast={settings['contrast']}, "
        f"saturation={settings['saturation']}, sharpness={settings['sharpness']}, "
        f"filter={settings['filter']}, temp={settings['temperature']}, "
        f"tint={settings['tint']}, rotation={settings['rotation']}, "
        f"flip={settings['flip_h']}/{settings['flip_v']}, "
        f"crop={settings['crop']}, vignette={settings['vignette']}, "
        f"texts={len(settings['text_overlays'])}, "
        f"resize={settings['resize_mode']} "
        f"{settings['width'] or ''}x{settings['height'] or ''})"
    )
    return output_path


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
        gc.collect()
        return queue_id
    except Exception as e:

        print("❌ Process gagal")
        print(f"Detail error: {e}")
        return None
