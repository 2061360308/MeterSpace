import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/session";
import { queryAccountBalance } from "@/lib/aliyun/bss";
import { ok, fail } from "@/lib/api";

const bodySchema = z.object({
  accessKeyId: z.string().min(1),
  accessKeySecret: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    await requireUserId();
    const body = bodySchema.parse(await req.json());
    const balance = await queryAccountBalance({
      accessKeyId: body.accessKeyId,
      accessKeySecret: body.accessKeySecret,
    });
    return ok({ connected: true, balance });
  } catch (e) {
    return fail(e);
  }
}
