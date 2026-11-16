import base64
import importlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from PIL import Image
from api.test_server import request_app


def image_data(size=(12, 8), mode="RGB", color="red", fmt="PNG", exif=None):
    output = io.BytesIO()
    options = {"exif": exif} if exif else {}
    Image.new(mode, size, color).save(output, format=fmt, **options)
    return base64.b64encode(output.getvalue()).decode()


async def bounded_json(request, maximum):
    if int(request.headers.get("content-length", "0")) > maximum:
        raise ValueError("too large")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > maximum:
            raise ValueError("too large")
    value = json.loads(body)
    if not isinstance(value, dict):
        raise ValueError("JSON object required")
    return value


class BoothAppearanceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec("api.booth_appearance"), "appearance backend is missing")
        self.module = importlib.import_module("api.booth_appearance")
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.directory = Path(directory.name)
        self.app = self.make_app()

    def make_app(self):
        app = FastAPI()
        app.include_router(self.module.create_booth_appearance_router(self.directory, bounded_json))
        app.mount("/watermark-files", StaticFiles(directory=self.directory))
        return app

    async def call(self, method="GET", payload=None, path="/photobooth/appearance", app=None, headers=None):
        status, _, body = await request_app(app or self.app, method, path, payload, headers=headers)
        return status, json.loads(body)

    async def upload(self, data=None, **extra):
        return await self.call("POST", {"data_base64": data or image_data(), **extra}, "/photobooth/appearance/image")

    async def test_presets_persist_and_custom_selection_keeps_uploaded_asset(self):
        self.assertEqual(await self.call(), (200, {"theme": "default", "dim": 35, "image_url": None, "has_image": False}))
        for theme in ("elegant", "pink", "floral", "default"):
            status, result = await self.call("POST", {"theme": theme, "dim": 0})
            self.assertEqual((status, result["theme"], result["dim"]), (200, theme, 0))
        status, custom = await self.upload(dim=85)
        self.assertEqual((status, custom["theme"], custom["dim"], custom["has_image"]), (200, "custom", 85, True))
        self.assertRegex(custom["image_url"], r"^/watermark-files/booth_background_[0-9a-f]{32}\.jpg$")
        await self.call("POST", {"theme": "pink", "dim": 17})
        self.assertEqual((await self.call(app=self.make_app()))[1], {**custom, "theme": "pink", "dim": 17})
        self.assertEqual((await self.call("POST", {"theme": "custom", "dim": 35}))[1], {**custom, "dim": 35})
        status, _, raw = await request_app(self.app, "GET", custom["image_url"])
        self.assertEqual(status, 200)
        self.assertEqual(Image.open(io.BytesIO(raw)).format, "JPEG")

    async def test_rejects_bad_config_and_client_asset_paths_without_changing_config(self):
        for payload in ({"theme": "custom", "dim": 35}, {"theme": "../pink", "dim": 35},
                        {"theme": "pink", "dim": 35, "image_url": "/etc/passwd"},
                        {"theme": "pink", "dim": 35, "image_filename": "../escape.jpg"}):
            self.assertEqual((await self.call("POST", payload))[0], 400)
        for dim in (True, False, -1, 86, 3.5, "35", None):
            self.assertEqual((await self.call("POST", {"theme": "pink", "dim": dim}))[0], 400)
            self.assertEqual((await self.upload(dim=dim))[0], 400)
        self.assertEqual(list(self.directory.iterdir()), [])

    async def test_canonical_image_flattens_alpha_resizes_and_strips_metadata(self):
        status, result = await self.upload(image_data((5000, 1000), "RGBA", (255, 0, 0, 0)))
        self.assertEqual(status, 200)
        with Image.open(self.directory / result["image_url"].split("/")[-1]) as image:
            self.assertEqual((image.format, image.mode, image.size), ("JPEG", "RGB", (4096, 819)))
            self.assertEqual(image.getpixel((0, 0)), (255, 255, 255))
            self.assertFalse(image.getexif())
        exif = Image.Exif(); exif[274] = 6; exif[270] = "private metadata"
        status, result = await self.upload(image_data((10, 20), fmt="JPEG", exif=exif))
        with Image.open(self.directory / result["image_url"].split("/")[-1]) as image:
            self.assertEqual(image.size, (20, 10))
            self.assertFalse(image.getexif())

    async def test_rejects_invalid_formats_sizes_pixels_and_bounded_requests(self):
        bad = ["%%%", base64.b64encode(b"PNG").decode(), image_data(fmt="GIF"), image_data((6000, 4001))]
        bad.append(base64.b64encode(b"x" * (8 * 1024 * 1024 + 1)).decode())
        for data in bad:
            self.assertEqual((await self.upload(data))[0], 400)
        self.assertEqual((await self.call("POST", {"data_base64": "x" * (12 * 1024 * 1024)}, "/photobooth/appearance/image"))[0], 400)
        self.assertEqual((await self.call("POST", {}, "/photobooth/appearance/image", headers=[(b"content-length", b"12582913")]))[0], 400)
        self.assertEqual(list(self.directory.iterdir()), [])

    async def test_corrupt_config_or_missing_asset_falls_back_without_repair(self):
        config = self.directory / "booth_appearance.json"
        for raw in ("broken", json.dumps({"theme": "custom", "dim": 15, "image_filename": "../escape.jpg"}),
                    json.dumps({"theme": "custom", "dim": 15, "image_filename": "booth_background_" + "a" * 32 + ".jpg"})):
            config.write_text(raw)
            self.assertEqual((await self.call())[1], {"theme": "default", "dim": 35, "image_url": None, "has_image": False})
            self.assertEqual(config.read_text(), raw)
        _, result = await self.upload()
        (self.directory / result["image_url"].split("/")[-1]).write_bytes(b"corrupted image")
        before = config.read_bytes()
        self.assertEqual((await self.call())[1]["theme"], "default")
        self.assertEqual(config.read_bytes(), before)

    async def test_failed_atomic_writes_preserve_previous_settings_and_image(self):
        _, previous = await self.upload()
        before = {p.name: p.read_bytes() for p in self.directory.iterdir()}
        with patch.object(self.module.os, "replace", side_effect=OSError("disk full")):
            self.assertEqual((await self.call("POST", {"theme": "pink", "dim": 40}))[0], 500)
            self.assertEqual((await self.upload())[0], 500)
        self.assertEqual((await self.call())[1], previous)
        self.assertEqual({p.name: p.read_bytes() for p in self.directory.iterdir()}, before)
        original = self.module.os.replace
        def fail_config(source, target):
            if Path(target).name == "booth_appearance.json":
                raise OSError("config full")
            original(source, target)
        with patch.object(self.module.os, "replace", side_effect=fail_config):
            self.assertEqual((await self.upload())[0], 500)
        self.assertEqual((await self.call())[1], previous)
        self.assertEqual({p.name: p.read_bytes() for p in self.directory.iterdir()}, before)

    async def test_truncated_persisted_jpeg_falls_back_without_rewriting_config(self):
        _, result = await self.upload(image_data((100, 100)))
        path = self.directory / result["image_url"].split("/")[-1]
        path.write_bytes(path.read_bytes()[:-20])
        config = (self.directory / "booth_appearance.json").read_bytes()
        self.assertEqual((await self.call())[1], {"theme": "default", "dim": 35, "image_url": None, "has_image": False})
        self.assertEqual((self.directory / "booth_appearance.json").read_bytes(), config)
