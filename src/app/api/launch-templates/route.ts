/**
 * GET  /api/launch-templates                列表（仅当前用户的 launch_templates）
 * POST /api/launch-templates                确认落库：上传页浏览后提交
 *
 * 替代旧的 GET/POST /api/templates（仅 kind=launch 范围）。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { requireUserId } from "@/lib/session";
import {
  listLaunchTemplates,
  createLaunchTemplate,
} from "@/lib/launch-templates/service";
import { parseTemplateDefinition, resolveEntryTimeout } from "@/lib/templates/validate";
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
    const list = await listLaunchTemplates(userId);
    return ok({
      launchTemplates: list.map((t) => ({
        id: t.definition.id,
        name: t.definition.name,
        description: t.definition.description ?? null,
        category: t.definition.category ?? null,
        icon: t.definition.icon ?? null,
        tags: t.definition.tags ?? [],
        entry: t.definition.entry,
        // launch_templates.params 永远为 []，但前端用同一形状避免漂移
        params: [] as never[],
        activity: t.definition.activity ?? null,
        timeout: t.definition.timeout ?? null,
        entryTimeout: resolveEntryTimeout(t.definition),
        version: t.version,
        fileCount: t.payload.length,
        originKind: (t.originKind ?? "upload") as "recipe" | "upload" | "migration",
        originRecipeId: t.originRecipeId,
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

    const incoming = parseTemplateDefinition(body.definition);
    const payload = body.payload as PayloadFile[];
    validatePayloadFiles(payload);

    if (!payload.some((f) => f.path === incoming.entry)) {
      const err = new Error(
        `载荷中缺少 entry 指向的文件: ${incoming.entry}`,
      ) as Error & { status?: number };
      err.status = 400;
      throw err;
    }

    // launch_templates.params 强制空。篡改 / 脏数据 → 拒绝。
    if ((incoming.params ?? []).length > 0) {
      const err = new Error(
        "启动模板不能包含参数定义；如需 params，请上传为配方（/recipes/upload）",
      ) as Error & { status?: number };
      err.status = 400;
      throw err;
    }

    const saved = await createLaunchTemplate(userId, incoming, payload);
    return ok(
      {
        id: saved.definition.id,
        version: saved.version,
      },
      { status: 201 },
    );
  } catch (e) {
    return fail(e);
  }
}
