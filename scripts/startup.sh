#!/bin/bash
set -e

echo "[startup] Beginning workspace setup..."

# === 1. 登录 ACR ===
{{ACR_LOGIN}}

# === 2. 挂载 OSS ===
mkdir -p /workspace /mnt/config
ossfs "{{OSS_BUCKET}}:{{OSS_WORKSPACE_PATH}}" /workspace \
  -ourl="http://oss-{{REGION}}-internal.aliyuncs.com" \
  -o ram_role="{{RAM_ROLE_NAME}}" -o allow_other -o uid=1000 -o gid=1000
ossfs "{{OSS_BUCKET}}:/ws-{{WORKSPACE_ID}}/config" /mnt/config \
  -ourl="http://oss-{{REGION}}-internal.aliyuncs.com" \
  -o ram_role="{{RAM_ROLE_NAME}}" -o allow_other

# === 3. 启动容器 ===
docker pull "{{IMAGE_URI}}"
docker run -d --name workspace \
  -p 8080:8080 \
  -v /workspace:/workspace \
  -e PASSWORD="{{ACCESS_TOKEN}}" \
  --restart unless-stopped \
  "{{IMAGE_URI}}" /workspace

# === 4. 恢复漫游配置 ===
if [ -f "/mnt/config/roaming.tar.gz" ]; then
  docker cp /mnt/config/roaming.tar.gz workspace:/tmp/roaming.tar.gz
  docker exec workspace bash -c "tar -xzf /tmp/roaming.tar.gz -C /home/coder && rm -f /tmp/roaming.tar.gz"
  echo "[roaming] Restored."
fi

# === 5. 恢复快照 ===
if [ -f "/workspace/.snapshots/latest.tar.gz" ]; then
  TMPDIR=$(mktemp -d)
  tar -xzf /workspace/.snapshots/latest.tar.gz -C "$TMPDIR"
  rsync -av --exclude='.git' --exclude='.snapshots' "$TMPDIR/" /workspace/
  rm -rf "$TMPDIR"
  echo "[snapshot] Restore complete."
fi

# === 6. Git Clone / Pull ===
{{GIT_BLOCK}}

# === 7. 安装 Features ===
{{FEATURES_LOOP}}

# === 8. 执行自定义脚本 ===
{{CUSTOM_SCRIPTS_LOOP}}

echo "[startup] Workspace setup complete."
echo "[startup] Waiting for container to be ready..."

# === 9. 等待容器就绪 ===
for i in $(seq 1 30); do
  if curl -sf http://localhost:8080 >/dev/null 2>&1; then
    echo "[startup] Container is ready."
    break
  fi
  sleep 5
done

echo "[startup] Done. Agent will handle health checks and idle detection."
