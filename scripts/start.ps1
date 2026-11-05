# Starts the site and API on one port. Data refreshes on schedule while this runs.
param([int]$Port = 8000, [string]$Home_ = "$env:LOCALAPPDATA\Pitchside")
$root = Split-Path -Parent $PSScriptRoot
Set-Location "$root\backend"
& "$Home_\venv\Scripts\python.exe" -m uvicorn app.main:app --port $Port
