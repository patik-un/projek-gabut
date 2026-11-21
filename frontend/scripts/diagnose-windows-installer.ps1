$ErrorActionPreference = 'Stop'

function Install-Release {
    param([string]$Version, [string]$Sha256, [string]$Mode)

    $name = "Event.Booth.Studio_${Version}_x64-setup.exe"
    $file = Join-Path $env:RUNNER_TEMP $name
    $url = "https://github.com/patik-un/projek-gabut/releases/download/v$Version/$name"
    Invoke-WebRequest -Uri $url -OutFile $file
    if ((Get-FileHash $file -Algorithm SHA256).Hash -ne $Sha256) {
        throw "SHA256 mismatch for $name"
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
    $installRoot = if ($product.InstallLocation) { $product.InstallLocation } else { Join-Path $env:LOCALAPPDATA 'Event Booth Studio' }
    if (!(Test-Path -LiteralPath (Join-Path $installRoot 'backend-bin\event-booth-backend.exe'))) {
        throw "Packaged backend not found in $installRoot"
    }
}

if ($env:INSTALL_PATH -eq 'upgrade') {
    Install-Release '0.1.8' 'f349b8e5e3718491bfca5c4cd4f847dfcc2da5d91f53e4c645db5be735c9a42c' '/S'
    Install-Release '0.1.9' 'b0b0643285b8ad5ac6e33f1f6b5044be0a467c9634498fac3635702627b63721' '/P /UPDATE'
} else {
    Install-Release '0.1.9' 'b0b0643285b8ad5ac6e33f1f6b5044be0a467c9634498fac3635702627b63721' '/S'
}
