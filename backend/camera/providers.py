import base64
import json
import os
import queue
import shutil
import subprocess
import sys
import threading
import time


PROVIDER_CONFIG_FILENAME = "camera_provider.json"


class CameraProviderError(RuntimeError):
    pass


class NativeSdkBridgeProvider:
    def __init__(
        self,
        provider_id,
        name,
        sdk_name,
        env_name,
        default_binary,
        persistent=False,
    ):
        self.id = provider_id
        self.name = name
        self.sdk_name = sdk_name
        self.env_name = env_name
        self.default_binary = default_binary
        self.persistent = persistent
        self.process = None
        self.process_lock = threading.Lock()
        self.stderr_lock = threading.Lock()
        self.stderr_lines = []
        self.last_error = None
        self.last_seen_at = None

    def bridge_path(self):
        configured = (os.environ.get(self.env_name) or "").strip()

        if configured:
            return os.path.abspath(os.path.expanduser(configured))

        return shutil.which(self.default_binary)

    def status(self, probe=True):
        bridge_path = self.bridge_path()

        if not bridge_path or not os.path.isfile(bridge_path):
            return {
                "id": self.id,
                "name": self.name,
                "sdk": self.sdk_name,
                "available": False,
                "connected": False,
                "persistent": self.persistent,
                "message": (
                    f"Bridge {self.sdk_name} belum terpasang. "
                    f"Atur {self.env_name} ke executable bridge."
                ),
            }

        if not probe:
            return {
                "id": self.id,
                "name": self.name,
                "sdk": self.sdk_name,
                "available": True,
                "connected": None,
                "persistent": self.persistent,
                "message": "Bridge SDK tersedia. Pilih integrasi ini untuk memeriksa kamera.",
            }

        try:
            result = self._command("status", timeout=8)
        except CameraProviderError as error:
            self.last_error = str(error)
            return {
                "id": self.id,
                "name": self.name,
                "sdk": self.sdk_name,
                "available": True,
                "connected": False,
                "persistent": self.persistent,
                "message": str(error),
                "diagnostic": self._diagnostic(),
            }

        self.last_error = None
        self.last_seen_at = int(time.time())
        return {
            "id": self.id,
            "name": self.name,
            "sdk": self.sdk_name,
            "available": True,
            "connected": bool(result.get("connected")),
            "persistent": self.persistent,
            "message": result.get("message") or (
                "Kamera terhubung" if result.get("connected") else "Kamera belum terhubung"
            ),
            "camera": result.get("camera"),
            "capabilities": result.get("capabilities") or {},
            "last_seen_at": self.last_seen_at,
        }

    def capture(self, output_path):
        result = self._command(
            "capture",
            {"output_path": output_path},
            timeout=45,
        )
        captured_path = result.get("output_path") or output_path

        if not os.path.isfile(captured_path):
            raise CameraProviderError(
                f"{self.name} tidak menghasilkan file capture: {captured_path}"
            )

        if os.path.abspath(captured_path) != os.path.abspath(output_path):
            shutil.copy2(captured_path, output_path)

        return output_path

    def preview_jpeg(self):
        result = self._command("preview", timeout=8)
        image_base64 = result.get("image_base64") or ""

        if "," in image_base64:
            image_base64 = image_base64.split(",", 1)[1]

        try:
            return base64.b64decode(image_base64, validate=True)
        except (ValueError, TypeError) as error:
            raise CameraProviderError(
                f"Preview {self.name} tidak valid"
            ) from error

    def apply_settings(self, settings):
        return self._command("settings", {"settings": settings}, timeout=8)

    def close(self):
        with self.process_lock:
            self._stop_process_locked()

    def reconnect(self):
        self.close()
        return self.status()

    def _command(self, command, payload=None, timeout=15):
        bridge_path = self.bridge_path()

        if not bridge_path or not os.path.isfile(bridge_path):
            raise CameraProviderError(
                f"Bridge {self.sdk_name} belum terpasang. Atur {self.env_name}."
            )

        request = {
            "protocol_version": 1,
            "command": command,
            **(payload or {}),
        }

        if self.persistent:
            return self._persistent_command(bridge_path, request, timeout)

        try:
            result = subprocess.run(
                [bridge_path],
                input=json.dumps(request),
                text=True,
                capture_output=True,
                timeout=timeout,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            raise CameraProviderError(
                f"Gagal menjalankan bridge {self.name}: {error}"
            ) from error

        if result.returncode != 0:
            message = result.stderr.strip() or result.stdout.strip()
            raise CameraProviderError(
                message or f"Bridge {self.name} berhenti dengan kode {result.returncode}"
            )

        try:
            response = json.loads(result.stdout)
        except json.JSONDecodeError as error:
            raise CameraProviderError(
                f"Respons bridge {self.name} bukan JSON valid"
            ) from error

        if not response.get("success"):
            raise CameraProviderError(
                response.get("message") or f"Perintah {command} gagal"
            )

        self.last_error = None
        self.last_seen_at = int(time.time())
        return response

    def _persistent_command(self, bridge_path, request, timeout):
        with self.process_lock:
            if self.process is None or self.process.poll() is not None:
                try:
                    self.process = subprocess.Popen(
                        [bridge_path, "--server"],
                        stdin=subprocess.PIPE,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        text=True,
                        bufsize=1,
                    )
                except OSError as error:
                    raise CameraProviderError(
                        f"Gagal menjalankan bridge {self.name}: {error}"
                    ) from error
                with self.stderr_lock:
                    self.stderr_lines = []
                threading.Thread(
                    target=self._drain_stderr,
                    args=(self.process,),
                    daemon=True,
                ).start()

            try:
                self.process.stdin.write(json.dumps(request) + "\n")
                self.process.stdin.flush()
            except (BrokenPipeError, OSError) as error:
                self._stop_process_locked()
                raise CameraProviderError(
                    f"Koneksi bridge {self.name} terputus: {error}"
                ) from error

            response_queue = queue.Queue(maxsize=1)
            process = self.process

            def read_response():
                try:
                    response_queue.put(process.stdout.readline())
                except (OSError, ValueError):
                    response_queue.put("")

            threading.Thread(target=read_response, daemon=True).start()

            try:
                output = response_queue.get(timeout=timeout)
            except queue.Empty as error:
                diagnostic = self._diagnostic()
                self._stop_process_locked()
                message = f"Bridge {self.name} timeout saat perintah {request['command']}"
                if diagnostic:
                    message = f"{message}: {diagnostic}"
                self.last_error = message
                raise CameraProviderError(message) from error

            if not output:
                diagnostic = self._diagnostic()
                self._stop_process_locked()
                message = f"Bridge {self.name} berhenti tanpa respons"
                if diagnostic:
                    message = f"{message}: {diagnostic}"
                self.last_error = message
                raise CameraProviderError(message)

            try:
                response = json.loads(output)
            except json.JSONDecodeError as error:
                raise CameraProviderError(
                    f"Respons bridge {self.name} bukan JSON valid"
                ) from error

            if not response.get("success"):
                self.last_error = (
                    response.get("message") or f"Perintah {request['command']} gagal"
                )
                raise CameraProviderError(
                    self.last_error
                )

            self.last_error = None
            self.last_seen_at = int(time.time())
            return response

    def _drain_stderr(self, process):
        if not process.stderr:
            return

        try:
            for line in process.stderr:
                message = line.strip()
                if not message:
                    continue
                with self.stderr_lock:
                    self.stderr_lines = [*self.stderr_lines[-19:], message]
        except (OSError, ValueError):
            return

    def _diagnostic(self):
        with self.stderr_lock:
            return self.stderr_lines[-1] if self.stderr_lines else None

    def _stop_process_locked(self):
        process = self.process
        self.process = None

        if process is None:
            return

        try:
            process.terminate()
            process.wait(timeout=3)
        except (OSError, subprocess.TimeoutExpired):
            try:
                process.kill()
                process.wait(timeout=1)
            except (OSError, subprocess.TimeoutExpired):
                pass
        finally:
            for stream in (process.stdin, process.stdout, process.stderr):
                if stream is None:
                    continue
                try:
                    stream.close()
                except OSError:
                    pass


class CameraProviderManager:
    def __init__(self, backend_dir):
        self.backend_dir = backend_dir
        self.config_path = os.path.join(
            backend_dir,
            "database",
            PROVIDER_CONFIG_FILENAME,
        )
        executable_suffix = ".exe" if sys.platform == "win32" else ""
        self.providers = {
            "canon_edsdk": NativeSdkBridgeProvider(
                "canon_edsdk",
                "Canon EOS",
                "Canon EDSDK",
                "EVENT_BOOTH_CANON_EDSDK_BRIDGE",
                f"event-booth-canon-edsdk-bridge{executable_suffix}",
            ),
            "sony_crsdk": NativeSdkBridgeProvider(
                "sony_crsdk",
                "Sony Alpha",
                "Sony Camera Remote SDK",
                "EVENT_BOOTH_SONY_CRSDK_BRIDGE",
                f"event-booth-sony-crsdk-bridge{executable_suffix}",
                persistent=True,
            ),
        }
        self.lock = threading.Lock()
        self.selected = self._load_selected()

    def _load_selected(self):
        try:
            with open(self.config_path, "r") as file:
                selected = json.load(file).get("selected")
        except (OSError, json.JSONDecodeError):
            selected = None

        return selected if selected in ("webcam", *self.providers.keys()) else "webcam"

    def select(self, provider_id):
        if provider_id not in ("webcam", *self.providers.keys()):
            raise CameraProviderError(f"Provider kamera tidak dikenal: {provider_id}")

        os.makedirs(os.path.dirname(self.config_path), exist_ok=True)

        with self.lock:
            previous_provider = self.providers.get(self.selected)
            if previous_provider and self.selected != provider_id:
                previous_provider.close()

            self.selected = provider_id
            with open(self.config_path, "w") as file:
                json.dump({"selected": provider_id}, file, indent=2)

        return self.status()

    def status(self):
        providers = [
            {
                "id": "webcam",
                "name": "Webcam / USB Streaming",
                "sdk": None,
                "available": True,
                "connected": None,
                "message": "Dikelola oleh WebView atau OpenCV",
            },
            *(
                provider.status(probe=provider_id == self.selected)
                for provider_id, provider in self.providers.items()
            ),
        ]

        return {
            "selected": self.selected,
            "providers": providers,
        }

    def selected_provider(self):
        return self.providers.get(self.selected)

    def reconnect(self):
        provider = self.selected_provider()

        if provider is None:
            return self.status()

        provider.close()
        return self.status()

    def close(self):
        for provider in self.providers.values():
            provider.close()

    def capture(self, output_path):
        provider = self.selected_provider()

        if provider is None:
            return None

        return provider.capture(output_path)

    def preview_jpeg(self):
        provider = self.selected_provider()

        if provider is None:
            return None

        return provider.preview_jpeg()

    def apply_settings(self, settings):
        provider = self.selected_provider()

        if provider is None:
            return None

        return provider.apply_settings(settings)
