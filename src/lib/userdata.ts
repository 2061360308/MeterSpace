import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface Feature {
  id: string;
  name: string;
  version: string;
  installScript: string;
}

export interface EntrypointVars {
  instanceId?: string;
  callbackUrl: string;
  accessToken: string;
  /** 工作区 ID（WS_WORKSPACE_ID），可选 */
  workspaceId?: string;
  /** 地域（WS_REGION），可选 */
  region?: string;
  /** 入口相对路径；留空则 agent 从 /payload 响应取 */
  entry?: string;
  /** 入口执行超时（秒） */
  entryTimeoutSec?: number;
  /** 载荷落盘根目录，默认 /opt/ws */
  workspaceRoot?: string;
  /** 空闲判定分钟数 */
  idleMinutes?: number;
  /** 活跃采样间隔（秒） */
  sampleIntervalSec?: number;
  /** 模板声明的端口数组（JSON），用于 agent 采样 */
  activityPorts?: { port: number; label?: string; protocol?: string; private?: boolean }[];
}

let cachedTemplate: string | null = null;

function getEntrypointTemplate(): string {
  if (cachedTemplate) return cachedTemplate;
  const templatePath = join(process.cwd(), "scripts", "entrypoint.sh");
  cachedTemplate = readFileSync(templatePath, "utf-8");
  return cachedTemplate;
}

export function buildEntrypoint(vars: EntrypointVars): string {
  const template = getEntrypointTemplate();

  const activity = {
    ports: vars.activityPorts ?? [],
    idleMinutes: vars.idleMinutes ?? 30,
    sampleIntervalSec: vars.sampleIntervalSec ?? 30,
  };

  // 全部走构建期占位符替换；config.json 用引号包裹的 heredoc，
  // 保证 shell 不会二次展开。
  return template
    .replace(/\{\{INSTANCE_ID\}\}/g, vars.instanceId ?? "")
    .replace(/\{\{CALLBACK_URL\}\}/g, vars.callbackUrl)
    .replace(/\{\{ACCESS_TOKEN\}\}/g, vars.accessToken)
    .replace(/\{\{WORKSPACE_ID\}\}/g, vars.workspaceId ?? "")
    .replace(/\{\{REGION\}\}/g, vars.region ?? "")
    .replace(/\{\{WORKSPACE_ROOT\}\}/g, vars.workspaceRoot ?? "/opt/ws")
    .replace(/\{\{ENTRY\}\}/g, vars.entry ?? "")
    .replace(/\{\{ENTRY_TIMEOUT\}\}/g, String(vars.entryTimeoutSec ?? 1800))
    .replace(/\{\{IDLE_MINUTES\}\}/g, String(vars.idleMinutes ?? 30))
    .replace(/\{\{ACTIVITY_CONFIG_JSON\}\}/g, JSON.stringify(activity));
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
