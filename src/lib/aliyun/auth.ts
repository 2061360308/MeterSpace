import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { decrypt } from "@/lib/crypto";
import type { AliCredentials } from "./client";

export interface UserSettings {
  accessKeyId: string;
  accessKeySecret: string;
  defaultRegion: string;
  defaultSpec: string;
  defaultDiskCategory: string;
  defaultDiskSize: number;
  defaultBandwidth: number;
  defaultReleaseHours: number;
  defaultIdleMinutes: number;
  defaultSpotStrategy: string;
  defaultSpotDuration: number;
  acrInstanceId: string | null;
  ossBucket: string | null;
}

/** Load + decrypt a user's Aliyun credentials from the settings table. */
export async function getUserCredentials(
  userId: string,
): Promise<AliCredentials> {
  const row = await db.query.settings.findFirst({
    where: eq(settings.userId, userId),
  });
  if (!row) {
    throw new Error("Aliyun credentials not configured");
  }
  return {
    accessKeyId: decrypt(row.aliAccessKeyId),
    accessKeySecret: decrypt(row.aliAccessSecret),
  };
}

/** Load a user's full (decrypted + resolved) settings. */
export async function getUserSettings(
  userId: string,
): Promise<UserSettings> {
  const row = await db.query.settings.findFirst({
    where: eq(settings.userId, userId),
  });
  if (!row) {
    throw new Error("Aliyun settings not configured");
  }
  return {
    accessKeyId: decrypt(row.aliAccessKeyId),
    accessKeySecret: decrypt(row.aliAccessSecret),
    defaultRegion: row.defaultRegion ?? "cn-hangzhou",
    defaultSpec: row.defaultSpec ?? "ecs.g6.xlarge",
    defaultDiskCategory: row.defaultDiskCategory ?? "cloud_essd",
    defaultDiskSize: row.defaultDiskSize ?? 40,
    defaultBandwidth: row.defaultBandwidth ?? 10,
    defaultReleaseHours: row.defaultReleaseHours ?? 4,
    defaultIdleMinutes: row.defaultIdleMinutes ?? 30,
    defaultSpotStrategy: row.defaultSpotStrategy ?? "NoSpot",
    defaultSpotDuration: row.defaultSpotDuration ?? 1,
    acrInstanceId: row.acrInstanceId,
    ossBucket: row.ossBucket,
  };
}

/** Resolve a workspace's effective release hours / idle minutes with global defaults. */
export function resolveLifecycle(
  workspace: { releaseHours: number | null; idleMinutes: number | null },
  s: UserSettings,
): { releaseHours: number; idleMinutes: number } {
  return {
    releaseHours: workspace.releaseHours ?? s.defaultReleaseHours,
    idleMinutes: workspace.idleMinutes ?? s.defaultIdleMinutes,
  };
}
