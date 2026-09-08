import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getAliyunProvider } from "@/lib/providers";
import { ok, fail } from "@/lib/api";
import { cacheGet, cacheSet, cacheKey, TTL } from "@/lib/cache";

export async function GET(req: NextRequest) {
  try {
    const region = req.nextUrl.searchParams.get("region") ?? "cn-hangzhou";
    const key = cacheKey("ecs:types", region);

    const cached = cacheGet(key);
    if (cached) return ok(cached);

    await requireUserId();
    const provider = getAliyunProvider();
    const types = await provider.getInstanceTypes(region);
    const result = {
      types: types.map((t) => ({
        instanceTypeId: t.id,
        cpuCoreCount: t.cpu,
        memorySize: t.memory,
        instanceTypeFamily: t.family,
        cpuArchitecture: t.architecture,
        gpuAmount: t.gpuAmount,
        gpuSpec: t.gpuSpec,
      })),
    };
    cacheSet(key, result, TTL.DAY);
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
