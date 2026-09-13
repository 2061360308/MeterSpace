/**
 * GET    /api/recipes/[id]   详情（含 payload 内容）
 * DELETE /api/recipes/[id]   仅用户自建可删（builtin / marketplace 拒）
 */
import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireUserId } from "@/lib/session";
import {
  getRecipe,
  isUserRecipe,
  deleteUserRecipe,
} from "@/lib/recipes/service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const r = await getRecipe(userId, id);
    if (!r) {
      const err = new Error("配方不存在") as Error & { status?: number };
      err.status = 404;
      throw err;
    }

    return ok({
      id: r.definition.id,
      name: r.definition.name,
      description: r.definition.description ?? null,
      category: r.definition.category ?? null,
      icon: r.definition.icon ?? null,
      tags: r.definition.tags ?? [],
      entry: r.definition.entry,
      params: r.definition.params ?? [],
      activity: r.definition.activity ?? null,
      timeout: r.definition.timeout ?? null,
      source: r.source,
      version: r.version,
      payload: r.payload.map((f) => ({
        path: f.path,
        content: f.content,
        mode: f.mode,
        size: f.size,
      })),
    });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const owned = await isUserRecipe(userId, id);
    if (!owned) {
      const err = new Error(
        "配方不存在或不可删除（内置 / 市场配方只读）",
      ) as Error & { status?: number };
      err.status = 404;
      throw err;
    }

    const deleted = await deleteUserRecipe(userId, id);
    if (!deleted) {
      const err = new Error("删除失败") as Error & { status?: number };
      err.status = 500;
      throw err;
    }
    return ok({ id, deleted: true });
  } catch (e) {
    return fail(e);
  }
}
