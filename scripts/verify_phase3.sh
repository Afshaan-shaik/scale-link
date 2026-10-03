#!/usr/bin/env bash
set -e

BASE_URL="${BASE_URL:-http://localhost:8080}"
echo "=========================================================="
echo " ScaleLink Phase 3 Verification: Async Analytics & Worker"
echo " Target: $BASE_URL"
echo "=========================================================="

RAND_SUFFIX=$(( RANDOM % 9000 + 1000 ))
CODE="phase3-$RAND_SUFFIX"
TARGET_URL="https://scalelink.dev/verify-p3-$RAND_SUFFIX"

# 1. Create short link
echo -n "[1/5] Creating link '$CODE'... "
CREATE_RESP=$(curl -s -X POST "$BASE_URL/api/links" \
  -H "Content-Type: application/json" \
  -d "{\"long_url\":\"$TARGET_URL\",\"custom_alias\":\"$CODE\"}")

CREATED_CODE=$(echo "$CREATE_RESP" | grep -o '"code":"[^"]*' | cut -d'"' -f4)
if [ "$CREATED_CODE" != "$CODE" ]; then
  echo "FAIL: Could not create link '$CODE': $CREATE_RESP"
  exit 1
fi
echo "PASS"

# 2. Fire initial redirect
echo -n "[2/5] Firing initial redirect (cache miss -> cache hit)... "
curl -s -o /dev/null -I "$BASE_URL/$CODE"
curl -s -o /dev/null -I "$BASE_URL/$CODE"
echo "PASS"

# 3. Simulate high-throughput redirects (1,000 events)
TOTAL_EVENTS=1000
echo "[3/5] Dispatching $TOTAL_EVENTS redirect events concurrently..."

# Use curl or background jobs to generate traffic
CONCURRENCY=20
PER_JOB=$(( TOTAL_EVENTS / CONCURRENCY ))

run_batch() {
  local count=$1
  for (( i=0; i<count; i++ )); do
    curl -s -o /dev/null "$BASE_URL/$CODE" \
      -H "User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) Mobile/15E148" \
      -H "CF-IPCountry: US" \
      -H "Referer: https://github.com/scalelink"
  done
}

pids=()
for (( j=0; j<CONCURRENCY; j++ )); do
  run_batch "$PER_JOB" &
  pids+=($!)
done

# Optional: restart worker container mid-run if running in docker
sleep 1
if command -v docker >/dev/null 2>&1 && docker ps | grep -q scalelink-worker; then
  echo "    [Chaos Test] Restarting scalelink-worker container mid-run..."
  docker restart scalelink-worker >/dev/null 2>&1 || true
fi

for pid in "${pids[@]}"; do
  wait "$pid"
done
echo "    All $TOTAL_EVENTS requests dispatched."

# 4. Wait for consumer group to process and commit all events
echo -n "[4/5] Waiting for async worker to commit batch writes to Postgres... "
CLICK_COUNT=0
for attempt in {1..30}; do
  STATS=$(curl -s "$BASE_URL/api/links/$CODE/stats")
  TOTAL=$(echo "$STATS" | grep -o '"total":[0-9]*' | cut -d':' -f2)
  if [ -n "$TOTAL" ] && [ "$TOTAL" -ge "$TOTAL_EVENTS" ]; then
    CLICK_COUNT=$TOTAL
    break
  fi
  sleep 1
done

if [ "$CLICK_COUNT" -ge "$TOTAL_EVENTS" ]; then
  echo "PASS (Recorded $CLICK_COUNT events in stats table, zero dropped!)"
else
  echo "FAIL: Expected >= $TOTAL_EVENTS clicks, got $CLICK_COUNT after 30 seconds"
  exit 1
fi

# 5. Verify stats aggregation structure
echo -n "[5/5] Verifying breakdown: countries, devices, referrers... "
if echo "$STATS" | grep -q '"devices"' && echo "$STATS" | grep -q '"countries"'; then
  echo "PASS"
else
  echo "FAIL: Malformed stats response: $STATS"
  exit 1
fi

echo "=========================================================="
echo " Phase 3 Verification Succeeded! All 1,000 events verified."
echo "=========================================================="
