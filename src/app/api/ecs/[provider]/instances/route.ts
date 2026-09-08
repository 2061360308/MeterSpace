import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import {
  getCachedInstanceTypes,
  upsertInstanceTypes,
} from "@/lib/price/service";
import { describeAllAvailability, describeInstanceTypes } from "@/lib/aliyun/ecs";
import { getUserCredentials } from "@/lib/aliyun/auth";

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

    const userId = await requireUserId();

    if (providerName === "aliyun") {
      const creds = await getUserCredentials(userId);
      const [availability, allTypes] = await Promise.all([
        describeAllAvailability(creds, region),
        describeInstanceTypes(creds, region),
      ]);

      const availableIds = new Set(availability.map((a) => a.instanceTypeId));
      const types = allTypes.filter((t) => availableIds.has(t.instanceTypeId));

      const instances = types.map((t) => ({
        instanceTypeId: t.instanceTypeId,
        cpuCoreCount: t.cpuCoreCount,
        memorySize: t.memorySize,
        gpuCount: t.gpuAmount ?? 0,
      }));

      await upsertInstanceTypes(providerName, region, instances);

      return ok({
        instances,
        availability: availability.map((a) => ({
          instanceTypeId: a.instanceTypeId,
          status: a.status,
          statusCategory: a.statusCategory,
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
