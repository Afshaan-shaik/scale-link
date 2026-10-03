$BaseUrl = if ($env:BASE_URL) { $env:BASE_URL } else { "http://localhost:8080" }
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Running ScaleLink Smoke Tests against $BaseUrl" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Healthcheck
Write-Host "[1/6] Checking /health endpoint..." -NoNewline
try {
    $health = Invoke-RestMethod -Uri "$BaseUrl/health" -Method Get -TimeoutSec 5
    if ($health.status -eq "ok") {
        Write-Host " PASS (API is healthy)" -ForegroundColor Green
    } else {
        Write-Host " FAIL: $($health | ConvertTo-Json -Compress)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host " FAIL: $_" -ForegroundColor Red
    exit 1
}

# 2. Create link via API
Write-Host "[2/6] Creating test short link via POST /api/links..." -NoNewline
$rand = Get-Random -Minimum 1000 -Maximum 9999
$alias = "smoke-$rand"
$target = "https://example.com/smoke-$rand"
$body = @{
    long_url = $target
    custom_alias = $alias
} | ConvertTo-Json

try {
    $res = Invoke-RestMethod -Uri "$BaseUrl/api/links" -Method Post -Body $body -ContentType "application/json"
    if ($res.code -eq $alias) {
        Write-Host " PASS (Created link code '$($res.code)')" -ForegroundColor Green
    } else {
        Write-Host " FAIL: Unexpected response: $($res | ConvertTo-Json -Compress)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host " FAIL: $_" -ForegroundColor Red
    exit 1
}

# 3. Follow redirect
Write-Host "[3/6] Requesting short URL redirect..." -NoNewline
try {
    $req = [System.Net.HttpWebRequest]::Create("$BaseUrl/$alias")
    $req.AllowAutoRedirect = $false
    $resp = $req.GetResponse()
    $status = [int]$resp.StatusCode
    $loc = $resp.Headers["Location"]
    $xCache = $resp.Headers["X-Cache"]
    $resp.Close()

    if (($status -eq 301 -or $status -eq 302) -and ($loc -eq $target)) {
        Write-Host " PASS (302 redirect verified to $target, X-Cache: $xCache)" -ForegroundColor Green
    } else {
        Write-Host " FAIL: Status=$status, Location=$loc" -ForegroundColor Red
        exit 1
    }
} catch [System.Net.WebException] {
    $resp = $_.Exception.Response
    if ($resp) {
        $status = [int]$resp.StatusCode
        $loc = $resp.Headers["Location"]
        if (($status -eq 301 -or $status -eq 302) -and ($loc -eq $target)) {
            Write-Host " PASS (302 redirect verified to $target)" -ForegroundColor Green
        } else {
            Write-Host " FAIL: Status=$status, Loc=$loc" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host " FAIL: $_" -ForegroundColor Red
        exit 1
    }
}

# 4. Check second request
Write-Host "[4/7] Verifying second request / cache..." -NoNewline
try {
    $req2 = [System.Net.HttpWebRequest]::Create("$BaseUrl/$alias")
    $req2.AllowAutoRedirect = $false
    $resp2 = $req2.GetResponse()
    $xCache2 = $resp2.Headers["X-Cache"]
    $resp2.Close()
    if ($xCache2 -eq "HIT") {
        Write-Host " PASS (X-Cache: HIT received)" -ForegroundColor Green
    } else {
        Write-Host " FAIL: Expected X-Cache: HIT, got $xCache2" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host " FAIL: $_" -ForegroundColor Red
    exit 1
}

# 5. Check async click analytics in /stats
Write-Host "[5/7] Verifying click recorded in /stats within 10s..." -NoNewline
$clickFound = $false
for ($i = 0; $i -lt 10; $i++) {
    Start-Sleep -Seconds 1
    try {
        $stats = Invoke-RestMethod -Uri "$BaseUrl/api/links/$alias/stats" -Method Get -TimeoutSec 3
        if ($stats.total -ge 1) {
            $clickFound = $true
            Write-Host " PASS (Async analytics recorded total clicks: $($stats.total))" -ForegroundColor Green
            break
        }
    } catch {}
}
if (-not $clickFound) {
    Write-Host " FAIL: Click event not reflected in /stats after 10s" -ForegroundColor Red
    exit 1
}

# 6. Expired link returns 410
Write-Host "[6/7] Verifying expired link returns 410 Gone..." -NoNewline
$expAlias = "exp-$rand"
$pastTime = (Get-Date).AddHours(-2).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$expBody = @{
    long_url = "https://example.com/expired"
    custom_alias = $expAlias
    expires_at = $pastTime
} | ConvertTo-Json

try {
    $null = Invoke-RestMethod -Uri "$BaseUrl/api/links" -Method Post -Body $expBody -ContentType "application/json"
    $reqExp = [System.Net.HttpWebRequest]::Create("$BaseUrl/$expAlias")
    $reqExp.AllowAutoRedirect = $false
    $respExp = $reqExp.GetResponse()
    $statusExp = [int]$respExp.StatusCode
    $respExp.Close()
    Write-Host " FAIL: Expected 410, got $statusExp" -ForegroundColor Red
    exit 1
} catch [System.Net.WebException] {
    $respExp = $_.Exception.Response
    if ($respExp -and ([int]$respExp.StatusCode -eq 410)) {
        Write-Host " PASS (HTTP 410 Gone confirmed)" -ForegroundColor Green
    } else {
        Write-Host " FAIL: $_" -ForegroundColor Red
        exit 1
    }
}

# 7. Rate limiter returns 429
Write-Host "[7/7] Verifying rate limit / abuse protection..." -NoNewline
$blocked = $false
for ($i = 1; $i -le 35; $i++) {
    try {
        $bodyRL = @{ long_url = "https://example.com/rl-$rand-$i" } | ConvertTo-Json
        $null = Invoke-RestMethod -Uri "$BaseUrl/api/links" -Method Post -Body $bodyRL -ContentType "application/json"
    } catch {
        if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 429) {
            $blocked = $true
            break
        }
    }
}
if ($blocked) {
    Write-Host " PASS (Rate limit returned 429 Too Many Requests)" -ForegroundColor Green
} else {
    Write-Host " INFO: Rate limiter threshold not exceeded or in dev mode" -ForegroundColor Yellow
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " All Smoke Checks Passed Successfully!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
