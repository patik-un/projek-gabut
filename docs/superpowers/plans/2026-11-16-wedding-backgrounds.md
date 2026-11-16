# Wedding Backgrounds Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task; independent backend/frontend portions may be delegated via dispatching-parallel-agents.

**Goal:** Persistent wedding presets/custom backgrounds restricted to photobooth UI.
**Architecture:** Independent appearance store/router, frontend policy and settings card, scoped backdrop layer.
**Tech Stack:** React, CSS/SVG, FastAPI/Pillow, existing backend app-data/static assets.
**Spec:** docs/superpowers/specs/2026-11-16-wedding-backgrounds-design.md

## Global Constraints
- rtk prefix; preserve unrelated dirty runtime files; no release or signing changes.
- Default appearance unchanged; themes default/elegant/pink/floral/custom; dim0–85 default35.
- JPEG/PNG≤8MiB and24M pixels, bounded12MiB request, canonical4096px JPEG with no metadata.
- Only photobooth UI layer; no changes to composite/print output or other menus.

## Review Focus
- Invalid images, client paths, alpha/EXIF, oversized payloads and disk failures cannot corrupt current settings.
- Missing/corrupt persisted data falls back without destructive repair on GET.
- A slow initial GET cannot overwrite a newly applied theme; failures keep the current theme and display errors.
- Rapid requests/upload while a save runs must not reorder operator choices.
- All photobooth steps/fullscreen expose background while controls remain readable and admin/export stay unaffected.

### Task 1: Persistent backend appearance
Files: new backend/api/booth_appearance.py, test_booth_appearance.py, minimal server.py router registration.
Interface: GET/POST /photobooth/appearance and POST /photobooth/appearance/image per spec. Router factory receives watermark directory and bounded JSON reader.
- [x] Test persistence, validation, actual image decoding/canonicalization, invalid custom selection, corrupt file fallback, failed write preservation; observe red.
- [x] Implement atomic store/router and register after static paths are initialized.
- [x] Run backend unittest suite; expected green.

### Task 2: Frontend policy, request state and admin card
Files: boothAppearance.js/.test.js, useBoothAppearance.js, BoothAppearanceSettings.jsx, BoothAppearance.css, App.jsx and package.json.
Interface: normalizeBoothAppearance(value), boothAppearanceStyle(value, apiUrl), createBoothAppearanceController({request,onChange,onBusy,onError}); controller load/save/upload and dispose.
- [x] Test theme/style normalization, URL restrictions, failed save/upload preservation, stale GET, overlapping mutations; observe red.
- [x] Add preset/dim/custom preview card, bounded upload, persistence/retry/error UI.
- [x] Run frontend suite; expected green.

### Task 3: Scoped photobooth background and verification
Files: App.jsx, BoothAppearance.css, verification report.
- [x] Mount backdrop only under photobooth root, make shell surfaces transparent with readable cards, retain fullscreen flow.
- [x] Browser verify preset/custom preview, application, photobooth/admin separation and fullscreen.
- [x] Run frontend/backend tests, build and diff check; independent review; fix material issues with regressions; commit scoped feature and report physical desktop limits.
