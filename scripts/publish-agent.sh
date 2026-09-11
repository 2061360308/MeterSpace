#!/bin/bash
# 构建 agent 二进制并放到 public/，供实例内 entrypoint.sh 拉取
#
# 产物：
#   public/agent-linux-amd64
#   public/agent-linux-arm64   (--all 时)
#
# 用法：
#   bash scripts/publish-agent.sh          # 只构建 amd64（默认，覆盖绝大多数 ECS）
#   bash scripts/publish-agent.sh --all    # amd64 + arm64
#
# 前置：本机需可用 Go 工具链（go version）
#   - 若未安装：https://go.dev/dl/ 或 apt install golang-go
#   - 交叉编译靠 CGO_ENABLED=0，无需目标平台工具链
#   - 非 PATH 安装时可设 GO_BIN 覆盖，例如：
#       GO_BIN="D:/program/golang/bin/go.exe" bash scripts/publish-agent.sh
#     脚本也会自动探测常见安装位置。

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
AGENT_DIR="${PROJECT_ROOT}/agent"
OUT_DIR="${PROJECT_ROOT}/public"

BUILD_ALL=0
if [ "$1" = "--all" ]; then
  BUILD_ALL=1
fi

# 定位 go：GO_BIN 显式指定 > PATH > 常见安装目录
GO=""
if [ -n "${GO_BIN}" ] && [ -x "${GO_BIN}" ]; then
  GO="${GO_BIN}"
elif command -v go >/dev/null 2>&1; then
  GO="go"
else
  for cand in \
    "/c/Go/bin/go.exe" \
    "/d/Go/bin/go.exe" \
    "/d/program/golang/bin/go.exe" \
    "/c/Program Files/Go/bin/go.exe" \
    "${LOCALAPPDATA}/Programs/Go/bin/go.exe"
  do
    if [ -x "${cand}" ]; then GO="${cand}"; break; fi
  done
fi

if [ -z "${GO}" ]; then
  echo "[publish-agent] ERROR: 未找到 go，请先安装 Go 工具链" >&2
  echo "[publish-agent] 下载：https://go.dev/dl/" >&2
  echo "[publish-agent] 或指定路径：GO_BIN=/path/to/go bash scripts/publish-agent.sh" >&2
  exit 1
fi

echo "[publish-agent] $("${GO}" version)"
mkdir -p "${OUT_DIR}"

cd "${AGENT_DIR}"

# 国内网络下 proxy.golang.org 常不可达；首次构建若失败可先执行：
#   "$GO" env -w GOPROXY=https://goproxy.cn,direct
echo "[publish-agent] building linux/amd64 ..."
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
  "${GO}" build -trimpath -ldflags="-s -w" -o "${OUT_DIR}/agent-linux-amd64" .
echo "[publish-agent]   -> ${OUT_DIR}/agent-linux-amd64"

if [ "${BUILD_ALL}" = "1" ]; then
  echo "[publish-agent] building linux/arm64 ..."
  CGO_ENABLED=0 GOOS=linux GOARCH=arm64 \
    "${GO}" build -trimpath -ldflags="-s -w" -o "${OUT_DIR}/agent-linux-arm64" .
  echo "[publish-agent]   -> ${OUT_DIR}/agent-linux-arm64"
fi

echo "[publish-agent] done"
