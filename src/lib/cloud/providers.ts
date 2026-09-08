import { registerProvider } from "@/lib/cloud/registry";

// Lazy initialization - credentials are resolved at request time
// The actual AliyunPriceProvider is created in resolveProvider()
// This module ensures the "aliyun" provider name is recognized
registerProvider("aliyun", () => {
  throw new Error("Use resolveProvider() for aliyun to get credentials at runtime");
});
