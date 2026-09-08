export interface SpotPriceEstimate {
  onDemandPrice: number;
  historicalDiscount: number;
  releaseRate: number | null;
}

export function estimateSpotPrice(estimate: SpotPriceEstimate): number {
  return estimate.onDemandPrice * estimate.historicalDiscount;
}

export interface PriceCacheEntry extends SpotPriceEstimate {
  provider: string;
  region: string;
  instanceType: string;
  refreshedAt: Date | null;
}
