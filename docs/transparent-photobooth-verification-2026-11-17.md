# Transparent photobooth containers — 17 November 2026

User explicitly requested no color on photobooth containers so the event background is directly visible. Replaced translucent glass with scoped transparent menu surfaces; removed panel border color, shadows and backdrop blur. Covers start, selection wrappers, capture header/review/footer, editor wrappers, results wrappers, topbar and app status. Strip selection cards retain their selection outline with transparent fill. Admin background-preview card now represents the transparent booth surface.

Photo/video frames, strip artboards, exported pictures and the solid white QR card/image retain their existing backgrounds. Controls retain their button fills. Existing admin background dim preference is preserved.

Validation: real App JSX/CSS browser preview at 1280×720 with Floral theme and synthetic operator; camera disabled and isolated unavailable API port. Computed start/topbar/status surfaces: rgba(0,0,0,0), backdrop-filter none, box-shadow none. Selection, editor and results inspected. Computed results wrappers transparent; QR card and image remain rgb(255,255,255). Admin card remains rgb(17,17,17) after switching out of photobooth. Production Vite build passed (124 modules); git diff --check passed. Screenshot: photobooth-transparent-containers.png in conversation visualization directory. Temporary visual fixture and server removed afterward.

CSS-only change, no backend or exported image changes. No new installer published.
