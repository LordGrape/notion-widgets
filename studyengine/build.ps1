$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Src = Join-Path $Root 'studyengine'
$Dist = Join-Path $Root 'dist'
New-Item -ItemType Directory -Force -Path $Dist | Out-Null

$cssOrder = @(
  (Join-Path $Src 'css/base.css'),
  (Join-Path $Src 'css/dashboard.css'),
  (Join-Path $Src 'css/session.css'),
  (Join-Path $Src 'css/sidebar.css'),
  (Join-Path $Src 'css/modals.css')
)
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

$styles = ($cssOrder | ForEach-Object { Get-Content -Raw -Path $_ }) -join "`n"
$scripts = ($jsOrder | ForEach-Object { Get-Content -Raw -Path $_ }) -join "`n"

$indexPath = Join-Path $Src 'index.html'
$outPath = Join-Path $Dist 'studyengine.html'
$index = Get-Content -Raw -Path $indexPath
$index = $index.Replace('__STYLES__', $styles)
$index = $index.Replace('__SCRIPTS__', $scripts)
Set-Content -Path $outPath -Value $index -Encoding UTF8
Write-Host "Built $outPath"
