# =============================================================
# 此文件为交付物/参考。实际运行时，脚本由 src/lib/userdata.ts 生成。
# 变量由后端在 UserData 头部注入。请勿直接部署此文件。
# =============================================================
#!/bin/bash
set -e

WORKSPACE_ID="${WORKSPACE_ID}"
OSS_BUCKET="${OSS_BUCKET}"
OSS_WORKSPACE_PATH="${OSS_WORKSPACE_PATH}"
REGION="${REGION}"
IMAGE_URI="${IMAGE_URI}"
RAM_ROLE_NAME="${RAM_ROLE_NAME}"
CALLBACK_URL="${CALLBACK_URL}"
ACCESS_TOKEN="${ACCESS_TOKEN}"
GIT_REPO_URL="${GIT_REPO_URL:-}"
GIT_BRANCH="${GIT_BRANCH:-main}"
GIT_AUTHED_URL="${GIT_AUTHED_URL:-}"
GIT_AUTO_CLONE="${GIT_AUTO_CLONE:-true}"
IDLE_MINUTES="${IDLE_MINUTES:-30}"
FEATURES="${FEATURES:-[]}"

apt-get update && apt-get install -y docker.io git curl jq tar ossfs rsync

systemctl enable --now docker

case "${IMAGE_URI}" in
  registry.*.aliyuncs.com/*)
    STS=$(curl -s http://100.100.100.200/latest/meta-data/ram/security-credentials/${RAM_ROLE_NAME})
    AK_ID=$(echo "$STS" | jq -r '.AccessKeyId')
    AK_SECRET=$(echo "$STS" | jq -r '.AccessKeySecret')
    docker login "registry.${REGION}.aliyuncs.com" --username="${AK_ID}" --password="${AK_SECRET}"
    ;;
esac

mkdir -p /workspace /mnt/config
ossfs "${OSS_BUCKET}:/${OSS_WORKSPACE_PATH}" /workspace \
  -ourl="http://oss-${REGION}-internal.aliyuncs.com" \
  -o ram_role="${RAM_ROLE_NAME}" -o allow_other -o uid=1000 -o gid=1000
ossfs "${OSS_BUCKET}:/ws-${WORKSPACE_ID}/config" /mnt/config \
  -ourl="http://oss-${REGION}-internal.aliyuncs.com" \
  -o ram_role="${RAM_ROLE_NAME}" -o allow_other

docker pull "${IMAGE_URI}"
docker run -d --name workspace \
  -p 8080:8080 \
  -v /workspace:/workspace \
  -e PASSWORD="${ACCESS_TOKEN}" \
  --restart unless-stopped \
  "${IMAGE_URI}" /workspace

if [ -f "/mnt/config/roaming.tar.gz" ]; then
  docker cp /mnt/config/roaming.tar.gz workspace:/tmp/roaming.tar.gz
  docker exec workspace bash -c "tar -xzf /tmp/roaming.tar.gz -C /home/coder && rm -f /tmp/roaming.tar.gz"
fi

if [ -f "/workspace/.snapshots/latest.tar.gz" ]; then
  TMPDIR=$(mktemp -d)
  tar -xzf /workspace/.snapshots/latest.tar.gz -C "$TMPDIR"
  rsync -av --exclude='.git' --exclude='.snapshots' "$TMPDIR/" /workspace/
  rm -rf "$TMPDIR"
fi

if [ -n "${GIT_REPO_URL}" ] && [ "${GIT_AUTO_CLONE}" = "true" ]; then
  cd /workspace
  if [ -d ".git" ]; then
    git pull origin "${GIT_BRANCH}"
  else
    git clone -b "${GIT_BRANCH}" "${GIT_AUTHED_URL}" .
  fi
fi

echo "${FEATURES}" | jq -c '.[]' | while read -r feature; do
  FEATURE_ID=$(echo "$feature" | jq -r '.id')
  FEATURE_SCRIPT=$(echo "$feature" | jq -r '.installScript')
  docker exec -u root workspace bash -lc "$FEATURE_SCRIPT"
done

PUBLIC_IP=$(curl -s http://100.100.100.200/latest/meta-data/public-ipv4)
INSTANCE_ID=$(curl -s http://100.100.100.200/latest/meta-data/instance-id)
for i in $(seq 1 30); do
  if curl -sf http://localhost:8080 >/dev/null 2>&1; then
    curl -s -X POST "${CALLBACK_URL}/api/health/${WORKSPACE_ID}" \
      -H "Content-Type: application/json" \
      -d "{\"instanceId\": \"${INSTANCE_ID}\", \"publicIp\": \"${PUBLIC_IP}\", \"port\": 8080, \"accessToken\": \"${ACCESS_TOKEN}\"}"
    break
  fi
  sleep 5
done

tail -f /dev/null
