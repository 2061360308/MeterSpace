import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getUserCredentials } from "@/lib/aliyun/auth";
import { describeInstanceTypes } from "@/lib/aliyun/ecs";
import { ok, fail } from "@/lib/api";
import { cacheGet, cacheSet, cacheKey, TTL } from "@/lib/cache";

export async function GET(req: NextRequest) {
  try {
    const region = req.nextUrl.searchParams.get("region") ?? "cn-hangzhou";
    const key = cacheKey("ecs:types", region);

    const cached = cacheGet(key);
    if (cached) return ok(cached);

    const userId = await requireUserId();
    const creds = await getUserCredentials(userId);
    const types = await describeInstanceTypes(creds, region);
    const result = {
      types: types.map((t) => ({
        instanceTypeId: t.instanceTypeId,
        cpuCoreCount: t.cpuCoreCount,
        memorySize: t.memorySize,
        instanceTypeFamily: t.instanceTypeFamily,
        cpuArchitecture: t.cpuArchitecture,
        gpuAmount: t.gpuAmount,
        gpuSpec: t.gpuSpec,
        localStorage: t.localStorage,
        internetMaxBandwidthOut: t.internetMaxBandwidthOut,
      })),
    };
    cacheSet(key, result, TTL.DAY);
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
