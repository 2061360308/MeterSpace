#!/usr/bin/env bash
# 打包云函数轮询器（阿里云 FC / AWS Lambda 通用）。
# 产物：functions/poller/poller.zip（控制台或命令行直接上传，Node 18+ runtime，无依赖）。
set -euo pipefail
cd "$(dirname "$0")/../functions/poller"
rm -f poller.zip
zip poller.zip index.mjs package.json
echo "Built functions/poller/poller.zip"
echo "部署后配置环境变量：RUNNER_URL=<本站根地址>、TASKS_WORKER_TOKEN=<与后端相同>"