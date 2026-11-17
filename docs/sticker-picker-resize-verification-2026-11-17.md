# Sticker selection centering and stable shrink — 17 November 2026

User reports off-center sticker choices and size/position jumps on shrinking.

Reproduced selection layout with actual App/DecorationArtwork at 1280×720, synthetic operator/default catalog, disconnected isolated API and disabled camera: image rectangle 75×75 inside an 89×52 button, visual box center offset +13.5px vertically. Added bounded centered flex thumbnail wrapper and scoped catalog CSS. Four sample thumbnail rectangles then measured exactly 0px offset in both axes and fit inside their buttons.

Resize root cause: radial pointer distance is unsigned. Dragging a handle toward and past the center shrank then enlarged the item again; perpendicular motion could also enlarge it (scale .5 became .92755 in the regression). Replaced radial ratio with signed projection on the starting handle direction. Center, rotation and aspect ratio stay unchanged; scale still clamps to .4–2.8 and degenerate input is ignored. Two new regressions observed RED→GREEN.

Additional button bug: sticker step .15 was rounded to one decimal, producing uneven changes. Actual App callback regression failed because 1→.9 instead of .85. Sticker-only updates now round to two decimals; sequence 1→.85→.7→.55→.4 and reverse step .4→.55 verified, with unchanged x/y and other items.

Validation: full frontend suite 178 passed; Vite production build passed, 126 modules; git diff --check passed. Existing rotated-corner, scale bounds, pointer capture/cancel/cleanup and final release-position tests pass. Independent focused review found no material issues in projection and thumbnail changes. Browser shrink buttons reached .4 without moving center [427.9921875,318.3515625]; actual SE-handle drag across center left scale .4 and that same center. Screenshot: sticker-centered-stable-resize.png in conversation visualization directory.

Temporary App fixture/server removed; no backend changes or new installer/release published.
