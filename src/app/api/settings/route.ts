import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { requireUserId } from "@/lib/session";
import { encrypt, decrypt } from "@/lib/crypto";
import { ok, fail } from "@/lib/api";

export async function GET() {
  try {
    const userId = await requireUserId();
    const row = await db.query.settings.findFirst({
      where: eq(settings.userId, userId),
    });
    if (!row) return ok({ settings: null });

    return ok({
      settings: {
        accessKeyId: decrypt(row.aliAccessKeyId),
        accessKeySecret: "",
        defaultRegion: row.defaultRegion,
        defaultSpec: row.defaultSpec,
        defaultDiskCategory: row.defaultDiskCategory,
        defaultDiskSize: row.defaultDiskSize,
        defaultBandwidth: row.defaultBandwidth,
        defaultReleaseHours: row.defaultReleaseHours,
        defaultIdleMinutes: row.defaultIdleMinutes,
        defaultSpotStrategy: row.defaultSpotStrategy,
        defaultSpotDuration: row.defaultSpotDuration,
        acrInstanceId: row.acrInstanceId,
        ossBucket: row.ossBucket,
      },
    });
  } catch (e) {
    return fail(e);
  }
}

const bodySchema = z.object({
  accessKeyId: z.string().min(1).optional(),
  accessKeySecret: z.string().min(1).optional(),
  defaultRegion: z.string().optional(),
  defaultSpec: z.string().optional(),
  defaultDiskCategory: z.string().optional(),
  defaultDiskSize: z.number().int().optional(),
  defaultBandwidth: z.number().int().optional(),
  defaultReleaseHours: z.number().int().optional(),
  defaultIdleMinutes: z.number().int().optional(),
  defaultSpotStrategy: z.string().optional(),
  defaultSpotDuration: z.number().int().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = bodySchema.parse(await req.json());

    const existing = await db.query.settings.findFirst({
      where: eq(settings.userId, userId),
    });

    const values: Record<string, unknown> = {
      userId,
      updatedAt: new Date(),
    };
    if (body.accessKeyId) values.aliAccessKeyId = encrypt(body.accessKeyId);
    if (body.accessKeySecret) values.aliAccessSecret = encrypt(body.accessKeySecret);
    if (body.defaultRegion !== undefined) values.defaultRegion = body.defaultRegion;
    if (body.defaultSpec !== undefined) values.defaultSpec = body.defaultSpec;
    if (body.defaultDiskCategory !== undefined) values.defaultDiskCategory = body.defaultDiskCategory;
    if (body.defaultDiskSize !== undefined) values.defaultDiskSize = body.defaultDiskSize;
    if (body.defaultBandwidth !== undefined) values.defaultBandwidth = body.defaultBandwidth;
    if (body.defaultReleaseHours !== undefined) values.defaultReleaseHours = body.defaultReleaseHours;
    if (body.defaultIdleMinutes !== undefined) values.defaultIdleMinutes = body.defaultIdleMinutes;
    if (body.defaultSpotStrategy !== undefined) values.defaultSpotStrategy = body.defaultSpotStrategy;
    if (body.defaultSpotDuration !== undefined) values.defaultSpotDuration = body.defaultSpotDuration;

    if (existing) {
      // Preserve existing AK/SK if not provided.
      if (!body.accessKeyId) values.aliAccessKeyId = existing.aliAccessKeyId;
      if (!body.accessKeySecret) values.aliAccessSecret = existing.aliAccessSecret;
      await db
        .update(settings)
        .set(values as Partial<typeof settings.$inferInsert>)
        .where(eq(settings.userId, userId));
    } else {
      if (!body.accessKeyId || !body.accessKeySecret) {
        return fail(new Error("accessKeyId and accessKeySecret are required for first setup"));
      }
      await db
        .insert(settings)
        .values(values as typeof settings.$inferInsert);
    }

    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
