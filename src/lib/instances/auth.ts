import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { instances } from "@/lib/db/schema";

export async function verifyAccessToken(
  instanceId: string,
  token: string,
): Promise<boolean> {
  const instance = await db.query.instances.findFirst({
    where: eq(instances.id, instanceId),
  });
  if (!instance) return false;
  if (instance.accessToken !== token) return false;
  return true;
}

export async function verifyAccessTokenWithInstance(
  instanceId: string,
  token: string,
): Promise<{ valid: boolean; instance?: typeof instances.$inferSelect }> {
  const instance = await db.query.instances.findFirst({
    where: eq(instances.id, instanceId),
  });
  if (!instance) return { valid: false };
  if (instance.accessToken !== token) return { valid: false };
  return { valid: true, instance };
}
