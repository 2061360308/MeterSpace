import { createHash } from "node:crypto";
import fcUtilModule from "@alicloud/openapi-util";
import type { AliCredentials } from "./client";

interface FcSigningClient {
  getAuthorization(
    request: {
      method: string;
      pathname: string;
      headers: Record<string, string>;
      query?: Record<string, string>;
    },
    signatureAlgorithm: string,
    payload: string,
    accessKeyId: string,
    accessKeySecret: string,
  ): string;
}

const fcUtil: FcSigningClient =
  (fcUtilModule as unknown as { default?: FcSigningClient }).default ??
  (fcUtilModule as unknown as FcSigningClient);

export class AliyunFcError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "AliyunFcError";
    this.status = status;
  }
}

export interface FcInvokeEventParams {
  region: string;
  functionName: string;
  qualifier?: string;
  payload: unknown;
}

/**
 * 触发 FC3（api 2023-03-30）事件函数：POST /2023-03-30/functions/{functionName}/invocations，
 * header x-fc-invocation-type: Async，body=事件 JSON 原样透传；用官方 @alicloud/openapi-util
 * 做 ACS3-HMAC-SHA256 签名。叫 10s 超时（对齐调用方 fire-and-forget 语义）。
 */
export async function invokeEvent(
  creds: AliCredentials,
  params: FcInvokeEventParams,
): Promise<void> {
  const { region, functionName, qualifier, payload } = params;
  const host = `fc.${region}.aliyuncs.com`;
  const pathname = `/2023-03-30/functions/${encodeURIComponent(functionName)}/invocations`;
  const body = JSON.stringify(payload);
  const hashedPayload = createHash("sha256").update(body).digest("hex");
  const headers: Record<string, string> = {
    host,
    "content-type": "application/json",
    "x-acs-date": new Date().toISOString(),
    "x-acs-content-sha256": hashedPayload,
    "x-fc-invocation-type": "Async",
  };

  const request = new URL(`https://${host}${pathname}`);
  if (qualifier) request.searchParams.set("qualifier", qualifier);
  const query: Record<string, string> = qualifier ? { qualifier } : {};

  const authorization = fcUtil.getAuthorization(
    { method: "POST", pathname, headers, query },
    "ACS3-HMAC-SHA256",
    hashedPayload,
    creds.accessKeyId,
    creds.accessKeySecret,
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const resp = await fetch(request, {
      method: "POST",
      headers: { ...headers, authorization },
      body,
      signal: controller.signal,
    });
    if (!resp.ok) {
      const detail = await resp.text();
      throw new AliyunFcError(resp.status, detail || `FC invoke failed with HTTP ${resp.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}