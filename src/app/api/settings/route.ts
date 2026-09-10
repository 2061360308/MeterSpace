import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { requireUserId } from "@/lib/session";
import { encrypt, decrypt } from "@/lib/crypto";
import { ok, fail } from "@/lib/api";
import { cacheDelete, cacheKey } from "@/lib/cache";

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
        logRetentionDays: row.logRetentionDays,
        githubMirror: row.githubMirror,
        dockerMirror: row.dockerMirror,
        proxyMode: row.proxyMode,
        proxyClashSubscription: row.proxyClashSubscription,
        proxyClashYaml: row.proxyClashYaml,
        proxyUpstreamUrl: row.proxyUpstreamUrl,
        proxyUpstreamUsername: row.proxyUpstreamUsername,
        proxyUpstreamSecret: row.proxyUpstreamSecret ? "••••••" : null,
        proxyProbeUrls: row.proxyProbeUrls ?? [],
        proxyBypass: row.proxyBypass ?? [],
        clashBinUrl: row.clashBinUrl,
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
  logRetentionDays: z.number().int().min(1).max(365).optional(),
  githubMirror: z.string().max(500).nullable().optional(),
  dockerMirror: z.string().max(500).nullable().optional(),
  proxyMode: z.enum(["disabled", "clash", "upstream"]).optional(),
  proxyClashSubscription: z.string().max(2000).nullable().optional(),
  proxyClashYaml: z.string().max(100000).nullable().optional(),
  proxyUpstreamUrl: z.string().max(500).nullable().optional(),
  proxyUpstreamUsername: z.string().max(200).nullable().optional(),
  proxyUpstreamSecret: z.string().max(200).nullable().optional(),
  proxyProbeUrls: z.array(z.string().max(500)).max(50).optional(),
  proxyBypass: z.array(z.string().max(500)).max(50).optional(),
  clashBinUrl: z.string().max(1000).nullable().optional(),
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
    if (body.logRetentionDays !== undefined) values.logRetentionDays = body.logRetentionDays;
    if (body.githubMirror !== undefined) values.githubMirror = body.githubMirror;
    if (body.dockerMirror !== undefined) values.dockerMirror = body.dockerMirror;
    if (body.proxyMode !== undefined) values.proxyMode = body.proxyMode;
    if (body.proxyClashSubscription !== undefined)
      values.proxyClashSubscription = body.proxyClashSubscription;
    if (body.proxyClashYaml !== undefined) values.proxyClashYaml = body.proxyClashYaml;
    if (body.proxyUpstreamUrl !== undefined) values.proxyUpstreamUrl = body.proxyUpstreamUrl;
    if (body.proxyUpstreamUsername !== undefined)
      values.proxyUpstreamUsername = body.proxyUpstreamUsername;
    if (body.proxyUpstreamSecret !== undefined)
      values.proxyUpstreamSecret = body.proxyUpstreamSecret
        ? encrypt(body.proxyUpstreamSecret)
        : existing?.proxyUpstreamSecret ?? null;
    if (body.proxyProbeUrls !== undefined) values.proxyProbeUrls = body.proxyProbeUrls;
    if (body.proxyBypass !== undefined) values.proxyBypass = body.proxyBypass;
    if (body.clashBinUrl !== undefined) values.clashBinUrl = body.clashBinUrl;

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

    // Invalidate user-specific caches when settings change
    cacheDelete(cacheKey("balance", userId));

    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
