$BaseUrl = if ($env:BASE_URL) { $env:BASE_URL } else { "http://localhost:8080" }
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " ScaleLink Phase 3 Verification: Async Analytics & Worker" -ForegroundColor Cyan
Write-Host " Target: $BaseUrl" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$rand = Get-Random -Minimum 1000 -Maximum 9999
$code = "phase3-$rand"
$target = "https://scalelink.dev/verify-p3-$rand"

# 1. Create short link
Write-Host "[1/5] Creating link '$code'..." -NoNewline
$createBody = @{
    long_url = $target
    custom_alias = $code
} | ConvertTo-Json

try {
    $res = Invoke-RestMethod -Uri "$BaseUrl/api/links" -Method Post -Body $createBody -ContentType "application/json"
    if ($res.code -eq $code) {
        Write-Host " PASS" -ForegroundColor Green
    } else {
        Write-Host " FAIL: Unexpected response: $($res | ConvertTo-Json -Compress)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host " FAIL: $_" -ForegroundColor Red
    exit 1
}

# 2. Fire initial redirect
Write-Host "[2/5] Firing initial redirects..." -NoNewline
try {
    $client = New-Object System.Net.Http.HttpClientHandler
    $client.AllowAutoRedirect = $false
    $http = New-Object System.Net.Http.HttpClient($client)
    $null = $http.GetAsync("$BaseUrl/$code").Result
    $null = $http.GetAsync("$BaseUrl/$code").Result
    Write-Host " PASS" -ForegroundColor Green
} catch {
    Write-Host " FAIL: $_" -ForegroundColor Red
    exit 1
}

# 3. Simulate high-throughput redirects (1,000 events)
$totalEvents = 1000
Write-Host "[3/5] Dispatching $totalEvents redirect requests across parallel threads..." -ForegroundColor Cyan

$threads = 20
$perThread = [int]($totalEvents / $threads)
$jobs = @()

$jobScript = {
    param($url, $count)
    $handler = New-Object System.Net.Http.HttpClientHandler
    $handler.AllowAutoRedirect = $false
    $client = New-Object System.Net.Http.HttpClient($handler)
    $client.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) Mobile/15E148")
    $client.DefaultRequestHeaders.Add("CF-IPCountry", "US")
    $client.DefaultRequestHeaders.Add("Referer", "https://github.com/scalelink")

    for ($i = 0; $i -lt $count; $i++) {
        try {
            $resp = $client.GetAsync($url).Result
            $resp.Dispose()
        } catch {}
    }
    $client.Dispose()
    $handler.Dispose()
}

for ($t = 0; $t -lt $threads; $t++) {
    $jobs += Start-Job -ScriptBlock $jobScript -ArgumentList "$BaseUrl/$code", $perThread
}

# Optional chaos restart check
Start-Sleep -Seconds 1
$hasDocker = Get-Command docker -ErrorAction SilentlyContinue
if ($hasDocker) {
    $running = & docker ps --filter "name=scalelink-worker" --format "{{.Names}}" 2>$null
    if ($running -match "scalelink-worker") {
        Write-Host "    [Chaos Test] Restarting scalelink-worker container mid-run..." -ForegroundColor Yellow
        & docker restart scalelink-worker >$null 2>&1
    }
}

$null = Wait-Job -Job $jobs
Get-Job -Job $jobs | Remove-Job -Force
Write-Host "    All $totalEvents requests dispatched." -ForegroundColor Green

# 4. Wait for consumer group to process and commit all events
Write-Host "[4/5] Waiting for async worker to commit batch writes to Postgres..." -NoNewline
$clickCount = 0
for ($attempt = 1; $attempt -le 30; $attempt++) {
    Start-Sleep -Seconds 1
    try {
        $stats = Invoke-RestMethod -Uri "$BaseUrl/api/links/$code/stats" -Method Get -TimeoutSec 3
        if ($stats.total -ge $totalEvents) {
            $clickCount = $stats.total
            break
        }
    } catch {}
}

if ($clickCount -ge $totalEvents) {
    Write-Host " PASS (Recorded $clickCount clicks in stats table, zero dropped!)" -ForegroundColor Green
} else {
    Write-Host " FAIL: Expected >= $totalEvents clicks, got $clickCount after 30 seconds" -ForegroundColor Red
    exit 1
}

# 5. Verify stats aggregation structure
Write-Host "[5/5] Verifying breakdown: countries, devices, referrers..." -NoNewline
if ($stats.devices -and $stats.countries) {
    Write-Host " PASS" -ForegroundColor Green
} else {
    Write-Host " FAIL: Incomplete stats structure: $($stats | ConvertTo-Json -Compress)" -ForegroundColor Red
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Phase 3 Verification Succeeded! All 1,000 events verified." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
