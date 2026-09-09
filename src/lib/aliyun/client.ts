import RPCClient from "@alicloud/pop-core";

export interface AliCredentials {
  accessKeyId: string;
  accessKeySecret: string;
}

export interface RpcClientConfig extends AliCredentials {
  endpoint: string;
  apiVersion: string;
}

export function createRpcClient(config: RpcClientConfig): RPCClient {
  const client = new RPCClient({
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    endpoint: config.endpoint,
    apiVersion: config.apiVersion,
  });
  const orig = client.request.bind(client);
  (client as unknown as { request: typeof orig }).request = async <T>(
    action: string,
    params: Record<string, unknown>,
    opts?: Record<string, unknown>,
  ): Promise<T> => {
    const res = await orig(action, params, opts);
    return normalizeKeys(res) as T;
  };
  return client;
}

/**
 * Deep-normalize Aliyun API response keys from PascalCase ("InstanceTypeId")
 * to camelCase ("instanceTypeId"). Array items and nested objects are recursed.
 */
function camel(s: string): string {
  if (s.includes(".") || s.includes("-")) return s;
  const withCap = s.replace(/([A-Z]+)(?=[A-Z][a-z]|\b)/g, (m) =>
    m.length > 1 ? m.slice(0, -1) + m.slice(-1).toLowerCase() : m.toLowerCase(),
  );
  return withCap.charAt(0).toLowerCase() + withCap.slice(1);
}

export function normalizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[camel(k)] = normalizeKeys(v);
    }
    return out;
  }
  return value;
}

export const API_VERSIONS = {
  ecs: "2014-05-26",
  bss: "2017-12-14",
  acrEnterprise: "2018-12-01",
  acrPersonal: "2016-06-07",
} as const;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ecsEndpoint(_region: string): string {
  // Use global endpoint for Vercel compatibility (regional endpoints timeout from overseas)
  return `https://ecs.aliyuncs.com`;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function acrEndpoint(_region: string): string {
  // Use global endpoint for Vercel compatibility (regional endpoints timeout from overseas)
  return `https://cr.aliyuncs.com`;
}

export const BSS_ENDPOINT = "https://business.aliyuncs.com";
