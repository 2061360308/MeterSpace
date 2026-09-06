import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getUserCredentials } from "@/lib/aliyun/auth";
import { describeSpotAdvice } from "@/lib/aliyun/ecs";
import { ok, fail } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const p = req.nextUrl.searchParams;
    const region = p.get("region") ?? "cn-hangzhou";
    const instanceType = p.get("instanceType");
    if (!instanceType) return fail(new Error("instanceType is required"));

    const creds = await getUserCredentials(userId);
    const advice = await describeSpotAdvice(
      creds,
      region,
      instanceType,
      Number(p.get("spotDuration") ?? 1),
    );
    return ok(advice);
  } catch (e) {
    return fail(e);
  }
}
