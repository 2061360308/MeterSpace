/**
 * GET  /api/recipes                    合并列表（builtin + marketplace + user）
 * POST /api/recipes                    确认落库：上传页浏览后提交
 *
 * 替代旧的 GET/POST /api/templates。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { requireUserId } from "@/lib/session";
import { listRecipes, createUserRecipe } from "@/lib/recipes/service";
import { parseTemplateDefinition } from "@/lib/templates/validate";
import { validatePayloadFiles } from "@/lib/templates/zip";
import type { PayloadFile } from "@/lib/templates/types";

const payloadFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  mode: z.string().default("0644"),
  size: z.number().int().min(0).default(0),
});

const bodySchema = z.object({
  definition: z.unknown(),
  payload: z.array(payloadFileSchema).default([]),
});

export async function GET() {
  try {
    const userId = await requireUserId();
    const list = await listRecipes(userId);
    return ok({
      recipes: list.map((r) => ({
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
        fileCount: r.payload.length,
      })),
    });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = bodySchema.parse(await req.json());

    const definition = parseTemplateDefinition(body.definition);
    const payload = body.payload as PayloadFile[];
    validatePayloadFiles(payload);

    if (!payload.some((f) => f.path === definition.entry)) {
      const err = new Error(
        `载荷中缺少 entry 指向的文件: ${definition.entry}`,
      ) as Error & { status?: number };
      err.status = 400;
      throw err;
    }

    const saved = await createUserRecipe(userId, definition, payload);
    return ok(
      {
        id: saved.definition.id,
        source: saved.source,
        version: saved.version,
      },
      { status: 201 },
    );
  } catch (e) {
    return fail(e);
  }
}
