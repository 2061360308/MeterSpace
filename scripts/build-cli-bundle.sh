#!/bin/bash
# 构建 @devcontainers/cli 离线包 -> public/devcontainer-cli.tar.gz
#
# 为什么需要：实例容器内不一定能访问 npm registry（海外源慢/被墙），
# 且 CLI 依赖较重（含 node_modules），不适合每次实例启动现装。
# 构建期一次性打好包放 public/，实例内通过 ${CALLBACK_URL}/devcontainer-cli.tar.gz 拉取。
#
# 用法：
#   bash scripts/build-cli-bundle.sh              # 默认版本
#   bash scripts/build-cli-bundle.sh 0.89.0      # 指定版本
#
# 产物：public/devcontainer-cli.tar.gz
#       解包后根目录直接是 package 内容（devcontainer 可执行入口 + node_modules）

set -e

CLI_VERSION="${1:-0.89.0}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUT_DIR="${PROJECT_ROOT}/public"
OUT_FILE="${OUT_DIR}/devcontainer-cli.tar.gz"
WORK_DIR="$(mktemp -d)"

echo "[cli-bundle] version = ${CLI_VERSION}"
echo "[cli-bundle] workdir = ${WORK_DIR}"

mkdir -p "${OUT_DIR}"

cd "${WORK_DIR}"
npm pack "@devcontainers/cli@${CLI_VERSION}" --registry=https://registry.npmmirror.com

TGZ="$(ls ./devcontainers-cli-*.tgz 2>/dev/null | head -n 1)"
if [ -z "${TGZ}" ]; then
  echo "[cli-bundle] ERROR: npm pack 未产出 tgz" >&2
  exit 1
fi
echo "[cli-bundle] packed = ${TGZ}"

tar -xzf "${TGZ}"
cd package

# 只装运行时依赖（CLI 用 --omit=dev 安装后 devDependencies 不需要）
npm install --omit=dev --production --registry=https://registry.npmmirror.com

# 打包成实例端可直接解包的形式：根目录即 package 内容
# 实例端：tar -xzf ... -C /opt/devcontainer && ln -sf /opt/devcontainer/devcontainer /usr/local/bin/devcontainer
cd "${WORK_DIR}/package"
tar -czf "${OUT_FILE}" .

cd "${PROJECT_ROOT}"
rm -rf "${WORK_DIR}"

SIZE="$(ls -lh "${OUT_FILE}" | awk '{print $5}')"
echo "[cli-bundle] done -> ${OUT_FILE} (${SIZE})"
