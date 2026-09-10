#!/bin/bash
set -e

# === 0. 网络引导（出口代理 + 连通性智能切换，先于一切境外安装执行） ===
{{PROXY_BOOTSTRAP}}

# === 0. 环境准备 ===
export HOME=/root
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH
export DEBIAN_FRONTEND=noninteractive
mkdir -p /workspace /var/log

echo "[1/9] Installing Docker (using USTC mirror)..."
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg wget jq
install -m 0755 -d /etc/apt/keyrings
wget -qO- --tries=3 https://mirrors.ustc.edu.cn/docker-ce/linux/debian/gpg | gpg --batch --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://mirrors.ustc.edu.cn/docker-ce/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable docker >/dev/null 2>&1 || true
systemctl start docker >/dev/null 2>&1 || true

# 配置 Docker 镜像加速
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "registry-mirrors": ["https://docker.1ms.run"]
}
EOF
systemctl daemon-reload >/dev/null 2>&1 || true
systemctl restart docker >/dev/null 2>&1 || true

echo "[1/9] Docker installed."

# === ACR 登录（镜像来自阿里云 ACR 时，走 RAM Role STS，免 AK 落盘） ===
{{ACR_LOGIN}}

echo "[2/9] Installing Node.js..."
NODE_MIRROR="https://cdn.npmmirror.com/binaries/node/latest"
NODE_VERSION=$(curl -sf "$NODE_MIRROR/SHASUMS256.txt" | grep "linux-x64.tar.gz" | head -1 | awk '{print $2}' | sed 's/node-v//;s/-linux-x64.tar.gz//')
if [ -z "$NODE_VERSION" ]; then
  echo "[2/9] Warning: Failed to fetch Node.js version, using fallback"
  NODE_VERSION="24.9.0"
fi
echo "[2/9] Latest Node.js version: $NODE_VERSION"
curl -fL -o /tmp/node.tar.gz "$NODE_MIRROR/node-v${NODE_VERSION}-linux-x64.tar.gz" || {
  echo "[2/9] Error: Failed to download Node.js"
  exit 1
}
tar -xzf /tmp/node.tar.gz -C /usr/local --strip-components=1 || {
  echo "[2/9] Error: Failed to extract Node.js"
  exit 1
}
rm -f /tmp/node.tar.gz

# 配置 npm 淘宝镜像源
npm config set registry https://registry.npmmirror.com

echo "[2/9] Node.js $(node --version) installed."

echo "[3/9] Installing code-server..."

install_code_server() {
  # 镜像基础 URL
  MIRROR_URL="https://mirrors.ustc.edu.cn/github-release/coder/code-server/LatestRelease"
  
  # 获取版本号 (使用 CS_VERSION 避免与 /etc/os-release 中的 VERSION 变量冲突)
  echo "[3/9] Fetching latest version from mirror..."
  CS_VERSION=$(curl -s "$MIRROR_URL/" | grep -oP 'code-server-\K[0-9.]+' | head -1)
  if [ -z "$CS_VERSION" ]; then
    echo "[3/9] Error: Failed to fetch version from mirror"
    exit 1
  fi
  echo "[3/9] Latest version: $CS_VERSION"
  
  # 系统检测
  OS=$(uname -s | tr '[:upper:]' '[:lower:]')
  ARCH=$(uname -m)
  case $ARCH in
    x86_64) ARCH="amd64" ;;
    aarch64) ARCH="arm64" ;;
  esac
  
  # 检测发行版
  DISTRO="unknown"
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    DISTRO=$ID
  fi
  
  echo "[3/9] Detected: OS=$OS, ARCH=$ARCH, DISTRO=$DISTRO"
  
  # 安装
  case $DISTRO in
    debian|ubuntu|raspbian)
      echo "[3/9] Installing deb package..."
      curl -fL -o /tmp/code-server.deb "$MIRROR_URL/code-server_${CS_VERSION}_${ARCH}.deb" || {
        echo "[3/9] Error: Failed to download code-server deb package"
        return 1
      }
      dpkg -i /tmp/code-server.deb || {
        echo "[3/9] Error: Failed to install code-server deb package"
        return 1
      }
      rm -f /tmp/code-server.deb
      ;;
    fedora|centos|rhel|opensuse|amzn)
      echo "[3/9] Installing rpm package..."
      curl -fL -o /tmp/code-server.rpm "$MIRROR_URL/code-server-$CS_VERSION-$ARCH.rpm" || {
        echo "[3/9] Error: Failed to download code-server rpm package"
        return 1
      }
      rpm -U /tmp/code-server.rpm || {
        echo "[3/9] Error: Failed to install code-server rpm package"
        return 1
      }
      rm -f /tmp/code-server.rpm
      ;;
    alpine|freebsd)
      echo "[3/9] Installing via npm..."
      npm install -g code-server || {
        echo "[3/9] Error: Failed to install code-server via npm"
        return 1
      }
      ;;
    *)
      echo "[3/9] Installing standalone package..."
      curl -fL -o /tmp/code-server.tar.gz "$MIRROR_URL/code-server-$CS_VERSION-$OS-$ARCH.tar.gz" || {
        echo "[3/9] Error: Failed to download code-server standalone package"
        return 1
      }
      mkdir -p /opt
      tar -xzf /tmp/code-server.tar.gz -C /opt/ || {
        echo "[3/9] Error: Failed to extract code-server standalone package"
        return 1
      }
      ln -sf /opt/code-server-$CS_VERSION-$OS-$ARCH/bin/code-server /usr/local/bin/code-server
      rm -f /tmp/code-server.tar.gz
      ;;
  esac
}

install_code_server
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