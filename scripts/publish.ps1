# Publishes a snapshot of the running site to GitHub Pages. Start the API on port 8000 first.
param(
  [string]$Home_ = "$env:LOCALAPPDATA\Pitchside",
  [string]$Repo = "https://github.com/khan-0910/Pitchside-Prem-.git",
  [string]$Base = "/Pitchside-Prem-/"
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$snapshot = "$root\frontend\public\snapshot"

if (Test-Path $snapshot) { Remove-Item -Recurse -Force $snapshot }
Set-Location "$root\backend"
& "$Home_\venv\Scripts\python.exe" -m scripts.export_static $snapshot
if ($LASTEXITCODE) { throw "Export failed" }

Set-Location "$root\frontend"
$env:VITE_STATIC = "1"
$env:VITE_BASE = $Base
$env:VITE_SNAPSHOT_DATE = Get-Date -Format "d MMMM yyyy"
npm run build
if ($LASTEXITCODE) { throw "Build failed" }

# Pages serves 404.html for deep links, and the app then routes them itself.
Copy-Item dist\index.html dist\404.html
New-Item -ItemType File dist\.nojekyll -Force | Out-Null

Set-Location dist
git init -q -b gh-pages
git add -A
git commit -q -m "Publish site snapshot"
git push -f $Repo gh-pages
if ($LASTEXITCODE) { throw "Push failed" }
Remove-Item -Recurse -Force .git
