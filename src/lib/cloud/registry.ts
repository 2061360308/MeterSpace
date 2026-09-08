import type { PriceProvider } from "@/lib/price/provider";

const providers = new Map<string, () => PriceProvider>();

export function registerProvider(name: string, factory: () => PriceProvider) {
  providers.set(name, factory);
}

export function getProvider(name: string): PriceProvider {
  const factory = providers.get(name);
  if (!factory) throw new Error(`Unknown provider: ${name}`);
  return factory();
}

export function listProviders(): string[] {
  return [...providers.keys()];
}
