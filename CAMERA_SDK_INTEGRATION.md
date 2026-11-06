# Canon and Sony Camera SDK Integration

Event Booth Studio supports three camera providers:

- `webcam`: WebView `getUserMedia` with OpenCV fallback.
- `canon_edsdk`: Canon EOS Digital SDK bridge.
- `sony_crsdk`: Sony Camera Remote SDK bridge.

Canon EDSDK and Sony Camera Remote SDK are proprietary downloads and are not
redistributed with this repository. Build one native bridge executable per SDK,
then configure its absolute path:

```text
EVENT_BOOTH_CANON_EDSDK_BRIDGE=/path/to/event-booth-canon-edsdk-bridge
EVENT_BOOTH_SONY_CRSDK_BRIDGE=/path/to/event-booth-sony-crsdk-bridge
```

On Windows, use the corresponding `.exe` paths. The bridge may be a thin CLI
client to a persistent native camera service so the SDK session and live view
remain open between commands.

## Bridge Protocol

The backend starts the configured executable, writes one JSON request to stdin,
and expects one JSON response on stdout. Diagnostic logs must go to stderr.

Every request contains:

```json
{"protocol_version": 1, "command": "status"}
```

Persistent bridges are started with `--server`. In server mode, the bridge must
read and respond to one JSON object per line, flush stdout after every response,
and keep diagnostic logs on stderr. The backend enforces per-command timeouts
and restarts a bridge that stops responding.

Supported commands:

### `status`

Open or inspect the SDK camera connection.

```json
{
  "success": true,
  "connected": true,
  "message": "Camera connected",
  "camera": {"model": "EOS R6 Mark II"},
  "capabilities": {"preview": true, "capture": true, "settings": true}
}
```

### `preview`

Return one JPEG live-view frame.

```json
{"success": true, "image_base64": "<base64 JPEG>"}
```

### `capture`

Trigger the physical shutter and download the full-resolution JPEG to the exact
requested path.

Request:

```json
{"protocol_version": 1, "command": "capture", "output_path": "/absolute/capture.jpg"}
```

Response:

```json
{"success": true, "output_path": "/absolute/capture.jpg"}
```

### `settings`

Apply supported camera settings. Unsupported settings should be ignored or
returned as a clear error.

```json
{
  "protocol_version": 1,
  "command": "settings",
  "settings": {"CAP_PROP_EXPOSURE": 0, "CAP_PROP_WHITE_BALANCE_BLUE_U": 5600}
}
```

Errors use:

```json
{"success": false, "message": "Camera is not connected"}
```

## Local Mock Test

The bundled mock bridge verifies the application flow without vendor SDKs:

```bash
chmod +x backend/camera/mock_sdk_bridge.py
EVENT_BOOTH_CANON_EDSDK_BRIDGE="$PWD/backend/camera/mock_sdk_bridge.py" \
  backend/.venv/bin/python -m uvicorn api.server:app --app-dir backend
```

Select `Canon EOS` from Admin > Kamera. Replace the mock path with the compiled
Canon or Sony bridge before using real hardware.

## Sony Camera Remote SDK on macOS

The bundled vendor runtime is based on Sony Camera Remote SDK
`v2.02.00_20260610a` supplied for this project.

The Sony SDK bridge source and runtime are located in:

```text
backend/camera/native/sony
```

Build it with:

```bash
backend/camera/native/sony/build.sh
```

The Tauri production build runs `npm run prepare:camera-bridges`, bundles the
universal `arm64`/`x86_64` bridge, and configures the backend automatically.
Connect the camera over USB and enable its Remote Shooting / PC Remote mode.
Set the camera image format to JPEG or RAW+JPEG so captures can be downloaded
into the photobooth flow. The bundled Sony bridge and macOS app require macOS
12.1 or newer.
