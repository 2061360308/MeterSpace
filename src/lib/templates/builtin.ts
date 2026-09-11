/**
 * 内置模板注册表（§14 模板清单）。
 *
 * 内置模板是**代码内常量**（不进 DB），与「市场模板」「用户自建模板」
 * 三者在 `/api/templates` 里合并返回（§9）。
 * 载荷用 `payload` 内联，避免构建期读取文件系统（serverless 打包差异）。
 *
 * 覆盖三种入口类型（§2.4）：
 *   COMMAND      blank / python-script / code-server / docker-image
 *   COMPOSE      compose-app / database
 *   DEVCONTAINER static-site
 */

import type { Template, PayloadFile } from "./types";

export interface BuiltinTemplate {
  definition: Template;
  payload: PayloadFile[];
}

function file(path: string, content: string, mode = "0644"): PayloadFile {
  return {
    path,
    content,
    mode,
    size: Buffer.byteLength(content, "utf8"),
  };
}

// ─────────────────────────── blank ───────────────────────────

const blank: BuiltinTemplate = {
  definition: {
    id: "blank",
    name: "空白环境",
    description: "Debian 裸机环境，登录后自己装东西",
    category: "blank",
    icon: "box",
    tags: ["裸机", "shell"],
    params: [],
    entry: "run.sh",
    activity: { ports: [], idleMinutes: 30 },
    timeout: 300,
  },
  payload: [
    file(
      "run.sh",
      `#!/bin/bash
# 空白环境：装好常用工具后保持存活（agent 会持续持有该进程）
set -e
export DEBIAN_FRONTEND=noninteractive
echo "[blank] 环境就绪，容器保持存活"
echo "[blank] 工作目录: /opt/ws"
cd /opt/ws
exec tail -f /dev/null
`,
      "0755",
    ),
  ],
};

// ──────────────────────── python-script ────────────────────────

const pythonScript: BuiltinTemplate = {
  definition: {
    id: "python-script",
    name: "Python 脚本服务",
    description: "上传自己的脚本，实例启动后自动运行",
    category: "web",
    icon: "python",
    tags: ["python", "裸机"],
    params: [
      {
        key: "repo",
        label: "Git 仓库",
        type: "string",
        required: true,
        placeholder: "https://github.com/me/app.git",
      },
      {
        key: "port",
        label: "服务端口",
        type: "number",
        default: 8000,
        min: 1024,
        max: 65535,
      },
      {
        key: "installDeps",
        label: "安装依赖",
        type: "boolean",
        default: true,
      },
      {
        key: "mode",
        label: "运行模式",
        type: "select",
        default: "dev",
        options: [
          { value: "dev", label: "开发" },
          { value: "prod", label: "生产" },
        ],
      },
    ],
    entry: "run.sh",
    activity: {
      ports: [{ port: 8000, label: "API", protocol: "http" }],
      idleMinutes: 30,
    },
    timeout: 1200,
  },
  payload: [
    file(
      "run.sh",
      `#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

echo "[python-script] 安装基础依赖..."
apt-get update -qq
apt-get install -y -qq python3 python3-pip git curl >/dev/null

WORK=/opt/ws/app
if [ -d "$WORK/.git" ]; then
  echo "[python-script] 仓库已存在，拉取更新"
  git -C "$WORK" pull --ff-only || true
else
  echo "[python-script] 克隆 {{repo}}"
  rm -rf "$WORK"
  git clone --depth 1 "{{repo}}" "$WORK"
fi

cd "$WORK"

if [ "{{installDeps}}" = "true" ] && [ -f requirements.txt ]; then
  echo "[python-script] 安装 requirements.txt"
  pip3 install -q -r requirements.txt
fi

echo "[python-script] 模式: {{mode}}，监听端口: {{port}}"
python3 -m http.server "{{port}}" --bind 0.0.0.0
`,
      "0755",
    ),
  ],
};

// ──────────────────────── code-server ────────────────────────

const codeServer: BuiltinTemplate = {
  definition: {
    id: "code-server",
    name: "VS Code Web",
    description: "浏览器里的 VS Code，开机即用",
    category: "dev-env",
    icon: "code",
    tags: ["vscode", "ide", "web"],
    params: [
      {
        key: "password",
        label: "访问密码",
        type: "string",
        default: "workspace",
        placeholder: "留空则不设密码",
      },
      {
        key: "extensions",
        label: "预装扩展",
        type: "text",
        default: "",
        placeholder: "每行一个扩展 ID，如 ms-python.python",
      },
      {
        key: "port",
        label: "监听端口",
        type: "number",
        default: 8080,
        min: 1024,
        max: 65535,
      },
    ],
    entry: "run.sh",
    activity: {
      ports: [{ port: 8080, label: "VS Code", protocol: "http" }],
      idleMinutes: 30,
    },
    timeout: 1800,
  },
  payload: [
    file(
      "run.sh",
      `#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

echo "[code-server] 安装依赖..."
apt-get update -qq
apt-get install -y -qq curl git ca-certificates >/dev/null

echo "[code-server] 下载 code-server..."
curl -fsSL https://github.com/coder/code-server/releases/latest/download/code-server-linux-amd64.tar.gz \\
  -o /tmp/code-server.tar.gz
mkdir -p /opt/code-server
tar -xzf /tmp/code-server.tar.gz -C /opt/code-server --strip-components=1
ln -sf /opt/code-server/bin/code-server /usr/local/bin/code-server
rm -f /tmp/code-server.tar.gz

# 预装扩展（可选）
if [ -n "{{extensions}}" ]; then
  echo "{{extensions}}" | while read -r ext; do
    [ -z "$ext" ] && continue
    echo "[code-server] 安装扩展 $ext"
    code-server --install-extension "$ext" || true
  done
fi

mkdir -p /root/.config/code-server /opt/ws
cat > /root/.config/code-server/config.yaml <<'CFG'
bind-addr: 0.0.0.0:{{port}}
auth: password
password: "{{password}}"
cert: false
CFG

echo "[code-server] 监听 0.0.0.0:{{port}}"
exec code-server --disable-telemetry /opt/ws
`,
      "0755",
    ),
  ],
};

// ──────────────────────── docker-image ────────────────────────

const dockerImage: BuiltinTemplate = {
  definition: {
    id: "docker-image",
    name: "Docker 镜像",
    description: "拉取任意镜像并以前台常驻方式运行",
    category: "container",
    icon: "container",
    tags: ["docker", "image"],
    params: [
      {
        key: "image",
        label: "镜像地址",
        type: "string",
        required: true,
        placeholder: "nginx:alpine",
      },
      {
        key: "command",
        label: "启动命令",
        type: "string",
        default: "",
        placeholder: "留空用镜像默认 CMD",
      },
      {
        key: "env",
        label: "环境变量",
        type: "text",
        default: "",
        placeholder: "每行一个 KEY=VALUE",
      },
      {
        key: "port",
        label: "暴露端口",
        type: "number",
        default: 8080,
        min: 1,
        max: 65535,
      },
    ],
    entry: "run.sh",
    activity: {
      ports: [{ port: 8080, label: "服务", protocol: "http" }],
      idleMinutes: 30,
    },
    timeout: 1800,
  },
  payload: [
    file(
      "run.sh",
      `#!/bin/bash
set -e

echo "[docker-image] 等待 Docker 就绪..."
for i in $(seq 1 60); do
  docker info >/dev/null 2>&1 && break
  sleep 2
done

echo "[docker-image] 拉取 {{image}}"
docker pull "{{image}}"

# 环境变量 → -e 参数
ENV_ARGS=()
if [ -n "{{env}}" ]; then
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    ENV_ARGS+=(-e "$line")
  done <<< "{{env}}"
fi

# 启动命令 → 拆成参数（留空则不覆盖 CMD）
CMD_ARGS=()
if [ -n "{{command}}" ]; then
  read -r -a CMD_ARGS <<< "{{command}}"
fi

echo "[docker-image] 启动容器（端口 {{port}}）"
exec docker run --rm --name ws-app \\
  -p "{{port}}:{{port}}" \\
  "\${ENV_ARGS[@]}" \\
  "{{image}}" "\${CMD_ARGS[@]}"
`,
      "0755",
    ),
  ],
};

// ────────────────────────── database ──────────────────────────

const database: BuiltinTemplate = {
  definition: {
    id: "database",
    name: "数据库",
    description: "PostgreSQL / MySQL / Redis 一键起库",
    category: "database",
    icon: "database",
    tags: ["postgres", "mysql", "redis"],
    params: [
      {
        key: "engine",
        label: "数据库",
        type: "select",
        default: "postgres",
        options: [
          { value: "postgres", label: "PostgreSQL 16" },
          { value: "mysql", label: "MySQL 8" },
          { value: "redis", label: "Redis 7" },
        ],
      },
      {
        key: "password",
        label: "密码",
        type: "string",
        default: "workspace",
      },
      {
        key: "database",
        label: "初始库名",
        type: "string",
        default: "app",
      },
    ],
    entry: "docker-compose.yml",
    activity: {
      ports: [
        { port: 5432, label: "PostgreSQL", protocol: "tcp" },
        { port: 3306, label: "MySQL", protocol: "tcp" },
        { port: 6379, label: "Redis", protocol: "tcp" },
      ],
      idleMinutes: 30,
    },
    timeout: 1800,
  },
  payload: [
    file(
      "docker-compose.yml",
      `# 数据库模板：只启动所选引擎，其余服务用 profiles 关掉。
# agent 以 \`docker compose up -d\` 拉起（entry = docker-compose.yml，§2.4）。
services:
  postgres:
    image: postgres:16-alpine
    profiles: ["postgres"]
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: "{{password}}"
      POSTGRES_DB: "{{database}}"
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  mysql:
    image: mysql:8
    profiles: ["mysql"]
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: "{{password}}"
      MYSQL_DATABASE: "{{database}}"
    ports:
      - "3306:3306"
    volumes:
      - mysqldata:/var/lib/mysql

  redis:
    image: redis:7-alpine
    profiles: ["redis"]
    restart: unless-stopped
    command: ["redis-server", "--requirepass", "{{password}}"]
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  mysqldata:
  redisdata:
`,
      "0644",
    ),
    file(
      "run.sh",
      `#!/bin/bash
# 按 {{engine}} 选择 profile 后交给 agent 的 compose 执行器。
# 注意：entry 是 docker-compose.yml，本脚本仅作参考/手工重启用。
set -e
PROFILE="{{engine}}"
echo "[database] 启动 $PROFILE"
exec docker compose --profile "$PROFILE" -f /opt/ws/docker-compose.yml up -d
`,
      "0755",
    ),
  ],
};

// ───────────────────────── compose-app ─────────────────────────

const composeApp: BuiltinTemplate = {
  definition: {
    id: "compose-app",
    name: "Docker Compose 应用",
    description: "自带 compose 编排文件，多容器一起拉起",
    category: "container",
    icon: "layers",
    tags: ["docker", "compose", "multi-container"],
    params: [
      {
        key: "appPort",
        label: "应用端口",
        type: "number",
        default: 3000,
        min: 1,
        max: 65535,
      },
      {
        key: "tag",
        label: "镜像标签",
        type: "string",
        default: "latest",
      },
    ],
    entry: "docker-compose.yml",
    activity: {
      ports: [
        { port: 3000, label: "App", protocol: "http" },
        { port: 5432, label: "DB", protocol: "tcp", private: true },
      ],
      idleMinutes: 30,
    },
    timeout: 1800,
  },
  payload: [
    file(
      "docker-compose.yml",
      `services:
  web:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "{{appPort}}:80"
    volumes:
      - ./html:/usr/share/nginx/html:ro

  # 示例后端服务，按需启用
  cache:
    image: redis:7-alpine
    restart: unless-stopped
    profiles: ["with-cache"]

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    profiles: ["with-db"]
    environment:
      POSTGRES_PASSWORD: workspace
      POSTGRES_DB: app
    ports:
      - "5432:5432"
    volumes:
      - dbdata:/var/lib/postgresql/data

volumes:
  dbdata:
`,
      "0644",
    ),
    file(
      "html/index.html",
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Compose App</title>
  </head>
  <body style="font-family: system-ui; display: grid; place-items: center; height: 100vh; margin: 0">
    <div style="text-align: center">
      <h1>Compose 应用已启动</h1>
      <p>把静态文件放进 <code>html/</code> 目录，或改 <code>docker-compose.yml</code> 挂载你自己的服务。</p>
    </div>
  </body>
</html>
`,
      "0644",
    ),
  ],
};

// ───────────────────────── static-site ─────────────────────────

const staticSite: BuiltinTemplate = {
  definition: {
    id: "static-site",
    name: "静态站点构建",
    description: "基于 DevContainer 的 Node 构建环境，克隆仓库并产出静态站",
    category: "web",
    icon: "globe",
    tags: ["node", "static", "devcontainer"],
    params: [
      {
        key: "repo",
        label: "Git 仓库",
        type: "string",
        required: true,
        placeholder: "https://github.com/me/site.git",
      },
      {
        key: "install",
        label: "安装命令",
        type: "string",
        default: "npm ci",
      },
      {
        key: "build",
        label: "构建命令",
        type: "string",
        default: "npm run build",
      },
      {
        key: "port",
        label: "预览端口",
        type: "number",
        default: 4321,
        min: 1024,
        max: 65535,
      },
    ],
    entry: ".devcontainer/devcontainer.json",
    activity: {
      ports: [{ port: 4321, label: "预览", protocol: "http" }],
      idleMinutes: 30,
    },
    timeout: 1800,
  },
  payload: [
    file(
      ".devcontainer/devcontainer.json",
      `{
  // DevContainer 模板：由 agent 执行 \`devcontainer up --workspace-folder\`（§2.4）。
  "name": "static-site",
  "image": "mcr.microsoft.com/devcontainers/javascript-node:20",
  "workspaceFolder": "/workspaces/site",
  "forwardPorts": [{{port}}],
  "postCreateCommand": "bash .devcontainer/setup.sh",
  "remoteUser": "node"
}
`,
      "0644",
    ),
    file(
      ".devcontainer/setup.sh",
      `#!/bin/bash
set -e

echo "[static-site] 拉取仓库 {{repo}}"
WORK=/workspaces/site
if [ -d "$WORK/.git" ]; then
  git -C "$WORK" pull --ff-only || true
else
  rm -rf "$WORK"
  git clone --depth 1 "{{repo}}" "$WORK"
fi

cd "$WORK"

echo "[static-site] 安装依赖：{{install}}"
{{install}}

echo "[static-site] 构建：{{build}}"
{{build}}

echo "[static-site] 启动预览（端口 {{port}}）"
exec npx --yes serve -s dist -l {{port}}
`,
      "0755",
    ),
  ],
};

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  blank,
  pythonScript,
  codeServer,
  dockerImage,
  database,
  composeApp,
  staticSite,
];

/** 按 id 取内置模板。 */
export function getBuiltinTemplate(id: string): BuiltinTemplate | null {
  return BUILTIN_TEMPLATES.find((t) => t.definition.id === id) ?? null;
}
