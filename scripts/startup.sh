#!/bin/bash
set -e

# === 0. 网络引导（出口代理 + 连通性智能切换，先于一切境外安装执行） ===
{{PROXY_BOOTSTRAP}}

# === 0. 环境准备 ===
export HOME=/root
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH
export DEBIAN_FRONTEND=noninteractive
mkdir -p /workspace /var/log

echo "[1/9] Installing Docker (using Aliyun mirror)..."
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg wget jq
install -m 0755 -d /etc/apt/keyrings
wget -qO- --tries=3 https://mirrors.aliyun.com/docker-ce/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://mirrors.aliyun.com/docker-ce/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable docker
systemctl start docker
echo "[1/9] Docker installed."

# === ACR 登录（镜像来自阿里云 ACR 时，走 RAM Role STS，免 AK 落盘） ===
{{ACR_LOGIN}}

echo "[2/9] Installing Node.js 22.x..."
wget -qO- --tries=3 https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y -qq nodejs
echo "[2/9] Node.js $(node --version) installed."

echo "[3/9] Installing code-server..."
wget -qO- --tries=3 https://code-server.dev/install.sh | sh
echo "[3/9] Code-server installed."

echo "[4/9] Installing devcontainer CLI..."
npm install -g @devcontainers/cli
echo "[4/9] Devcontainer CLI installed."

echo "[5/9] Writing devcontainer.json..."
mkdir -p /workspace/.devcontainer
cat > /workspace/.devcontainer/devcontainer.json <<'DEVCONTAINER_EOF'
{{DEVCONTAINER_JSON}}
DEVCONTAINER_EOF
# 若出口代理已启用，向容器注入代理环境（避免容器内拉包走不到公共网络）
if [ -n "${WS_PROXY:-}" ] && command -v jq >/dev/null 2>&1; then
  jq --arg http "$WS_PROXY" --arg https "$WS_PROXY" --arg all "$WS_PROXY" \
     --arg no "$WS_NO_PROXY" \
     '.containerEnv += {"HTTP_PROXY": $http, "HTTPS_PROXY": $https, "ALL_PROXY": $all, "NO_PROXY": $no, "http_proxy": $http, "https_proxy": $https, "all_proxy": $all, "no_proxy": $no}' \
     /workspace/.devcontainer/devcontainer.json > /tmp/devcontainer.json.proxy \
  && mv /tmp/devcontainer.json.proxy /workspace/.devcontainer/devcontainer.json \
  && echo "[5/9] devcontainer containerEnv proxy injected."
fi
echo "[5/9] devcontainer.json written."

echo "[6/9] Starting devcontainer..."
cd /workspace
devcontainer up --workspace-folder .
echo "[6/9] Devcontainer started."

echo "[6.5/9] Installing features..."
{{FEATURES_LOOP}}

echo "[6.8/9] Running custom scripts..."
{{CUSTOM_SCRIPTS_LOOP}}

echo "[7/9] Git clone/pull..."
{{GIT_BLOCK}}

echo "[8/9] Starting code-server..."
nohup code-server --bind-addr 0.0.0.0:8080 --auth none > /var/log/code-server.log 2>&1 &
echo "[8/9] Code-server started."

echo "[9/9] Verifying services..."
sleep 5
if curl -sf http://localhost:8080 > /dev/null 2>&1; then
  echo "[9/9] Code-server is running."
else
  echo "[9/9] Warning: Code-server not responding yet, may need more time."
fi

echo "[startup] All steps completed. Access at http://{公网IP}:8080"