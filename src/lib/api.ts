import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(e: unknown): NextResponse {
  if (e instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid request", details: e.issues },
      { status: 400 },
    );
  }
  const anyErr = e as { status?: number; message?: string; code?: string };
  const status = typeof anyErr?.status === "number" ? anyErr.status : 500;
  const message = anyErr?.message ?? "Internal Server Error";
  return NextResponse.json({ error: message, code: anyErr?.code }, { status });
}

/** Wrap a route handler with try/catch -> JSON error. */
export function withErrorHandler(
  fn: () => Promise<Response>,
): Promise<Response> {
  return fn().catch(fail);
}
