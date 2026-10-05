# ScaleLink PowerShell Load Testing Script
param (
    [string]$Target = "redirect",
    [string]$BaseUrl = "http://localhost:8080"
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " ScaleLink k6 Load Testing Suite" -ForegroundColor Cyan
Write-Host " Target Script: loadtest/$Target.js" -ForegroundColor Cyan
Write-Host " Target URL:    $BaseUrl" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Check if k6 is installed natively
if (Get-Command k6 -ErrorAction SilentlyContinue) {
    Write-Host "==> Running native k6..." -ForegroundColor Green
    $env:BASE_URL = $BaseUrl
    & k6 run "loadtest/$Target.js"
} else {
    Write-Host "==> Native k6 not found. Running via Docker Compose k6 container..." -ForegroundColor Yellow
    $dockerEnv = "BASE_URL=http://nginx:80"
    & docker compose --profile tools run --rm -e $dockerEnv k6 run "/loadtest/$Target.js"
}
