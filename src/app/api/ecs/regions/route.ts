import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { cacheGet, cacheSet, TTL } from "@/lib/cache";
import { getProvider } from "@/lib/providers";

export async function GET(req: NextRequest) {
  try {
    const providerName = req.nextUrl.searchParams.get("provider") ?? "aliyun";

    const provider = getProvider(providerName);
    if (!provider) {
      return fail({ status: 400, message: `Unsupported provider: ${providerName}` });
    }

    // Check cache first
    const cacheKey = `regions:${providerName}`;
    const cached = cacheGet(cacheKey);
    if (cached) return ok({ regions: cached, provider: providerName });

    // Fetch from provider
    const regions = await provider.getRegions();
    cacheSet(cacheKey, regions, TTL.WEEK);

    return ok({ regions, provider: providerName });
  } catch (e) {
    return fail(e);
  }
}
