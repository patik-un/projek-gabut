$ErrorActionPreference = 'Stop'
$binary = Join-Path $PSScriptRoot '..\src-tauri\backend-bin\event-booth-backend.exe'
$data = Join-Path ([System.IO.Path]::GetTempPath()) ('event-booth-smoke-' + [guid]::NewGuid())
$env:EVENT_BOOTH_BACKEND_DATA_DIR = $data
$env:EVENT_BOOTH_API_TOKEN = [guid]::NewGuid().ToString('N')
$env:EVENT_BOOTH_BACKEND_PORT = '18080'
$process = $null
try {
    New-Item -ItemType Directory -Path $data | Out-Null
    $process = Start-Process -FilePath $binary -PassThru -RedirectStandardOutput (Join-Path $data 'stdout.log') -RedirectStandardError (Join-Path $data 'stderr.log')
    $ready = $false
    for ($attempt = 0; $attempt -lt 90; $attempt++) {
        if ($process.HasExited) { throw 'Packaged backend exited before becoming ready' }
        try {
            $response = Invoke-RestMethod 'http://127.0.0.1:18080/' -TimeoutSec 2
            if ($response.status -eq 'running') { $ready = $true; break }
        } catch { Start-Sleep -Seconds 1 }
    }
    if (-not $ready) { throw 'Packaged backend health check timed out' }
    $headers = @{ 'x-event-booth-token' = $env:EVENT_BOOTH_API_TOKEN }
    $providers = Invoke-RestMethod 'http://127.0.0.1:18080/camera/providers' -Headers $headers -TimeoutSec 10
    if ($providers.selected -ne 'webcam') { throw 'Packaged backend default provider is invalid' }
    Write-Host 'Packaged Windows backend smoke test passed.'
} finally {
    if ($process -and -not $process.HasExited) {
        & taskkill /F /T /PID $process.Id | Out-Null
    }
    if (Test-Path $data) {
        Get-Content (Join-Path $data 'stderr.log') -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force $data
    }
    Remove-Item Env:EVENT_BOOTH_BACKEND_DATA_DIR -ErrorAction SilentlyContinue
    Remove-Item Env:EVENT_BOOTH_API_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:EVENT_BOOTH_BACKEND_PORT -ErrorAction SilentlyContinue
}
