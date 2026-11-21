!macro NSIS_HOOK_PREINSTALL
  IfFileExists "$INSTDIR\backend-bin\event-booth-backend.exe" 0 event_booth_backend_ready
  Push $0
  Push $1
  System::Call 'kernel32::SetEnvironmentVariableW(w "EVENT_BOOTH_INSTALL_FRONTEND", w "$INSTDIR\${MAINBINARYNAME}.exe")'
  System::Call 'kernel32::SetEnvironmentVariableW(w "EVENT_BOOTH_INSTALL_BACKEND", w "$INSTDIR\backend-bin\event-booth-backend.exe")'

  ; NSIS uses a 32-bit stub. Use native PowerShell to read x64 process paths.
  StrCpy $1 "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"
  IfFileExists "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe" 0 event_booth_backend_check
  StrCpy $1 "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe"

  event_booth_backend_check:
    ; Only stop orphaned backend processes from this installation directory.
    nsExec::ExecToLog /TIMEOUT=15000 `"$1" -NoProfile -NonInteractive -Command "$$ErrorActionPreference='Stop'; $$app=$$env:EVENT_BOOTH_INSTALL_FRONTEND; $$backend=$$env:EVENT_BOOTH_INSTALL_BACKEND; $$name=[IO.Path]::GetFileNameWithoutExtension($$app); if (Get-Process -Name $$name -ErrorAction SilentlyContinue | Where-Object Path -EQ $$app) { exit 1 }; $$processes=@(Get-Process -Name event-booth-backend -ErrorAction SilentlyContinue | Where-Object Path -EQ $$backend); foreach ($$process in $$processes) { if (!$$process.HasExited) { $$process.Kill() } }; foreach ($$process in $$processes) { if (!$$process.WaitForExit(3000)) { exit 1 } }; $$file=[IO.File]::Open($$backend,'Open','Write','ReadWrite'); $$file.Dispose()"`
    Pop $0
    StrCmp $0 "0" event_booth_backend_checked
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "File backend Event Booth Studio masih dipakai atau tidak dapat ditulis. Tutup Event Booth Studio, lalu pilih Retry. Jika masih gagal, restart Windows sebelum mencoba lagi." /SD IDCANCEL IDRETRY event_booth_backend_check
    SetErrorLevel 1
    Abort

  event_booth_backend_checked:
    System::Call 'kernel32::SetEnvironmentVariableW(w "EVENT_BOOTH_INSTALL_FRONTEND", p 0)'
    System::Call 'kernel32::SetEnvironmentVariableW(w "EVENT_BOOTH_INSTALL_BACKEND", p 0)'
    Pop $1
    Pop $0
  event_booth_backend_ready:
!macroend
