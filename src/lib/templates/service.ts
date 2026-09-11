/**
 * 模板服务：内置 / 用户自建 / 市场 三源合并与查找（§9）。
 *
 * 优先级（同 id 时后者覆盖前者）：
 *   市场 → 内置 → 用户自建
 * 用户自建允许覆盖内置同名模板（便于本地调试）。
 */

import { and, eq, or, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { templates } from "@/lib/db/schema";
import {
  BUILTIN_TEMPLATES,
  getBuiltinTemplate,
} from "./builtin";
import { parseTemplateDefinition } from "./validate";
import { getMarketplaceTemplates } from "@/lib/marketplace/client";
import type { Template, PayloadFile } from "./types";

export type TemplateSource = "builtin" | "user" | "marketplace";

export interface ResolvedTemplate {
  definition: Template;
  payload: PayloadFile[];
  source: TemplateSource;
  version: string;
  /** 数据库中的行 id（内置模板为 null） */
  rowId: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

interface TemplateRow {
  id: string;
  userId: string | null;
  name: string;
  definition: unknown;
  payload: unknown;
  version: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

function rowToResolved(row: TemplateRow): ResolvedTemplate | null {
  let def: Template;
  try {
    def = parseTemplateDefinition(row.definition);
  } catch (e) {
    // 库里的历史脏数据不应让整个列表接口挂掉
    console.warn(`[templates] 跳过非法定义 id=${row.id}:`, e);
    return null;
  }
  const payload = Array.isArray(row.payload) ? (row.payload as PayloadFile[]) : [];
  return {
    definition: def,
    payload,
    source: "user",
    version: row.version ?? "1",
    rowId: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * 列出该用户可见的全部模板。
 *
 * 三个来源，优先级由低到高（同 id 后者覆盖前者）：
 *   内置(builtin) → 市场(marketplace) → 用户自建/平台级(user)
 * 用户自建放最后，便于用同名 id 覆盖内置做本地调试。
 */
export async function listTemplates(userId: string): Promise<ResolvedTemplate[]> {
  const rows = await db
    .select()
    .from(templates)
    .where(or(eq(templates.userId, userId), isNull(templates.userId)));

  const map = new Map<string, ResolvedTemplate>();

  // 1) 内置（最低优先级）
  for (const b of BUILTIN_TEMPLATES) {
    map.set(b.definition.id, {
      definition: b.definition,
      payload: b.payload,
      source: "builtin",
      version: "1",
      rowId: null,
    });
  }

  // 2) 市场模板（可选增强，拉取失败静默跳过）
  const market = await getMarketplaceTemplates();
  for (const m of market) {
    let def: Template;
    try {
      def = parseTemplateDefinition(m.definition);
    } catch (e) {
      // 市场里的脏条目不能污染整个列表
      console.warn(`[templates] 跳过非法市场模板 id=${m.id}:`, e);
      continue;
    }
    map.set(def.id, {
      definition: def,
      payload: m.payload as PayloadFile[],
      source: "marketplace",
      version: m.version,
      rowId: null,
    });
  }

  // 3) 用户自建 / 平台级 DB 模板（最高优先级）
  for (const row of rows as TemplateRow[]) {
    const r = rowToResolved(row);
    if (r) map.set(r.definition.id, r);
  }

  return Array.from(map.values()).sort((a, b) =>
    a.definition.name.localeCompare(b.definition.name, "zh-Hans-CN"),
  );
}

/** 取单个模板（含载荷）。用户自建优先于内置。 */
export async function getTemplate(
  userId: string,
  id: string,
): Promise<ResolvedTemplate | null> {
  // 用户自建 / 平台级优先
  const row = await db.query.templates.findFirst({
    where: and(eq(templates.id, id), or(eq(templates.userId, userId), isNull(templates.userId))),
  });
  if (row) {
    const r = rowToResolved(row as TemplateRow);
    if (r) return r;
  }

  const b = getBuiltinTemplate(id);
  if (b) {
    return {
      definition: b.definition,
      payload: b.payload,
      source: "builtin",
      version: "1",
      rowId: null,
    };
  }

  // 最后兜底到市场（未落库的市场模板也能直接被实例化）
  const market = await getMarketplaceTemplates();
  const m = market.find((t) => t.id === id);
  if (m) {
    try {
      return {
        definition: parseTemplateDefinition(m.definition),
        payload: m.payload as PayloadFile[],
        source: "marketplace",
        version: m.version,
        rowId: null,
      };
    } catch (e) {
      console.warn(`[templates] 市场模板 ${id} 定义非法:`, e);
    }
  }

  return null;
}

/** upsert 用户自建模板（元数据 + 载荷）。 */
export async function upsertUserTemplate(
  userId: string,
  definition: Template,
  payload: PayloadFile[],
): Promise<ResolvedTemplate> {
  const existing = await db.query.templates.findFirst({
    where: eq(templates.id, definition.id),
  });

  if (existing && existing.userId && existing.userId !== userId) {
    const err = new Error(`模板 id 已被占用: ${definition.id}`) as Error & {
      status?: number;
    };
    err.status = 409;
    throw err;
  }

  const now = new Date();
  if (existing) {
    const [updated] = await db
      .update(templates)
      .set({
        name: definition.name,
        definition: definition as unknown as Record<string, unknown>,
        payload,
        updatedAt: now,
      })
      .where(eq(templates.id, definition.id))
      .returning();
    return rowToResolved(updated as TemplateRow)!;
  }

  const [created] = await db
    .insert(templates)
    .values({
      id: definition.id,
      userId,
      name: definition.name,
      definition: definition as unknown as Record<string, unknown>,
      payload,
      version: "1",
    })
    .returning();
  return rowToResolved(created as TemplateRow)!;
}

/** 删除用户自建模板（内置不可删）。 */
export async function deleteUserTemplate(
  userId: string,
  id: string,
): Promise<boolean> {
  const res = await db
    .delete(templates)
    .where(and(eq(templates.id, id), eq(templates.userId, userId)))
    .returning({ id: templates.id });
  return res.length > 0;
}
