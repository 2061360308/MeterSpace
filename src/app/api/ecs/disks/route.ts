import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getUserCredentials } from "@/lib/aliyun/auth";
import { describeDiskCategories } from "@/lib/aliyun/ecs";
import { ok, fail } from "@/lib/api";
import { cacheGet, cacheSet, cacheKey, TTL } from "@/lib/cache";

export async function GET(req: NextRequest) {
  try {
    const region = req.nextUrl.searchParams.get("region");
    if (!region) {
      return fail({ status: 400, message: "region is required" });
    }

    const key = cacheKey("ecs:disks", region);
    const cached = cacheGet(key);
    if (cached) return ok(cached);

    const userId = await requireUserId();
    const creds = await getUserCredentials(userId);
    const disks = await describeDiskCategories(creds, region);
    const result = { disks };
    cacheSet(key, result, TTL.DAY);
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
