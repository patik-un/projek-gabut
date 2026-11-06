import base64
import io
import unittest

from unittest.mock import patch

from PIL import Image, ImageDraw, ImageSequence


def image_url(image, format="PNG"):
    output = io.BytesIO()
    image.save(output, format=format)
    return "data:image/" + format.lower().replace("jpg", "jpeg") + ";base64," + base64.b64encode(output.getvalue()).decode()


def animation_url(frames, durations=None, disposal=2):
    output = io.BytesIO()
    frames[0].save(output, format="GIF", save_all=True, append_images=frames[1:], loop=0,
                   duration=durations or [100] * len(frames), disposal=disposal, optimize=False)
    return "data:image/gif;base64," + base64.b64encode(output.getvalue()).decode()


def result_gif(result):
    return Image.open(io.BytesIO(base64.b64decode(result["data_url"].split(",")[1])))


class GifRenderingTest(unittest.TestCase):
    def setUp(self):
        from api import gif_rendering
        self.module = gif_rendering

    def test_photo_order_durations_dimensions_and_loop(self):
        result = self.module.render_gif({"mode": "photos", "frames": [
            image_url(Image.new("RGB", (64, 48), color)) for color in ["red", "lime", "blue"]
        ], "duration_ms": 500})
        gif = result_gif(result)
        self.assertEqual(gif.size, (64, 48))
        self.assertEqual(gif.n_frames, 3)
        self.assertEqual(result["frame_count"], 3)
        self.assertEqual(gif.info["loop"], 0)
        for index, color in enumerate([(255, 0, 0), (0, 255, 0), (0, 0, 255)]):
            gif.seek(index)
            self.assertEqual(gif.info["duration"], 500)
            self.assertEqual(gif.convert("RGB").getpixel((32, 24)), color)
        self.assertTrue(result["filename"].endswith(".gif"))

    def test_strip_respects_gif_alpha_disposal_and_frame_timing(self):
        red = Image.new("RGBA", (20, 20))
        ImageDraw.Draw(red).rectangle((0, 0, 7, 19), fill="red")
        blue = Image.new("RGBA", (20, 20))
        ImageDraw.Draw(blue).rectangle((12, 0, 19, 19), fill="blue")
        result = self.module.render_gif({"mode": "strip", "background_data": image_url(Image.new("RGB", (60, 60), "lime")),
            "overlays": [{"data_url": animation_url([red, blue], [100, 300]), "x": 30, "y": 30, "width": 20, "height": 20}]})
        gif = result_gif(result)
        self.assertEqual(gif.n_frames, 2)
        first = gif.convert("RGB")
        self.assertEqual(first.getpixel((22, 30)), (255, 0, 0))
        self.assertEqual(first.getpixel((37, 30)), (0, 255, 0))
        self.assertEqual(gif.info["duration"], 100)
        gif.seek(1)
        self.assertEqual(gif.info["duration"], 300)
        second = gif.convert("RGB")
        self.assertEqual(second.getpixel((22, 30)), (0, 255, 0))
        self.assertEqual(second.getpixel((37, 30)), (0, 0, 255))

    def test_overlay_clockwise_rotation_and_opacity_preserve_center(self):
        source = Image.new("RGBA", (20, 20))
        ImageDraw.Draw(source).rectangle((0, 0, 19, 7), fill="red")
        result = self.module.render_gif({"mode": "strip", "background_data": image_url(Image.new("RGB", (60, 60), "white")),
            "overlays": [{"data_url": animation_url([source]), "x": 30, "y": 30, "width": 20, "height": 20, "rotation": 90, "opacity": 50}]})
        first = result_gif(result).convert("RGB")
        self.assertEqual(first.getpixel((23, 30)), (255, 255, 255))
        color = first.getpixel((37, 30))
        self.assertEqual(color[0], 255)
        self.assertTrue(120 <= color[1] <= 135)
        self.assertEqual(color[1], color[2])

    def test_overlay_padding_and_aspect_ratio_fit_inside_box(self):
        source = Image.new("RGBA", (40, 20), "red")
        result = self.module.render_gif({"mode": "strip", "background_data": image_url(Image.new("RGB", (80, 80), "white")),
            "overlays": [{"data_url": animation_url([source]), "x": 40, "y": 40, "width": 40, "height": 40, "padding_x": .1, "padding_y": .1}]})
        image = result_gif(result).convert("RGB")
        self.assertEqual(image.getpixel((24, 40)), (255, 0, 0))
        self.assertEqual(image.getpixel((23, 40)), (255, 255, 255))
        self.assertEqual(image.getpixel((40, 31)), (255, 255, 255))
        self.assertEqual(image.getpixel((40, 32)), (255, 0, 0))

    def test_multiple_overlay_timelines_use_durations_and_input_layer_order(self):
        first = animation_url([Image.new("RGBA", (12, 12), color) for color in ["red", "blue"]], [100, 300])
        top = animation_url([Image.new("RGBA", (12, 12), color) for color in ["lime", "yellow"]], [200, 200])
        result = self.module.render_gif({"mode": "strip", "background_data": image_url(Image.new("RGB", (30, 30), "white")),
            "overlays": [{"data_url": source, "x": x, "y": 15, "width": 12, "height": 12} for source, x in [(first, 10), (top, 16)]]})
        gif = result_gif(result)
        self.assertEqual(gif.n_frames, 3)
        durations = []
        for frame in ImageSequence.Iterator(gif):
            durations.append(frame.info["duration"])
        self.assertEqual(durations, [100, 100, 200])
        gif.seek(2)
        self.assertEqual(gif.convert("RGB").getpixel((12, 15)), (255, 255, 0))
        self.assertEqual(gif.convert("RGB").getpixel((5, 15)), (0, 0, 255))

    def test_photos_fit_output_and_total_duration_limits(self):
        frames = [image_url(Image.new("RGB", (1200, 600), color)) for color in ["red", "blue"]]
        result = self.module.render_gif({"mode": "photos", "frames": frames * 10, "duration_ms": 1000})
        gif = result_gif(result)
        self.assertLessEqual(max(gif.size), 960)
        self.assertLessEqual(gif.n_frames, 120)
        self.assertLessEqual(sum(frame.info["duration"] for frame in ImageSequence.Iterator(gif)), 8000)

    def test_invalid_inputs_are_rejected(self):
        valid = image_url(Image.new("RGB", (20, 20), "red"))
        animation = animation_url([Image.new("RGBA", (20, 20), "red")])
        for payload in [None, {}, {"mode": "unknown"}, {"mode": "photos", "frames": [valid]},
            {"mode": "photos", "frames": [valid] * 21}, {"mode": "photos", "frames": [valid, "bad"]},
            {"mode": "photos", "frames": [valid, valid], "duration_ms": float("nan")},
            {"mode": "strip", "background_data": valid, "overlays": []},
            *[{"mode": "strip", "background_data": valid, "overlays": [{"data_url": animation, "x": value, "y": 10, "width": 10, "height": 10}]} for value in [float("nan"), float("inf"), True, 10 ** 1000]],
            {"mode": "strip", "background_data": valid, "overlays": [{"data_url": valid, "x": 10, "y": 10, "width": 10, "height": 10}]},
            {"mode": "strip", "background_data": valid, "overlays": [{"data_url": animation, "x": 10, "y": 10, "width": -1, "height": 10}]}]:
            with self.subTest(payload=str(payload)[:80]), self.assertRaises(ValueError):
                self.module.render_gif(payload)

    def test_render_work_has_a_time_budget(self):
        data = image_url(Image.new("RGB", (20, 20), "red"))
        with patch("time.monotonic", side_effect=[0, 100]):
            with self.assertRaisesRegex(ValueError, "waktu"):
                self.module.render_gif({"mode": "photos", "frames": [data, data]})

    def test_source_animation_frame_and_duration_limits_are_enforced(self):
        sources = [
            animation_url([Image.new("RGB", (4, 4), (i, 0, 0)) for i in range(121)], [10] * 121),
            animation_url([Image.new("RGB", (4, 4), color) for color in ["red", "blue"]], [5000, 5000]),
        ]
        background = image_url(Image.new("RGB", (20, 20), "white"))
        for source in sources:
            with self.subTest(source=source[:40]), self.assertRaises(ValueError):
                self.module.render_gif({"mode": "strip", "background_data": background, "overlays": [
                    {"data_url": source, "x": 10, "y": 10, "width": 10, "height": 10}]})

    def test_many_output_frames_downscale_to_decoded_pixel_budget(self):
        background = image_url(Image.new("RGB", (1000, 1000), "white"))
        source = animation_url([Image.new("RGB", (8, 8), (i * 2, 0, 0)) for i in range(60)], [100] * 60)
        result = self.module.render_gif({"mode": "strip", "background_data": background, "overlays": [
            {"data_url": source, "x": 500, "y": 500, "width": 200, "height": 200}]})
        self.assertLessEqual(result["width"] * result["height"] * result["frame_count"], self.module.MAX_OUTPUT_PIXELS)
        self.assertLessEqual(max(result["width"], result["height"]), 960)

    def test_gif_attachment_validation_checks_actual_content(self):
        gif = animation_url([Image.new("RGB", (20, 20), "red"), Image.new("RGB", (20, 20), "blue")])
        files = self.module.validate_gif_files([{"filename": "session.gif", "data_base64": gif.split(",")[1]}])
        self.assertEqual(files[0][0], "session.gif")
        self.assertTrue(files[0][1].startswith(b"GIF"))
        for attachments in [[{"filename": "bad.gif", "data_base64": base64.b64encode(b"not gif").decode()}],
                [{"filename": "../escape.gif", "data_base64": gif.split(",")[1]}],
                [{"filename": "same.gif", "data_base64": gif.split(",")[1]}] * 2]:
            with self.assertRaises(ValueError):
                self.module.validate_gif_files(attachments)


if __name__ == "__main__":
    unittest.main()
