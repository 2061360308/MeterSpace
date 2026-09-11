#!/bin/bash
# 实例引导脚本（ECS user-data）。
#
# 职责（docs/FINAL-PLAN.md §5.2 / §12.2）：
#   1. 拉 agent 二进制（按架构）
#   2. 拉 Node.js 运行时（devcontainer CLI 依赖）
#   3. 拉 devcontainer CLI bundle 并解包
#   4. 写 agent 配置（模板协议字段）
#   5. 启动 agent；工作区载荷由 agent 自己从后端 /payload 拉取
#
# 注意：不再下载 startup.sh（随 Z2 删除），载荷改由 agent 拉取。
set -e

# === 环境变量（构建期替换） ===
INSTANCE_ID={{INSTANCE_ID}}
CALLBACK_URL={{CALLBACK_URL}}
ACCESS_TOKEN={{ACCESS_TOKEN}}
WORKSPACE_ID={{WORKSPACE_ID}}
REGION={{REGION}}
WORKSPACE_ROOT={{WORKSPACE_ROOT}}
ENTRY={{ENTRY}}
ENTRY_TIMEOUT={{ENTRY_TIMEOUT}}

mkdir -p /opt/agent/logs "${WORKSPACE_ROOT}" /workspace

# === 1. 下载 Agent（多架构） ===
ARCH=$(uname -m)
case ${ARCH} in
  x86_64)  AGENT_ARCH="amd64" ;;
  aarch64) AGENT_ARCH="arm64" ;;
  *)       echo "[entrypoint] Unsupported architecture: ${ARCH}"; exit 1 ;;
esac

AGENT_DOWNLOAD_URL="${CALLBACK_URL}/agent-linux-${AGENT_ARCH}"

echo "[entrypoint] Downloading agent for ${AGENT_ARCH} from ${AGENT_DOWNLOAD_URL}..."
for i in $(seq 1 10); do
  if curl -sfL "${AGENT_DOWNLOAD_URL}" -o /opt/agent/agent; then
    echo "[entrypoint] Agent downloaded."
    break
  fi
  if [ "$i" = "10" ]; then echo "[entrypoint] Agent download failed after 10 attempts"; exit 1; fi
  echo "[entrypoint] Attempt $i failed, retrying in 5s..."
  sleep 5
done
chmod +x /opt/agent/agent

# === 2. 下载 Node.js（devcontainer CLI 依赖） ===
install_node() {
  if command -v node >/dev/null 2>&1; then
    echo "[entrypoint] Node already present: $(node -v)"
    return 0
  fi

  NODE_VER="v20.18.0"
  case ${ARCH} in
    x86_64)  NODE_ARCH="x64" ;;
    aarch64) NODE_ARCH="arm64" ;;
  esac

  # 优先国内镜像，失败回退官方源
  for BASE in "https://npmmirror.com/mirrors/node" "https://nodejs.org/dist"; do
    URL="${BASE}/${NODE_VER}/node-${NODE_VER}-linux-${NODE_ARCH}.tar.xz"
    echo "[entrypoint] Fetching Node from ${URL}"
    if curl -sfL "${URL}" -o /tmp/node.tar.xz; then
      mkdir -p /opt/node
      tar -xJf /tmp/node.tar.xz -C /opt/node --strip-components=1
      ln -sf /opt/node/bin/node /usr/local/bin/node
      ln -sf /opt/node/bin/npm /usr/local/bin/npm
      ln -sf /opt/node/bin/npx /usr/local/bin/npx
      echo "[entrypoint] Node installed: $(node -v)"
      return 0
    fi
    echo "[entrypoint] Mirror failed, trying next..."
  done

  echo "[entrypoint] WARNING: Node install failed; DEVCONTAINER entries will not work"
  return 1
}

install_node || true

# === 3. 下载并解包 devcontainer CLI bundle ===
install_devcontainer_cli() {
  if command -v devcontainer >/dev/null 2>&1; then
    echo "[entrypoint] devcontainer CLI already present"
    return 0
  fi

  CLI_URL="${CALLBACK_URL}/devcontainer-cli.tar.gz"
  echo "[entrypoint] Downloading devcontainer CLI from ${CLI_URL}..."
  for i in $(seq 1 5); do
    if curl -sfL "${CLI_URL}" -o /tmp/devcontainer-cli.tar.gz; then
      mkdir -p /opt/devcontainer
      tar -xzf /tmp/devcontainer-cli.tar.gz -C /opt/devcontainer
      # bundle 根目录即 package 内容，入口为 devcontainer
      if [ -f /opt/devcontainer/devcontainer ]; then
        chmod +x /opt/devcontainer/devcontainer
        ln -sf /opt/devcontainer/devcontainer /usr/local/bin/devcontainer
        echo "[entrypoint] devcontainer CLI installed."
        return 0
      fi
      echo "[entrypoint] bundle 解包后未找到 devcontainer 入口"
      return 1
    fi
    echo "[entrypoint] CLI attempt $i failed, retrying in 5s..."
    sleep 5
  done

  echo "[entrypoint] WARNING: devcontainer CLI unavailable; DEVCONTAINER entries will fail"
  return 1
}

install_devcontainer_cli || true

# === 4. 写入 Agent 配置（模板协议） ===
# 全部使用构建期 {{...}} 占位符（由 src/lib/userdata.ts 替换），
# 不在 heredoc 里做 shell 展开 —— 避免两套替换体系混用。
cat > /opt/agent/config.json <<'AGENTCFG'
{
  "instance_id": "{{INSTANCE_ID}}",
  "workspace_id": "{{WORKSPACE_ID}}",
  "region": "{{REGION}}",
  "backend_url": "{{CALLBACK_URL}}",
  "backend_token": "{{ACCESS_TOKEN}}",
  "heartbeat_interval": 30,
  "heartbeat_jitter": 5,
  "workspace_root": "{{WORKSPACE_ROOT}}",
  "workspace_dir": "/workspace",
  "entry": "{{ENTRY}}",
  "entry_timeout": {{ENTRY_TIMEOUT}},
  "exposed_ports_file": "/opt/agent/ports.json",
  "activity": {{ACTIVITY_CONFIG_JSON}},
  "idle_minutes": {{IDLE_MINUTES}},
  "script_path": "",
  "script_timeout": 60
}
AGENTCFG

echo "[entrypoint] Agent config written:"
cat /opt/agent/config.json

# === 5. 启动 Agent ===
export HOME=/root
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH
export DEBIAN_FRONTEND=noninteractive
echo "[entrypoint] Starting agent..."
/opt/agent/agent &
AGENT_PID=$!
echo "[entrypoint] Agent started with PID $AGENT_PID"

wait $AGENT_PID
