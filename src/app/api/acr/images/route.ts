import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getUserCredentials } from "@/lib/aliyun/auth";
import { listImageTags } from "@/lib/aliyun/acr";
import { ok, fail } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const region = req.nextUrl.searchParams.get("region") ?? "cn-hangzhou";
    const instanceId = req.nextUrl.searchParams.get("instanceId");
    const repoId = req.nextUrl.searchParams.get("repoId");
    if (!instanceId || !repoId) {
      return fail(new Error("instanceId and repoId are required"));
    }

    const creds = await getUserCredentials(userId);
    const images = await listImageTags(creds, region, instanceId, repoId);
    return ok({ images });
  } catch (e) {
    return fail(e);
  }
}
