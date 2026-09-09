#!/bin/bash
set -e

# === 0. 环境准备 ===
export HOME=/root
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH
export DEBIAN_FRONTEND=noninteractive
mkdir -p /workspace /var/log

echo "[1/8] Installing Docker (using Aliyun mirror)..."
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://mirrors.aliyun.com/docker-ce/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable docker
systemctl start docker
echo "[1/8] Docker installed."

echo "[2/8] Installing Node.js 22.x..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y -qq nodejs
echo "[2/8] Node.js $(node --version) installed."

echo "[3/8] Installing code-server..."
curl -fsSL https://code-server.dev/install.sh | sh
echo "[3/8] Code-server installed."

echo "[4/8] Installing devcontainer CLI..."
npm install -g @devcontainers/cli
echo "[4/8] Devcontainer CLI installed."

echo "[5/8] Writing devcontainer.json..."
mkdir -p /workspace/.devcontainer
cat > /workspace/.devcontainer/devcontainer.json <<'DEVCONTAINER_EOF'
{{DEVCONTAINER_JSON}}
DEVCONTAINER_EOF
echo "[5/8] devcontainer.json written."

echo "[6/8] Starting devcontainer..."
cd /workspace
devcontainer up --workspace-folder .
echo "[6/8] Devcontainer started."

echo "[7/8] Starting code-server..."
nohup code-server --bind-addr 0.0.0.0:8080 --auth none > /var/log/code-server.log 2>&1 &
echo "[7/8] Code-server started."

echo "[8/8] Verifying services..."
sleep 5
if curl -sf http://localhost:8080 > /dev/null 2>&1; then
  echo "[8/8] Code-server is running."
else
  echo "[8/8] Warning: Code-server not responding yet, may need more time."
fi

echo "[startup] All steps completed. Access at http://{公网IP}:8080"
