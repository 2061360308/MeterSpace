import { NextRequest } from "next/server";
import { eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { instances, instanceLogs } from "@/lib/db/schema";
import { requireUserId } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const instance = await db.query.instances.findFirst({
      where: eq(instances.id, id),
    });
    if (!instance) {
      return new Response("Instance not found", { status: 404 });
    }

    const workspace = await db.query.workspaces.findFirst({
      where: eq(instances.workspaceId, instance.workspaceId),
    });
    if (!workspace || workspace.userId !== userId) {
      return new Response("Instance not found", { status: 404 });
    }

    if (instance.logsExpireAt && new Date(instance.logsExpireAt) < new Date()) {
      return new Response("Logs expired", { status: 410 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let lastTimestamp: Date | null = null;

        const sendLogs = async () => {
          try {
            const conditions = [eq(instanceLogs.instanceId, id)];

            if (lastTimestamp) {
              conditions.push(gt(instanceLogs.timestamp, lastTimestamp));
            }

            const logs = await db.query.instanceLogs.findMany({
              where: (fields, { and }) => and(...conditions),
              orderBy: [instanceLogs.timestamp],
              limit: 50,
            });

            for (const log of logs) {
              const data = JSON.stringify({
                timestamp: log.timestamp.toISOString(),
                level: log.level,
                phase: log.phase,
                message: log.message,
              });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              lastTimestamp = log.timestamp;
            }

            const currentInstance = await db.query.instances.findFirst({
              where: eq(instances.id, id),
            });
            if (
              currentInstance?.status === "STOPPED" ||
              currentInstance?.status === "FAILED"
            ) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "done", status: currentInstance.status })}\n\n`,
                ),
              );
              controller.close();
              return false;
            }
            return true;
          } catch {
            controller.close();
            return false;
          }
        };

        const shouldContinue = await sendLogs();
        if (!shouldContinue) return;

        const interval = setInterval(async () => {
          const continueLoop = await sendLogs();
          if (!continueLoop) {
            clearInterval(interval);
          }
        }, 1000);

        req.signal.addEventListener("abort", () => {
          clearInterval(interval);
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
}
