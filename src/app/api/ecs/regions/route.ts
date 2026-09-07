import { requireUserId } from "@/lib/session";
import { getUserCredentials } from "@/lib/aliyun/auth";
import { describeRegions } from "@/lib/aliyun/ecs";
import { ok, fail } from "@/lib/api";
import { cacheGet, cacheSet, TTL } from "@/lib/cache";

const CACHE_KEY = "ecs:regions";

export async function GET() {
  try {
    const cached = cacheGet(CACHE_KEY);
    if (cached) return ok(cached);

    const userId = await requireUserId();
    const creds = await getUserCredentials(userId);
    const regions = await describeRegions(creds);
    cacheSet(CACHE_KEY, regions, TTL.WEEK);
    return ok(regions);
  } catch (e) {
    return fail(e);
  }
}
