import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getUserCredentials } from "@/lib/aliyun/auth";
import { listInstances } from "@/lib/aliyun/acr";
import { ok, fail } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const region = req.nextUrl.searchParams.get("region") ?? "cn-hangzhou";
    const creds = await getUserCredentials(userId);
    const instances = await listInstances(creds, region);
    return ok({ instances });
  } catch (e) {
    return fail(e);
  }
}
