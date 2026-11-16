# Photobooth operations

Approved scope: print configuration, organized admin, distraction-free fullscreen, and configurable timing. Continue in the existing feature checkout; preserve unrelated runtime data. No release publication in this implementation step.

## Approach

Keep existing React/backend/Tauri architecture. Organize existing admin cards under Photobooth, Strip, Kamera, Cetak, Waktu, Sistem tabs, retaining their state. Use small dedicated settings and timing helpers rather than adding more policy to App.jsx. Avoid a replacement admin app or OS-wide kiosk restrictions.

Print: keep supported layout papers 3R (88.9×127 mm) and 4R (101.6×152.4 mm), printer selection, auto-print switch and last-result preview. Add portrait/landscape, copies 1–10, fit (whole image) or fill (crop to printable area), and a generated one-copy test sheet. Apply options to actual Windows/CUPS jobs; reject invalid API input before submission. Never change global printer defaults. Borderless remains a driver setting, clearly explained; do not promise support from every printer. Paper selection per strip remains authoritative for actual strip jobs; global paper is the fallback/new-strip default and test-sheet paper.

Fullscreen: explicit operator action enters true fullscreen (Tauri window API or browser Fullscreen API), hides application header/navigation and shows a discreet exit control. Escape exits; failure leaves ordinary UI usable with a message. No credential/OS lockout. Preserve current session on entry/exit.

Timing: preserve 3-second initial/subsequent photo countdown and existing readiness delay by default. Optional session limit (0–3600 s), strip selection limit (0–600 s), editing limit (0–600 s), where 0 disables. Admin config is validated and persisted with existing settings; a session snapshots limits. Show time remaining. Strip timeout starts the selected/default strip only when ready; editing timeout advances to final preview without printing automatically; total-session expiry pauses/blocks further editing/capture at a safe boundary and offers finish/restart rather than silently deleting photos. Never reset while capture, save, GIF, print, upload or finalization is active. Timeouts pause while outside photobooth and stop at final results. Changed admin timing applies to the next session.

Validation: frontend policy tests and build, backend regression/Windows print tests, browser inspection. Physical Windows fullscreen/driver output needs a real Windows machine.
