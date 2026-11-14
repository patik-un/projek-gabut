import asyncio
import base64
import importlib
import json
import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlsplit


def valid_jpeg():
    import io
    from PIL import Image
    output = io.BytesIO()
    Image.new("RGB", (8, 8), "white").save(output, "JPEG")
    return base64.b64encode(output.getvalue()).decode()


async def request_app(app, method, path, payload=None, origin=None, headers=None):
    body = b"" if payload is None else json.dumps(payload).encode()
    request_headers = [(b"host", b"127.0.0.1:8000")]
    if payload is not None:
        request_headers.append((b"content-type", b"application/json"))
    if origin is not None:
        request_headers.append((b"origin", origin.encode()))
    request_headers.extend(headers or [])
    scope = {
        "type": "http", "asgi": {"version": "3.0"},
        "http_version": "1.1", "method": method,
        "scheme": "http", "path": path, "raw_path": path.encode(),
        "query_string": b"", "root_path": "", "headers": request_headers,
        "client": ("127.0.0.1", 12345), "server": ("127.0.0.1", 8000),
    }
    incoming = asyncio.Queue()
    incoming.put_nowait({"type": "http.request", "body": body, "more_body": False})
    messages = []

    async def receive():
        return await incoming.get()

    async def send(message):
        messages.append(message)

    await asyncio.wait_for(app(scope, receive, send), timeout=5)
    start = next(message for message in messages if message["type"] == "http.response.start")
    response_body = b"".join(
        message.get("body", b"") for message in messages
        if message["type"] == "http.response.body"
    )
    return start["status"], dict(start.get("headers", [])), response_body


class LocalApiTest(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        cls.environment = patch.dict(os.environ, {
            "EVENT_BOOTH_BACKEND_DATA_DIR": cls.directory.name,
        })
        cls.environment.start()
        database_dir = Path(cls.directory.name, "database")
        database_dir.mkdir()
        cls.database = patch("queue_db.DB_FILE", str(database_dir / "queue.db"))
        cls.database.start()
        cls.server = importlib.import_module("api.server")

    @classmethod
    def tearDownClass(cls):
        cls.database.stop()
        cls.environment.stop()
        cls.directory.cleanup()

    async def test_sticker_background_removal_returns_alpha_png_without_saving_catalog(self):
        import cv2
        import numpy as np
        image = np.full((80, 100, 3), 245, dtype=np.uint8)
        image[20:60, 30:70] = (20, 30, 210)
        _, encoded = cv2.imencode(".png", image)
        with tempfile.TemporaryDirectory() as folder, patch.object(self.server, "PHOTOBOOTH_EDITOR_SETTINGS_FILE", os.path.join(folder, "editor.json")):
            catalog_file = Path(folder, "editor.json")
            catalog_file.write_text('{"saved": "catalog"}')
            status, _, body = await request_app(self.server.app, "POST", "/photobooth/sticker/remove-background", {
                "image_data": "data:image/png;base64," + base64.b64encode(encoded).decode(),
            })
            self.assertEqual(catalog_file.read_text(), '{"saved": "catalog"}')
        self.assertEqual(status, 200)
        result = json.loads(body)
        self.assertTrue(result["success"])
        self.assertEqual((result["width"], result["height"]), (100, 80))
        decoded = cv2.imdecode(np.frombuffer(base64.b64decode(result["image_data"].split(",")[1]), np.uint8), cv2.IMREAD_UNCHANGED)
        self.assertEqual(decoded.shape, (80, 100, 4))
        self.assertEqual(int(decoded[0, 0, 3]), 0)
        self.assertEqual(int(decoded[40, 50, 3]), 255)

    async def test_sticker_background_removal_invalid_payloads_are_json_400(self):
        for payload in [None, [], {}, {"image_data": "bad"}, {"image_data": 12}]:
            with self.subTest(payload=payload):
                status, _, body = await request_app(self.server.app, "POST", "/photobooth/sticker/remove-background", payload)
                self.assertEqual(status, 400)
                self.assertFalse(json.loads(body)["success"])
                self.assertTrue(json.loads(body)["message"])

    async def test_sticker_segmentation_failure_returns_recoverable_json_422(self):
        import cv2
        import numpy as np
        _, encoded = cv2.imencode(".png", np.full((40, 40, 3), 255, np.uint8))
        status, _, body = await request_app(self.server.app, "POST", "/photobooth/sticker/remove-background", {
            "image_data": "data:image/png;base64," + base64.b64encode(encoded).decode(),
        })
        self.assertEqual(status, 422)
        self.assertTrue(json.loads(body)["recoverable"])
        self.assertFalse(json.loads(body)["success"])

    async def test_sticker_processing_does_not_block_health_requests(self):
        entered, release = threading.Event(), threading.Event()
        def processing(image_data, rect):
            entered.set()
            if not release.wait(timeout=2):
                raise AssertionError("Health request did not complete during segmentation")
            return {"success": True}
        with patch.object(self.server, "remove_background", side_effect=processing):
            task = asyncio.create_task(request_app(self.server.app, "POST", "/photobooth/sticker/remove-background", {"image_data": "test"}))
            try:
                self.assertTrue(await asyncio.to_thread(entered.wait, 1))
                status, _, body = await asyncio.wait_for(request_app(self.server.app, "GET", "/"), timeout=.5)
                self.assertEqual(status, 200)
                self.assertEqual(json.loads(body), {"status": "running"})
                self.assertFalse(task.done())
            finally:
                release.set()
                await task

    async def test_sticker_request_size_is_bounded_without_content_length(self):
        status, _, body = await request_app(self.server.app, "POST", "/photobooth/sticker/remove-background", {
            "image_data": "A" * self.server.MAX_REQUEST_BYTES,
        })
        self.assertEqual(status, 400)
        self.assertFalse(json.loads(body)["success"])

    async def test_gif_endpoint_returns_actual_looping_animation(self):
        from api.test_gif_rendering import image_url, result_gif
        from PIL import Image
        status, _, body = await request_app(self.server.app, "POST", "/photobooth/gif", {
            "mode": "photos", "frames": [image_url(Image.new("RGB", (32, 24), color)) for color in ["red", "blue"]],
            "duration_ms": 500,
        })
        self.assertEqual(status, 200)
        result = json.loads(body)
        self.assertTrue(result["success"])
        self.assertEqual(result_gif(result).n_frames, 2)

    async def test_gif_endpoint_invalid_payload_returns_json_400(self):
        for payload in [None, [], {}, {"mode": "photos", "frames": []}]:
            status, _, body = await request_app(self.server.app, "POST", "/photobooth/gif", payload)
            self.assertEqual(status, 400)
            self.assertFalse(json.loads(body)["success"])

    async def test_drive_upload_queues_validated_gifs_in_same_folder_and_preserves_jpeg(self):
        from api.test_gif_rendering import animation_url, image_url
        from PIL import Image
        gif = animation_url([Image.new("RGB", (20, 20), color) for color in ["red", "blue"]])
        jpeg = image_url(Image.new("RGB", (30, 40), "white"), "JPEG")
        with tempfile.TemporaryDirectory() as folder, patch.object(self.server, "PHOTOBOOTH_STRIP_DIR", folder), \
             patch.object(self.server, "create_drive_folder", return_value={"id": "folder-id", "webViewLink": "https://example.test/folder"}), \
             patch.object(self.server, "add_to_queue", side_effect=[11, 12]) as enqueue:
            status, _, body = await request_app(self.server.app, "POST", "/photobooth/drive-upload", {
                "parent_drive_folder_id": "parent", "folder_name": "job-test", "filename": "strip.jpg",
                "data_base64": jpeg.split(",")[1], "gif_files": [{"filename": "session.gif", "data_base64": gif.split(",")[1]}],
            })
            self.assertEqual(status, 200)
            result = json.loads(body)
            self.assertEqual(result["queue_id"], 11)
            self.assertEqual(result["gif_queue_ids"], [12])
            self.assertIn("image_url", result)
            self.assertEqual(len(enqueue.call_args_list), 2)
            paths = [call.args[0] for call in enqueue.call_args_list]
            self.assertEqual(Path(paths[0]).read_bytes(), base64.b64decode(jpeg.split(",")[1]))
            self.assertEqual(Path(paths[1]).read_bytes(), base64.b64decode(gif.split(",")[1]))
            for call in enqueue.call_args_list:
                self.assertEqual(call.kwargs, {"drive_folder_id": "folder-id", "source": "photobooth", "status": "staged"})

    async def test_drive_upload_rejects_invalid_gifs_before_google_or_queue_calls(self):
        with patch.object(self.server, "create_drive_folder") as create, patch.object(self.server, "add_to_queue") as enqueue:
            status, _, body = await request_app(self.server.app, "POST", "/photobooth/drive-upload", {
                "parent_drive_folder_id": "parent", "data_base64": "anBlZw==", "gif_files": [{"filename": "bad.gif", "data_base64": "YmFk"}],
            })
        self.assertEqual(status, 400)
        self.assertFalse(json.loads(body)["success"])
        create.assert_not_called()
        enqueue.assert_not_called()

    async def test_gif_generation_keeps_health_requests_responsive(self):
        entered, release = threading.Event(), threading.Event()
        def render(payload):
            entered.set()
            if not release.wait(timeout=2):
                raise AssertionError("Health request blocked by GIF generation")
            return {"success": True}
        with patch.object(self.server, "render_gif", side_effect=render):
            task = asyncio.create_task(request_app(self.server.app, "POST", "/photobooth/gif", {"mode": "photos"}))
            try:
                self.assertTrue(await asyncio.to_thread(entered.wait, 1))
                status, _, _ = await asyncio.wait_for(request_app(self.server.app, "GET", "/"), timeout=.5)
                self.assertEqual(status, 200)
                self.assertFalse(task.done())
            finally:
                release.set()
                await task

    async def test_gif_endpoint_enforces_body_bound_before_processing(self):
        with patch.object(self.server, "MAX_GIF_REQUEST_BYTES", 30), patch.object(self.server, "render_gif") as render:
            status, _, body = await request_app(self.server.app, "POST", "/photobooth/gif", {"mode": "photos", "frames": ["x"] * 50})
        self.assertEqual(status, 400)
        self.assertFalse(json.loads(body)["success"])
        render.assert_not_called()

    async def test_drive_upload_without_gifs_keeps_original_response(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(self.server, "PHOTOBOOTH_STRIP_DIR", folder), \
             patch.object(self.server, "create_drive_folder", return_value={"id": "folder-id"}), \
             patch.object(self.server, "add_to_queue", return_value=13) as enqueue:
            status, _, body = await request_app(self.server.app, "POST", "/photobooth/drive-upload", {
                "parent_drive_folder_id": "parent", "folder_name": "job-test", "filename": "strip.jpg", "data_base64": valid_jpeg(),
            })
        self.assertEqual(status, 200)
        result = json.loads(body)
        self.assertEqual(result["queue_id"], 13)
        self.assertEqual(result["gif_queue_ids"], [])
        self.assertIn("image_url", result)
        enqueue.assert_called_once()

    async def test_editor_catalog_roundtrip_and_validation(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(
            self.server, "PHOTOBOOTH_EDITOR_SETTINGS_FILE", os.path.join(folder, "editor.json"), create=True,
        ):
            status, _, body = await request_app(self.server.app, "GET", "/photobooth/editor-settings")
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(body)["schema_version"], 2)
            self.assertIsNone(json.loads(body)["settings"])
            payload = {"stickers": [{"id": "heart", "name": "Hati", "content": "❤️", "kind": "emoji", "visible": False}],
                       "texts": [{"id": "greeting", "text": "Selamat datang", "visible": True}]}
            status, _, _ = await request_app(self.server.app, "POST", "/photobooth/editor-settings", payload)
            self.assertEqual(status, 200)
            status, _, body = await request_app(self.server.app, "GET", "/photobooth/editor-settings")
            self.assertEqual(json.loads(body)["settings"], payload)
            for bad in [{"stickers": [], "texts": [{"id": "x", "text": "", "visible": True}]},
                        {"stickers": [{"id": "x", "name": "Bad", "kind": "image", "content": "https://example.com/a.png", "visible": True}], "texts": []},
                        {"stickers": [], "texts": [{"id": "x", "text": "Hi", "visible": "false"}]}]:
                status, _, _ = await request_app(self.server.app, "POST", "/photobooth/editor-settings", bad)
                self.assertEqual(status, 400)
            status, _, body = await request_app(self.server.app, "GET", "/photobooth/editor-settings")
            self.assertEqual(json.loads(body)["settings"], payload)
            status, _, _ = await request_app(self.server.app, "POST", "/photobooth/editor-settings", {"stickers": [], "texts": []})
            self.assertEqual(status, 200)
            status, _, body = await request_app(self.server.app, "GET", "/photobooth/editor-settings")
            self.assertEqual(json.loads(body)["settings"], {"stickers": [], "texts": []})

    async def test_editor_catalog_preserves_custom_image_and_rejects_duplicates_and_corrupt_images(self):
        import cv2
        import numpy as np
        _, png = cv2.imencode(".png", np.zeros((20, 40, 4), dtype=np.uint8))
        content = "data:image/png;base64," + base64.b64encode(png).decode()
        sticker = {"id": "custom", "name": "Logo", "kind": "image", "content": content, "visible": True}
        with tempfile.TemporaryDirectory() as folder, patch.object(
            self.server, "PHOTOBOOTH_EDITOR_SETTINGS_FILE", os.path.join(folder, "editor.json"),
        ):
            payload = {"stickers": [sticker], "texts": []}
            status, _, body = await request_app(self.server.app, "POST", "/photobooth/editor-settings", payload)
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(body)["settings"], payload)
            for stickers in [[sticker, sticker], [{**sticker, "content": "data:image/png;base64,aGVsbG8="}],
                             [{**sticker, "content": "data:image/png;base64,"}]]:
                status, _, _ = await request_app(self.server.app, "POST", "/photobooth/editor-settings", {"stickers": stickers, "texts": []})
                self.assertEqual(status, 400)
            status, _, body = await request_app(self.server.app, "GET", "/photobooth/editor-settings")
            self.assertEqual(json.loads(body)["settings"], payload)

    async def test_editor_catalog_styles_roundtrip_and_invalid_styles_do_not_overwrite(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(
            self.server, "PHOTOBOOTH_EDITOR_SETTINGS_FILE", os.path.join(folder, "editor.json"),
        ):
            style = {"font": "serif", "size": 7, "weight": 600, "italic": True, "color": "#f4e7bd",
                     "outlineWidth": 2, "outlineColor": "#111318", "shadow": "glow", "background": "pill",
                     "backgroundColor": "#302050", "rotation": -12, "opacity": 90}
            sticker_style = {"size": 22, "rotation": 20, "opacity": 70, "outlineWidth": 4,
                             "outlineColor": "#ffffff", "shadow": "soft"}
            payload = {"texts": [{"id": "t", "text": "Beautiful", "visible": True, "style": style}],
                       "stickers": [{"id": "s", "name": "Heart", "content": "❤️", "kind": "emoji", "visible": True, "style": sticker_style}]}
            status, _, _ = await request_app(self.server.app, "POST", "/photobooth/editor-settings", payload)
            self.assertEqual(status, 200)
            status, _, body = await request_app(self.server.app, "GET", "/photobooth/editor-settings")
            self.assertEqual(json.loads(body)["settings"], payload)
            for change in [{"size": -1}, {"opacity": 101}, {"rotation": float("nan")}, {"font": "unknown"},
                           {"color": "red; display:none"}, {"italic": "false"}, {"shadow": "unknown"}, {"weight": True}]:
                bad = {**payload, "texts": [{**payload["texts"][0], "style": {**style, **change}}]}
                status, _, _ = await request_app(self.server.app, "POST", "/photobooth/editor-settings", bad)
                self.assertEqual(status, 400)
            status, _, body = await request_app(self.server.app, "GET", "/photobooth/editor-settings")
            self.assertEqual(json.loads(body)["settings"], payload)

    async def test_photobooth_settings_roundtrip_preserves_same_pose_strips_and_print_preferences(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(
            self.server, "PHOTOBOOTH_SETTINGS_FILE", os.path.join(folder, "strips.json"), create=True,
        ):
            strips = [
                {"id": "anniversary", "name": "Anniversary", "pose_count": 4,
                 "slot_count": 4, "slots": [], "image_url": None, "active": True},
                {"id": "birthday", "name": "Ulang Tahun", "pose_count": 4,
                 "slot_count": 4, "slots": [], "image_url": None, "active": False},
            ]
            payload = {"strip_options": strips, "default_strip_id": "anniversary",
                       "strip_settings": {"anniversary": {"paper_size": "3r", "double_strip_enabled": True},
                                          "birthday": {"paper_size": "4r", "double_strip_enabled": False}}}
            status, _, body = await request_app(self.server.app, "POST", "/photobooth/settings", payload)
            self.assertEqual(status, 200)
            self.assertTrue(json.loads(body)["success"])
            self.assertTrue(Path(folder, "strips.json").exists())
            for endpoint in ["/photobooth/settings", "/photobooth/template"]:
                status, _, body = await request_app(self.server.app, "GET", endpoint)
                self.assertEqual(status, 200)
                saved = json.loads(body)
                self.assertEqual([strip["id"] for strip in saved["strip_options"]], ["anniversary", "birthday"])
                self.assertFalse(saved["strip_options"][1]["active"])
                self.assertEqual(saved["default_strip_id"], "anniversary")
                self.assertEqual(saved["strip_settings"], payload["strip_settings"])

    async def test_capture_accepts_twenty_photos_for_ten_pose_double_strips_and_enforces_limit(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(self.server, "OUTPUT_DIR", folder):
            for index in range(6):
                Path(folder, f"existing-{index}.jpg").write_bytes(b"image")
            for _ in range(14):
                status, _, _ = await request_app(self.server.app, "POST", "/capture",
                                                {"max_photo_count": 20, "data_base64": valid_jpeg()})
                self.assertEqual(status, 200)
            status, _, _ = await request_app(self.server.app, "POST", "/capture",
                                            {"max_photo_count": 20, "data_base64": valid_jpeg()})
            self.assertEqual(status, 409)

    async def test_photobooth_settings_reject_invalid_counts_duplicates_and_empty_catalog(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(
            self.server, "PHOTOBOOTH_SETTINGS_FILE", os.path.join(folder, "strips.json"), create=True,
        ):
            strip = {"id": "custom", "name": "Custom", "pose_count": 4, "slot_count": 4,
                     "slots": [], "image_url": None, "active": True}
            for payload in [[], {"strip_options": []}, {"strip_options": [strip, strip]},
                            *[{"strip_options": [{**strip, "pose_count": count}]} for count in [0, 11, 1.5, True]],
                            {"strip_options": [{**strip, "name": " "}]}]:
                with self.subTest(payload=payload):
                    status, _, _ = await request_app(self.server.app, "POST", "/photobooth/settings", payload)
                    self.assertEqual(status, 400)

    async def test_photobooth_upload_and_reset_target_an_id_without_overwriting_same_pose_neighbor(self):
        import base64
        import cv2
        import numpy as np
        with tempfile.TemporaryDirectory() as folder, patch.object(
            self.server, "PHOTOBOOTH_SETTINGS_FILE", os.path.join(folder, "strips.json"), create=True,
        ), patch.object(self.server, "WATERMARK_DIR", folder):
            strips = [{"id": key, "name": key, "pose_count": 4, "slot_count": 4,
                       "slots": [], "image_url": None, "active": True} for key in ["first", "second"]]
            status, _, _ = await request_app(self.server.app, "POST", "/photobooth/settings", {"strip_options": strips})
            self.assertEqual(status, 200)
            image = np.full((1000, 400, 4), 255, dtype=np.uint8)
            for top in [40, 270, 500, 730]:
                image[top:top + 180, 30:370, 3] = 0
            encoded = base64.b64encode(cv2.imencode(".png", image)[1]).decode()
            status, _, body = await request_app(self.server.app, "POST", "/photobooth/template",
                                                {"strip_id": "second", "data_base64": encoded})
            self.assertEqual(status, 200)
            result = json.loads(body)["strip_options"]
            self.assertIsNone(result[0]["image_url"])
            self.assertEqual(result[1]["id"], "second")
            self.assertEqual(result[1]["pose_count"], 4)
            self.assertEqual(len(result[1]["slots"]), 4)
            self.assertIsNotNone(result[1]["image_url"])
            status, _, body = await request_app(self.server.app, "DELETE", "/photobooth/template/by-id/second")
            self.assertEqual(status, 200)
            result = json.loads(body)["strip_options"]
            self.assertEqual([strip["id"] for strip in result], ["first", "second"])
            self.assertIsNone(result[1]["image_url"])
            self.assertTrue(result[1]["active"])

    async def test_offline_png_sync_detects_offset_slots_and_returns_a_durable_file_url(self):
        import base64
        import cv2
        import numpy as np
        with tempfile.TemporaryDirectory() as folder, patch.object(
            self.server, "PHOTOBOOTH_SETTINGS_FILE", os.path.join(folder, "strips.json"), create=True,
        ), patch.object(self.server, "WATERMARK_DIR", folder):
            image = np.full((1000, 400, 4), 255, dtype=np.uint8)
            image[40:220, 20:160, 3] = 0
            image[500:680, 220:360, 3] = 0
            encoded = base64.b64encode(cv2.imencode(".png", image)[1]).decode()
            strip = {"id": "offline", "name": "Offline", "pose_count": 2, "slot_count": 2,
                     "slots": [], "image_url": f"data:image/png;base64,{encoded}", "active": True}
            status, _, body = await request_app(self.server.app, "POST", "/photobooth/settings", {"strip_options": [strip]})
            self.assertEqual(status, 200)
            saved = json.loads(body)["strip_options"][0]
            self.assertEqual(len(saved["slots"]), 2)
            self.assertEqual(saved["slots"][0]["left"], 5)
            self.assertAlmostEqual(saved["slots"][1]["left"], 55)
            self.assertIn("/watermark-files/photobooth_custom_", saved["image_url"])

    async def test_offline_png_sync_preserves_a_pose_edit_made_after_upload(self):
        import base64
        import cv2
        import numpy as np
        with tempfile.TemporaryDirectory() as folder, patch.object(
            self.server, "PHOTOBOOTH_SETTINGS_FILE", os.path.join(folder, "strips.json"), create=True,
        ), patch.object(self.server, "WATERMARK_DIR", folder):
            image = np.full((1000, 400, 4), 255, dtype=np.uint8)
            image[40:220, 20:160, 3] = 0
            image[500:680, 220:360, 3] = 0
            encoded = base64.b64encode(cv2.imencode(".png", image)[1]).decode()
            slots = [{"left": 10, "top": top, "width": 80, "height": 15} for top in [5, 25, 45, 65]]
            strip = {"id": "offline", "name": "Empat Pose", "pose_count": 4, "slot_count": 4,
                     "slots": slots, "image_url": f"data:image/png;base64,{encoded}", "active": True}
            status, _, body = await request_app(self.server.app, "POST", "/photobooth/settings", {"strip_options": [strip]})
            self.assertEqual(status, 200)
            saved = json.loads(body)["strip_options"][0]
            self.assertEqual(saved["pose_count"], 4)
            self.assertEqual(saved["slots"], slots)

    async def test_unrelated_website_cannot_read_or_mutate_the_local_api(self):
        for origin in ["https://unrelated.example", "null", "http://localhost:1420.evil.example"]:
            with self.subTest(origin=origin):
                status, _, _ = await request_app(self.server.app, "GET", "/", origin=origin)
                self.assertEqual(status, 403)
        with patch.object(self.server, "remove_drive_token") as remove_token:
            status, _, _ = await request_app(
                self.server.app, "POST", "/auth/drive/logout", origin="https://unrelated.example",
            )
            self.assertEqual(status, 403)
            remove_token.assert_not_called()

    async def test_local_frontend_and_tauri_origins_receive_cors_headers(self):
        for origin in [
            "http://localhost:1420", "http://127.0.0.1:1420",
            "tauri://localhost", "http://tauri.localhost", "https://tauri.localhost",
        ]:
            with self.subTest(origin=origin):
                status, headers, body = await request_app(self.server.app, "GET", "/", origin=origin)
                self.assertEqual(status, 200)
                self.assertEqual(json.loads(body), {"status": "running"})
                self.assertEqual(headers.get(b"access-control-allow-origin"), origin.encode())

    async def test_native_health_requests_and_frontend_preflight_still_work(self):
        status, _, _ = await request_app(self.server.app, "GET", "/")
        self.assertEqual(status, 200)
        status, headers, _ = await request_app(
            self.server.app, "OPTIONS", "/auto-watch-folder", origin="http://localhost:1420",
            headers=[(b"access-control-request-method", b"PATCH"),
                     (b"access-control-request-headers", b"content-type")],
        )
        self.assertEqual(status, 200)
        self.assertIn(b"PATCH", headers.get(b"access-control-allow-methods", b""))

    async def test_drive_target_update_preserves_a_disabled_watch_and_pending_files(self):
        from detect import detect
        with tempfile.TemporaryDirectory() as folder:
            config_path = os.path.join(folder, "config", "auto_watch.json")
            watch_path = os.path.join(folder, "images")
            os.makedirs(watch_path)
            Path(watch_path, "photo.jpg").write_bytes(b"image")
            with patch.object(detect, "AUTO_WATCH_CONFIG_FILE", config_path):
                detect.set_auto_watch_folder(watch_path, drive_folder_id="DRIVE_A")
                before = detect.disable_auto_watch_folder()
                status, _, body = await request_app(
                    self.server.app, "PATCH", "/auto-watch-folder",
                    {"drive_folder_id": " DRIVE_B "}, origin="http://localhost:1420",
                )
                self.assertEqual(status, 200)
                self.assertTrue(json.loads(body)["success"])
                after = detect.get_auto_watch_status()
                self.assertEqual(after["drive_folder_id"], "DRIVE_B")
                self.assertEqual(after["folder_path"], before["folder_path"])
                self.assertEqual(after["pending_files"], before["pending_files"])
                self.assertFalse(after["enabled"])
                self.assertFalse(after["auto_upload_enabled"])

    async def test_drive_target_update_rejects_invalid_payloads(self):
        for payload in [{}, {"drive_folder_id": 42}, ["DRIVE_B"]]:
            with self.subTest(payload=payload):
                status, _, _ = await request_app(
                    self.server.app, "PATCH", "/auto-watch-folder", payload,
                )
                self.assertEqual(status, 400)

    def test_backend_image_urls_are_permitted_by_the_packaged_csp(self):
        config_path = Path(__file__).resolve().parents[2] / "frontend/src-tauri/tauri.conf.json"
        config = json.loads(config_path.read_text())
        csp = dict(
            (parts[0], parts[1:])
            for directive in config["app"]["security"]["csp"].split(";")
            if (parts := directive.strip().split())
        )
        for directory in [self.server.OUTPUT_DIR, self.server.WATERMARK_DIR, self.server.PHOTOBOOTH_STRIP_DIR]:
            with self.subTest(directory=directory):
                url = urlsplit(self.server.public_url(os.path.join(directory, "photo.jpg")))
                self.assertIn(f"{url.scheme}://{url.netloc}", csp["img-src"])

    def test_image_urls_follow_the_configured_backend_port(self):
        with patch.dict(os.environ, {"EVENT_BOOTH_BACKEND_PORT": "8123"}):
            url = urlsplit(self.server.public_url(os.path.join(self.server.OUTPUT_DIR, "photo.jpg")))
            self.assertEqual(url.hostname, "127.0.0.1")
            self.assertEqual(url.port, 8123)

    def test_missing_drive_configuration_fails_before_starting_browser_login(self):
        with patch.object(self.server, "get_drive_auth_status", return_value={"configured": False}), \
             patch.object(self.server.threading, "Thread") as thread:
            response = self.server.trigger_drive_login()
        self.assertEqual(getattr(response, "status_code", None), 400)
        thread.assert_not_called()

    def test_browser_login_is_reserved_before_the_worker_is_dispatched(self):
        with patch.object(self.server, "get_drive_auth_status", return_value={"configured": True}), \
             patch.object(self.server, "remove_drive_token"), \
             patch.object(self.server, "reserve_drive_login", return_value=7, create=True) as reserve, \
             patch.object(self.server, "force_drive_login") as login, \
             patch.object(self.server.threading, "Thread") as thread:
            response = self.server.trigger_drive_login()
            self.assertTrue(response["success"])
            reserve.assert_called_once_with()
            thread.call_args.kwargs["target"]()
            login.assert_called_once_with(expected_generation=7)

    def test_login_reservation_failure_does_not_launch_a_browser_worker(self):
        with patch.object(self.server, "get_drive_auth_status", return_value={"configured": True}), \
             patch.object(self.server, "remove_drive_token"), \
             patch.object(self.server, "reserve_drive_login", side_effect=OSError("read-only auth"), create=True), \
             patch.object(self.server.threading, "Thread") as thread:
            response = self.server.trigger_drive_login()
        self.assertEqual(getattr(response, "status_code", None), 500)
        thread.assert_not_called()


if __name__ == "__main__":
    unittest.main()
