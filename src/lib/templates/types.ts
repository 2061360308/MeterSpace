/**
 * 模板元数据类型定义。
 *
 * 对应 docs/FINAL-PLAN.md 第 2 章（元数据 JSON Schema）与 §8.2（类型定义）。
 */

export type ParamType = "string" | "text" | "number" | "boolean" | "select";

export interface ParamOption {
  value: string;
  label: string;
}

export interface Param {
  /** {{key}} 引用名，^[a-zA-Z_][a-zA-Z0-9_]*$ */
  key: string;
  label: string;
  type: ParamType;
  default?: string | number | boolean;
  required?: boolean;
  /** string / text 用 */
  placeholder?: string;
  /** number 用 */
  min?: number;
  /** number 用 */
  max?: number;
  /** select 必填 */
  options?: ParamOption[];
}

export interface PortDecl {
  port: number;
  /** 默认 "端口 {port}" */
  label?: string;
  /** 默认 http */
  protocol?: "http" | "tcp";
  /** true = 不生成快捷按钮 */
  private?: boolean;
}

export interface ActivityConfig {
  ports?: PortDecl[];
  /** 默认 30 */
  idleMinutes?: number;
  /** 默认 30 */
  sampleIntervalSec?: number;
}

export type EntryKind = "command" | "devcontainer" | "compose";

export type TemplateCategory =
  | "container"
  | "web"
  | "database"
  | "dev-env"
  | "ai"
  | "toolchain"
  | "blank";

export interface Template {
  id: string;
  name: string;
  description?: string;
  category?: TemplateCategory;
  icon?: string;
  tags?: string[];
  params?: Param[];
  entry: string;
  activity?: ActivityConfig;
  /** 入口执行超时（秒），默认 1800，上限 3600 */
  timeout?: number;
}

/** 载荷中的单个文件（模板内联 / 工作区落库都用这个形状）。 */
export interface PayloadFile {
  /** 相对路径，如 run.sh / scripts/setup.py */
  path: string;
  content: string;
  /** 八进制字符串，如 "0755" */
  mode: string;
  size: number;
}

/** GET /api/instances/[id]/payload 的响应体。 */
export interface PayloadResponse {
  entry: string;
  /** 落盘根目录，如 /opt/ws */
  workspace: string;
  vars: Record<string, string>;
  files: PayloadFile[];
}

/** 默认值（分散在多处使用，集中定义避免漂移）。 */
export const DEFAULT_IDLE_MINUTES = 30;
export const DEFAULT_SAMPLE_INTERVAL_SEC = 30;
export const DEFAULT_ENTRY_TIMEOUT = 1800;
export const MAX_ENTRY_TIMEOUT = 3600;

/** 载荷限制（§3.3）。 */
export const MAX_FILE_SIZE = 128 * 1024; // 128 KB
export const MAX_TOTAL_SIZE = 2 * 1024 * 1024; // 2 MB
export const MAX_FILE_COUNT = 200;
export const MAX_PATH_DEPTH = 6;
export const PATH_CHARSET_RE = /^[A-Za-z0-9._/-]+$/;

/** 由 entry 文件名判定执行类型（§2.4）。 */
export function resolveEntryKind(entry: string): EntryKind {
  const lower = entry.toLowerCase();
  if (lower.endsWith(".json") && lower.includes("devcontainer")) {
    return "devcontainer";
  }
  if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "compose";
  if (lower.endsWith(".sh")) return "command";
  throw new Error(`无法识别的 entry: ${entry}`);
}

/** 描述 entry 类型的中文名，用于报错与日志。 */
export function entryKindLabel(kind: EntryKind): string {
  switch (kind) {
    case "command":
      return "命令脚本";
    case "devcontainer":
      return "DevContainer";
    case "compose":
      return "Docker Compose";
  }
}
