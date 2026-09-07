import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getUserCredentials } from "@/lib/aliyun/auth";
import { describeAllAvailability, describeInstanceTypes } from "@/lib/aliyun/ecs";
import { ok, fail } from "@/lib/api";
import { cacheGet, cacheSet, cacheKey, TTL } from "@/lib/cache";

export async function GET(req: NextRequest) {
  try {
    const region = req.nextUrl.searchParams.get("region");
    if (!region) {
      return fail({ status: 400, message: "region is required" });
    }

    const key = cacheKey("ecs:instances", region);
    const cached = cacheGet(key);
    if (cached) return ok(cached);

    const userId = await requireUserId();
    const creds = await getUserCredentials(userId);

    const [availability, allTypes] = await Promise.all([
      describeAllAvailability(creds, region),
      describeInstanceTypes(creds, region),
    ]);

    const availableIds = new Set(availability.map((a) => a.instanceTypeId));
    const types = allTypes.filter((t) => availableIds.has(t.instanceTypeId));

    const typeMap = new Map(types.map((t) => [t.instanceTypeId, t]));
    const result = {
      instances: availability.map((a) => ({
        ...a,
        spec: typeMap.get(a.instanceTypeId) ?? null,
      })),
    };

    cacheSet(key, result, TTL.DAY);
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
