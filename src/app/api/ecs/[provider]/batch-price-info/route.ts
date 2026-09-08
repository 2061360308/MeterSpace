import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { getOrFetchPrices } from "@/lib/price/service";
import { resolveProvider } from "@/lib/cloud/resolve";

interface PriceInfo {
  onDemandPrice: number;
  historicalDiscount: number;
  releaseRate: number | null;
  averageSpotPrice: number;
}

type Params = { params: Promise<{ provider: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { provider: providerName } = await params;
    const p = req.nextUrl.searchParams;
    const region = p.get("region") ?? "cn-hangzhou";
    const instanceTypesStr = p.get("instanceTypes");

    if (!instanceTypesStr) {
      return fail({ status: 400, message: "instanceTypes is required" });
    }

    const instanceTypes = instanceTypesStr.split(",").filter(Boolean);
    if (instanceTypes.length === 0) {
      return fail({ status: 400, message: "instanceTypes is empty" });
    }
    if (instanceTypes.length > 10) {
      return fail({ status: 400, message: "instanceTypes exceeds 10 limit" });
    }

    const userId = await requireUserId();
    const provider = await resolveProvider(providerName, userId);

    const estimates = await getOrFetchPrices(provider, region, instanceTypes);

    const result: Record<string, PriceInfo> = {};
    for (const [instanceType, est] of estimates) {
      result[instanceType] = {
        onDemandPrice: est.onDemandPrice,
        historicalDiscount: est.historicalDiscount,
        releaseRate: est.releaseRate,
        averageSpotPrice: est.onDemandPrice * est.historicalDiscount,
      };
    }

    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
