import { NextRequest } from "next/server";
import { pollInstanceStep } from "@/lib/instances/lifecycle";

export const dynamic = "force-dynamic";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let res = 0;
  for (let i = 0; i < a.length; i++) {
    res |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return res === 0;
}

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const expected = process.env.TASKS_WORKER_TOKEN ?? "";
  if (!expected || !token || !timingSafeEqual(token, expected)) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id: instanceId } = await params;
  if (!instanceId) {
    return new Response(JSON.stringify({ ok: false, error: "missing instanceId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await pollInstanceStep(instanceId);
  return Response.json({ ok: true, state: result });
}
