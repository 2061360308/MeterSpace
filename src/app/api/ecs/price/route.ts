import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getUserCredentials } from "@/lib/aliyun/auth";
import { describePrice, findUbuntu2204Image } from "@/lib/aliyun/ecs";
import { ok, fail } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const p = req.nextUrl.searchParams;
    const region = p.get("region") ?? "cn-hangzhou";
    const instanceType = p.get("instanceType");
    if (!instanceType) return fail(new Error("instanceType is required"));

    const creds = await getUserCredentials(userId);
    const imageId = await findUbuntu2204Image(creds, region);
    const details = await describePrice(creds, {
      region,
      imageId,
      instanceType,
      spotStrategy: p.get("spotStrategy") ?? "NoSpot",
      spotDuration: Number(p.get("spotDuration") ?? 1),
      diskCategory: p.get("diskCategory") ?? "cloud_essd",
      diskSize: Number(p.get("diskSize") ?? 40),
      bandwidth: Number(p.get("bandwidth") ?? 10),
    });
    return ok({ details });
  } catch (e) {
    return fail(e);
  }
}
