#!/bin/bash
# idle-watcher.sh — 检测 code-server 活动，空闲超阈值时上报。
WORKSPACE_ID="${WORKSPACE_ID}"
IDLE_MINUTES="${IDLE_MINUTES:-30}"
CALLBACK_URL="${CALLBACK_URL}"
ACCESS_TOKEN="${ACCESS_TOKEN}"
CHECK_INTERVAL=60

touch /tmp/.last_activity

get_last_activity() {
  local ws_activity=$(ss -tnp 2>/dev/null | grep -c ':8080' || echo 0)
  local file_activity=$(find /workspace -maxdepth 3 -newer /tmp/.last_activity -type f 2>/dev/null | head -1)
  local term_activity=$(docker exec workspace ps aux 2>/dev/null | grep -cE 'bash|zsh|node' || echo 0)
  if [ "$ws_activity" -gt 0 ] || [ -n "$file_activity" ] || [ "$term_activity" -gt 1 ]; then
    date +%s > /tmp/.last_activity
  fi
  cat /tmp/.last_activity 2>/dev/null || date +%s
}

while true; do
  LAST_ACTIVE=$(get_last_activity)
  NOW=$(date +%s)
  IDLE_SECONDS=$((IDLE_MINUTES * 60))
  IDLE_TIME=$((NOW - LAST_ACTIVE))
  if [ "$IDLE_TIME" -ge "$IDLE_SECONDS" ]; then
    if [ ! -f "/tmp/.idle_triggered" ]; then
      touch /tmp/.idle_triggered
      curl -s -X POST "${CALLBACK_URL}/api/health/${WORKSPACE_ID}/idle" \
        -H "Content-Type: application/json" \
        -d "{\"idleSeconds\": ${IDLE_TIME}, \"accessToken\": \"${ACCESS_TOKEN}\"}"
    fi
  else
    rm -f /tmp/.idle_triggered
  fi
  sleep $CHECK_INTERVAL
done
