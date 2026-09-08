import type { SpotPriceEstimate } from "./types";

export interface PriceProvider {
  readonly name: string;

  getEstimate(region: string, instanceType: string): Promise<SpotPriceEstimate>;

  batchGetEstimates(
    region: string,
    instanceTypes: string[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<Map<string, SpotPriceEstimate>>;
}
