# One-time install of the scan station on this PC (NVIDIA GPU required).
#   powershell -ExecutionPolicy Bypass -File tools\scan-station\setup.ps1
# Creates a Python environment in %LOCALAPPDATA%\ScanStation, asks for the folder to watch and the
# widget key, and adds a startup shortcut so the station runs quietly whenever you sign in.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$home_ = Join-Path $env:LOCALAPPDATA "ScanStation"
$venv = Join-Path $home_ "venv"
New-Item -ItemType Directory -Force $home_ | Out-Null

if (-not (Test-Path (Join-Path $venv "Scripts\python.exe"))) {
	Write-Host "Creating the Python environment ..."
	py -3 -m venv $venv
}
$python = Join-Path $venv "Scripts\python.exe"
Write-Host "Installing PyTorch (CUDA), Transformers and readers. The first install downloads about 3 GB ..."
& $python -m pip install --upgrade pip | Out-Null
& $python -m pip install -r (Join-Path $here "requirements.txt")
& $python -c "import torch; assert torch.cuda.is_available(), 'No CUDA GPU found'; print('GPU:', torch.cuda.get_device_name(0))"

& $python (Join-Path $here "scan_station.py") setup

Write-Host "Downloading TeleOCR (about 2.5 GB) so the first scan starts quickly ..."
& $python -c "from huggingface_hub import snapshot_download; snapshot_download('StarDoc-AI/TeleOCR')"

$startup = [Environment]::GetFolderPath("Startup")
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut((Join-Path $startup "Scan Station.lnk"))
$link.TargetPath = Join-Path $venv "Scripts\pythonw.exe"
$link.Arguments = "`"$(Join-Path $here 'scan_station.py')`" run"
$link.WorkingDirectory = $here
$link.Description = "Reads textbook scans into the Notion Source Library"
$link.Save()
Start-Process -FilePath $link.TargetPath -ArgumentList $link.Arguments -WorkingDirectory $here -WindowStyle Hidden
Write-Host "Done. The station is running and will start whenever you sign in. Log: $env:APPDATA\ScanStation\scan-station.log"
