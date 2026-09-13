/**
 * 配方服务（§9 拆表后的 v3 实现）。
 *
 * 三源合并：内置 → 市场 → 用户自建（DB 中的 recipes 表）。
 * 内置 / 市场的来源在 `BUILTIN_TEMPLATES` 与 `getMarketplaceTemplates()`，
 * 都不入库；用户上传的落 `recipes` 表（user_id 非空）。
 *
 * 与 v1 不同：**不**再 fork 到「launch」——fork 的概念被「使用」流程取代：
 *   POST /api/recipes/[id]/use → 系统渲染占位符 → 落 `launch_templates` 行。
 */

import { and, eq, or, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { recipes } from "@/lib/db/schema";
import {
  BUILTIN_TEMPLATES,
  getBuiltinTemplate,
} from "@/lib/templates/builtin";
import { parseTemplateDefinition } from "@/lib/templates/validate";
import { getMarketplaceTemplates } from "@/lib/marketplace/client";
import type { Template, PayloadFile } from "@/lib/templates/types";

export type RecipeSource = "builtin" | "user" | "marketplace";

export interface ResolvedRecipe {
  definition: Template;
  payload: PayloadFile[];
  source: RecipeSource;
  version: string;
  /** DB 行 id（内置 / 市场为 null） */
  rowId: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

interface RecipeRow {
  id: string;
  userId: string | null;
  name: string;
  definition: unknown;
  payload: unknown;
  version: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

function rowToResolved(row: RecipeRow): ResolvedRecipe | null {
  let def: Template;
  try {
    def = parseTemplateDefinition(row.definition);
  } catch (e) {
    console.warn(`[recipes] 跳过非法定义 id=${row.id}:`, e);
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
 * 列出该用户可见的全部配方。
 *
 * 优先级（同 id 后者覆盖前者）：
 *   builtin → marketplace → user
 * 用户自建放最后，便于用同名 id 覆盖内置做本地调试。
 */
export async function listRecipes(userId: string): Promise<ResolvedRecipe[]> {
  const rows = await db
    .select()
    .from(recipes)
    .where(or(eq(recipes.userId, userId), isNull(recipes.userId)));

  const map = new Map<string, ResolvedRecipe>();

  for (const b of BUILTIN_TEMPLATES) {
    map.set(b.definition.id, {
      definition: b.definition,
      payload: b.payload,
      source: "builtin",
      version: "1",
      rowId: null,
    });
  }

  const market = await getMarketplaceTemplates();
  for (const m of market) {
    let def: Template;
    try {
      def = parseTemplateDefinition(m.definition);
    } catch (e) {
      console.warn(`[recipes] 跳过非法市场配方 id=${m.id}:`, e);
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

  for (const row of rows as RecipeRow[]) {
    const r = rowToResolved(row);
    if (r) map.set(r.definition.id, r);
  }

  return Array.from(map.values()).sort((a, b) =>
    a.definition.name.localeCompare(b.definition.name, "zh-Hans-CN"),
  );
}

/** 取单个配方（含 payload）。user → builtin → marketplace 顺序优先。 */
export async function getRecipe(
  userId: string,
  id: string,
): Promise<ResolvedRecipe | null> {
  const row = await db.query.recipes.findFirst({
    where: and(
      eq(recipes.id, id),
      or(eq(recipes.userId, userId), isNull(recipes.userId)),
    ),
  });
  if (row) {
    const r = rowToResolved(row as RecipeRow);
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
      console.warn(`[recipes] 市场配方 ${id} 定义非法:`, e);
    }
  }

  return null;
}

/** 是否用户自建（DB 中有行）。用于「删除」等强权限判断。 */
export async function isUserRecipe(userId: string, id: string): Promise<boolean> {
  const row = await db.query.recipes.findFirst({
    where: and(eq(recipes.id, id), eq(recipes.userId, userId)),
  });
  return row != null;
}

/** 新建用户自建配方。返回新行。 */
export async function createUserRecipe(
  userId: string,
  definition: Template,
  payload: PayloadFile[],
): Promise<ResolvedRecipe> {
  const [created] = await db
    .insert(recipes)
    .values({
      id: definition.id,
      userId,
      name: definition.name,
      definition: definition as unknown as Record<string, unknown>,
      payload,
      version: "1",
    })
    .returning();
  return rowToResolved(created as RecipeRow)!;
}

/** 删除用户自建配方（内置 / 市场拒）。 */
export async function deleteUserRecipe(
  userId: string,
  id: string,
): Promise<boolean> {
  const res = await db
    .delete(recipes)
    .where(and(eq(recipes.id, id), eq(recipes.userId, userId)))
    .returning({ id: recipes.id });
  return res.length > 0;
}
