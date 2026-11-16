# Admin layout overlap fix — 16 November 2026

Reproduced the released 0.1.8 admin UI at 1280 × 720 using actual App JSX/CSS with synthetic admin login, backend disconnected, and camera disabled. The constrained scrollable operations grid computed rows `784.82px 30px 30px`: Mode Operasi needed 184.594px, so Edit Strip overlapped it and covered the mode buttons. A browser rectangle-intersection check reported that exact pair.

Root fix: operations grid uses `grid-auto-rows: max-content` and `align-content: start`. Cards retain their natural height inside the scrollable area. After the change rows were `784.82px 184.594px 96.1953px`; intersection check passed and screenshot showed both mode buttons plus the separate Edit Strip card.

All six admin tabs inspected in the browser: Photobooth (3 cards), Strip (2), Kamera (1), Cetak (1), Waktu (1), Sistem (3), zero intersecting non-nested visible cards. Frontend suite: 168 passed. Vite production build: passed (124 modules). git diff --check: passed. Temporary preview files/server removed. Screenshot: admin-photobooth-layout-fixed.png in conversation visualization directory.

CSS-only local fix; no release asset replaced and no new installer published. Version 0.1.8 on GitHub still uses the prior layout until a new release is requested.
