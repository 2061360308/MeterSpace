/**
 * GET    /api/launch-templates/[id]    详情（payload 内容完整）
 * DELETE /api/launch-templates/[id]    删除（仅 owner 可）
 */
import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireUserId } from "@/lib/session";
import { getLaunchTemplate, deleteLaunchTemplate } from "@/lib/launch-templates/service";
import { resolveEntryTimeout } from "@/lib/templates/validate";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const t = await getLaunchTemplate(userId, id);
    if (!t) {
      const err = new Error("启动模板不存在") as Error & { status?: number };
      err.status = 404;
      throw err;
    }

    return ok({
      id: t.definition.id,
      name: t.definition.name,
      description: t.definition.description ?? null,
      category: t.definition.category ?? null,
      icon: t.definition.icon ?? null,
      tags: t.definition.tags ?? [],
      entry: t.definition.entry,
      params: [] as never[],
      activity: t.definition.activity ?? null,
      timeout: t.definition.timeout ?? null,
      entryTimeout: resolveEntryTimeout(t.definition),
      version: t.version,
      payload: t.payload.map((f) => ({
        path: f.path,
        content: f.content,
        mode: f.mode,
        size: f.size,
      })),
      originKind: t.originKind,
      originRecipeId: t.originRecipeId,
    });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const deleted = await deleteLaunchTemplate(userId, id);
    if (!deleted) {
      const err = new Error("启动模板不存在或不可删除") as Error & {
        status?: number;
      };
      err.status = 404;
      throw err;
    }
    return ok({ id, deleted: true });
  } catch (e) {
    return fail(e);
  }
}
