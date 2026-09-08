import { decrypt } from "@/lib/crypto";

export interface Feature {
  id: string;
  name: string;
  version: string;
  installScript: string;
}

export interface EntrypointVars {
  instanceId?: string;
  workspaceId: string;
  ossBucket: string;
  ossWorkspacePath: string;
  region: string;
  imageUri: string;
  ramRoleName: string;
  callbackUrl: string;
  accessToken: string;
  agentVersion?: string;
  gitRepoUrl?: string | null;
  gitBranch: string;
  gitAuthedUrl?: string | null;
  gitAutoClone: boolean;
  idleMinutes: number;
  features: Feature[];
  customScripts?: { name: string; script: string }[];
}

function q(v: string): string {
  return `'${v.replace(/'/g, `'\\''`)}'`;
}

export function buildEntrypoint(vars: EntrypointVars): string {
  const agentVersion = vars.agentVersion ?? "latest";
  const agentDownloadUrl = `https://github.com/workspace-cloud/agent/releases/download/${agentVersion}/agent-linux-amd64`;

  const startupScript = buildStartupScript(vars);

  return `#!/bin/bash
set -e

# === 环境变量 ===
INSTANCE_ID=${q(vars.instanceId ?? "")}
WORKSPACE_ID=${q(vars.workspaceId)}
OSS_BUCKET=${q(vars.ossBucket)}
OSS_WORKSPACE_PATH=${q(vars.ossWorkspacePath)}
REGION=${q(vars.region)}
IMAGE_URI=${q(vars.imageUri)}
RAM_ROLE_NAME=${q(vars.ramRoleName)}
CALLBACK_URL=${q(vars.callbackUrl)}
ACCESS_TOKEN=${q(vars.accessToken)}
GIT_REPO_URL=${q(vars.gitRepoUrl ?? "")}
GIT_BRANCH=${q(vars.gitBranch)}
GIT_AUTHED_URL=${q(vars.gitAuthedUrl ?? "")}
GIT_AUTO_CLONE=${vars.gitAutoClone ? "true" : "false"}
IDLE_MINUTES=${String(vars.idleMinutes)}

# === 1. 基础环境 ===
apt-get update && apt-get install -y docker.io git curl jq tar ossfs rsync

# === 2. 启动 Docker ===
systemctl enable --now docker

# === 3. 下载并启动 Agent ===
mkdir -p /opt/agent/scripts /opt/agent/logs

# 下载 agent 二进制
curl -sfL "${agentDownloadUrl}" -o /opt/agent/agent || {
  echo "[agent] Failed to download agent from ${agentDownloadUrl}"
  exit 1
}
chmod +x /opt/agent/agent

# 写入启动脚本
cat > /opt/agent/scripts/startup.sh <<'STARTUP_SCRIPT'
${startupScript}
STARTUP_SCRIPT
chmod +x /opt/agent/scripts/startup.sh

# 写入 agent 配置
cat > /opt/agent/config.json <<AGENTCFG
{
  "instance_id": "${vars.instanceId}",
  "workspace_id": "${vars.workspaceId}",
  "backend_url": "${vars.callbackUrl}",
  "backend_token": "${vars.accessToken}",
  "script_path": "/opt/agent/scripts/startup.sh",
  "heartbeat_interval": 30,
  "script_timeout": 600
}
AGENTCFG

# 启动 agent
/opt/agent/agent &
AGENT_PID=$!
echo "[agent] Started with PID $AGENT_PID"

# === 4. 保持运行 ===
wait $AGENT_PID
tail -f /dev/null`;
}

function buildStartupScript(vars: EntrypointVars): string {
  const featuresJson = JSON.stringify(vars.features);
  const customScriptsJson = JSON.stringify(vars.customScripts ?? []);

  const acrLogin =
    vars.imageUri.match(/registry\..*\.aliyuncs\.com\//)
      ? `STS=$(curl -s http://100.100.100.200/latest/meta-data/ram/security-credentials/${vars.ramRoleName})
AK_ID=$(echo "$STS" | jq -r '.AccessKeyId')
AK_SECRET=$(echo "$STS" | jq -r '.AccessKeySecret')
docker login ${q(`registry.${vars.region}.aliyuncs.com`)} --username="\${AK_ID}" --password="\${AK_SECRET}"
`
      : `echo "[acr] image is not from ACR, skip login"`;

  const gitBlock =
    vars.gitRepoUrl && vars.gitAutoClone
      ? `if [ -n "${vars.gitRepoUrl}" ] && [ "${vars.gitAutoClone}" = "true" ]; then
  cd /workspace
  if [ -d ".git" ]; then
    git pull origin ${q(vars.gitBranch)}
  else
    git clone -b ${q(vars.gitBranch)} ${q(vars.gitAuthedUrl ?? vars.gitRepoUrl)} .
  fi
fi
`
      : `echo "[git] auto-clone disabled"`;

  const featuresLoop = `echo ${q(featuresJson)} | jq -c '.[]' | while read -r feature; do
  FEATURE_ID=$(echo "$feature" | jq -r '.id')
  FEATURE_SCRIPT=$(echo "$feature" | jq -r '.installScript')
  echo "[feature] Installing \${FEATURE_ID}..."
  docker exec -u root workspace bash -lc "\$FEATURE_SCRIPT"
  echo "[feature] \${FEATURE_ID} installed."
done`;

  const customScriptsLoop = `echo ${q(customScriptsJson)} | jq -c '.[]' | while read -r script; do
  SCRIPT_NAME=$(echo "$script" | jq -r '.name')
  SCRIPT_CONTENT=$(echo "$script" | jq -r '.script')
  echo "[script] Running \${SCRIPT_NAME}..."
  echo "\$SCRIPT_CONTENT" | bash
  echo "[script] \${SCRIPT_NAME} completed."
done`;

  return `#!/bin/bash
set -e

echo "[startup] Beginning workspace setup..."

# === 1. 登录 ACR ===
${acrLogin}

# === 2. 挂载 OSS ===
mkdir -p /workspace /mnt/config
ossfs "\${OSS_BUCKET}:/${vars.ossWorkspacePath}" /workspace \\
  -ourl="http://oss-\${REGION}-internal.aliyuncs.com" \\
  -o ram_role="\${RAM_ROLE_NAME}" -o allow_other -o uid=1000 -o gid=1000
ossfs "\${OSS_BUCKET}:/ws-\${WORKSPACE_ID}/config" /mnt/config \\
  -ourl="http://oss-\${REGION}-internal.aliyuncs.com" \\
  -o ram_role="\${RAM_ROLE_NAME}" -o allow_other

# === 3. 启动容器 ===
docker pull "\${IMAGE_URI}"
docker run -d --name workspace \\
  -p 8080:8080 \\
  -v /workspace:/workspace \\
  -e PASSWORD="\${ACCESS_TOKEN}" \\
  --restart unless-stopped \\
  "\${IMAGE_URI}" /workspace

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
${gitBlock}

# === 7. 安装 Features ===
${featuresLoop}

# === 8. 执行自定义脚本 ===
${customScriptsLoop}

# === 9. 启动 idle-watcher ===
cat > /opt/idle-watcher.sh <<'IDLE_WATCHER'
#!/bin/bash
WORKSPACE_ID="${vars.workspaceId}"
IDLE_MINUTES=${vars.idleMinutes}
CALLBACK_URL="${vars.callbackUrl}"
ACCESS_TOKEN="${vars.accessToken}"
CHECK_INTERVAL=60

touch /tmp/.last_activity

get_last_activity() {
  local ws_activity=\\$(ss -tnp 2>/dev/null | grep -c ':8080' || echo 0)
  local file_activity=\\$(find /workspace -maxdepth 3 -newer /tmp/.last_activity -type f 2>/dev/null | head -1)
  local term_activity=\\$(docker exec workspace ps aux 2>/dev/null | grep -cE 'bash|zsh|node' || echo 0)
  if [ "\$ws_activity" -gt 0 ] || [ -n "\$file_activity" ] || [ "\$term_activity" -gt 1 ]; then
    date +%s > /tmp/.last_activity
  fi
  cat /tmp/.last_activity 2>/dev/null || date +%s
}

while true; do
  LAST_ACTIVE=\\$(get_last_activity)
  NOW=\\$(date +%s)
  IDLE_SECONDS=\\$((IDLE_MINUTES * 60))
  IDLE_TIME=\\$((NOW - LAST_ACTIVE))
  if [ "\$IDLE_TIME" -ge "\$IDLE_SECONDS" ]; then
    if [ ! -f "/tmp/.idle_triggered" ]; then
      touch /tmp/.idle_triggered
      curl -s -X POST "\${CALLBACK_URL}/api/health/\${WORKSPACE_ID}/idle" \\
        -H "Content-Type: application/json" \\
        -d "{\\"idleSeconds\\": \${IDLE_TIME}, \\"accessToken\\": \\"\${ACCESS_TOKEN}\\"}"
    fi
  else
    rm -f /tmp/.idle_triggered
  fi
  sleep \$CHECK_INTERVAL
done
IDLE_WATCHER
chmod +x /opt/idle-watcher.sh
nohup bash /opt/idle-watcher.sh >/var/log/idle-watcher.log 2>&1 &

echo "[startup] Workspace setup complete."
echo "[health] Waiting for container to be ready..."

# === 10. 等待容器就绪 ===
for i in $(seq 1 30); do
  if curl -sf http://localhost:8080 >/dev/null 2>&1; then
    echo "[health] Container is ready."
    break
  fi
  sleep 5
done`;
}

export function buildUserData(vars: EntrypointVars): string {
  return Buffer.from(buildEntrypoint(vars)).toString("base64");
}

export function buildStopHook(): string {
  return `#!/bin/bash
set -e
cd /workspace

UNTRACKED=$(git ls-files --others --exclude-standard)
MODIFIED=$(git diff --name-only)
ALL_FILES=$(printf '%s\\n%s\\n' "$UNTRACKED" "$MODIFIED" | sort -u | grep -v '^$')

if [ -n "$ALL_FILES" ]; then
  SNAP=".snapshots/$(date +%Y%m%d-%H%M).tar.gz"
  mkdir -p .snapshots
  printf '%s\\n' "$ALL_FILES" | tar -czf "$SNAP" -T -
  ln -sf "$(basename "$SNAP")" .snapshots/latest.tar.gz
  echo "[snapshot] Packed $(printf '%s\\n' "$ALL_FILES" | wc -l) files."
fi

docker exec workspace bash -c "tar -czf /tmp/roaming.tar.gz -C /home/coder .local/share/code-server .config .gitconfig 2>/dev/null || true"
docker cp workspace:/tmp/roaming.tar.gz /mnt/config/roaming.tar.gz 2>/dev/null || true

git ls-files | grep -v '^\\.snapshots/' | while read -r f; do rm -f "$f"; done
find . -type d -empty -not -path './.git/*' -not -path './.snapshots/*' -delete 2>/dev/null || true
echo "[cleanup] Tracked files removed."

echo "OSS_USAGE=$(du -sb /workspace | cut -f1)"`;
}

export function decryptGitToken(gitTokenEnc: string | null): string | null {
  if (!gitTokenEnc) return null;
  return decrypt(gitTokenEnc);
}
