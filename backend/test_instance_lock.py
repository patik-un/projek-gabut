import tempfile
import unittest
from pathlib import Path


class InstanceLockTest(unittest.TestCase):
    def test_second_instance_is_rejected_and_lock_released_after_close(self):
        from instance_lock import acquire_instance_lock
        with tempfile.TemporaryDirectory() as folder:
            first = acquire_instance_lock(folder)
            with self.assertRaises(RuntimeError):
                acquire_instance_lock(folder)
            first.close()
            acquire_instance_lock(folder).close()
