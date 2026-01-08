Param(
  [int]$Port = 8000,
  [string]$HostAddr = '127.0.0.1'
)

$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

if (!(Test-Path '.venv')) {
  python -m venv .venv
}

.\.venv\Scripts\python.exe -m pip install -U pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

$env:HOST = $HostAddr
$env:PORT = "$Port"

Write-Output "Starting matheshop_engine_server on http://$HostAddr:$Port"
Write-Output "Log: $here\logs\server.log"
Write-Output "(Stop with Ctrl+C)"

.\.venv\Scripts\python.exe -m matheshop_engine_server

