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

  return template
    .replace(/\{\{INSTANCE_ID\}\}/g, vars.instanceId ?? "")
    .replace(/\{\{CALLBACK_URL\}\}/g, vars.callbackUrl)
    .replace(/\{\{ACCESS_TOKEN\}\}/g, vars.accessToken);
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
