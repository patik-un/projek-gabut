"""Bounded local GIF generation for session photos and animated strip stickers."""
import base64
import binascii
import io
import math
import os
import time
import uuid

from PIL import Image, UnidentifiedImageError

MAX_GIF_REQUEST_BYTES = 24 * 1024 * 1024
MAX_UPLOAD_REQUEST_BYTES = 32 * 1024 * 1024
MAX_IMAGE_BYTES = 4 * 1024 * 1024
MAX_STICKER_BYTES = 2 * 1024 * 1024
MAX_INPUT_BYTES = 16 * 1024 * 1024
MAX_DECODED_PIXELS = 24 * 1024 * 1024
MAX_OUTPUT_PIXELS = 24 * 1024 * 1024
MAX_OUTPUT_BYTES = 12 * 1024 * 1024
MAX_OUTPUT_EDGE = 960
MAX_FRAMES = 120
MAX_DURATION_MS = 8000
MAX_RENDER_SECONDS = 15
MAX_OVERLAYS = 12
MAX_GIF_ATTACHMENTS = 2
MAX_ATTACHMENT_BYTES = 18 * 1024 * 1024


class _Budget:
    def __init__(self, deadline=None):
        self.bytes = 0
        self.pixels = 0
        self.deadline = deadline

    def check(self):
        _check_deadline(self.deadline)

    def add_pixels(self, size):
        self.check()
        width, height = size
        if min(size) < 1 or max(size) > 16384:
            raise ValueError("Dimensi gambar tidak didukung")
        self.pixels += width * height
        if self.pixels > MAX_DECODED_PIXELS:
            raise ValueError("Total piksel gambar/animasi melebihi batas 24 megapiksel")


def _check_deadline(deadline):
    if deadline is not None and time.monotonic() > deadline:
        raise ValueError("Batas waktu pembuatan GIF tercapai; kurangi ukuran atau jumlah stiker")


def _number(value, minimum, maximum, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not minimum <= value <= maximum:
        raise ValueError(f"{label} harus berupa angka antara {minimum} dan {maximum}")
    return value


def _base64(value, maximum):
    if not isinstance(value, str) or not value or len(value) > 4 * ((maximum + 2) // 3):
        raise ValueError("Ukuran data gambar terlalu besar atau kosong")
    try:
        data = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as error:
        raise ValueError("Base64 gambar tidak valid") from error
    if len(data) > maximum:
        raise ValueError("Ukuran data gambar terlalu besar")
    return data


def _data_url(value, formats, maximum, budget):
    budget.check()
    if not isinstance(value, str):
        raise ValueError("Gambar harus berupa data URL base64")
    prefix, separator, encoded = value.partition(",")
    accepted = {f"data:image/{mime};base64": format for mime, format in formats.items()}
    if not separator or prefix not in accepted:
        raise ValueError("Format data URL gambar tidak didukung")
    data = _base64(encoded, maximum)
    budget.bytes += len(data)
    if budget.bytes > MAX_INPUT_BYTES:
        raise ValueError("Total data gambar maksimal 16 MB")
    return data, accepted[prefix]


def _open(data, expected):
    try:
        image = Image.open(io.BytesIO(data))
        if image.format != expected:
            image.close()
            raise ValueError("Isi gambar tidak cocok dengan format yang dinyatakan")
        return image
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise ValueError("Gambar rusak atau tidak didukung") from error


def _static(value, budget):
    data, expected = _data_url(value, {"png": "PNG", "jpeg": "JPEG", "webp": "WEBP"}, MAX_IMAGE_BYTES, budget)
    with _open(data, expected) as image:
        budget.add_pixels(image.size)
        if getattr(image, "n_frames", 1) != 1:
            raise ValueError("Gunakan gambar statis untuk foto dan latar strip")
        try:
            return image.convert("RGBA")
        except (OSError, ValueError) as error:
            raise ValueError("Gambar rusak atau tidak didukung") from error


def _animation(data, budget, retain=True):
    frames, durations = [], []
    with _open(data, "GIF") as image:
        try:
            for index in range(MAX_FRAMES + 1):
                try:
                    image.seek(index)
                except EOFError:
                    break
                if index == MAX_FRAMES:
                    raise ValueError("GIF maksimal 120 frame")
                budget.add_pixels(image.size)
                duration = image.info.get("duration", 100)
                duration = max(10, int(duration) if duration else 100)
                durations.append(duration)
                if sum(durations) > MAX_DURATION_MS:
                    raise ValueError("Durasi GIF maksimal 8 detik")
                # Pillow seek applies disposal and composes local-frame transparency.
                rgba = image.convert("RGBA")
                if retain:
                    frames.append(rgba.copy())
                rgba.close()
        except (OSError, EOFError) as error:
            raise ValueError("Frame GIF rusak") from error
    if not durations:
        raise ValueError("GIF tidak memiliki frame")
    return frames, durations


def _fit_size(size, count):
    width, height = size
    scale = min(1, MAX_OUTPUT_EDGE / max(size), math.sqrt(MAX_OUTPUT_PIXELS / (width * height * count)))
    return max(1, int(width * scale)), max(1, int(height * scale))


def _opaque(image):
    background = Image.new("RGBA", image.size, "white")
    background.alpha_composite(image)
    return background.convert("RGB")


class _BoundedOutput(io.BytesIO):
    def __init__(self, deadline):
        super().__init__()
        self.deadline = deadline

    def write(self, data):
        _check_deadline(self.deadline)
        if self.tell() + len(data) > MAX_OUTPUT_BYTES:
            raise ValueError("Hasil GIF melebihi 12 MB; kurangi ukuran atau jumlah stiker")
        return super().write(data)


def _encode(frames, durations, mode, deadline):
    output = _BoundedOutput(deadline)
    palette_frames = []
    for frame in frames:
        _check_deadline(deadline)
        palette_frames.append(frame.convert("RGB").quantize(colors=256))
    palette_frames[0].save(output, format="GIF", save_all=True, append_images=palette_frames[1:],
                           duration=durations, loop=0, disposal=2, optimize=False)
    data = output.getvalue()
    with Image.open(io.BytesIO(data)) as gif:
        width, height = gif.size
        count = gif.n_frames
    return {"success": True, "data_url": "data:image/gif;base64," + base64.b64encode(data).decode("ascii"),
            "filename": f"photobooth-{mode}-{uuid.uuid4().hex[:12]}.gif", "width": width, "height": height, "frame_count": count}


def _photos(payload, deadline):
    sources = payload.get("frames")
    if not isinstance(sources, list) or not 2 <= len(sources) <= 20:
        raise ValueError("GIF foto memerlukan 2 sampai 20 foto")
    duration = _number(payload.get("duration_ms", 500), 100, 1000, "duration_ms")
    duration = max(10, int(min(duration, MAX_DURATION_MS / len(sources)) // 10) * 10)
    budget, frames = _Budget(deadline), []
    size = None
    for source in sources:
        image = _static(source, budget)
        if size is None:
            size = _fit_size(image.size, len(sources))
        # Canvas snapshots share a ratio; center-fit differing external frames.
        frame = Image.new("RGBA", size, "white")
        image.thumbnail(size, Image.Resampling.LANCZOS)
        frame.alpha_composite(image, ((size[0] - image.width) // 2, (size[1] - image.height) // 2))
        frames.append(frame.convert("RGB"))
    return _encode(frames, [duration] * len(frames), "photos", deadline)


def _timeline(animations):
    length = max(sum(durations) for _, durations, _ in animations)
    boundaries = {0, length}
    for _, durations, _ in animations:
        time = 0
        index = 0
        while time < length:
            time = min(length, time + durations[index % len(durations)])
            boundaries.add(time)
            index += 1
    times = sorted(boundaries)
    if len(times) - 1 > MAX_FRAMES:
        # GIF timing is measured in centiseconds; a bounded uniform sample is
        # deterministic when combined source events would exceed 120 frames.
        step = math.ceil(length / MAX_FRAMES / 10) * 10
        times = list(range(0, length, step)) + [length]
    return times


def _frame_at(frames, durations, time):
    position = time % sum(durations)
    for frame, duration in zip(frames, durations):
        if position < duration:
            return frame
        position -= duration
    return frames[-1]


def _strip(payload, deadline):
    overlays = payload.get("overlays")
    if not isinstance(overlays, list) or not 1 <= len(overlays) <= MAX_OVERLAYS:
        raise ValueError("GIF strip memerlukan 1 sampai 12 stiker GIF")
    budget = _Budget(deadline)
    background = _static(payload.get("background_data"), budget)
    source_size = background.size
    animations = []
    for overlay in overlays:
        if not isinstance(overlay, dict):
            raise ValueError("Data stiker GIF harus berupa objek")
        x = _number(overlay.get("x"), -source_size[0], source_size[0] * 2, "x")
        y = _number(overlay.get("y"), -source_size[1], source_size[1] * 2, "y")
        width = _number(overlay.get("width"), 1, source_size[0] * 2, "width")
        height = _number(overlay.get("height"), 1, source_size[1] * 2, "height")
        rotation = _number(overlay.get("rotation", 0), -360, 360, "rotation")
        opacity = _number(overlay.get("opacity", 100), 0, 100, "opacity")
        padding_x = _number(overlay.get("padding_x", 0), 0, .49, "padding_x")
        padding_y = _number(overlay.get("padding_y", 0), 0, .49, "padding_y")
        data, _ = _data_url(overlay.get("data_url"), {"gif": "GIF"}, MAX_STICKER_BYTES, budget)
        frames, durations = _animation(data, budget)
        animations.append((frames, durations, (x, y, width, height, rotation, opacity, padding_x, padding_y)))
    times = _timeline(animations)
    size = _fit_size(source_size, len(times) - 1)
    scale_x, scale_y = size[0] / source_size[0], size[1] / source_size[1]
    background = _opaque(background.resize(size, Image.Resampling.LANCZOS)).convert("RGBA")
    # Keep source frames bounded; transform only the selected frame during each
    # output step, avoiding a second retained decoded-animation allocation.
    output = []
    for time in times[:-1]:
        _check_deadline(deadline)
        composite = background.copy()
        for frames, durations, (x, y, width, height, rotation, opacity, padding_x, padding_y) in animations:
            _check_deadline(deadline)
            source = _frame_at(frames, durations, time)
            inner_width, inner_height = width * (1 - 2 * padding_x) * scale_x, height * (1 - 2 * padding_y) * scale_y
            ratio = min(inner_width / source.width, inner_height / source.height)
            target_size = (max(1, round(source.width * ratio)), max(1, round(source.height * ratio)))
            if target_size[0] * target_size[1] > MAX_OUTPUT_PIXELS:
                raise ValueError("Ukuran stiker GIF terlalu besar")
            artwork = source.resize(target_size, Image.Resampling.LANCZOS)
            if opacity != 100:
                artwork.putalpha(artwork.getchannel("A").point(lambda alpha: round(alpha * opacity / 100)))
            if rotation:
                artwork = artwork.rotate(-rotation, resample=Image.Resampling.BICUBIC, expand=True)
            left, top = round(x * scale_x - artwork.width / 2), round(y * scale_y - artwork.height / 2)
            composite.alpha_composite(artwork, (left, top))
        output.append(composite.convert("RGB"))
    return _encode(output, [right - left for left, right in zip(times, times[1:])], "strip", deadline)


def render_gif(payload):
    if not isinstance(payload, dict):
        raise ValueError("Permintaan GIF harus berupa objek JSON")
    deadline = time.monotonic() + MAX_RENDER_SECONDS
    try:
        if payload.get("mode") == "photos":
            return _photos(payload, deadline)
        if payload.get("mode") == "strip":
            return _strip(payload, deadline)
    except (OSError, Image.DecompressionBombError) as error:
        raise ValueError("Gambar GIF tidak dapat diproses; coba gambar yang lebih kecil") from error
    raise ValueError("mode harus photos atau strip")


def validate_gif_files(files):
    if files is None:
        return []
    if not isinstance(files, list) or len(files) > MAX_GIF_ATTACHMENTS:
        raise ValueError("Maksimal 2 lampiran GIF")
    result, names, total = [], set(), 0
    deadline = time.monotonic() + MAX_RENDER_SECONDS
    for attachment in files:
        if not isinstance(attachment, dict):
            raise ValueError("Lampiran GIF harus berupa objek")
        filename = attachment.get("filename")
        if not isinstance(filename, str) or not filename.strip() or len(filename) > 120 or os.path.basename(filename) != filename or "\\" in filename or not filename.lower().endswith(".gif") or any(ord(char) < 32 for char in filename):
            raise ValueError("Nama lampiran GIF tidak valid")
        if filename.lower() in names:
            raise ValueError("Nama lampiran GIF harus unik")
        names.add(filename.lower())
        data = _base64(attachment.get("data_base64"), MAX_OUTPUT_BYTES)
        total += len(data)
        if total > MAX_ATTACHMENT_BYTES:
            raise ValueError("Total lampiran GIF maksimal 18 MB")
        _animation(data, _Budget(deadline), retain=False)
        result.append((filename, data))
    return result
