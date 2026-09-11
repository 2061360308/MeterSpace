import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireUserId } from "@/lib/session";
import {
  getTemplate,
  deleteUserTemplate,
} from "@/lib/templates/service";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/templates/[id] —— 详情（含定义 + 载荷清单，不含载荷正文）。 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const t = await getTemplate(userId, id);
    if (!t) {
      const err = new Error("模板不存在") as Error & { status?: number };
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
      params: t.definition.params ?? [],
      activity: t.definition.activity ?? null,
      timeout: t.definition.timeout ?? null,
      source: t.source,
      version: t.version,
      files: t.payload.map((f) => ({
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

/** DELETE /api/templates/[id] —— 仅用户自建可删。 */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const deleted = await deleteUserTemplate(userId, id);
    if (!deleted) {
      const err = new Error("模板不存在或不可删除（内置模板只读）") as Error & {
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
