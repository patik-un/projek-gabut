"""Bounded offline photo cutouts. No catalog writes or external models."""
import base64
import binascii
import struct

import cv2
import numpy as np

MAX_IMAGE_BYTES = 4 * 1024 * 1024
MAX_BASE64_LENGTH = 4 * ((MAX_IMAGE_BYTES + 2) // 3)
MAX_REQUEST_BYTES = MAX_BASE64_LENGTH + 4096
MAX_SOURCE_PIXELS = 24 * 1024 * 1024
MAX_WORKING_EDGE = 1024


class SegmentationError(Exception):
    """A valid photo needs a better subject guide or manual correction."""


def _source_dimensions(data, mime):
    # Reject decompression bombs before OpenCV allocates the decoded bitmap.
    if mime == "png" and data[:8] == b"\x89PNG\r\n\x1a\n" and len(data) >= 24 and data[12:16] == b"IHDR":
        return struct.unpack(">II", data[16:24])
    if mime == "jpeg" and data[:2] == b"\xff\xd8":
        offset = 2
        while offset < len(data):
            if data[offset] != 255:
                break
            while offset < len(data) and data[offset] == 255:
                offset += 1
            if offset >= len(data):
                break
            marker = data[offset]
            offset += 1
            if marker in (0xD9, 0xDA):
                break
            if marker == 0x01 or 0xD0 <= marker <= 0xD7:
                continue
            if offset + 2 > len(data):
                break
            length = int.from_bytes(data[offset:offset + 2], "big")
            if length < 2 or offset + length > len(data):
                break
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF) and length >= 8:
                height, width = struct.unpack(">HH", data[offset + 3:offset + 7])
                return width, height
            offset += length
    if mime == "webp" and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        offset = 12
        while offset + 8 <= len(data):
            tag = data[offset:offset + 4]
            length = int.from_bytes(data[offset + 4:offset + 8], "little")
            chunk = data[offset + 8:offset + 8 + length]
            if len(chunk) != length:
                break
            if tag == b"VP8X" and length >= 10:
                return 1 + int.from_bytes(chunk[4:7], "little"), 1 + int.from_bytes(chunk[7:10], "little")
            if tag == b"VP8L" and length >= 5 and chunk[0] == 0x2F:
                packed = int.from_bytes(chunk[1:5], "little")
                return (packed & 0x3FFF) + 1, ((packed >> 14) & 0x3FFF) + 1
            if tag == b"VP8 " and length >= 10 and chunk[3:6] == b"\x9d\x01\x2a":
                return int.from_bytes(chunk[6:8], "little") & 0x3FFF, int.from_bytes(chunk[8:10], "little") & 0x3FFF
            offset += 8 + length + (length % 2)
    raise ValueError("Data gambar PNG, JPEG, atau WebP tidak valid")


def _decode_image(image_data):
    if not isinstance(image_data, str):
        raise ValueError("image_data harus berupa data URL PNG, JPEG, atau WebP")
    prefix, separator, encoded = image_data.partition(",")
    accepted = {"data:image/png;base64": "png", "data:image/jpeg;base64": "jpeg", "data:image/webp;base64": "webp"}
    if not separator or prefix not in accepted or not encoded or len(encoded) > MAX_BASE64_LENGTH:
        raise ValueError("Gunakan gambar PNG, JPEG, atau WebP maksimal 4 MB")
    try:
        data = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as error:
        raise ValueError("Data base64 gambar tidak valid") from error
    if len(data) > MAX_IMAGE_BYTES:
        raise ValueError("Ukuran gambar maksimal 4 MB")
    width, height = _source_dimensions(data, accepted[prefix])
    if min(width, height) < 3 or width * height > MAX_SOURCE_PIXELS or max(width, height) > 16384:
        raise ValueError("Dimensi gambar harus minimal 3 piksel dan maksimal 24 megapiksel / sisi 16384 piksel")
    try:
        image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_UNCHANGED)
    except cv2.error as error:
        raise ValueError("Gambar tidak dapat dibaca") from error
    if image is None or image.size == 0 or image.shape[:2] != (height, width):
        raise ValueError("Gambar tidak dapat dibaca")
    if image.dtype == np.uint16:
        image = (image // 257).astype(np.uint8)
    if image.dtype != np.uint8:
        raise ValueError("Format warna gambar tidak didukung")
    if image.ndim == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGRA)
    elif image.shape[2] == 3:
        image = cv2.cvtColor(image, cv2.COLOR_BGR2BGRA)
    elif image.shape[2] != 4:
        raise ValueError("Format warna gambar tidak didukung")
    if max(width, height) > MAX_WORKING_EDGE:
        scale = MAX_WORKING_EDGE / max(width, height)
        image = cv2.resize(image, (max(3, round(width * scale)), max(3, round(height * scale))), interpolation=cv2.INTER_AREA)
    return image


def _subject_rect(rect, width, height):
    if rect is None:
        rect = {"x": .05, "y": .05, "width": .9, "height": .9}
    if not isinstance(rect, dict) or set(rect) != {"x", "y", "width", "height"}:
        raise ValueError("rect harus berisi x, y, width, height antara 0 dan 1")
    values = [rect[key] for key in ("x", "y", "width", "height")]
    if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 1 for value in values):
        raise ValueError("Koordinat rect harus berupa angka terbatas antara 0 dan 1")
    x, y, w, h = values
    if x < 0 or y < 0 or w <= 0 or h <= 0 or x + w > 1 or y + h > 1:
        raise ValueError("rect harus berada di dalam gambar")
    left, top = round(x * width), round(y * height)
    right, bottom = round((x + w) * width), round((y + h) * height)
    if right - left < 2 or bottom - top < 2 or (left == 0 and top == 0 and right == width and bottom == height):
        raise ValueError("rect terlalu kecil atau tidak menyisakan latar belakang; beri jarak di sekitar subjek")
    return left, top, right - left, bottom - top


def remove_background(image_data, rect=None):
    image = _decode_image(image_data)
    height, width = image.shape[:2]
    bounds = _subject_rect(rect, width, height)
    alpha = image[:, :, 3].copy()
    if np.any(alpha):
        mask = np.zeros((height, width), np.uint8)
        try:
            cv2.grabCut(np.ascontiguousarray(image[:, :, :3]), mask, bounds,
                        np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64),
                        4, cv2.GC_INIT_WITH_RECT)
        except cv2.error as error:
            raise SegmentationError("Latar belum dapat dipisahkan. Sesuaikan kotak subjek atau gunakan penghapus manual.") from error
        cutout = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
        alpha = np.minimum(alpha, cutout)
        if not np.any(alpha):
            raise SegmentationError("Subjek belum ditemukan. Sesuaikan kotak subjek atau gunakan penghapus manual.")
    image[:, :, 3] = alpha
    try:
        ok, encoded = cv2.imencode(".png", image)
    except cv2.error as error:
        raise SegmentationError("Hasil stiker belum dapat dibuat. Coba gambar lain.") from error
    if not ok:
        raise SegmentationError("Hasil stiker belum dapat dibuat. Coba gambar lain.")
    return {"success": True, "image_data": "data:image/png;base64," + base64.b64encode(encoded).decode("ascii"), "width": width, "height": height}
