# macOS Tauri dev 401 repair — 17 November 2026

## Reproduction and root cause
User runs `npm run tauri dev`. The existing backend listener on 127.0.0.1:8000 was uvicorn PID 21364, launched by Python main PID 21362 on 16 November 17:28; main had parent PID 1. Current Vite/Tauri dev started 17 November. Public GET / returned 200 while protected GET /camera/providers returned 401 `Sesi aplikasi tidak valid`. The orphan backend retained an earlier per-instance token; each Tauri process creates a fresh token. Public liveness polling mistakenly accepted the old backend as ready.

Confirmed orphan belonged to this project's backend directory, rechecked its parent PID and cwd before signaling, and read only queue status counts (empty). Sent SIGTERM to the orphan main, allowing normal API-child cleanup. Later process inspection showed the new port-8000 listener's parent was a new Python main whose parent was the active target/debug/frontend process.

## Fix
- Tauri passes its PID only to directly launched development Python. Packaged onefile executables clear the inherited guard variable because a PyInstaller bootloader can be Python's immediate parent.
- Dev backend checks managed-parent identity on startup and in its main loop, then exits through normal cleanup if Tauri disappears. Standalone Python backend remains supported.
- New /system/health endpoint uses existing per-instance token middleware. Public / stays available for liveness/smoke probes.
- UI polling, startup checks and Drive login readiness use authenticated health. A wrong session never enables data polling and shows an actionable session-conflict message. Drive startup rejects that conflict before OAuth instead of waiting for its timeout.
- Native start_backend failures are no longer swallowed. Standalone browser login skips native invoke.

## Validation
Red→green regressions: stale-instance readiness, 401 before OAuth, matching/wrong/missing tokens, real subprocess reparenting after native parent exits, and native configuration excludes the parent guard for packaged onefile builds.
- Backend complete suite: 161 tests passed.
- Frontend complete suite: 170 tests passed.
- Rust cargo test --locked on macOS: 4 tests passed.
- Vite production build: passed, 124 modules.
- git diff --check: passed.
- Independent focused code review: no material blockers after scoping the parent guard to direct dev Python.

No token values were read from live process environments or printed; authentication/CORS were not disabled. No new release or installer published. Live native process ownership checked; GUI login and full packaged-install transition were not automated.
