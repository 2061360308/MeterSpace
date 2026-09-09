#!/bin/bash
set -e

echo "[1/7] Installing Docker..."
curl -fsSL https://get.docker.com | sh
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
