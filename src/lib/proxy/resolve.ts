import type { Settings } from "@/lib/db/schema";

export type ProxyMode = "disabled" | "clash" | "upstream";
export type WorkspaceProxyMode = "inherit" | ProxyMode;

/** Clash 内核本地监听的 mixed-port（引导脚本与其保持一致）。 */
export const CLASH_LOCAL_PORT = 7890;

export const PROXY_MODES: { id: ProxyMode; label: string }[] = [
  { id: "disabled", label: "关闭" },
  { id: "clash", label: "Clash 订阅 / 配置" },
  { id: "upstream", label: "上游代理直连" },
];

/** 默认连通性探测端点（境外，任一不可达即判定需要代理）。 */
export const DEFAULT_PROBE_URLS: string[] = [
  "https://github.com",
  "https://registry-1.docker.io",
  "https://registry.npmjs.org",
  "https://cdn.jsdelivr.net",
  "https://raw.githubusercontent.com",
  "https://code-server.dev",
  "https://deb.nodesource.com",
];

/** 默认 no_proxy 白名单（国内/内网/本机不需走代理）。 */
export const DEFAULT_BYPASS: string[] = [
  "127.0.0.1",
  "localhost",
  "100.100.100.200",
  ".aliyuncs.com",
  ".cn",
  ".cnb.cool",
];

export type ProxyRow = Pick<
  Settings,
  | "proxyMode"
  | "proxyClashSubscription"
  | "proxyClashYaml"
  | "proxyUpstreamUrl"
  | "proxyUpstreamUsername"
  | "proxyUpstreamSecret"
  | "proxyProbeUrls"
  | "proxyBypass"
  | "clashBinUrl"
>;

export interface ProxyConfig {
  mode: ProxyMode;
  clashSubscription: string | null;
  clashYaml: string | null;
  upstreamUrl: string | null;
  upstreamUsername: string | null;
  upstreamSecret: string | null;
  /** 合并全局 + 工作区（工作区非 inherit 时优先）。 */
  probeUrls: string[];
  bypass: string[];
  clashBinUrl: string | null;
}

export type WorkspaceProxyRow = Pick<
  Settings,
  | "proxyMode"
  | "proxyClashSubscription"
  | "proxyClashYaml"
  | "proxyUpstreamUrl"
  | "proxyUpstreamUsername"
  | "proxyUpstreamSecret"
>;

const GLOBAL_PROXY_KEYS: (keyof Settings)[] = [
  "proxyMode",
  "proxyClashSubscription",
  "proxyClashYaml",
  "proxyUpstreamUrl",
  "proxyUpstreamUsername",
  "proxyUpstreamSecret",
  "clashBinUrl",
];

export function toWorkspaceProxyRow(s: Settings): WorkspaceProxyRow {
  return {
    proxyMode: "inherit",
    proxyClashSubscription: s.proxyClashSubscription,
    proxyClashYaml: s.proxyClashYaml,
    proxyUpstreamUrl: s.proxyUpstreamUrl,
    proxyUpstreamUsername: s.proxyUpstreamUsername,
    proxyUpstreamSecret: s.proxyUpstreamSecret,
  };
}

/**
 * Resolve the effective proxy configuration for a workspace start.
 * Workspace override wins only for the fields it actually sets;
 * everything else falls back to the global settings.
 */
export function resolveProxyConfig(
  settings: Settings | null,
  workspace?: {
    proxyMode?: string | null;
    proxyClashSubscription?: string | null;
    proxyClashYaml?: string | null;
    proxyUpstreamUrl?: string | null;
    proxyUpstreamUsername?: string | null;
    proxyUpstreamSecret?: string | null;
  } | null,
): ProxyConfig {
  const wsMode: WorkspaceProxyMode =
    (workspace?.proxyMode as WorkspaceProxyMode) ?? "inherit";

  const inherit = wsMode === "inherit" || !wsMode;

  if (!settings) {
    const mode: ProxyMode =
      wsMode === "inherit" || wsMode === undefined ? "disabled" : wsMode;
    return {
      mode,
      clashSubscription: inherit ? null : (workspace?.proxyClashSubscription ?? null),
      clashYaml: inherit ? null : (workspace?.proxyClashYaml ?? null),
      upstreamUrl: inherit ? null : (workspace?.proxyUpstreamUrl ?? null),
      upstreamUsername: inherit ? null : (workspace?.proxyUpstreamUsername ?? null),
      upstreamSecret: inherit ? null : (workspace?.proxyUpstreamSecret ?? null),
      probeUrls: DEFAULT_PROBE_URLS,
      bypass: DEFAULT_BYPASS,
      clashBinUrl: null,
    };
  }

  const effective: Settings = {
    ...settings,
    // 工作区覆盖时逐字段取值
    proxyMode: inherit ? settings.proxyMode : wsMode,
    proxyClashSubscription:
      inherit || workspace?.proxyClashSubscription == null
        ? settings.proxyClashSubscription
        : workspace.proxyClashSubscription,
    proxyClashYaml:
      inherit || workspace?.proxyClashYaml == null
        ? settings.proxyClashYaml
        : workspace.proxyClashYaml,
    proxyUpstreamUrl:
      inherit || workspace?.proxyUpstreamUrl == null
        ? settings.proxyUpstreamUrl
        : workspace.proxyUpstreamUrl,
    proxyUpstreamUsername:
      inherit || workspace?.proxyUpstreamUsername == null
        ? settings.proxyUpstreamUsername
        : workspace.proxyUpstreamUsername,
    proxyUpstreamSecret:
      inherit || workspace?.proxyUpstreamSecret == null
        ? settings.proxyUpstreamSecret
        : workspace.proxyUpstreamSecret,
  };

  const probeUrls = Array.isArray(effective.proxyProbeUrls)
    ? effective.proxyProbeUrls
    : [];
  const bypass = Array.isArray(effective.proxyBypass)
    ? effective.proxyBypass
    : [];

  return {
    mode: (effective.proxyMode as ProxyMode) ?? "disabled",
    clashSubscription: effective.proxyClashSubscription ?? null,
    clashYaml: effective.proxyClashYaml ?? null,
    upstreamUrl: effective.proxyUpstreamUrl ?? null,
    upstreamUsername: effective.proxyUpstreamUsername ?? null,
    upstreamSecret: effective.proxyUpstreamSecret ?? null,
    probeUrls:
      probeUrls.length > 0 ? probeUrls : DEFAULT_PROBE_URLS,
    bypass:
      bypass.length > 0 ? bypass : DEFAULT_BYPASS,
    clashBinUrl: effective.clashBinUrl ?? null,
  };
}

/** 供设置页校验/回显用的字段名集合。 */
export function settingsProxyKeys(): (keyof Settings)[] {
  return GLOBAL_PROXY_KEYS as (keyof Settings)[];
}