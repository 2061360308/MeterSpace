import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { requireUserId } from "@/lib/session";
import { getAliyunProvider } from "@/lib/providers";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { ok, fail } from "@/lib/api";
import { ossBucketForRegion } from "@/lib/workspaces/service";

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

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const region: string = body.region;
    if (!region || typeof region !== "string") {
      return fail({ status: 400, message: "region is required" });
    }

    const row = await db.query.settings.findFirst({
      where: eq(settings.userId, userId),
      columns: { enabledRegions: true, aliAccessKeyId: true },
    });
    if (!row?.aliAccessKeyId) {
      return fail({
        status: 400,
        message: "阿里云凭据未配置，请先在「账号与安全」中绑定阿里云",
      });
    }

    const regions = row.enabledRegions ?? [];
    if (regions.includes(region)) {
      return ok({ regions });
    }

    // 开通地域：注册/确保对应的 OSS 存储桶存在
    const provider = getAliyunProvider();
    await provider.ensureStorage(region, ossBucketForRegion(region));

    const next = [...regions, region];
    await db
      .update(settings)
      .set({ enabledRegions: next })
      .where(eq(settings.userId, userId));
    return ok({ regions: next });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const region: string = body.region;
    if (!region || typeof region !== "string") {
      return fail({ status: 400, message: "region is required" });
    }

    const row = await db.query.settings.findFirst({
      where: eq(settings.userId, userId),
      columns: { enabledRegions: true },
    });
    const next = (row?.enabledRegions ?? []).filter((r) => r !== region);
    await db
      .update(settings)
      .set({ enabledRegions: next })
      .where(eq(settings.userId, userId));
    return ok({ regions: next });
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