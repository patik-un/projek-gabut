# Capture Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Admin-controlled review/retake and clear centered booth presentation with keyboard fullscreen.
**Architecture:** Extend existing serialized capture with latest-file replacement; React review state gates auto capture and final navigation. Separate normalized review policy and keyboard helper enable meaningful tests.
**Tech Stack:** React, CSS, FastAPI, Tauri 2.
**Spec:** docs/superpowers/specs/2026-11-16-capture-review-design.md

## Global Constraints
Preserve unrelated runtime files. No publication. Full photo/QR canvases stay opaque. Session changes invalidate review. Failed retakes preserve previous JPEG.

## Review Focus
- Latest-photo precondition rejects stale replacement and path traversal.
- Failed capture or locked Windows target preserves old JPEG and capture count.
- Final photo waits for acceptance; retake at count limit still works.
- Hidden/expired sessions pause review; reset cancels all review state.
- F12 scoped to photobooth; Esc exits without changing session.

### Task 1: Safe capture replacement
Files: backend/api/server.py, backend/api/test_server.py.
Interface: POST /capture accepts optional replace_filename equal to latest capture basename; successful replacement keeps same filename and count.
- [x] Add tests for successful full-session replacement, bad/stale targets, invalid frame and locked target preserving originals.
- [x] Run tests and observe missing replacement failure.
- [x] Add strict target validation and atomic post-capture replacement with cleanup on failure.
- [x] Run backend suite.

### Task 2: Review flow and settings
Files: frontend/src/captureReview.js, captureReview.test.js, App.jsx, BoothOperationsSettings.jsx, appHandlers.test.js, package.json.
Interface: normalizeCaptureReview(settings) returns enabled, seconds, allowRetake, maxRetakes; App snapshots at session start, tracks latest retake target and successful attempts.
- [x] Test normalization and actual capture callbacks including retake at limit and failure.
- [x] Observe failures; implement admin controls, paused review timer, accept/retake actions and auto capture gating.
- [x] Run frontend suite.

### Task 3: Keyboard and presentation
Files: frontend/src/boothFullscreen.js, boothFullscreen.test.js, useBoothFullscreen.js, App.jsx, BoothOperations.css, BoothAppearance.css.
Interface: handleBoothFullscreenKey(event, active, change) handles unmodified F12/escape. Hook accepts active flag.
- [x] Test keyboard scope, repeats and exit behavior; observe missing helper failure.
- [x] Implement shortcuts; remove visible fullscreen control and empty toolbar.
- [x] Center camera with explicit grid rows and bounded frame; translucent themed surfaces preserve contrast.
- [x] Run suite/build; inspect real CSS/JSX browser preview and final independent review. Record verification and commit only feature files.
