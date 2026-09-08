import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { requireUserId } from "@/lib/session";
import { getAliyunProvider } from "@/lib/providers";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { ok, fail } from "@/lib/api";

export async function GET() {
  try {
    const userId = await requireUserId();
    const row = await db.query.settings.findFirst({
      where: eq(settings.userId, userId),
      columns: { enabledRegions: true },
    });
    return ok({ regions: row?.enabledRegions ?? ["cn-hangzhou"] });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const regions: string[] = body.regions;
    if (!Array.isArray(regions)) {
      return fail({ status: 400, message: "regions must be an array" });
    }

    const row = await db.query.settings.findFirst({
      where: eq(settings.userId, userId),
      columns: { enabledRegions: true, aliAccessKeyId: true },
    });
    if (!row) {
      return fail({ status: 400, message: "Aliyun credentials not configured" });
    }

    if (row.aliAccessKeyId) {
      const provider = getAliyunProvider();
      for (const region of regions) {
        await provider.ensureStorage(region, `meterspace-${region}`).catch(() => {});
      }
    }

    await db
      .update(settings)
      .set({ enabledRegions: regions })
      .where(eq(settings.userId, userId));

    return ok({ regions });
  } catch (e) {
    return fail(e);
  }
}
