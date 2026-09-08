import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getAliyunProvider } from "@/lib/providers";
import { ok, fail } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    await requireUserId();
    const region = req.nextUrl.searchParams.get("region") ?? "cn-hangzhou";
    const instanceId = req.nextUrl.searchParams.get("instanceId");
    const repoId = req.nextUrl.searchParams.get("repoId");
    if (!instanceId || !repoId) {
      return fail(new Error("instanceId and repoId are required"));
    }

    const provider = getAliyunProvider();
    const images = await provider.listImageTags(region, instanceId, repoId);
    return ok({ images });
  } catch (e) {
    return fail(e);
  }
}
