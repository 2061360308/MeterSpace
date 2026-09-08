import type { CloudProvider } from "./types";
import { AliyunProvider } from "./aliyun";
import { TencentProvider } from "./tencent";
import { AWSProvider } from "./aws";

const providers: Record<string, CloudProvider> = {
  aliyun: new AliyunProvider(),
  tencent: new TencentProvider(),
  aws: new AWSProvider(),
};

/** Get a cloud provider instance by name */
export function getProvider(name: string): CloudProvider | undefined {
  return providers[name];
}

/** Get all registered providers */
export function getAllProviders(): CloudProvider[] {
  return Object.values(providers);
}

/** Get all provider names */
export function getProviderNames(): string[] {
  return Object.keys(providers);
}
