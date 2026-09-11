/**
 * 模板相关的前端共享类型与请求封装（阶段 F）。
 *
 * 与后端 `/api/templates` 的响应形状一一对应；放在 here 而不是各页面内联，
 * 避免列表页 / 详情页 / 编辑页三处类型漂移。
 */

import type { Param, ActivityConfig, TemplateCategory } from "./types";

export type { Param, ActivityConfig, TemplateCategory };

export type TemplateSource = "builtin" | "user" | "marketplace";

export interface TemplateSummary {
  id: string;
  name: string;
  description: string | null;
  category: TemplateCategory | null;
  icon: string | null;
  tags: string[];
  entry: string;
  params: Param[];
  activity: ActivityConfig | null;
  timeout: number | null;
  source: TemplateSource;
  version: string;
  fileCount: number;
}

export interface TemplateDetail {
  id: string;
  name: string;
  description: string | null;
  category: TemplateCategory | null;
  icon: string | null;
  tags: string[];
  entry: string;
  params: Param[];
  activity: ActivityConfig | null;
  timeout: number | null;
  source: TemplateSource;
  version: string;
  payload: { path: string; content: string; mode: string; size: number }[];
}

export const SOURCE_LABEL: Record<TemplateSource, string> = {
  builtin: "内置",
  marketplace: "市场",
  user: "我的",
};

export const CATEGORY_LABEL: Record<string, string> = {
  container: "容器",
  web: "Web",
  database: "数据库",
  "dev-env": "开发环境",
  ai: "AI",
  toolchain: "工具链",
  blank: "空白",
};

/** 由 entry 文件名给出人类可读的执行类型标签（与后端 resolveEntryKind 同源语义）。 */
export function entryKindLabel(entry: string): string {
  const lower = entry.toLowerCase();
  if (lower.endsWith(".json") && lower.includes("devcontainer")) return "DevContainer";
  if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "Compose";
  if (lower.endsWith(".sh")) return "脚本";
  return "未知";
}

/** GET /api/templates */
export async function fetchTemplates(): Promise<TemplateSummary[]> {
  const res = await fetch("/api/templates");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "加载模板失败");
  return data.templates ?? [];
}
