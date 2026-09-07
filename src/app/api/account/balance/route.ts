import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getUserCredentials } from "@/lib/aliyun/auth";
import { queryAccountBalance } from "@/lib/aliyun/bss";
import { ok, fail } from "@/lib/api";
import { cacheGet, cacheSet, cacheDelete, cacheKey, TTL } from "@/lib/cache";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const refresh = req.nextUrl.searchParams.get("refresh") === "true";
    const key = cacheKey("balance", userId);

    if (!refresh) {
      const cached = cacheGet(key);
      if (cached) return ok(cached);
    }

    const creds = await getUserCredentials(userId);
    const balance = await queryAccountBalance(creds);
    cacheSet(key, balance, TTL.MINUTE * 5);
    return ok(balance);
  } catch (e) {
    return fail(e);
  }
}
