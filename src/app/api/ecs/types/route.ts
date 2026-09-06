import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getUserCredentials } from "@/lib/aliyun/auth";
import { describeInstanceTypes } from "@/lib/aliyun/ecs";
import { ok, fail } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const region = req.nextUrl.searchParams.get("region") ?? "cn-hangzhou";
    const creds = await getUserCredentials(userId);
    const types = await describeInstanceTypes(creds, region);
    return ok({
      types: types.map((t) => ({
        instanceTypeId: t.instanceTypeId,
        cpuCoreCount: t.cpuCoreCount,
        memorySize: t.memorySize,
        instanceTypeFamily: t.instanceTypeFamily,
        cpuArchitecture: t.cpuArchitecture,
      })),
    });
  } catch (e) {
    return fail(e);
  }
}
