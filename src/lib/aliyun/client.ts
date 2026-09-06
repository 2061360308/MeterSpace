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
  return new RPCClient({
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    endpoint: config.endpoint,
    apiVersion: config.apiVersion,
  });
}

export const API_VERSIONS = {
  ecs: "2014-05-26",
  bss: "2017-12-14",
  acrEnterprise: "2018-12-01",
  acrPersonal: "2016-06-07",
} as const;

export function ecsEndpoint(region: string): string {
  return `https://ecs.${region}.aliyuncs.com`;
}

export function acrEndpoint(region: string): string {
  return `https://cr.${region}.aliyuncs.com`;
}

export const BSS_ENDPOINT = "https://business.aliyuncs.com";
