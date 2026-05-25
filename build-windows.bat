@echo off
REM ======================================================
REM Build Windows installer for Event Booth Studio
REM Jalankan file ini dari Windows.
REM ======================================================
echo ========================================
echo  Event Booth Studio — Windows Build
echo ========================================

cd /d "%~dp0"

REM ---- 1. Prepare Python Backend Environment ----
echo.
echo [1/4] Preparing Python backend environment...
cd backend

if not exist ".venv" (
    echo Creating Python virtual environment...
    python -m venv .venv
)

call .venv\Scripts\activate.bat

echo Installing dependencies...
pip install -r requirements.txt

call deactivate
cd ..

REM ---- 2. Install Frontend Dependencies ----
echo.
echo [2/4] Installing frontend dependencies...
cd frontend
call npm install

REM ---- 3. Prepare Backend Seed Data ----
echo.
echo [3/4] Preparing backend seed data...
node scripts\prepare-tauri-backend.mjs

REM ---- 4. Build Tauri NSIS Installer ----
echo.
echo [4/4] Building Windows installer...
call npm run tauri build -- --bundles nsis

echo.
echo ========================================
echo  Build selesai!
echo  Hasil: frontend\src-tauri\target\release\bundle\nsis\
echo ========================================
pause
