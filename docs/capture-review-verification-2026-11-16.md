# Capture review and presentation verification — 2026-11-16

Implemented admin-controlled per-photo review (2–30 seconds), optional latest-photo retakes (1–5 per photo), policy snapshot at session start, and automatic acceptance on expiry. Admin settings are under Waktu. Review pauses while hidden, busy, expired, or viewing another menu. Final capture cannot auto-advance while review or retake is pending.

Camera preview is centered in explicit header/progress/camera grid rows, bounded to available height, and uses contain to preserve the full frame. Themed booth panels use translucent dark glass; photo and QR canvases stay opaque. Removed visible fullscreen control and empty toolbar; F12 enters in photobooth and Esc exits across views using existing native/browser fullscreen APIs.

Validation:
- Frontend complete suite: 168 tests passed.
- Backend complete unittest discovery: 157 tests passed.
- Production Vite build passed, 124 modules.
- git diff --check passed.
- Actual App JSX/CSS rendered with synthetic photo, Floral background and camera access disabled. Browser F12 hid navigation and Esc restored it. Review buttons and disabled advance button were visible, photo centered, background visible through glass panels. Screenshot: capture-review-centered-preview.png in the conversation visualization directory.
- Independent fresh-context review found and fixed three material issues, each reproduced red then green: partial native retake became latest capture, Escape stopped working after view change, session reset during capture refresh restored stale review. Retakes now stage in a temporary subdirectory with finally cleanup and atomically replace the old file only after success; revision checked after refreshes; Escape works outside booth. Additional regression verifies switching to Admin preserves pending review.

Platform boundary: browser fullscreen and mocked Windows file-lock/camera failures checked on macOS; no physical Windows camera/printer or packaged Windows installer tested. Existing Tauri fullscreen permissions unchanged. No version bump, push, tag or release; public installer remains 0.1.7. Unrelated app runtime data preserved.
