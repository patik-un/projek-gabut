import base64
import binascii
import math
import io
import re

import cv2
import numpy as np
from PIL import Image


def normalize_decoration_style(style, collection):
    if not isinstance(style, dict):
        raise ValueError("Gaya desain harus berupa objek")
    numbers = {"size": (2, 14) if collection == "texts" else (6, 40),
               "rotation": (-180, 180), "opacity": (20, 100), "outlineWidth": (0, 8 if collection == "texts" else 12)}
    choices = {"shadow": ("none", "soft", "glow")}
    colors = {"outlineColor"}
    if collection == "texts":
        choices.update(font=("sans", "serif", "cute", "retro", "bold"), weight=(400, 600, 800),
                       background=("none", "rounded", "pill"))
        colors.update(("color", "backgroundColor"))
    allowed = set(numbers) | set(choices) | colors | ({"italic"} if collection == "texts" else set())
    result = {}
    for key, value in style.items():
        if key not in allowed:
            raise ValueError("Pengaturan gaya tidak dikenal")
        if key in numbers:
            minimum, maximum = numbers[key]
            if type(value) not in (int, float) or not math.isfinite(value) or not minimum <= value <= maximum:
                raise ValueError("Nilai ukuran atau efek desain tidak valid")
        elif key in choices:
            if isinstance(value, bool) or value not in choices[key]:
                raise ValueError("Pilihan gaya desain tidak valid")
        elif key in colors:
            if not isinstance(value, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
                raise ValueError("Warna desain harus berupa kode HEX")
        elif type(value) is not bool:
            raise ValueError("Pengaturan miring tidak valid")
        result[key] = value
    return result


def validate_gif_sticker(raw):
    try:
        with Image.open(io.BytesIO(raw)) as image:
            if image.format != "GIF" or max(image.size) > 1024:
                raise ValueError("GIF harus berformat GIF asli, maksimal 1024 piksel")
            decoded_pixels = 0
            for index in range(101):
                try:
                    image.seek(index)
                except EOFError:
                    break
                if index >= 100:
                    raise ValueError("GIF maksimal 100 frame")
                width, height = image.size
                decoded_pixels += width * height
                if max(width, height) > 1024 or decoded_pixels > 40_000_000:
                    raise ValueError("GIF melebihi batas dimensi atau total 40 juta piksel")
                image.load()
    except ValueError:
        raise
    except Exception as error:
        raise ValueError("Data GIF stiker tidak valid") from error


def normalize_editor_catalog(payload):
    if not isinstance(payload, dict):
        raise ValueError("Katalog edit harus berupa objek")
    result = {}
    for collection in ("stickers", "texts"):
        items = payload.get(collection)
        if not isinstance(items, list) or len(items) > 100:
            raise ValueError("Maksimal 100 item per jenis katalog")
        normalized, identifiers = [], set()
        image_bytes = 0
        for item in items:
            if not isinstance(item, dict):
                raise ValueError("Item katalog tidak valid")
            identifier = item.get("id")
            if not isinstance(identifier, str) or not identifier.strip() or len(identifier) > 100 or identifier in identifiers:
                raise ValueError("ID katalog harus unik dan tidak kosong")
            if type(item.get("visible")) is not bool:
                raise ValueError("Status tampil katalog tidak valid")
            identifiers.add(identifier)
            entry = {"id": identifier, "visible": item["visible"]}
            if "style" in item:
                entry["style"] = normalize_decoration_style(item["style"], collection)
            if collection == "texts":
                text = item.get("text")
                if not isinstance(text, str) or not text.strip() or len(text) > 32:
                    raise ValueError("Tulisan wajib diisi, maksimal 32 karakter")
                entry["text"] = text.strip()
            else:
                name, content, kind = item.get("name"), item.get("content"), item.get("kind")
                if not isinstance(name, str) or not name.strip() or len(name) > 80:
                    raise ValueError("Nama stiker wajib diisi, maksimal 80 karakter")
                if not isinstance(content, str) or kind not in ("emoji", "image", "gif"):
                    raise ValueError("Jenis stiker tidak valid")
                if kind in ("image", "gif"):
                    header, _, encoded = content.partition(",")
                    allowed_headers = ("data:image/gif;base64",) if kind == "gif" else ("data:image/png;base64", "data:image/jpeg;base64", "data:image/webp;base64")
                    if header not in allowed_headers or len(encoded) > 2800000:
                        raise ValueError("Stiker harus PNG, JPEG, WebP, atau GIF sesuai jenisnya, maksimal 2 MB")
                    try:
                        raw = base64.b64decode(encoded, validate=True)
                    except (ValueError, binascii.Error):
                        raise ValueError("Data gambar stiker tidak valid")
                    image_bytes += len(raw)
                    if len(raw) > 2 * 1024 * 1024 or image_bytes > 12 * 1024 * 1024:
                        raise ValueError("Total gambar stiker maksimal 12 MB")
                    if not raw:
                        raise ValueError("Data gambar stiker kosong")
                    if kind == "gif":
                        validate_gif_sticker(raw)
                        gif_style = {"size": 18, "shadow": "none", "outlineWidth": 0, **entry.get("style", {})}
                        if gif_style["shadow"] != "none" or gif_style["outlineWidth"] != 0:
                            raise ValueError("GIF hanya mendukung ukuran, rotasi, dan opasitas tanpa efek bayangan atau garis")
                        entry["style"] = gif_style
                    else:
                        try:
                            image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_UNCHANGED)
                        except cv2.error:
                            raise ValueError("Data gambar stiker tidak valid")
                        if image is None or max(image.shape[:2]) > 2048:
                            raise ValueError("Gambar stiker tidak valid atau melebihi 2048 piksel")
                elif not content.strip() or len(content) > 32:
                    raise ValueError("Isi stiker tidak valid")
                entry.update(name=name.strip(), content=content, kind=kind)
            normalized.append(entry)
        result[collection] = normalized
    return result
