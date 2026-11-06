import json
import os
import stat
import tempfile
import textwrap
import unittest

from camera.providers import (
    CameraProviderError,
    CameraProviderManager,
    NativeSdkBridgeProvider,
)


class NativeSdkBridgeProviderTest(unittest.TestCase):
    def make_bridge(self, source):
        directory = tempfile.TemporaryDirectory()
        path = os.path.join(directory.name, "bridge.py")
        with open(path, "w") as file:
            file.write(textwrap.dedent(source))
        os.chmod(path, os.stat(path).st_mode | stat.S_IEXEC)
        self.addCleanup(directory.cleanup)
        return path

    def provider(self, bridge_path):
        env_name = "EVENT_BOOTH_TEST_CAMERA_BRIDGE"
        previous = os.environ.get(env_name)
        os.environ[env_name] = bridge_path
        self.addCleanup(self.restore_env, env_name, previous)
        return NativeSdkBridgeProvider(
            "test",
            "Test Camera",
            "Test SDK",
            env_name,
            "missing-test-bridge",
            persistent=True,
        )

    @staticmethod
    def restore_env(name, value):
        if value is None:
            os.environ.pop(name, None)
        else:
            os.environ[name] = value

    def test_persistent_bridge_reuses_process(self):
        bridge = self.make_bridge(
            """\
            #!/usr/bin/env python3
            import json
            import os
            import sys
            for line in sys.stdin:
                request = json.loads(line)
                print(json.dumps({
                    "success": True,
                    "connected": True,
                    "pid": os.getpid(),
                    "command": request["command"],
                }), flush=True)
            """
        )
        provider = self.provider(bridge)
        self.addCleanup(provider.close)

        # A fresh executable can take longer to launch; this test checks PID reuse.
        first = provider._command("status", timeout=5)
        second = provider._command("status", timeout=1)

        self.assertEqual(first["pid"], second["pid"])

    def test_timeout_stops_bridge_and_next_command_recovers(self):
        hanging_bridge = self.make_bridge(
            """\
            #!/usr/bin/env python3
            import sys
            import time
            for line in sys.stdin:
                time.sleep(2)
            """
        )
        working_bridge = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "mock_sdk_bridge.py",
        )
        provider = self.provider(hanging_bridge)
        self.addCleanup(provider.close)

        with self.assertRaisesRegex(CameraProviderError, "timeout"):
            provider._command("status", timeout=0.1)

        os.environ[provider.env_name] = working_bridge
        result = provider._command("status", timeout=1)
        self.assertTrue(result["connected"])


class CameraProviderManagerTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.manager = CameraProviderManager(self.directory.name)
        self.addCleanup(self.manager.close)

    def test_can_select_provider_when_bridge_is_unavailable(self):
        status = self.manager.select("canon_edsdk")
        selected = next(
            provider
            for provider in status["providers"]
            if provider["id"] == "canon_edsdk"
        )

        self.assertEqual(status["selected"], "canon_edsdk")
        self.assertFalse(selected["available"])

    def test_can_switch_from_native_provider_back_to_webcam(self):
        self.manager.select("sony_crsdk")
        status = self.manager.select("webcam")

        self.assertEqual(status["selected"], "webcam")


if __name__ == "__main__":
    unittest.main()
