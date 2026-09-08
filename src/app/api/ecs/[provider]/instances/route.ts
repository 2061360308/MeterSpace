import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import {
  getCachedInstanceTypes,
  upsertInstanceTypes,
} from "@/lib/price/service";
import { getAliyunProvider } from "@/lib/providers";

type Params = { params: Promise<{ provider: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { provider: providerName } = await params;
    const region = req.nextUrl.searchParams.get("region");
    if (!region) return fail({ status: 400, message: "region is required" });

    const cached = await getCachedInstanceTypes(providerName, region);
    if (cached.cached) {
      return ok({
        instances: cached.instances,
        cached: true,
        refreshedAt: cached.refreshedAt,
      });
    }

    await requireUserId();

    if (providerName === "aliyun") {
      const provider = getAliyunProvider();
      const [availability, allTypes] = await Promise.all([
        provider.getAvailability(region),
        provider.getInstanceTypes(region),
      ]);

      const availableIds = new Set(availability.map((a) => a.instanceTypeId));
      const types = allTypes.filter((t) => availableIds.has(t.id));

      const instances = types.map((t) => ({
        instanceTypeId: t.id,
        cpuCoreCount: t.cpu,
        memorySize: t.memory,
        gpuCount: t.gpuAmount ?? 0,
      }));

      await upsertInstanceTypes(providerName, region, instances);

      return ok({
        instances,
        availability: availability.map((a) => ({
          instanceTypeId: a.instanceTypeId,
          status: a.status,
          statusCategory: a.zones[0]?.status,
          availableZones: a.availableZones,
          totalZones: a.totalZones,
          zones: a.zones,
        })),
        cached: false,
        refreshedAt: new Date(),
      });
    }

    return fail({ status: 400, message: `Unsupported provider: ${providerName}` });
  } catch (e) {
    return fail(e);
  }
}
