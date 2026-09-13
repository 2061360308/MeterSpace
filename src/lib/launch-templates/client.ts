/**
 * 启动模板前端类型与请求封装（v3）。
 *
 * 与后端 `/api/launch-templates/*` 的响应形状一一对应。
 */

import type { ActivityConfig, TemplateCategory } from "@/lib/templates/types";

export type { ActivityConfig, TemplateCategory };

export interface LaunchTemplateSummary {
  id: string;
  name: string;
  description: string | null;
  category: TemplateCategory | null;
  icon: string | null;
  tags: string[];
  entry: string;
  /** 启动模板永远无 params，但前端用同一形状避免漂移。 */
  params: never[];
  activity: ActivityConfig | null;
  timeout: number | null;
  version: string;
  fileCount: number;
  /** 审计来源 */
  originKind: "recipe" | "upload" | "migration";
  originRecipeId: string | null;
}

export interface LaunchTemplateDetail {
  id: string;
  name: string;
  description: string | null;
  category: TemplateCategory | null;
  icon: string | null;
  tags: string[];
  entry: string;
  params: never[];
  activity: ActivityConfig | null;
  timeout: number | null;
  version: string;
  payload: { path: string; content: string; mode: string; size: number }[];
  originKind: string;
  originRecipeId: string | null;
}

/**
 * 上传 zip → POST /api/launch-templates/upload 返回的 preview 形状。
 * 服务端只解析 + 校验，**不入库**，由前端持有 preview 再走 confirm。
 *
 * 额外约束：上传 launch template 时，`payload` 不能含 `{{xxx}}` 占位符；
 * 若带占位符，preview 标记 `hasPlaceholders=true` 让前端拦截并提示「应去上传配方」。
 */
export interface LaunchTemplateUploadPreview {
  definition: import("@/lib/templates/types").Template;
  files: { path: string; content: string; mode: string; size: number }[];
  fileCount: number;
  totalSize: number;
  hasPlaceholders: boolean;
  placeholderKeys: string[];
}

export const CATEGORY_LABEL: Record<string, string> = {
  container: "容器",
  web: "Web",
  database: "数据库",
  "dev-env": "开发环境",
  ai: "AI",
  toolchain: "工具链",
  blank: "空白",
};

export const ORIGIN_LABEL: Record<LaunchTemplateSummary["originKind"], string> = {
  recipe: "从配方",
  upload: "直接上传",
  migration: "数据迁移",
};

/** 由 entry 文件名给出人类可读的执行类型标签。 */
export function entryKindLabel(entry: string): string {
  const lower = entry.toLowerCase();
  if (lower.endsWith(".json") && lower.includes("devcontainer")) return "DevContainer";
  if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "Compose";
  if (lower.endsWith(".sh")) return "脚本";
  return "未知";
}

/** GET /api/launch-templates */
export async function fetchLaunchTemplates(): Promise<LaunchTemplateSummary[]> {
  const res = await fetch("/api/launch-templates");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "加载启动模板失败");
  return data.launchTemplates ?? [];
}

/** GET /api/launch-templates/[id] */
export async function fetchLaunchTemplate(id: string): Promise<LaunchTemplateDetail> {
  const res = await fetch(`/api/launch-templates/${encodeURIComponent(id)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "加载启动模板详情失败");
  return data as LaunchTemplateDetail;
}

/**
 * POST /api/launch-templates/upload（multipart zip）
 *
 * 服务端只解析 + 校验 + 返回 preview，**不入库**。
 * 若上传的 zip 含 `{{xxx}}` 占位符，会被服务端转去 `/recipes/upload`，前端看到
 * `hasPlaceholders=true` 时应主动引导用户改去配方上传。
 */
export async function uploadLaunchTemplatePreview(
  file: File,
): Promise<LaunchTemplateUploadPreview> {
  const fd = new FormData();
  fd.append("zip", file);
  const res = await fetch("/api/launch-templates/upload", {
    method: "POST",
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "上传解析失败");
  return data as LaunchTemplateUploadPreview;
}

/**
 * POST /api/launch-templates（确认落库）
 */
export async function confirmLaunchTemplateCreate(input: {
  definition: import("@/lib/templates/types").Template;
  payload: { path: string; content: string; mode: string; size: number }[];
}): Promise<{ id: string }> {
  const res = await fetch("/api/launch-templates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "保存启动模板失败");
  return data as { id: string };
}

/** DELETE /api/launch-templates/[id] */
export async function deleteLaunchTemplate(id: string): Promise<void> {
  const res = await fetch(`/api/launch-templates/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "删除失败");
}
