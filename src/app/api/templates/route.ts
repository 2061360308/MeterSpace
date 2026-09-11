import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { requireUserId } from "@/lib/session";
import { listTemplates, upsertUserTemplate } from "@/lib/templates/service";
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

/** GET /api/templates —— 内置 + 用户自建 合并列表。 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const list = await listTemplates(userId);
    return ok({
      templates: list.map((t) => ({
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
        fileCount: t.payload.length,
      })),
    });
  } catch (e) {
    return fail(e);
  }
}

/** POST /api/templates —— 用户自建模板（元数据 + 载荷数组）。 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = bodySchema.parse(await req.json());

    const definition = parseTemplateDefinition(body.definition);
    const payload = body.payload as PayloadFile[];
    validatePayloadFiles(payload);

    // entry 必须存在于载荷里
    if (!payload.some((f) => f.path === definition.entry)) {
      const err = new Error(`载荷中缺少 entry 指向的文件: ${definition.entry}`) as Error & {
        status?: number;
      };
      err.status = 400;
      throw err;
    }

    const saved = await upsertUserTemplate(userId, definition, payload);
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
