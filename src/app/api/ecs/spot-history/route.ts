import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getUserCredentials } from "@/lib/aliyun/auth";
import { describeSpotPriceHistory } from "@/lib/aliyun/ecs";
import { ok, fail } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const p = req.nextUrl.searchParams;
    const region = p.get("region") ?? "cn-hangzhou";
    const instanceType = p.get("instanceType");
    if (!instanceType) return fail(new Error("instanceType is required"));

    const creds = await getUserCredentials(userId);
    const history = await describeSpotPriceHistory(creds, region, instanceType);
    return ok(history);
  } catch (e) {
    return fail(e);
  }
}
