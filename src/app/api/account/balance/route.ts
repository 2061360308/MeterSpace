import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getAliyunProvider } from "@/lib/providers";
import { ok, fail } from "@/lib/api";
import { cacheGet, cacheSet, cacheKey, TTL } from "@/lib/cache";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const refresh = req.nextUrl.searchParams.get("refresh") === "true";
    const key = cacheKey("balance", userId);

    if (!refresh) {
      const cached = cacheGet(key);
      if (cached) return ok(cached);
    }

    const provider = getAliyunProvider();
    const balance = await provider.getBalance();
    cacheSet(key, balance, TTL.MINUTE * 5);
    return ok(balance);
  } catch (e) {
    return fail(e);
  }
}
