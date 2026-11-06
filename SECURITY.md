# Security Notes

## Google Drive credentials

- OAuth access and refresh tokens are stored in `auth/token.json`.
- On macOS/Linux, the auth directory is restricted to mode `700` and credential
  files to `600`.
- Legacy `token.pickle` files are never deserialized because pickle can execute
  code. Users with a legacy token must login to Google Drive once again.
- Release builds fail if a Drive token is found inside `backend-seed`.

The OAuth desktop `client_secrets.json` is application configuration, not a
confidential server secret. It may be bundled with a desktop app, but it must
never be used as proof that a caller is trusted. If this repository has ever
been public or shared outside the team, rotate the OAuth client in Google Cloud
and remove the old file from Git history.

## Local API

The backend binds to `127.0.0.1`. Browser requests are accepted only from the
local Vite development origin and known Tauri application origins. Requests
from unrelated websites are rejected with HTTP `403`.

## Release checklist

1. Run `npm run check:release` from `frontend`.
2. Confirm no `token.json`, `token.pickle`, database, or user output exists in
   `frontend/src-tauri/backend-seed`.
3. Build signed installers for production distribution.
4. Rotate OAuth credentials immediately if they are accidentally committed,
   logged, uploaded, or shared.
