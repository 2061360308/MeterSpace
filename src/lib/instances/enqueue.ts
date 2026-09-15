import { getProvider } from "@/lib/providers";

/**
 * 云函数入队封装（5 个调用点复用：create×2、release×3，见 docs/CLOUD-FUNCTION-WORKERS.md §8）。
 *
 * 独立成文件的原因：lifecycle.ts 与 workspaces/service.ts 互相 import 会成环，
 * 拆出来让三处各自单向引用。
 *
 * fire-and-forget：失败仅 log，不阻塞创建 / 停止主流程（D2：云函数是系统必备组件，
 * 未部署 = 系统出错，不设计 tick 兜底）。
 */
export async function enqueueTracking(
  type: "create" | "release",
  instanceId: string,
  providerName: string,
): Promise<void> {
  try {
    const p = getProvider(providerName);
    await p?.invokeCloudFunction?.({
      task: "instance-tracking",
      instanceId,
      intervalSec: 10,
      timeoutSec: type === "create" ? 600 : 660,
    });
  } catch (e) {
    console.error(`[enqueueTracking] ${type} invoke failed:`, e);
  }
}