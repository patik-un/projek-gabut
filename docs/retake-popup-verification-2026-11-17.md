# Oto retake countdown and status popup — 17 November 2026

User reports Ulang Foto not starting the countdown in Oto mode and intrusive bottom notifications.

Cause found: the result-review JSX replaced the video with an image. Returning from review remounted video and attachCameraVideoElement reset cameraPreviewReady, so automatic capture could remain gated awaiting another media-ready event. Regression rendered the actual production capture JSX during review and failed because no video was present.

Fix: keep the live video/backend preview mounted and overlay the captured image at z-index 4 (countdown layer stays 5). Retake clears prior countdown/ready labels and re-enters the configured Oto countdown. Caption/counter show the current retaken photo. Manual mode retains manual capture.

Photobooth status is a fixed non-modal popup instead of the bottom app-status element. It has a close button, auto-dismisses after 4 seconds, cancels stale timers and does not change layout or pause the camera. Other application views retain existing status presentation.

Validation:
- Actual production JSX regression RED→GREEN: video exists alongside result image during review.
- Actual Oto handler/effect regression: full one-photo session retake runs ready delay, configured countdown 3→2, replaces last.jpg and returns to review with one successful attempt consumed.
- Popup effect tests: dismiss at 4000ms, no timer for empty messages, old callbacks cannot hide the next message after cleanup.
- Full frontend suite: 175 passed. Production Vite build: passed (126 modules). git diff --check passed.
- Browser integration using actual App with a canvas MediaStream and in-memory backend, no physical camera: video readyState 4/width 960 remains present during review; Ulang Foto starts countdown, capture succeeds, review returns and retry count reaches zero. Screenshot uses an 8-second fixture countdown for visibility: photobooth-retake-countdown-popup.png in conversation visualization directory. Closing popup leaves camera readyState 4, popup count 0 and bottom-status count 0.
- Independent focused review: no material issues.

Temporary preview files, sample SVG and server removed. No backend change or new installer/release published. Native camera hardware was not used in this browser integration check.
