# Sticker Transform Controls Implementation Plan

> **For agentic workers:** Execute inline with superpowers:executing-plans. Preserve existing uncommitted work.

**Goal:** Resize, rotate, move, and delete stickers directly on the strip preview.

**Architecture:** A small React selection-controls component owns pointer gestures and cleanup. Pure geometry and gesture functions update existing scale/rotation fields, leaving image artwork and exports unchanged.

**Tech Stack:** React, Pointer Events, CSS, Node test runner; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-14-sticker-transform-design.md` (approved).

## Global Constraints

- Preserve sticker aspect ratio and center; scale stays between 0.4 and 2.8.
- Support mouse, touch, emoji, image, GIF, rotated stickers, and either strip.
- Selection controls never enter exported artwork.
- Reuse the current checkout because it contains the ongoing user fixes; do not commit unrelated work.

## Review Focus

- Rotated rectangular stickers must resize consistently from each corner.
- Controls stay usable at both scale limits and near preview edges.
- Only the active pointer updates a gesture; cancellation/unmount removes listeners.
- The selected sticker alone changes; persisted artwork and GIF fields stay intact.
- Keyboard interaction provides an alternative to dragging handles.

### Task 1: Direct sticker manipulation

**Files:** Create `frontend/src/stickerTransform.js`, `frontend/src/StickerTransformControls.jsx`, `frontend/src/stickerTransform.test.js`; modify `frontend/src/App.jsx`, `frontend/src/App.css`, `frontend/package.json`.

**Interface:** `transformSticker(item, mode, center, start, point)` returns a scale or rotation patch. `beginStickerTransform(event, item, mode, onChange, targetWindow)` returns gesture cleanup. Controls accept `item`, `onChange(patch)`, `onDelete()`.

- [x] Write behavioral tests for radial resize, rotation, limits, invalid/degenerate geometry, pointer isolation and cleanup; run and observe failure.
- [x] Implement the geometry and pointer lifecycle; test to green.
- [x] Render four resize handles, a rotation handle and delete button on selected stickers. Keep controls at constant screen size using inverse scale; retain existing movement and panel controls.
- [x] Verify existing export code still consumes the same scale/rotation fields; run frontend suite and production build.
- [x] Inspect the real component in a browser fixture with representative emoji, image, GIF and rotated stickers; drag handles and verify appearance at limits.
- [x] Request a focused review, address material findings and record results.

## Execution ledger

- Approved by user: “oke gas”. Execute all steps inline.
- Pre-flight: one implementation task; component and App share the scale/rotation patch interface.

- Task 1 complete: `npm test` passed 116/116; `npm run build` passed; `git diff --check` passed.
- Browser verification: actual corner drag changed scale from 1 to 2.2676; rotate drag changed angle from 0 to 89.43°. Keyboard controls, minimum/maximum hitbox sizing, emoji/image/GIF, edge controls, and deletion verified.
- Focused independent code review: no material correctness findings.
- Visual result: `/Users/a1/.codex/visualizations/2026/11/14/01a1d92c-bb1d-7742-be7c-a9c5240d6949/sticker-controls-preview.png`.
- Temporary browser fixture removed. No commit or push performed; existing unrelated edits preserved.
