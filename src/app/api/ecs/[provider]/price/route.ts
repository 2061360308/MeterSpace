import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { getOrFetchPrices } from "@/lib/price/service";
import { resolveProvider } from "@/lib/cloud/resolve";
import { estimateSpotPrice } from "@/lib/price/types";

type Params = { params: Promise<{ provider: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { provider: providerName } = await params;
    const p = req.nextUrl.searchParams;
    const region = p.get("region");
    const instanceType = p.get("instanceType");

    if (!region) return fail({ status: 400, message: "region is required" });
    if (!instanceType) {
      return fail({ status: 400, message: "instanceType is required" });
    }

    const userId = await requireUserId();
    const provider = await resolveProvider(providerName, userId);

    const estimates = await getOrFetchPrices(provider, region, [instanceType]);
    const est = estimates.get(instanceType);

    if (!est) {
      return fail({ status: 404, message: "Price not available" });
    }

    return ok({
      onDemandPrice: est.onDemandPrice,
      historicalDiscount: est.historicalDiscount,
      releaseRate: est.releaseRate,
      estimatedSpotPrice: estimateSpotPrice(est),
      cached: est.cached,
    });
  } catch (e) {
    return fail(e);
  }
}
