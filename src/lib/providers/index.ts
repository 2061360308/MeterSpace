import type { CloudProvider } from "./types";
import { AliyunProvider } from "./aliyun";
import { TencentProvider } from "./tencent";
import { AWSProvider } from "./aws";

export * from "./types";

const providers: Record<string, CloudProvider> = {
  aliyun: new AliyunProvider(),
  tencent: new TencentProvider(),
  aws: new AWSProvider(),
};

export function getProvider(name: string): CloudProvider | undefined {
  return providers[name];
}

export function getAliyunProvider(): AliyunProvider {
  return providers.aliyun as AliyunProvider;
}

export function getAllProviders(): CloudProvider[] {
  return Object.values(providers);
}

export function getProviderNames(): string[] {
  return Object.keys(providers);
}
