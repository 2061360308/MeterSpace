import { createHmac } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { instances } from "@/lib/db/schema";
import { AGENT_CONTROL_PORT } from "@/lib/constants";

/**
 * agent 控制通道（docs/AGENT-PRESTOP.md）。
 *
 * 端口与 `ensureInstanceSecurityGroup` 的放行规则共用 `AGENT_CONTROL_PORT`，
 * 改端口需同步 `agent/api/server.go` 与 `src/lib/ecs/provisioning.ts`。
 */

const DISPATCH_TIMEOUT_MS = 5_000;

export interface DispatchPreStopInput {
  instanceId: string;
  workspaceId: string;
  publicIp: string;
  accessToken: string;
  script: string;
  reason?: string;
}

/**
 * 向后端 agent 下发 pre_stop 指令（HMAC 签名，消息=`workspaceId:action:timestamp`）。
 *
 * 成功定义：
 * - `2xx`：指令被接受
 * - `409`：agent 侧已在执行同一条指令（幂等成功，视为成功）
 * - 其它 status >= 400 / 超时：抛错，由调用方决定重试策略。
 */
export async function dispatchPreStop(input: DispatchPreStopInput): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = `${input.workspaceId}:pre_stop:${timestamp}`;
  const signature = createHmac("sha256", input.accessToken).update(message).digest("hex");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`http://${input.publicIp}:${AGENT_CONTROL_PORT}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "pre_stop",
        timestamp,
        signature,
        script: input.script,
        timeout: 120,
        reason: input.reason,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 409) {
    return;
  }
  if (res.status >= 400) {
    const text = await res.text().catch(() => "");
    throw new Error(`dispatchPreStop failed: HTTP ${res.status} ${text}`);
  }
}

/**
 * 查询实例公网 IP；无云资源 / publicIp 为空返回 null。
 */
export async function getAgentPublicUrl(instanceId: string): Promise<string | null> {
  const row = (
    await db
      .select({ publicIp: instances.publicIp })
      .from(instances)
      .where(eq(instances.id, instanceId))
      .limit(1)
  )[0];
  return row?.publicIp ?? null;
}