import { requireUserId } from "@/lib/session";
import { getUserCredentials } from "@/lib/aliyun/auth";
import { describeRegions } from "@/lib/aliyun/ecs";
import { ok, fail } from "@/lib/api";

export async function GET() {
  try {
    const userId = await requireUserId();
    const creds = await getUserCredentials(userId);
    const regions = await describeRegions(creds);
    return ok(regions);
  } catch (e) {
    return fail(e);
  }
}
