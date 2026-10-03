#!/usr/bin/env bash
set -e

BASE_URL="${BASE_URL:-http://localhost:8080}"
echo "=========================================================="
echo " Running ScaleLink Automated Smoke Tests against $BASE_URL"
echo "=========================================================="

# 1. Healthcheck check
echo -n "[1/6] Checking /health endpoint... "
HEALTH_RESP=$(curl -s -f "$BASE_URL/health" || echo '{"status":"down"}')
if echo "$HEALTH_RESP" | grep -q '"status":"ok"'; then
  echo "PASS (API is healthy)"
else
  echo "FAIL: Health endpoint returned $HEALTH_RESP"
  exit 1
fi

# 2. Create link via API
echo -n "[2/6] Creating test short link via POST /api/links... "
RAND_SUFFIX=$(( RANDOM % 9000 + 1000 ))
CUSTOM_ALIAS="smoke-$RAND_SUFFIX"
TARGET_URL="https://example.com/smoke-test-$RAND_SUFFIX"

CREATE_RESP=$(curl -s -X POST "$BASE_URL/api/links" \
  -H "Content-Type: application/json" \
  -d "{\"long_url\":\"$TARGET_URL\",\"custom_alias\":\"$CUSTOM_ALIAS\"}")

CODE=$(echo "$CREATE_RESP" | grep -o '"code":"[^"]*' | cut -d'"' -f4)
if [ "$CODE" != "$CUSTOM_ALIAS" ]; then
  echo "FAIL: Expected code '$CUSTOM_ALIAS', got '$CREATE_RESP'"
  exit 1
fi
echo "PASS (Created link with code '$CODE')"

# 3. Follow redirect (DB / first hit)
echo -n "[3/6] Requesting short URL (redirect)... "
HEADER_1=$(curl -s -I "$BASE_URL/$CODE")
if echo "$HEADER_1" | grep -E -q "HTTP/.* (301|302)" && echo "$HEADER_1" | grep -q -i "Location: $TARGET_URL"; then
  echo "PASS (302 redirect verified to $TARGET_URL)"
else
  echo "FAIL: Invalid redirect response:\n$HEADER_1"
  exit 1
fi

# 4. Check cache hit on second request
echo -n "[4/7] Verifying cache hit on second request... "
HEADER_2=$(curl -s -I "$BASE_URL/$CODE")
if echo "$HEADER_2" | grep -q -i "X-Cache: HIT"; then
  echo "PASS (X-Cache: HIT received)"
else
  echo "FAIL: Expected X-Cache: HIT, got: $(echo "$HEADER_2" | grep -i X-Cache)"
  exit 1
fi

# 5. Check async click analytics in /stats
echo -n "[5/7] Verifying click recorded in /stats within 10s... "
CLICK_FOUND=0
for i in {1..10}; do
  STATS_RESP=$(curl -s "$BASE_URL/api/links/$CODE/stats")
  TOTAL=$(echo "$STATS_RESP" | grep -o '"total":[0-9]*' | cut -d':' -f2)
  if [ -n "$TOTAL" ] && [ "$TOTAL" -ge 1 ]; then
    CLICK_FOUND=1
    break
  fi
  sleep 1
done

if [ "$CLICK_FOUND" -eq 1 ]; then
  echo "PASS (Async analytics recorded total clicks: $TOTAL)"
else
  echo "FAIL: Expected click in /stats, got: $STATS_RESP"
  exit 1
fi

# 6. Check expired link returns 410
echo -n "[6/7] Verifying expired link returns 410 Gone... "
EXP_ALIAS="exp-$RAND_SUFFIX"
PAST_TIME=$(date -u -d "1 hour ago" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v-1H +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "2020-01-01T00:00:00Z")

curl -s -X POST "$BASE_URL/api/links" \
  -H "Content-Type: application/json" \
  -d "{\"long_url\":\"https://example.com/expired\",\"custom_alias\":\"$EXP_ALIAS\",\"expires_at\":\"$PAST_TIME\"}" >/dev/null

EXP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/$EXP_ALIAS")
if [ "$EXP_STATUS" = "410" ]; then
  echo "PASS (HTTP 410 Gone returned)"
else
  echo "FAIL: Expected HTTP 410, got $EXP_STATUS"
  exit 1
fi

# 7. Verify Rate Limiter returns 429
echo -n "[7/7] Verifying rate limit / abuse protection... "
# Rapid-fire 30 requests to trigger rate limit if configured
BLOCKED=0
for i in {1..35}; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/links" \
    -H "Content-Type: application/json" \
    -d "{\"long_url\":\"https://example.com/ratelimit-$RAND_SUFFIX-$i\"}")
  if [ "$STATUS" = "429" ]; then
    BLOCKED=1
    break
  fi
done

if [ "$BLOCKED" -eq 1 ]; then
  echo "PASS (Rate limit returned 429 Too Many Requests)"
else
  echo "INFO: Rate limiter not yet saturated or disabled in current phase"
fi

echo "=========================================================="
echo " All Smoke Checks Passed Successfully!"
echo "=========================================================="
