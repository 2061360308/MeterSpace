#!/bin/bash
# stop-hook.sh — 由云助手 RunCommand 在 ECS 内以 root 执行。
# 打包未提交文件 + 漫游配置，删除已跟踪文件，输出 OSS 占用。
set -e
cd /workspace

UNTRACKED=$(git ls-files --others --exclude-standard)
MODIFIED=$(git diff --name-only)
ALL_FILES=$(printf '%s\n%s\n' "$UNTRACKED" "$MODIFIED" | sort -u | grep -v '^$')

if [ -n "$ALL_FILES" ]; then
  SNAP=".snapshots/$(date +%Y%m%d-%H%M).tar.gz"
  mkdir -p .snapshots
  printf '%s\n' "$ALL_FILES" | tar -czf "$SNAP" -T -
  ln -sf "$(basename "$SNAP")" .snapshots/latest.tar.gz
  echo "[snapshot] Packed $(printf '%s\n' "$ALL_FILES" | wc -l) files."
fi

docker exec workspace bash -c "tar -czf /tmp/roaming.tar.gz -C /home/coder .local/share/code-server .config .gitconfig 2>/dev/null || true"
docker cp workspace:/tmp/roaming.tar.gz /mnt/config/roaming.tar.gz 2>/dev/null || true

git ls-files | grep -v '^\.snapshots/' | while read -r f; do rm -f "$f"; done
find . -type d -empty -not -path './.git/*' -not -path './.snapshots/*' -delete 2>/dev/null || true
echo "[cleanup] Tracked files removed."

echo "OSS_USAGE=$(du -sb /workspace | cut -f1)"
