import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { gitTokens } from "@/lib/db/schema";
import { encrypt, decrypt } from "@/lib/crypto";

export async function storeGitToken(
  userId: string,
  provider: string,
  token: string,
  username?: string | null,
): Promise<void> {
  await db
    .insert(gitTokens)
    .values({
      userId,
      provider,
      tokenEnc: encrypt(token),
      username: username ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [gitTokens.userId, gitTokens.provider],
      set: { tokenEnc: encrypt(token), username: username ?? null, updatedAt: new Date() },
    });
}

export async function getGitToken(
  userId: string,
  provider: string,
): Promise<string | null> {
  const row = await db.query.gitTokens.findFirst({
    where: and(eq(gitTokens.userId, userId), eq(gitTokens.provider, provider)),
  });
  if (!row) return null;
  return decrypt(row.tokenEnc);
}

/** Return the encrypted token (for copying into a workspace's git_token_enc). */
export async function getGitTokenEnc(
  userId: string,
  provider: string,
): Promise<string | null> {
  const row = await db.query.gitTokens.findFirst({
    where: and(eq(gitTokens.userId, userId), eq(gitTokens.provider, provider)),
  });
  return row?.tokenEnc ?? null;
}
