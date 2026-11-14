import os
import unittest
from pathlib import Path
from unittest.mock import patch

from runtime_paths import get_backend_dir


class BackendDataPathTest(unittest.TestCase):
    def test_standalone_root_and_nested_modules_use_the_same_backend_directory(self):
        backend = Path(__file__).resolve().parent
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(get_backend_dir(backend / "queue_db.py"), str(backend))
            self.assertEqual(get_backend_dir(backend / "api/server.py"), str(backend))

    def test_configured_data_directory_overrides_the_module_location(self):
        with patch.dict(os.environ, {"EVENT_BOOTH_BACKEND_DATA_DIR": "~/booth-test-data"}):
            self.assertEqual(get_backend_dir(__file__), os.path.abspath(os.path.expanduser("~/booth-test-data")))


if __name__ == "__main__":
    unittest.main()
