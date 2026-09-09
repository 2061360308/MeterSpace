import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { instances } from "@/lib/db/schema";
import { verifyAccessToken } from "@/lib/instances/auth";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

const resourceUsageSchema = z.object({
  cpu_percent: z.number(),
  memory_mb: z.number(),
  memory_total_mb: z.number(),
  disk_mb: z.number(),
  disk_total_mb: z.number(),
});

const bodySchema = z.object({
  token: z.string(),
  status: z.string().optional(),
  active: z.boolean().optional(),
  uptime: z.number().optional(),
  script_status: z.string().optional(),
  script_error: z.string().optional(),
  resource_usage: resourceUsageSchema.optional(),
  access_summary: z.any().optional(),
});

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = bodySchema.parse(await req.json());

    const valid = await verifyAccessToken(id, body.token);
    if (!valid) {
      return fail({ message: "Invalid token", status: 401 });
    }

    // Build update data
    const updateData: Record<string, unknown> = {
      lastActiveAt: new Date(),
      idleTriggered: false,
    };

    // Add resource usage if provided
    if (body.resource_usage) {
      updateData.cpuPercent = body.resource_usage.cpu_percent;
      updateData.memoryMb = body.resource_usage.memory_mb;
      updateData.memoryTotalMb = body.resource_usage.memory_total_mb;
      updateData.diskMb = body.resource_usage.disk_mb;
      updateData.diskTotalMb = body.resource_usage.disk_total_mb;
    }

    // Add access summary if provided
    if (body.access_summary) {
      updateData.accessSummary = body.access_summary;
    }

    await db
      .update(instances)
      .set(updateData)
      .where(eq(instances.id, id));

    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
