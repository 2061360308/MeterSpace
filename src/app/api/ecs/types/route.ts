import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getAliyunProvider } from "@/lib/providers";
import { ok, fail } from "@/lib/api";
import {
  getCachedInstanceTypes,
  upsertInstanceTypes,
} from "@/lib/price/service";

/**
 * 实例规格元数据。
 *
 * 走 **DB 缓存**（`instance_cache`，24h TTL）而不是进程内 Map：
 * serverless 下函数实例随时回收、彼此隔离，进程内 Map 等于没有缓存，
 * 每次冷启动都会实时打云 API，这是规格表格首屏最慢的一环。
 * 见 docs/UI-PERFORMANCE.md U4。
 */
export async function GET(req: NextRequest) {
  try {
    const region = req.nextUrl.searchParams.get("region") ?? "cn-hangzhou";

    const cached = await getCachedInstanceTypes("aliyun", region);
    if (cached.cached) {
      return ok({
        types: cached.instances.map((t) => ({
          instanceTypeId: t.instanceTypeId,
          cpuCoreCount: t.cpuCoreCount,
          memorySize: t.memorySize,
          instanceTypeFamily: t.instanceTypeFamily ?? "",
          cpuArchitecture: t.cpuArchitecture ?? "",
          gpuAmount: t.gpuCount,
          gpuSpec: t.gpuSpec ?? null,
        })),
        cached: true,
        refreshedAt: cached.refreshedAt,
      });
    }

    await requireUserId();
    const provider = getAliyunProvider();
    const types = await provider.getInstanceTypes(region);

    await upsertInstanceTypes(
      "aliyun",
      region,
      types.map((t) => ({
        instanceTypeId: t.id,
        cpuCoreCount: t.cpu,
        memorySize: t.memory,
        gpuCount: t.gpuAmount ?? 0,
        instanceTypeFamily: t.family,
        cpuArchitecture: t.architecture,
        gpuSpec: t.gpuSpec,
      })),
    );

    return ok({
      types: types.map((t) => ({
        instanceTypeId: t.id,
        cpuCoreCount: t.cpu,
        memorySize: t.memory,
        instanceTypeFamily: t.family,
        cpuArchitecture: t.architecture,
        gpuAmount: t.gpuAmount,
        gpuSpec: t.gpuSpec,
      })),
      cached: false,
    });
  } catch (e) {
    return fail(e);
  }
}
