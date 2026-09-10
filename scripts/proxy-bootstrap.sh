#!/bin/bash
# =============================================================================
# 网络引导：出口代理 + 连通性智能切换（在 ECS 启动主安装前执行）
#
# 由后端 /api/instance-scripts/startup 渲染占位符后内联进 startup.sh。
# 三类输入：
#   NET_MODE=disabled                    直连（仅归一化 apt 国内源）
#   NET_MODE=clash                       Clash 系内核（订阅 / YAML），mixed-port 代理
#   NET_MODE=upstream                    用户自备 http/socks5 上游代理
#
# 规则：
#   1) 先做直连连通测试（境外端点 list），全部可达 → 无需代理，直接继续；
#   2) 有不可达 → 按模式拉起代理，写系统级配置（env/apt/docker/git/devcontainer）；
#   3) 代理拉起后做复测并输出 [proxy] 报告（进入 instanceLogs 供面板查看）；
#   4) 任何一步失败 → 降级直连继续，绝不让启动脚本整体失败。
#
# 整体包在一个函数内：跳过逻辑用 return，export 的环境变量在函数返回后仍对
# 调用 shell（startup.sh）生效。
# =============================================================================

ws_network_bootstrap() {

ws_log() { echo "[proxy] $*"; }

# --- 由后端注入的配置（base64 防引号/换行问题） ---
NET_MODE='{{NET_MODE}}'
CLASH_SUBSCRIPTION_B64='{{CLASH_SUBSCRIPTION_B64}}'
CLASH_YAML_B64='{{CLASH_YAML_B64}}'
UPSTREAM_URL_B64='{{UPSTREAM_URL_B64}}'
UPSTREAM_USERNAME_B64='{{UPSTREAM_USERNAME_B64}}'
UPSTREAM_SECRET_B64='{{UPSTREAM_SECRET_B64}}'
CLASH_BIN_FALLBACK_B64='{{CLASH_BIN_FALLBACK_B64}}'
PLATFORM_BASE='{{PLATFORM_BASE}}'
PLATFORM_HOST='{{PLATFORM_HOST}}'
PROXY_PROBE_URLS=({{PROXY_PROBE_URLS_ARR}})
PROXY_BYPASS=({{PROXY_BYPASS_ARR}})
CLASH_PORT={{CLASH_PORT}}

b64() { (echo -n "$1" | base64 -d) 2>/dev/null || echo ""; }

CLASH_SUBSCRIPTION=$(b64 "$CLASH_SUBSCRIPTION_B64")
CLASH_YAML=$(b64 "$CLASH_YAML_B64")
UPSTREAM_URL=$(b64 "$UPSTREAM_URL_B64")
UPSTREAM_USERNAME=$(b64 "$UPSTREAM_USERNAME_B64")
UPSTREAM_SECRET=$(b64 "$UPSTREAM_SECRET_B64")
CLASH_BIN_FALLBACK=$(b64 "$CLASH_BIN_FALLBACK_B64")

ws_log "mode=${NET_MODE} proxy-port=${CLASH_PORT} probes=${#PROXY_PROBE_URLS[@]}"

# ---------------------------------------------------------------------------
# 0. apt 国内源归一（无论是否代理都执行，保证 apt 稳定快速）
# ---------------------------------------------------------------------------
ws_apt_mirror() {
  if [ -f /etc/debian_version ]; then
    local suite="bookworm"
    case "$(cat /etc/debian_version)" in
      12*|bookworm*) suite="bookworm" ;;
      11*|bullseye*) suite="bullseye" ;;
      10*|buster*) suite="buster" ;;
    esac
    rm -f /etc/apt/sources.list.d/*.sources 2>/dev/null || true
    cat > /etc/apt/sources.list.d/aliyun.sources <<SRCEOF
Types: deb
URIs: http://mirrors.aliyun.com/debian
Suites: ${suite} ${suite}-updates ${suite}-backports
Components: main contrib non-free non-free-firmware
Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg
SRCEOF
    sed -i 's/^deb\b/#deb/; s/^Types: *deb/#Types: deb/' /etc/apt/sources.list 2>/dev/null || true
    ws_log "apt sources -> mirrors.aliyun.com (${suite})"
  fi
}
ws_apt_mirror

# --- 确保 curl 可用（基镜像可能未预装）---
if ! command -v curl >/dev/null 2>&1; then
  (apt-get update -qq && apt-get install -y -qq curl) >/dev/null 2>&1 || true
fi

# ---------------------------------------------------------------------------
# 1. 直连探测 —— 境外端点全部可达则直连（国内网络/海外地域都不需要代理）
# ---------------------------------------------------------------------------
WS_BLOCKED=0
for u in "${PROXY_PROBE_URLS[@]}"; do
  if [ -z "$u" ]; then continue; fi
  if curl -sI -o /dev/null --connect-timeout 4 --max-time 8 "$u" 2>/dev/null; then
    ws_log "direct probe ${u} = ok"
  else
    WS_BLOCKED=1
    ws_log "direct probe ${u} = fail"
  fi
done

if [ "$NET_MODE" = "disabled" ] || [ "$WS_BLOCKED" = "0" ]; then
  if [ "$NET_MODE" = "disabled" ]; then
    ws_log "mode=disabled, skip proxy (direct)"
  else
    ws_log "direct connectivity fine, skip proxy (smart switch)"
  fi
  WS_PROXY=""
  return 0
fi

ws_log "detected blocked overseas endpoints, enabling proxy (mode=${NET_MODE})"

# ---------------------------------------------------------------------------
# 2. 拉起代理
# ---------------------------------------------------------------------------
WS_PROXY=""
WS_NO_PROXY_NORM="$(IFS=,; echo "${PROXY_BYPASS[*]}"),${PLATFORM_HOST},.aliyuncs.com"
# 去重
WS_NO_PROXY=""
for d in $(echo "$WS_NO_PROXY_NORM" | tr ',' ' '); do
  case ",${WS_NO_PROXY}," in
    *",${d},"*) : ;;
    *) WS_NO_PROXY="${WS_NO_PROXY:+${WS_NO_PROXY},}${d}" ;;
  esac
done

if [ "$NET_MODE" = "upstream" ]; then
  if [ -z "$UPSTREAM_URL" ]; then
    ws_log "upstream url is empty, degrade to direct"
  else
    if [ -n "$UPSTREAM_USERNAME" ]; then
      WS_PROXY="${UPSTREAM_URL/:\/\//://${UPSTREAM_USERNAME}:${UPSTREAM_SECRET}@}"
    else
      WS_PROXY="$UPSTREAM_URL"
    fi
    ws_log "upstream proxy = ${WS_PROXY}"
  fi
elif [ "$NET_MODE" = "clash" ]; then
  # 2a. 获取配置
  mkdir -p /etc/clash
  if [ -n "$CLASH_SUBSCRIPTION" ]; then
    if curl -fsSL --connect-timeout 10 --max-time 60 -o /etc/clash/config.yaml "$CLASH_SUBSCRIPTION" 2>/dev/null; then
      ws_log "clash config fetched from subscription"
    else
      ws_log "subscription fetch failed, degrade to direct"
      CLASH_SUBSCRIPTION=""
    fi
  fi
  if [ -z "$CLASH_SUBSCRIPTION" ] && [ -n "$CLASH_YAML" ]; then
    echo "$CLASH_YAML" > /etc/clash/config.yaml
    ws_log "clash config from pasted YAML"
  fi
  if [ -s /etc/clash/config.yaml ]; then
    # 强制关键设置（先删旧键避免重复，再在文件头部插入）
    sed -i '/^\(###\? \)\?\(mixed-port\|port\|socks-port\|allow-lan\|external-controller\|log-level\):/d' /etc/clash/config.yaml 2>/dev/null || true
    sed -i '1i mixed-port: '"${CLASH_PORT}"'\nallow-lan: true\nexternal-controller: 127.0.0.1:9090\nlog-level: info\n' /etc/clash/config.yaml 2>/dev/null || true

    # 2b. 获取内核（平台 public/ 优先，其次用户配置 URL）
    ARCH=$(uname -m)
    case "$ARCH" in
      x86_64)  CLASH_ARCH="amd64" ;;
      aarch64) CLASH_ARCH="arm64" ;;
      *)       CLASH_ARCH="" ;;
    esac
    CLASH_BIN="/usr/local/bin/clash"
    CLASH_DL_OK=0
    if [ -n "${PLATFORM_BASE}" ] && [ -n "$CLASH_ARCH" ]; then
      for i in 1 2 3; do
        if curl -fsSL --retry 2 --connect-timeout 8 --max-time 120 -o "$CLASH_BIN" "${PLATFORM_BASE}/clash-linux-${CLASH_ARCH}"; then
          CLASH_DL_OK=1
          ws_log "clash kernel downloaded from platform (${CLASH_ARCH})"
          break
        fi
        sleep 3
      done
    fi
    if [ "$CLASH_DL_OK" = "0" ] && [ -n "$CLASH_BIN_FALLBACK" ] && [ -n "$CLASH_ARCH" ]; then
      if curl -fsSL --retry 2 --connect-timeout 8 --max-time 180 -o "$CLASH_BIN" "$CLASH_BIN_FALLBACK"; then
        CLASH_DL_OK=1
        ws_log "clash kernel downloaded from fallback URL"
      fi
    fi
    if [ "$CLASH_DL_OK" = "1" ]; then
      chmod +x "$CLASH_BIN"
      if "$CLASH_BIN" -t -d /etc/clash -f /etc/clash/config.yaml >/dev/null 2>&1; then
        ws_log "clash config valid, starting..."
        nohup "$CLASH_BIN" -d /etc/clash -f /etc/clash/config.yaml >/var/log/clash.log 2>&1 &
        for i in $(seq 1 15); do
          if (echo > "/dev/tcp/127.0.0.1/${CLASH_PORT}") 2>/dev/null; then
            WS_PROXY="http://127.0.0.1:${CLASH_PORT}"
            ws_log "clash listening on 127.0.0.1:${CLASH_PORT}"
            break
          fi
          sleep 1
        done
        if [ -z "$WS_PROXY" ]; then
          ws_log "clash failed to start (see /var/log/clash.log), degrade to direct"
        fi
      else
        ws_log "clash config test failed, degrade to direct"
      fi
    else
      ws_log "clash kernel unavailable (place in public/clash-linux-${CLASH_ARCH} or set clash_bin_url), degrade to direct"
    fi
  else
    ws_log "no clash config provided, degrade to direct"
  fi
else
  ws_log "unknown mode '${NET_MODE}', degrade to direct"
fi

# ---------------------------------------------------------------------------
# 3. 代理生效：当前 shell + 系统级配置（apt/docker/git/devcontainer 后续步骤生效）
# ---------------------------------------------------------------------------
if [ -n "$WS_PROXY" ]; then
  export http_proxy="$WS_PROXY" https_proxy="$WS_PROXY" all_proxy="$WS_PROXY"
  export HTTP_PROXY="$WS_PROXY" HTTPS_PROXY="$WS_PROXY" ALL_PROXY="$WS_PROXY"
  export no_proxy="$WS_NO_PROXY" NO_PROXY="$WS_NO_PROXY"
  ws_log "proxy exported to current shell (no_proxy=${WS_NO_PROXY})"

  sed -i '/^\(###\? \)\?\(http-proxy\|https-proxy\):/d' /etc/profile.d/ws-proxy.sh 2>/dev/null || true
  mkdir -p /etc/profile.d
  cat > /etc/profile.d/ws-proxy.sh <<PROFYEOF
export http_proxy='${WS_PROXY}' https_proxy='${WS_PROXY}' all_proxy='${WS_PROXY}'
export HTTP_PROXY='${WS_PROXY}' HTTPS_PROXY='${WS_PROXY}' ALL_PROXY='${WS_PROXY}'
export no_proxy='${WS_NO_PROXY}' NO_PROXY='${WS_NO_PROXY}'
PROFYEOF
  chmod +x /etc/profile.d/ws-proxy.sh 2>/dev/null || true

  mkdir -p /etc/systemd/system/docker.service.d
  cat > /etc/systemd/system/docker.service.d/http-proxy.conf <<DOCKEREOF
[Service]
Environment="HTTP_PROXY=${WS_PROXY}" "HTTPS_PROXY=${WS_PROXY}" "NO_PROXY=${WS_NO_PROXY}" "no_proxy=${WS_NO_PROXY}"
DOCKEREOF

  mkdir -p /root/.docker
  cat > /root/.docker/config.json <<DOCKERCFGEOF
{
  "proxies": {
    "default": {
      "httpProxy": "${WS_PROXY}",
      "httpsProxy": "${WS_PROXY}",
      "noProxy": "${WS_NO_PROXY}"
    }
  }
}
DOCKERCFGEOF

  if command -v git >/dev/null 2>&1; then
    git config --global --replace-all http.proxy "$WS_PROXY" 2>/dev/null || true
    git config --global --replace-all https.proxy "$WS_PROXY" 2>/dev/null || true
  fi

  for u in "${PROXY_PROBE_URLS[@]}"; do
    if [ -z "$u" ]; then continue; fi
    if curl -sI -o /dev/null --connect-timeout 6 --max-time 12 -x "$WS_PROXY" "$u" 2>/dev/null; then
      ws_log "proxied probe ${u} = ok"
    else
      ws_log "proxied probe ${u} = fail"
    fi
  done
  ws_log "network bootstrap complete (proxy active)"
else
  ws_log "proxy not active, continuing direct"
fi

export WS_PROXY
return 0
}

ws_network_bootstrap