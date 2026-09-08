import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getAliyunProvider } from "@/lib/providers";
import { ok, fail } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    await requireUserId();
    const region = req.nextUrl.searchParams.get("region") ?? "cn-hangzhou";
    const instanceId = req.nextUrl.searchParams.get("instanceId");
    if (!instanceId) return fail(new Error("instanceId is required"));

    const provider = getAliyunProvider();
    const repositories = await provider.listRepositories(region, instanceId);
    return ok({ repositories });
  } catch (e) {
    return fail(e);
  }
}
