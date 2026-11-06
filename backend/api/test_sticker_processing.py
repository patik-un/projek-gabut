import base64
import unittest
from unittest.mock import patch

import cv2
import numpy as np


def data_image(image, extension=".png"):
    ok, encoded = cv2.imencode(extension, image)
    assert ok
    mime = {".png": "png", ".jpg": "jpeg", ".webp": "webp"}[extension]
    return "data:image/" + mime + ";base64," + base64.b64encode(encoded).decode()


class StickerProcessingTest(unittest.TestCase):
    def setUp(self):
        from api import sticker_processing
        self.processing = sticker_processing
        self.image = np.full((80, 100, 3), 245, np.uint8)
        self.image[20:60, 30:70] = (20, 30, 210)

    def remove(self, image=None, **kwargs):
        result = self.processing.remove_background(data_image(self.image if image is None else image), **kwargs)
        decoded = cv2.imdecode(np.frombuffer(base64.b64decode(result["image_data"].split(",")[1]), np.uint8), cv2.IMREAD_UNCHANGED)
        self.assertTrue(result["success"])
        self.assertEqual((result["height"], result["width"]), decoded.shape[:2])
        return decoded

    def test_synthetic_subject_has_transparent_background_and_opaque_foreground(self):
        result = self.remove(rect={"x": .2, "y": .15, "width": .6, "height": .7})
        self.assertEqual(result.shape, (80, 100, 4))
        self.assertEqual(int(result[0, 0, 3]), 0)
        self.assertEqual(int(result[40, 50, 3]), 255)
        np.testing.assert_array_equal(result[40, 50, :3], self.image[40, 50])

    def test_png_roundtrip_preserves_existing_transparency(self):
        image = cv2.cvtColor(self.image, cv2.COLOR_BGR2BGRA)
        image[40, 50, 3] = 90
        image[30, 40, 3] = 0
        result = self.remove(image)
        self.assertEqual(int(result[40, 50, 3]), 90)
        self.assertEqual(int(result[30, 40, 3]), 0)
        self.assertTrue(np.all(result[:, :, 3] <= image[:, :, 3]))

    def test_fully_transparent_input_stays_transparent(self):
        result = self.remove(np.zeros((80, 100, 4), np.uint8))
        self.assertFalse(np.any(result[:, :, 3]))

    def test_jpeg_and_webp_are_accepted(self):
        for extension in [".jpg", ".webp"]:
            result = self.processing.remove_background(data_image(self.image, extension))
            self.assertTrue(result["image_data"].startswith("data:image/png;base64,"))

    def test_large_image_downscales_with_aspect_ratio(self):
        image = cv2.resize(self.image, (1600, 1280))
        result = self.remove(image)
        self.assertEqual(result.shape[:2], (819, 1024))

    def test_rejects_invalid_rectangles(self):
        for rect in [{}, [], {"x": 0, "y": 0, "width": 1, "height": 1},
                     {"x": .1, "y": .1, "width": 0, "height": .2},
                     {"x": .1, "y": .1, "width": .0001, "height": .2},
                     {"x": .5, "y": .1, "width": .9, "height": .2},
                     {"x": -.1, "y": .1, "width": .5, "height": .2},
                     *[{"x": value, "y": .1, "width": .5, "height": .2} for value in [float("nan"), float("inf"), 10 ** 1000, True, "0.1"]]]:
            with self.subTest(rect=rect), self.assertRaises(ValueError):
                self.processing.remove_background(data_image(self.image), rect=rect)

    def test_rejects_corrupt_or_oversized_data(self):
        for content in [None, 12, "", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/png;base64,@@@@", "data:image/png;base64,aGVsbG8=", "data:image/png;base64," + "A" * (6 * 1024 * 1024)]:
            with self.subTest(content=str(content)[:60]), self.assertRaises(ValueError):
                self.processing.remove_background(content)

    def test_dimensions_are_bounded_before_decode(self):
        import struct
        header = b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR" + struct.pack(">II", 100000, 100000)
        content = "data:image/png;base64," + base64.b64encode(header).decode()
        with patch.object(cv2, "imdecode") as decode, self.assertRaises(ValueError):
            self.processing.remove_background(content)
        decode.assert_not_called()

    def test_segmentation_failure_is_recoverable_without_leaking_cv_error(self):
        with patch.object(cv2, "grabCut", side_effect=cv2.error("internal details")):
            with self.assertRaises(self.processing.SegmentationError) as error:
                self.processing.remove_background(data_image(self.image))
        self.assertNotIn("internal details", str(error.exception))

    def test_no_foreground_is_recoverable(self):
        with self.assertRaises(self.processing.SegmentationError):
            self.remove(np.full((80, 100, 3), 255, np.uint8))


if __name__ == "__main__":
    unittest.main()
