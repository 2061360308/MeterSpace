import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { resolveProvider } from "@/lib/cloud/resolve";
import { upsertInstanceTypes, upsertPrices } from "@/lib/price/service";
import { describeAllAvailability, describeInstanceTypes } from "@/lib/aliyun/ecs";
import { getUserCredentials } from "@/lib/aliyun/auth";

type Params = { params: Promise<{ provider: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { provider: providerName } = await params;
    const p = req.nextUrl.searchParams;
    const region = p.get("region");

    const userId = await requireUserId();

    if (providerName === "aliyun") {
      const creds = await getUserCredentials(userId);
      const provider = await resolveProvider(providerName, userId);

      const regions = region ? [region] : ["cn-hangzhou", "cn-shanghai", "cn-beijing", "cn-shenzhen", "cn-guangzhou", "cn-hongkong"];
      const results: { region: string; instances: number; prices: number }[] = [];

      for (const r of regions) {
        const [availability, allTypes] = await Promise.all([
          describeAllAvailability(creds, r),
          describeInstanceTypes(creds, r),
        ]);

        const availableIds = new Set(availability.map((a) => a.instanceTypeId));
        const types = allTypes.filter((t) => availableIds.has(t.instanceTypeId));

        const instances = types.map((t) => ({
          instanceTypeId: t.instanceTypeId,
          cpuCoreCount: t.cpuCoreCount,
          memorySize: t.memorySize,
          gpuCount: t.gpuAmount ?? 0,
        }));

        await upsertInstanceTypes(providerName, r, instances);

        const instanceTypes = instances.map((i) => i.instanceTypeId);
        const estimates = await provider.batchGetEstimates(r, instanceTypes);
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
