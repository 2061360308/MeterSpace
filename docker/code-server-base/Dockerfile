# code-server-base — Workspace Cloud 预置基础镜像
# 满足 base 镜像契约（见 docs/PLAN.md 第五章）：
#  1. 监听 8080，HTTP
#  2. 通过环境变量 PASSWORD 设置登录密码
#  3. 接受 /workspace 作为工作目录
#  4. coder 用户 (UID 1000) 可读写挂载的 /workspace
FROM codercom/code-server:latest

USER root

# 基础工具（Features 默认依赖）
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    wget \
    ca-certificates \
    gnupg \
    lsb-release \
    build-essential \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# code-server 安装 `code` CLI 到 PATH
RUN ln -s /usr/lib/code-server/lib/vscode/bin/remote-cli/code /usr/local/bin/code || true

USER coder

WORKDIR /workspace

EXPOSE 8080

# code-server 镜像默认 ENTRYPOINT 支持 --auth password 与 --bind-addr；
# 平台侧通过 docker run -e PASSWORD=xxx 传入并通过默认 entrypoint 运行。
