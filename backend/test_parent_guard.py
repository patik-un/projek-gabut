import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path


class ParentGuardTest(unittest.TestCase):
    def test_standalone_backend_has_no_parent_requirement(self):
        from parent_guard import managed_parent_alive
        self.assertTrue(managed_parent_alive(None))

    def test_native_parent_is_validated_without_reading_credentials(self):
        from parent_guard import managed_parent_alive
        self.assertTrue(managed_parent_alive(str(os.getppid())))
        self.assertFalse(managed_parent_alive(str(os.getppid() + 1000000)))
        self.assertFalse(managed_parent_alive("invalid"))

    @unittest.skipUnless(os.name == "posix", "Unix reparenting regression")
    def test_backend_guard_detects_real_parent_exit(self):
        with tempfile.TemporaryDirectory() as folder:
            marker = Path(folder, "parent-exited")
            child = "from parent_guard import managed_parent_alive; import sys,time; from pathlib import Path; expected=sys.argv[1]; end=time.monotonic()+6\nwhile managed_parent_alive(expected) and time.monotonic()<end: time.sleep(.02)\nPath(sys.argv[2]).write_text(str(managed_parent_alive(expected)))"
            launcher = "import subprocess,os,sys; subprocess.Popen([sys.executable,'-c',sys.argv[1],str(os.getpid()),sys.argv[2]],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)"
            subprocess.run([sys.executable, "-c", launcher, child, str(marker)], check=True, timeout=3)
            deadline = time.monotonic() + 8
            while not marker.exists() and time.monotonic() < deadline:
                time.sleep(.02)
            self.assertTrue(marker.exists(), "guard did not detect lost native parent")
            self.assertEqual(marker.read_text(), "False")
