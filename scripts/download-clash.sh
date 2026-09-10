#!/usr/bin/env bash
# 下载 mihomo (Clash.Meta) 内核到 public/clash-linux-{amd64,arm64}。
# ECS 引导脚本 scripts/proxy-bootstrap.sh 会从
#   ${PLATFORM_BASE}/clash-linux-${CLASH_ARCH}
# 拉取内核失败时回退到全局设置配置的 clash_bin_url。
set -euo pipefail

VERSION="${1:-v1.18.10}"
PUBLIC_DIR="$(cd "$(dirname "$0")/../public" && pwd)"

declare -A ARCH=(
  [amd64]=amd64
  [arm64]=arm64
)

for goarch in "${!ARCH[@]}"; do
  url="https://github.com/MetaCubeX/mihomo/releases/download/${VERSION}/mihomo-linux-${goarch}-${VERSION}.gz"
  out="${PUBLIC_DIR}/clash-linux-${ARCH[$goarch]}"
  echo "==> ${goarch}: ${url}"
  curl -fsSL --connect-timeout 15 -o "/tmp/clash-${goarch}.gz" "$url"
  echo "    unpacking -> ${out}"
  murmur=$(mktemp)
  # gzip 需先解出可执行文件
  gzip -dk -c "/tmp/clash-${goarch}.gz" > "${murmur}"
  chmod +x "${murmur}"
  mv "${murmur}" "${out}"
  "${out}" -v 2>&1 | head -1 || true
done

echo "ok: $(ls -l "${PUBLIC_DIR}"/clash-linux-*)"
echo "提示：也可手动放置任意 mihomo/Clash.Meta 内核到 public/clash-linux-{amd64,arm64}"