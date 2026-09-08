import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getAliyunProvider } from "@/lib/providers";
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

    await requireUserId();
    const provider = getAliyunProvider();
    const disks = await provider.getDiskCategories(region);
    const result = { disks };
    cacheSet(key, result, TTL.DAY);
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
