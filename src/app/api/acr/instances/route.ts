import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getAliyunProvider } from "@/lib/providers";
import { ok, fail } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    await requireUserId();
    const region = req.nextUrl.searchParams.get("region") ?? "cn-hangzhou";
    const provider = getAliyunProvider();
    const instances = await provider.listRegistryInstances(region);
    return ok({ instances });
  } catch (e) {
    return fail(e);
  }
}
