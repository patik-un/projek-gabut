$ErrorActionPreference = 'Stop'

function Install-Release {
    param([string]$Version, [string]$Sha256, [string]$Mode)

    if ($Version -eq $env:CANDIDATE_VERSION -and $env:CANDIDATE_INSTALLER) {
        $file = $env:CANDIDATE_INSTALLER
    } else {
        $name = "Event.Booth.Studio_${Version}_x64-setup.exe"
        $file = Join-Path $env:RUNNER_TEMP $name
        $url = "https://github.com/patik-un/projek-gabut/releases/download/v$Version/$name"
        curl.exe --fail --location --retry 3 --silent --show-error --output $file $url
        if ($LASTEXITCODE -ne 0) { throw "Download failed for $name with curl exit code $LASTEXITCODE" }
        if ((Get-FileHash $file -Algorithm SHA256).Hash -ne $Sha256) {
            throw "SHA256 mismatch for $name"
        }
    }
    Write-Host "Installer $Version Authenticode status $((Get-AuthenticodeSignature $file).Status)"
    $process = Start-Process -FilePath $file -ArgumentList $Mode -PassThru
    if (!$process.WaitForExit(120000)) {
        Stop-Process -Id $process.Id -Force
        throw "Installer $Version timed out"
    }
    if ($process.ExitCode -ne 0) {
        throw "Installer $Version exited with code $($process.ExitCode)"
    }
    $product = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' |
        Where-Object { $_.DisplayName -eq 'Event Booth Studio' } |
        Select-Object -First 1
    if ($product.DisplayVersion -ne $Version) {
        throw "Expected installed version $Version, found $($product.DisplayVersion)"
    }
    Write-Host "Installed version $($product.DisplayVersion) at $($product.InstallLocation)"
    $installRoot = if ($product.InstallLocation) { $product.InstallLocation.Trim('"') } else { Join-Path $env:LOCALAPPDATA 'Event Booth Studio' }
    if (!(Test-Path -LiteralPath (Join-Path $installRoot 'backend-bin\event-booth-backend.exe'))) {
        throw "Packaged backend not found in $installRoot"
    }
    return $installRoot
}

try {
    if ($env:INSTALL_PATH -eq 'upgrade' -or $env:CANDIDATE_INSTALLER) {
        $root = Install-Release '0.1.8' 'f349b8e5e3718491bfca5c4cd4f847dfcc2da5d91f53e4c645db5be735c9a42c' '/S'
        $env:EVENT_BOOTH_BACKEND_DATA_DIR = Join-Path $env:RUNNER_TEMP 'test-data'
        $env:EVENT_BOOTH_API_TOKEN = [guid]::NewGuid().ToString('N')
        $env:EVENT_BOOTH_BACKEND_PORT = '18080'
        New-Item -ItemType Directory $env:EVENT_BOOTH_BACKEND_DATA_DIR | Out-Null
        $backendPath = Join-Path $root 'backend-bin\event-booth-backend.exe'
        $oldDigest = (Get-FileHash $backendPath -Algorithm SHA256).Hash
        $backend = Start-Process $backendPath -PassThru
        try {
            $ready = $false
            for ($attempt = 0; $attempt -lt 25; $attempt++) {
                if ($backend.HasExited) { throw 'Packaged backend exited early' }
                try {
                    $health = Invoke-RestMethod 'http://127.0.0.1:18080/' -TimeoutSec 2
                    if ($health.status -eq 'running') { $ready = $true; break }
                } catch { Start-Sleep -Seconds 1 }
            }
            if (!$ready) { throw 'Packaged backend never started' }
            Write-Host "Reproducing upgrade with backend PID $($backend.Id) still running"
            if ($env:CANDIDATE_INSTALLER) {
                $null = Install-Release $env:CANDIDATE_VERSION '' '/S /UPDATE'
            } else {
                $null = Install-Release '0.1.9' 'b0b0643285b8ad5ac6e33f1f6b5044be0a467c9634498fac3635702627b63721' '/S /UPDATE'
            }
            $newDigest = (Get-FileHash $backendPath -Algorithm SHA256).Hash
            if (!$backend.HasExited -or $newDigest -eq $oldDigest) {
                throw "Installer registered the upgrade while the previous backend still occupied the destination. Backend exited: $($backend.HasExited). Backend replaced: $($newDigest -ne $oldDigest)."
            }
        } finally {
            if (!$backend.HasExited) { taskkill.exe /F /T /PID $backend.Id | Out-Null }
        }
    } else {
        $null = Install-Release '0.1.9' 'b0b0643285b8ad5ac6e33f1f6b5044be0a467c9634498fac3635702627b63721' '/S'
    }
} catch {
    Write-Host "::error::$($_.Exception.Message)"
    throw
}
