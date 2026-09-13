/**
 * POST /api/launch-templates/[id]/instantiate —— 把启动模板落成 workspace。
 *
 * 与旧 /api/templates/[id]/instantiate 等价，但读 launch_templates 表。
 * 由 wizard 第 3 步直接调用。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { requireUserId } from "@/lib/session";
import { instantiateWorkspaceFromLaunch } from "@/lib/launch-templates/service";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  name: z.string().min(1).max(64),
  region: z.string().min(1),
  provider: z.string().default("aliyun"),
  params: z.record(z.string(), z.unknown()).default({}),
  diskSize: z.number().int().min(20).default(40),
  bandwidth: z.number().int().min(1).default(10),
  publicIp: z.boolean().default(true),
  // real 列：允许小数（0.5 = 半小时），与 settings.defaultReleaseHours 对齐
  releaseHours: z.number().positive().nullable().optional(),
  gitProvider: z.string().nullable().optional(),
  gitRepoUrl: z.string().nullable().optional(),
  gitBranch: z.string().default("main"),
  autoClone: z.boolean().default(true),
  proxyMode: z.enum(["inherit", "disabled", "clash", "upstream"]).optional(),
  proxyClashSubscription: z.string().optional(),
  proxyClashYaml: z.string().optional(),
  proxyUpstreamUrl: z.string().optional(),
  proxyUpstreamUsername: z.string().optional(),
  proxyUpstreamSecret: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = bodySchema.parse(await req.json());

    const result = await instantiateWorkspaceFromLaunch(userId, id, body);
    return ok(result, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
