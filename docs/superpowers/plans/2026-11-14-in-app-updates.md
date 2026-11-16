# In-App Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Windows users discover, download and install signed updates in the app.
**Architecture:** Official Tauri updater controlled through Rust commands, React status UI, backend quiescence before installation, GitHub Releases for stable signed artifacts.
**Tech Stack:** Tauri 2, Rust, React, Python/FastAPI/SQLite, GitHub Actions.
**Spec:** `docs/superpowers/specs/2026-11-14-in-app-updates-design.md`

## Global Constraints

- Initial updater version 0.1.6; Windows x86_64 first; unsupported platforms report explicitly.
- Check after startup and every six hours; install only on user action at an idle boundary.
- Preserve app identifier, app-data, authentication, photo files and durable queue.
- HTTPS and trusted signature required; private signing key only in ignored local backup; never upload the key to GitHub.
- Stable publications only from matching explicit version tags after tests and packaged smoke pass.
- Prefix shell commands with `rtk`; preserve unrelated dirty runtime data.

## Review Focus

- Offline/404 manifest must show checking failed, never up to date.
- Queue worker racing update preparation must not claim another pending job.
- Download failure must leave backend running; installer failure must resume backend/queue.
- Double-clicks and stale async callbacks must not install twice or overwrite a current state.
- Missing public signing payload, mismatched tag or missing installer signature must stop release publication.

### Task 1: Backend quiescence

**Files:** `backend/queue_db.py`, `backend/api/server.py`, new `backend/api/test_update_prepare.py`.
**Interface:** authenticated POST `/system/update/prepare` pauses new queue claims/mutations, returns `{ready, active_requests, processing}`; POST `/system/update/cancel` resumes claims. Queue pause expires after a bounded lease so a crashed updater cannot permanently pause work.
- [x] Write tests for active work, atomic claim pause, cancel and lease expiry; run red.
- [x] Add SQLite control state checked inside claim transaction and middleware active mutation accounting; run all backend tests green.

### Task 2: Native updater and user interface

**Files:** new `frontend/src-tauri/src/updater.rs`, native `lib.rs`/Cargo/config, new `frontend/src/appUpdater.js`, `AppUpdates.jsx`, tests and App/CSS integration.
**Interfaces:** Rust `check_app_update`, `download_app_update(Channel)`, `install_app_update`, `cancel_app_update`; metadata includes current version, supported, version, notes. Download progress sent through native channel. Rust owns update handle and downloaded verified bytes.
- [x] Write controller tests for available/current/offline, unknown length, double calls, retry, postpone, busy guard; observe red.
- [x] Add native updater plugin and narrow commands; quiesce backend with authenticated loopback requests, stop owned child tree, install with Windows exit cleanup; restore backend/pause on failure. Unsupported OS/dev expose explanatory state.
- [x] Add nonmodal update badge and persistent panel available before login; derive busy reason from existing session/save/print state. Install overlay blocks new user operations while updating.
- [x] Run frontend suite/build, backend suite and cargo test/check. Inspect rendered UI with mocked native adapter where interactive Windows unavailable.

### Task 3: Signing and release pipeline

**Files:** workflow, new manifest builder/test scripts, .gitignore, version manifests and release guide.
**Interface:** CLI builds `latest.json` from versioned installer, `.sig`, matching `v<version>` tag and repository asset URL; rejects mismatches.
- [x] Test manifest behavior red, implement and run green.
- [x] Generate durable project signing key without printing secret; save ignored local backup only. Public key goes in updater config. User explicitly declined uploading the key.
- [x] Sign the successful Windows artifact locally. Publish via public signing JSON only after signature/checksum/provenance/tag validation. Keep branch test builds as artifacts. Use narrowly scoped release job permissions.
- [x] Bump all versions to 0.1.6; document one-time bootstrap install, future tag releases, key backup and physical Windows test limits.
- [x] Independent final review and local verification complete; finish scoped commit/push, dispatch Windows build, sign locally, tag tested commit and verify stable release assets/manifest. Report exact validation boundaries.

Execution note (2026-11-16): Windows build #17, local signing and stable publication #18 complete. Public manifest URL corrected after detecting GitHub asset-name normalization; 133 frontend tests and final unauthenticated release checks pass. See `docs/windows-autoupdate-verification-2026-11-16.md`. User declined cloud key upload; public-payload publication replaces Actions-secret signing. Interactive Windows upgrade transition remains a validation boundary.
