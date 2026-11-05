# Windows first-time setup. Keeps the venv and data out of OneDrive.
param([string]$Home_ = "$env:LOCALAPPDATA\Pitchside")
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

New-Item -ItemType Directory -Force "$Home_" | Out-Null
if (-not (Test-Path "$Home_\venv")) { python -m venv "$Home_\venv" }
& "$Home_\venv\Scripts\python.exe" -m pip install -q -r "$root\backend\requirements-dev.txt"

if (-not (Test-Path "$root\.env")) {
    Copy-Item "$root\.env.example" "$root\.env"
    (Get-Content "$root\.env") -replace '^PITCHSIDE_DATA_DIR=.*', "PITCHSIDE_DATA_DIR=$($Home_ -replace '\\','/')/data" | Set-Content "$root\.env"
}

Push-Location "$root\frontend"
npm install --no-audit --no-fund
npm run build
Pop-Location

Push-Location "$root\backend"
& "$Home_\venv\Scripts\python.exe" -m scripts.bootstrap
Pop-Location
Write-Host "Done. Run scripts\start.ps1, then open http://127.0.0.1:8000"
