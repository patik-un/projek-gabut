# Capture review and photobooth presentation

User requests per-photo preview and retake controlled by admin, clearer wedding backgrounds, centered camera preview, and hidden fullscreen controls operated with F12 / Esc. The follow-up adds requirements to the proposed design.

Approach: review each latest photo before proceeding rather than editing arbitrary earlier slots. Admin controls preview on/off, 2–30 seconds (default 5), retake on/off, and 1–5 successful retakes per photo (default 1). Expiry accepts the photo. Settings are snapshotted on session start. Failed retakes preserve the previous JPEG and do not consume an attempt. Session reset clears review state; hidden pages and expired sessions pause review. Retakes use the existing serialized capture endpoint with a latest filename precondition and atomic replacement.

Presentation: center the camera in its available grid area, preserve full camera image with contain, use translucent dark glass on themed booth surfaces, retain solid photo/QR canvases. Remove fullscreen button and its surrounding empty toolbar; keep configured clocks. F12 enters native/browser fullscreen only in photobooth, Esc exits. Keyboard repeats and modified shortcuts do nothing. Native desktop behavior uses existing Tauri permissions. No release, push, or installer publication is included.

Alternatives: reviewing the whole strip would require arbitrary slot selection and delay the existing flow. Fully transparent text surfaces would lose contrast on light wedding images; use glass and local text shadows instead.
