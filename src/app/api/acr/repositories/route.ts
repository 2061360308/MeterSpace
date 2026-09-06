import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getUserCredentials } from "@/lib/aliyun/auth";
import { listRepositories } from "@/lib/aliyun/acr";
import { ok, fail } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const region = req.nextUrl.searchParams.get("region") ?? "cn-hangzhou";
    const instanceId = req.nextUrl.searchParams.get("instanceId");
    if (!instanceId) return fail(new Error("instanceId is required"));

    const creds = await getUserCredentials(userId);
    const repositories = await listRepositories(creds, region, instanceId);
    return ok({ repositories });
  } catch (e) {
    return fail(e);
  }
}
