/**
 * 配方前端类型与请求封装（v3）。
 *
 * 与后端 `/api/recipes/*` 的响应形状一一对应；不写进 `/templates/*` 任何 URL。
 */

import type { Param, ActivityConfig, TemplateCategory } from "@/lib/templates/types";

export type { Param, ActivityConfig, TemplateCategory };

export type RecipeSource = "builtin" | "user" | "marketplace";

export interface RecipeSummary {
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
  source: RecipeSource;
  version: string;
  fileCount: number;
}

export interface RecipeDetail {
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
  source: RecipeSource;
  version: string;
  payload: { path: string; content: string; mode: string; size: number }[];
}

/**
 * 上传 zip → POST /api/recipes/upload 的返回形状。
 * 服务端只解析 + 校验，**不入库**，由前端持有 preview 再走 confirm。
 */
export interface RecipeUploadPreview {
  definition: import("@/lib/templates/types").Template;
  files: { path: string; content: string; mode: string; size: number }[];
  fileCount: number;
  totalSize: number;
}

export const SOURCE_LABEL: Record<RecipeSource, string> = {
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

/** GET /api/recipes */
export async function fetchRecipes(): Promise<RecipeSummary[]> {
  const res = await fetch("/api/recipes");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "加载配方失败");
  return data.recipes ?? [];
}

/** GET /api/recipes/[id] */
export async function fetchRecipe(id: string): Promise<RecipeDetail> {
  const res = await fetch(`/api/recipes/${encodeURIComponent(id)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "加载配方详情失败");
  return data as RecipeDetail;
}

/**
 * POST /api/recipes/upload（multipart zip）
 *
 * 服务端只解析 + 校验 + 返回 preview，**不入库**；前端接下来会跳到浏览确认页。
 */
export async function uploadRecipePreview(file: File): Promise<RecipeUploadPreview> {
  const fd = new FormData();
  fd.append("zip", file);
  const res = await fetch("/api/recipes/upload", { method: "POST", body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "上传解析失败");
  return data as RecipeUploadPreview;
}

/**
 * POST /api/recipes（确认落库）：承接 preview + （可选编辑后的）definition。
 * 返回创建出的配方 id。
 */
export async function confirmRecipeCreate(input: {
  definition: import("@/lib/templates/types").Template;
  payload: { path: string; content: string; mode: string; size: number }[];
}): Promise<{ id: string }> {
  const res = await fetch("/api/recipes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "保存配方失败");
  return data as { id: string };
}

/**
 * POST /api/recipes/[id]/use —— 输入 params → 服务器渲染占位符 → 创建 launch_templates → 返回新 id。
 */
export async function applyRecipe(
  id: string,
  params: Record<string, unknown>,
): Promise<{ launchTemplateId: string }> {
  const res = await fetch(`/api/recipes/${encodeURIComponent(id)}/use`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "使用配方失败");
  return data as { launchTemplateId: string };
}

/** DELETE /api/recipes/[id] */
export async function deleteRecipe(id: string): Promise<void> {
  const res = await fetch(`/api/recipes/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "删除失败");
}
