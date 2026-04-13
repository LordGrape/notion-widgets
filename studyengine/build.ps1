$ErrorActionPreference = 'Stop'

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root

$Src = Join-Path $Root 'studyengine'
$Dist = Join-Path $Root 'dist'

if (-not (Test-Path (Join-Path $Src 'index.html'))) {
  throw "Run from repo root context: missing studyengine/index.html."
}

New-Item -ItemType Directory -Force -Path $Dist | Out-Null
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$cssOrder = @(
  (Join-Path $Src 'css/base.css'),
  (Join-Path $Src 'css/dashboard.css'),
  (Join-Path $Src 'css/session.css'),
  (Join-Path $Src 'css/sidebar.css'),
  (Join-Path $Src 'css/modals.css')
)

# Keep JS order exactly as current build pipeline
$jsOrder = @(
  (Join-Path $Src 'js/utils.js'),
  (Join-Path $Src 'js/fsrs.js'),
  (Join-Path $Src 'js/courses.js'),
  (Join-Path $Src 'js/cards.js'),
  (Join-Path $Src 'js/dragon.js'),
  (Join-Path $Src 'js/sidebar.js'),
  (Join-Path $Src 'js/dashboard.js'),
  (Join-Path $Src 'js/tutor.js'),
  (Join-Path $Src 'js/session.js'),
  (Join-Path $Src 'js/state.js')
)

$styles = ($cssOrder | ForEach-Object { [System.IO.File]::ReadAllText($_, [System.Text.Encoding]::UTF8) }) -join "`n"
$scripts = ($jsOrder | ForEach-Object { [System.IO.File]::ReadAllText($_, [System.Text.Encoding]::UTF8) }) -join "`n"

$indexPath = Join-Path $Src 'index.html'
$outPath = Join-Path $Dist 'studyengine.html'
$index = [System.IO.File]::ReadAllText($indexPath, [System.Text.Encoding]::UTF8)
$index = $index.Replace('__STYLES__', $styles)
$index = $index.Replace('__SCRIPTS__', $scripts)
[System.IO.File]::WriteAllText($outPath, $index, $utf8NoBom)

# Required explicit copies
Copy-Item -Path (Join-Path $Root 'core.js') -Destination (Join-Path $Dist 'core.js') -Force
Copy-Item -Path (Join-Path $Root 'clock.html') -Destination (Join-Path $Dist 'clock.html') -Force
Copy-Item -Path (Join-Path $Root 'timetable.html') -Destination (Join-Path $Dist 'timetable.html') -Force
Copy-Item -Path (Join-Path $Root 'quotes.html') -Destination (Join-Path $Dist 'quotes.html') -Force
Copy-Item -Path (Join-Path $Root 'horizon.html') -Destination (Join-Path $Dist 'horizon.html') -Force

# Copy any other root-level .html/.js/.css/.png files
$patterns = @('*.html', '*.js', '*.css', '*.png')
foreach ($pattern in $patterns) {
  Get-ChildItem -Path $Root -File -Filter $pattern | ForEach-Object {
    if ($_.Name -eq 'studyengine.html') { return }
    Copy-Item -Path $_.FullName -Destination (Join-Path $Dist $_.Name) -Force
  }
}

# Copy static assets to dist/ (e.g. horizon dragon PNGs)
$assetsSource = Join-Path $Root 'assets'
$assetsDest = Join-Path (Join-Path $Root 'dist') 'assets'
if (Test-Path $assetsSource) {
    if (Test-Path $assetsDest) { Remove-Item -Recurse -Force $assetsDest }
    Copy-Item -Recurse $assetsSource $assetsDest
}

$files = Get-ChildItem -Path $Dist -File
$fileCount = $files.Count
$totalBytes = ($files | Measure-Object -Property Length -Sum).Sum
$totalMB = [Math]::Round(($totalBytes / 1MB), 2)
Write-Host "Build complete: $Dist ($fileCount files, $totalMB MB)"
