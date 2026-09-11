import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaces, workspacePayloads, auditLogs } from "@/lib/db/schema";
import { ok, fail } from "@/lib/api";
import { requireUserId } from "@/lib/session";
import { getTemplate } from "@/lib/templates/service";
import { buildParamValues } from "@/lib/templates/validate";
import { renderFile } from "@/lib/templates/render";
import {
  DEFAULT_IDLE_MINUTES,
  DEFAULT_ENTRY_TIMEOUT,
  type ActivityConfig,
} from "@/lib/templates/types";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  name: z.string().min(1).max(64),
  region: z.string().min(1),
  provider: z.string().default("aliyun"),
  params: z.record(z.string(), z.unknown()).default({}),
  diskSize: z.number().int().min(20).default(40),
  bandwidth: z.number().int().min(1).default(10),
  publicIp: z.boolean().default(true),
  releaseHours: z.number().int().nullable().optional(),
});

/**
 * POST /api/templates/[id]/instantiate —— 校验 + 渲染 + 落库（§9.1）。
 *
 * 只做「创建工作区 + 写渲染好的载荷」，**不启动实例**。
 * 启动仍走 POST /api/workspaces/[id]/start（用户此时选规格）。
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = bodySchema.parse(await req.json());

    // ① 取模板（用户自建 → 内置）
    const tpl = await getTemplate(userId, id);
    if (!tpl) {
      const err = new Error("模板不存在") as Error & { status?: number };
      err.status = 404;
      throw err;
    }
    const { definition, payload } = tpl;

    // ② 动态校验 params 并补齐默认值
    const vars = buildParamValues(definition.params, body.params);

    // ③ activity / timeout 解析（模板缺省时兜底）
    const activity: ActivityConfig = {
      ports: definition.activity?.ports ?? [],
      idleMinutes: definition.activity?.idleMinutes ?? DEFAULT_IDLE_MINUTES,
      sampleIntervalSec: definition.activity?.sampleIntervalSec,
    };
    const entryTimeout = definition.timeout ?? DEFAULT_ENTRY_TIMEOUT;

    // ④ 落库 workspaces
    const [workspace] = await db
      .insert(workspaces)
      .values({
        userId,
        name: body.name,
        provider: body.provider,
        region: body.region,
        imageUri: null, // 模板工作区不依赖单一镜像
        defaultDiskSize: body.diskSize,
        defaultBandwidth: body.bandwidth,
        publicIp: body.publicIp,
        features: [],
        templateId: definition.id,
        templateVersion: tpl.version,
        templateParams: vars,
        entry: definition.entry,
        activityConfig: activity,
        entryTimeout,
        idleMinutes: activity.idleMinutes ?? DEFAULT_IDLE_MINUTES,
        releaseHours: body.releaseHours ?? null,
        ossWorkspacePath: null,
        proxyMode: "inherit",
      })
      .returning();

    await db
      .update(workspaces)
      .set({ ossWorkspacePath: `ws-${workspace.id}/workspace` })
      .where(eq(workspaces.id, workspace.id));

    // ⑤ 渲染载荷并逐文件入库
    if (payload.length > 0) {
      const rows = payload.map((f) => {
        const rendered = renderFile(definition.entry, f.path, f.content, vars);
        return {
          workspaceId: workspace.id,
          path: f.path,
          content: rendered,
          mode: f.mode,
          size: Buffer.byteLength(rendered, "utf8"),
        };
      });
      await db.insert(workspacePayloads).values(rows);
    }

    await db.insert(auditLogs).values({
      userId,
      workspaceId: workspace.id,
      action: "CREATE",
      details: {
        name: body.name,
        region: body.region,
        source: "template",
        templateId: definition.id,
      },
    });

    // ⑥ 返回（ports 给前端生成按钮）
    const ports = (activity.ports ?? [])
      .filter((p) => !p.private)
      .map((p) => ({
        port: p.port,
        label: p.label ?? `端口 ${p.port}`,
        protocol: p.protocol ?? "http",
      }));

    return ok(
      {
        workspaceId: workspace.id,
        needsUpload: false,
        entry: definition.entry,
        ports,
        files: payload.map((f) => f.path),
      },
      { status: 201 },
    );
  } catch (e) {
    return fail(e);
  }
}
