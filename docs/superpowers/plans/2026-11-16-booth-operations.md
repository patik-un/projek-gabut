# Photobooth Operations Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task. Steps use checkboxes.

**Goal:** Configurable printing, usable admin navigation, fullscreen and safe timers.
**Architecture:** Existing React app integrates focused policy/components; backend applies bounded print-job options.
**Tech Stack:** React, Tauri 2, Python/FastAPI, Windows GDI/CUPS.
**Spec:** docs/superpowers/specs/2026-11-16-booth-operations-design.md

## Global Constraints
- Prefix commands with rtk; preserve unrelated data; use existing feature branch.
- No cloud signing key upload, no publication as part of feature implementation.
- Print 3R/4R; copies 1–10; orientation portrait/landscape; fit/fill; defaults preserve existing jobs.
- Timer limits default off; photo countdown defaults 3 seconds; no destructive timeout during active work.

## Review Focus
- Driver ignores landscape or photo size: stop before submitting a wrong job.
- Invalid copies/options: API rejects without generating print jobs.
- Admin tabs retain edits and make every existing setting reachable.
- Escape/native fullscreen exit restores navigation and session state.
- Stale timers, navigation, hidden window, and async capture/finalization must not reset photos or double-start sessions.

### Task 1: Print job backend
Files: backend/api/server.py, backend/api/test_windows_print.py and focused print option tests.
Interface: POST /photobooth/print accepts copies=1, orientation='portrait', fit='fit'. Helpers accept same optional keywords. Validate strict input; apply copies as pages within one Windows job and lpr -#; landscape driver dimensions; fit or cropped fill without physical distortion.
- [x] Write Windows/CUPS/endpoint regressions; observe failing tests.
- [x] Implement job options without changing driver defaults.
- [x] Run backend suite; expected all pass.

### Task 2: Frontend operations policy and settings
Files: new frontend/src/boothOperations.js/.test.js, new BoothOperationsSettings.jsx, App.jsx, package.json test command.
Interface: normalizeBoothOperations(settings), resolveBoothTimerStage(mode,step), advanceBoothClock(clock,dt,busy), createPrintTestImage(paper,orientation); printer fields printCopies/printOrientation/printFit and timing fields timing{initialCountdown,nextCountdown,sessionSeconds,selectionSeconds,editSeconds}.
- [x] Test corrupt stored settings, disabled limits, stage transitions, pause/busy/expiry; observe red.
- [x] Implement helpers, settings cards, request payload and local-storage hydration.
- [x] Run npm test; expected green.

### Task 3: Admin navigation, fullscreen, timer integration
Files: App.jsx, new BoothOperations.css, fullscreen helper, default capability.
Interface: six admin tabs, mounted hidden cards, native/browser fullscreen entry/exit with Escape, session snapshot clock with visible countdown and safe expiry prompt.
- [x] Integrate timer policy and snapshot/deferred safe expiry; add behavior regressions.
- [x] Integrate admin tab navigation and fullscreen; inspect browser layout and error recovery.
- [x] Run frontend/backend suites, production build, Rust check for capability changes, diff check; expected green.
- [x] Independent final review; fix material findings with regression evidence. Commit scoped changes and report physical Windows validation limits.
