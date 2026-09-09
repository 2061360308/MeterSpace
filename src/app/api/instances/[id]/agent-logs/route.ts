import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { instanceLogs } from "@/lib/db/schema";
import { verifyAccessToken } from "@/lib/instances/auth";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

const logEntrySchema = z.object({
  timestamp: z.string(),
  level: z.enum(["info", "warn", "error"]),
  phase: z.string().optional(),
  message: z.string(),
});

const bodySchema = z.object({
  token: z.string(),
  logs: z.array(logEntrySchema),
});

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = bodySchema.parse(await req.json());

    const valid = await verifyAccessToken(id, body.token);
    if (!valid) {
      return fail({ message: "Invalid token", status: 401 });
    }

    if (body.logs.length > 0) {
      await db.insert(instanceLogs).values(
        body.logs.map((log) => ({
          instanceId: id,
          timestamp: new Date(log.timestamp),
          level: log.level,
          phase: log.phase ?? null,
          message: log.message,
        })),
      );
    }

    return ok({ received: body.logs.length });
  } catch (e) {
    return fail(e);
  }
}
