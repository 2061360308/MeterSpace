import { requireUserId } from "@/lib/session";
import { getUserCredentials } from "@/lib/aliyun/auth";
import { queryAccountBalance } from "@/lib/aliyun/bss";
import { ok, fail } from "@/lib/api";

export async function GET() {
  try {
    const userId = await requireUserId();
    const creds = await getUserCredentials(userId);
    const balance = await queryAccountBalance(creds);
    return ok(balance);
  } catch (e) {
    return fail(e);
  }
}
