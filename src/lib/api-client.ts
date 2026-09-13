/**
 * 客户端数据访问层。
 *
 * 统一三件事：
 * 1. `pingMaintenance()` —— serverless 无后台进程，所有时序逻辑（超时 / 异步停止收尾 /
 *    空闲释放 / 心跳回收）都靠请求触发。任何「加载数据」的动作之前都先打这一枪，
 *    且**不 await**，避免它拖慢首屏。
 * 2. `apiGet` —— 统一的响应处理与错误语义（404 单独标记，便于路由跳转）。
 * 3. `queryKeys` —— React Query 的键集中在同一处，避免各处手写字符串导致缓存不命中。
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/** 懒处理打点：不 await，失败静默（它只是巡检，不该影响用户操作）。 */
export function pingMaintenance(tasks?: string[]): void {
  fetch("/api/maintenance", {
    method: "POST",
    ...(tasks
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tasks }),
        }
      : {}),
  }).catch(() => {});
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(data.error ?? `请求失败（${res.status}）`, res.status);
  }
  return (await res.json()) as T;
}

export async function apiSend<T>(
  url: string,
  method: "POST" | "PATCH" | "DELETE" | "PUT",
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    ...(body !== undefined
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(data.error ?? `操作失败（${res.status}）`, res.status);
  }
  return (await res.json().catch(() => ({}))) as T;
}

export const queryKeys = {
  workspaces: ["workspaces"] as const,
  workspace: (id: string) => ["workspace", id] as const,
  workspaceInstances: (id: string) => ["workspace", id, "instances"] as const,
  cloudStatus: (workspaceId: string, instanceId: string) =>
    ["workspace", workspaceId, "cloud-status", instanceId] as const,
  instance: (id: string) => ["instance", id] as const,
  cloudInstances: (provider: string, region: string) =>
    ["cloud-instances", provider, region] as const,
  ecsTypes: (region: string) => ["ecs-types", region] as const,
  ecsPrice: (params: string) => ["ecs-price", params] as const,
} as const;

/** 轮询间隔：进行中状态 3s，稳定状态不轮询。 */
export const POLL_ACTIVE_MS = 3000;
export const POLL_SETTLING_MS = 5000;
