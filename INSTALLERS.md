# Event Booth Studio Installers

Panduan singkat untuk membuat installer macOS dan Windows.

## macOS

Jalankan dari root project di Mac:

```bash
./build-mac.sh
```

Output installer:

```text
frontend/src-tauri/target/release/bundle/dmg/
```

Catatan:
- Script akan membuat `backend/.venv` jika belum ada.
- Script menjalankan `npm install`, build frontend, menyiapkan `backend-seed`, membuat binary backend dengan PyInstaller, lalu membuat DMG Tauri.
- Jika ingin inject Google OAuth client secrets tanpa menyimpan file manual, jalankan script dengan env `GOOGLE_CLIENT_SECRETS_JSON`.
- Jika macOS memblokir app karena belum ditandatangani/notarized, itu normal untuk build lokal unsigned.

## Windows via GitHub Actions

Workflow tersedia di:

```text
.github/workflows/windows-installer.yml
```

Cara pakai:

1. Push branch ke GitHub.
2. Buka `Settings` -> `Secrets and variables` -> `Actions`.
3. Tambahkan secret `GOOGLE_CLIENT_SECRETS_JSON` berisi isi file `backend/auth/client_secrets.json` jika fitur Google Drive akan dipakai di installer.
4. Buka tab `Actions`.
5. Pilih `Build Windows Installer`.
6. Klik `Run workflow`.
7. Download artifact `event-booth-studio-windows-installer`.

Output installer di artifact GitHub:

```text
frontend/src-tauri/target/release/bundle/nsis/
```

## Windows lokal

Jika ingin build langsung dari mesin Windows:

```bat
build-windows.bat
```

Output:

```text
frontend\src-tauri\target\release\bundle\nsis\
```

## Yang ikut dibundle

- Frontend React hasil `npm run build`
- Binary backend hasil PyInstaller
- Seed data backend dari `frontend/src-tauri/backend-seed`
- Watermark/template/config awal yang tersedia saat build

## Belum termasuk

- Code signing macOS
- Apple notarization
- Windows code signing certificate
