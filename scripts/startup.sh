#!/bin/bash
set -e

echo "[1/7] Installing Docker (using Aliyun mirror)..."
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
echo "[1/7] Docker installed."

echo "[2/7] Installing code-server..."
curl -fsSL https://code-server.dev/install.sh | sh
echo "[2/7] Code-server installed at $(which code-server)."

echo "[3/7] Installing devcontainer CLI..."
npm install -g @devcontainers/cli
echo "[3/7] Devcontainer CLI installed."

echo "[4/7] Writing devcontainer.json..."
mkdir -p /workspace/.devcontainer
cat > /workspace/.devcontainer/devcontainer.json <<'DEVCONTAINER_EOF'
{{DEVCONTAINER_JSON}}
DEVCONTAINER_EOF
echo "[4/7] devcontainer.json written."

echo "[5/7] Starting devcontainer..."
cd /workspace
devcontainer up --workspace-folder .
echo "[5/7] Devcontainer started."

echo "[6/7] Starting code-server..."
nohup code-server --bind-addr 0.0.0.0:8080 --auth none > /var/log/code-server.log 2>&1 &
echo "[6/7] Code-server started on port 8080."

echo "[7/7] Verifying services..."
sleep 2
if curl -sf http://localhost:8080 > /dev/null 2>&1; then
  echo "[7/7] Code-server is running."
else
  echo "[7/7] Warning: Code-server not responding yet, may need more time."
fi

echo "[startup] All steps completed. Access at http://{公网IP}:8080"
