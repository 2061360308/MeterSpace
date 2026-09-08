import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { resolveProvider } from "@/lib/cloud/resolve";
import { upsertInstanceTypes, upsertPrices } from "@/lib/price/service";
import { getAliyunProvider } from "@/lib/providers";

type Params = { params: Promise<{ provider: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { provider: providerName } = await params;
    const p = req.nextUrl.searchParams;
    const region = p.get("region");

    const userId = await requireUserId();

    if (providerName === "aliyun") {
      const provider = getAliyunProvider();
      const priceProvider = await resolveProvider(providerName, userId);

      const regions = region ? [region] : ["cn-hangzhou", "cn-shanghai", "cn-beijing", "cn-shenzhen", "cn-guangzhou", "cn-hongkong"];
      const results: { region: string; instances: number; prices: number }[] = [];

      for (const r of regions) {
        const [availability, allTypes] = await Promise.all([
          provider.getAvailability(r),
          provider.getInstanceTypes(r),
        ]);

        const availableIds = new Set(availability.map((a) => a.instanceTypeId));
        const types = allTypes.filter((t) => availableIds.has(t.id));

        const instances = types.map((t) => ({
          instanceTypeId: t.id,
          cpuCoreCount: t.cpu,
          memorySize: t.memory,
          gpuCount: t.gpuAmount ?? 0,
        }));

        await upsertInstanceTypes(providerName, r, instances);

        const instanceTypes = instances.map((i) => i.instanceTypeId);
        const estimates = await priceProvider.batchGetEstimates(r, instanceTypes);
        await upsertPrices(providerName, r, estimates);

        results.push({
          region: r,
          instances: instances.length,
          prices: estimates.size,
        });
      }

      return ok({ provider: providerName, results });
    }

    return fail({ status: 400, message: `Unsupported provider: ${providerName}` });
  } catch (e) {
    return fail(e);
  }
}
