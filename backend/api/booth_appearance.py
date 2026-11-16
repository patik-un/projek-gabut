"""Persistent photobooth UI appearance, independent of print/composite settings."""
import base64
import binascii
import io
import json
import os
from pathlib import Path
import re
import tempfile
import threading
import uuid

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from PIL import Image, ImageOps
from starlette.concurrency import run_in_threadpool

THEMES = {"default", "elegant", "pink", "floral", "custom"}
ASSET_NAME = re.compile(r"booth_background_[0-9a-f]{32}\.jpg")
MAX_REQUEST_BYTES = 12 * 1024 * 1024
MAX_IMAGE_BYTES = 8 * 1024 * 1024
DEFAULT = {"theme": "default", "dim": 35, "image_filename": None}


def validate_dim(value):
    if type(value) is not int or not 0 <= value <= 85:
        raise ValueError("Kegelapan harus bilangan bulat 0–85")
    return value


def canonical_image(data):
    if not isinstance(data, str):
        raise ValueError("Gambar JPG/PNG wajib diisi")
    if data.startswith("data:"):
        header, separator, data = data.partition(",")
        if not separator or header not in ("data:image/jpeg;base64", "data:image/png;base64"):
            raise ValueError("Gambar harus JPG atau PNG")
    if len(data) > 4 * ((MAX_IMAGE_BYTES + 2) // 3):
        raise ValueError("Gambar maksimal 8 MiB")
    try:
        raw = base64.b64decode(data, validate=True)
    except (ValueError, binascii.Error) as error:
        raise ValueError("Data gambar tidak valid") from error
    if not raw or len(raw) > MAX_IMAGE_BYTES:
        raise ValueError("Gambar maksimal 8 MiB")
    try:
        with Image.open(io.BytesIO(raw)) as source:
            if source.format not in ("JPEG", "PNG"):
                raise ValueError("Gambar harus JPG atau PNG")
            if source.width * source.height > 24_000_000:
                raise ValueError("Gambar maksimal 24 juta piksel")
            source.load()
            oriented = ImageOps.exif_transpose(source)
            rgba = oriented.convert("RGBA")
            image = Image.new("RGB", rgba.size, "white")
            image.paste(rgba, mask=rgba.getchannel("A"))
            image.thumbnail((4096, 4096), Image.Resampling.LANCZOS)
            output = io.BytesIO()
            image.save(output, format="JPEG", quality=90)
            return output.getvalue()
    except ValueError:
        raise
    except (OSError, SyntaxError, Image.DecompressionBombError) as error:
        raise ValueError("Gambar tidak dapat dibaca") from error


class BoothAppearanceStore:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.config_path = self.directory / "booth_appearance.json"
        self.lock = threading.RLock()

    def _load(self):
        try:
            value = json.loads(self.config_path.read_text(encoding="utf-8"))
            if not isinstance(value, dict) or value.get("theme") not in THEMES:
                return dict(DEFAULT)
            validate_dim(value.get("dim"))
            name = value.get("image_filename")
            if name is not None:
                if not isinstance(name, str) or not ASSET_NAME.fullmatch(name):
                    return dict(DEFAULT)
                path = self.directory / name
                if path.is_symlink():
                    return dict(DEFAULT)
                with Image.open(path) as image:
                    if image.format != "JPEG" or image.width * image.height > 24_000_000:
                        return dict(DEFAULT)
                    image.load()
            if value["theme"] == "custom" and name is None:
                return dict(DEFAULT)
            return {"theme": value["theme"], "dim": value["dim"], "image_filename": name}
        except (OSError, ValueError, TypeError, SyntaxError, Image.DecompressionBombError):
            return dict(DEFAULT)

    @staticmethod
    def _response(value):
        name = value["image_filename"]
        return {"theme": value["theme"], "dim": value["dim"],
                "image_url": f"/watermark-files/{name}" if name else None, "has_image": bool(name)}

    def get(self):
        with self.lock:
            return self._response(self._load())

    def _atomic_write(self, path, raw):
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=self.directory, prefix=".booth_appearance_", delete=False) as file:
                temporary = Path(file.name)
                file.write(raw)
                file.flush()
                os.fsync(file.fileno())
            os.replace(temporary, path)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)

    def _save(self, value):
        self._atomic_write(self.config_path, json.dumps(value).encode("utf-8"))
        return self._response(value)

    def save(self, payload):
        if not isinstance(payload, dict) or set(payload) - {"theme", "dim"}:
            raise ValueError("Hanya tema dan kegelapan yang dapat disimpan")
        theme = payload.get("theme")
        if not isinstance(theme, str) or theme not in THEMES:
            raise ValueError("Tema tidak valid")
        dim = validate_dim(payload.get("dim", 35))
        with self.lock:
            current = self._load()
            if theme == "custom" and not current["image_filename"]:
                raise ValueError("Unggah gambar terlebih dahulu")
            return self._save({**current, "theme": theme, "dim": dim})

    def upload(self, payload):
        if not isinstance(payload, dict) or set(payload) - {"data_base64", "dim"}:
            raise ValueError("Pengaturan unggahan tidak valid")
        dim = validate_dim(payload.get("dim", 35))
        raw = canonical_image(payload.get("data_base64"))
        with self.lock:
            name = f"booth_background_{uuid.uuid4().hex}.jpg"
            path = self.directory / name
            try:
                self._atomic_write(path, raw)
                return self._save({"theme": "custom", "dim": dim, "image_filename": name})
            except OSError:
                path.unlink(missing_ok=True)
                raise


def create_booth_appearance_router(directory, read_bounded_json):
    store = BoothAppearanceStore(directory)
    router = APIRouter()

    @router.get("/photobooth/appearance")
    def get_appearance():
        return store.get()

    async def mutate(request, operation, maximum):
        try:
            payload = await read_bounded_json(request, maximum)
            return await run_in_threadpool(operation, payload)
        except ValueError as error:
            return JSONResponse(status_code=400, content={"message": str(error)})
        except OSError:
            return JSONResponse(status_code=500, content={"message": "Gagal menyimpan tampilan. Periksa penyimpanan lalu coba lagi."})

    @router.post("/photobooth/appearance")
    async def save_appearance(request: Request):
        return await mutate(request, store.save, 4096)

    @router.post("/photobooth/appearance/image")
    async def upload_appearance(request: Request):
        return await mutate(request, store.upload, MAX_REQUEST_BYTES)

    return router
