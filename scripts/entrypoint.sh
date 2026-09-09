#!/bin/bash
set -e

# === 环境变量 ===
INSTANCE_ID={{INSTANCE_ID}}
CALLBACK_URL={{CALLBACK_URL}}
ACCESS_TOKEN={{ACCESS_TOKEN}}

# === 1. 下载启动脚本 ===
mkdir -p /opt/agent/scripts /opt/agent/logs

echo "[entrypoint] Downloading startup script..."
for i in $(seq 1 5); do
  if curl -sfL "${CALLBACK_URL}/api/instance-scripts/startup?instanceId=${INSTANCE_ID}&token=${ACCESS_TOKEN}" \
    -o /opt/agent/scripts/startup.sh; then
    echo "[entrypoint] Startup script downloaded."
    break
  fi
  echo "[entrypoint] Attempt $i failed, retrying in 5s..."
  sleep 5
done
chmod +x /opt/agent/scripts/startup.sh

# === 2. 下载 Agent（多架构） ===
ARCH=$(uname -m)
case ${ARCH} in
  x86_64)  AGENT_ARCH="amd64" ;;
  aarch64) AGENT_ARCH="arm64" ;;
  *)       echo "[entrypoint] Unsupported architecture: ${ARCH}"; exit 1 ;;
esac

AGENT_DOWNLOAD_URL="${CALLBACK_URL}/agent-linux-${AGENT_ARCH}"

echo "[entrypoint] Downloading agent for ${AGENT_ARCH} from ${AGENT_DOWNLOAD_URL}..."
for i in $(seq 1 5); do
  if curl -sfL "${AGENT_DOWNLOAD_URL}" -o /opt/agent/agent; then
    echo "[entrypoint] Agent downloaded."
    break
  fi
  echo "[entrypoint] Attempt $i failed, retrying in 5s..."
  sleep 5
done
chmod +x /opt/agent/agent

# === 3. 写入 Agent 配置 ===
cat > /opt/agent/config.json <<AGENTCFG
{
  "instance_id": "${INSTANCE_ID}",
  "backend_url": "${CALLBACK_URL}",
  "backend_token": "${ACCESS_TOKEN}",
  "script_path": "/opt/agent/scripts/startup.sh",
  "heartbeat_interval": 30,
  "script_timeout": 600
}
AGENTCFG

# === 4. 启动 Agent ===
export HOME=/root
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH
export DEBIAN_FRONTEND=noninteractive
echo "[entrypoint] Starting agent..."
/opt/agent/agent &
AGENT_PID=$!
echo "[entrypoint] Agent started with PID $AGENT_PID"

wait $AGENT_PID
