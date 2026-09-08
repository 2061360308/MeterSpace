import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { describeRegions } from "@/lib/aliyun/ecs";
import { getUserCredentials } from "@/lib/aliyun/auth";
import type { CloudProvider, CloudRegion } from "./types";

export class AliyunProvider implements CloudProvider {
  readonly name = "aliyun";
  readonly label = "阿里云";

  async getRegions(): Promise<CloudRegion[]> {
    const userId = await this.getFirstUserId();
    const creds = await getUserCredentials(userId);
    const rawRegions = await describeRegions(creds);
    const seen = new Set<string>();
    return rawRegions
      .filter((r) => {
        if (seen.has(r.regionId)) return false;
        seen.add(r.regionId);
        return true;
      })
      .map((r) => ({ id: r.regionId, label: `${r.localName} (${r.regionId})` }));
  }

  async hasCredentials(userId: string): Promise<boolean> {
    const row = await db.query.settings.findFirst({
      where: eq(settings.userId, userId),
      columns: { aliAccessKeyId: true },
    });
    return !!row?.aliAccessKeyId;
  }

  private async getFirstUserId(): Promise<string> {
    // For region listing, we need at least one user with credentials
    // This is a simplified approach - in production you might want to cache this
    const row = await db.query.settings.findFirst({
      columns: { userId: true },
    });
    if (!row) throw new Error("No Aliyun credentials configured");
    return row.userId;
  }
}
