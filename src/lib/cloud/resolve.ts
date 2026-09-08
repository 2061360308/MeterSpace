import { getProvider } from "@/lib/cloud/registry";
import { getUserCredentials } from "@/lib/aliyun/auth";
import { AliyunPriceProvider } from "@/lib/price/aliyun-price";
import type { PriceProvider } from "@/lib/price/provider";

export async function resolveProvider(
  providerName: string,
  userId: string,
): Promise<PriceProvider> {
  if (providerName === "aliyun") {
    const creds = await getUserCredentials(userId);
    return new AliyunPriceProvider(creds);
  }
  return getProvider(providerName);
}
