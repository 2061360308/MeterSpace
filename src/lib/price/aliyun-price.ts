import type { PriceProvider } from "@/lib/price/provider";
import type { SpotPriceEstimate } from "@/lib/price/types";
import {
  describeSpotAdvice,
  describePrice,
  findDebianImage,
} from "@/lib/aliyun/ecs";
import type { AliCredentials } from "@/lib/aliyun/client";
import { RateLimiter } from "@/lib/price/rate-limiter";

export class AliyunPriceProvider implements PriceProvider {
  readonly name = "aliyun";
  private limiter = new RateLimiter(5, 200);

  constructor(private creds: AliCredentials) {}

  async getEstimate(
    region: string,
    instanceType: string,
  ): Promise<SpotPriceEstimate> {
    return this.limiter.add(async () => {
      const [advice, imageId] = await Promise.all([
        describeSpotAdvice(this.creds, region, instanceType, 1),
        findDebianImage(this.creds, region),
      ]);

      const priceDetails = await describePrice(this.creds, {
        region,
        imageId,
        instanceType,
        spotStrategy: "NoSpot",
        spotDuration: 1,
        diskCategory: "cloud_essd",
        diskSize: 40,
        bandwidth: 10,
      });

      const instanceDetail = priceDetails.find(
        (d) => d.resource?.toLowerCase() === "instancetype",
      );

      return {
        onDemandPrice: instanceDetail?.originalPrice ?? 0,
        historicalDiscount: advice.historicalDiscount,
        releaseRate: advice.available ? advice.releaseRate : null,
      };
    });
  }

  async batchGetEstimates(
    region: string,
    instanceTypes: string[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<Map<string, SpotPriceEstimate>> {
    const result = new Map<string, SpotPriceEstimate>();
    const batchSize = 10;

    const adviceMap = new Map<
      string,
      { historicalDiscount: number; releaseRate: number }
    >();

    for (let i = 0; i < instanceTypes.length; i += batchSize) {
      const batch = instanceTypes.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((t) =>
          this.limiter.add(() =>
            describeSpotAdvice(this.creds, region, t, 1),
          ),
        ),
      );
      results.forEach((r, idx) => {
        if (r.status === "fulfilled" && r.value.available) {
          adviceMap.set(batch[idx], {
            historicalDiscount: r.value.historicalDiscount,
            releaseRate: r.value.releaseRate,
          });
        }
      });
      onProgress?.(
        Math.min(i + batchSize, instanceTypes.length),
        instanceTypes.length,
      );
    }

    const imageId = await findDebianImage(this.creds, region);

    for (let i = 0; i < instanceTypes.length; i += 5) {
      const batch = instanceTypes.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map((t) =>
          this.limiter.add(() =>
            describePrice(this.creds, {
              region,
              imageId,
              instanceType: t,
              spotStrategy: "NoSpot",
              spotDuration: 1,
              diskCategory: "cloud_essd",
              diskSize: 40,
              bandwidth: 10,
            }),
          ),
        ),
      );
      results.forEach((r, idx) => {
        if (r.status === "fulfilled") {
          const detail = r.value.find(
            (d) => d.resource?.toLowerCase() === "instancetype",
          );
          const advice = adviceMap.get(batch[idx]) ?? {
            historicalDiscount: 0,
            releaseRate: 0,
          };
          result.set(batch[idx], {
            onDemandPrice: detail?.originalPrice ?? 0,
            historicalDiscount: advice.historicalDiscount,
            releaseRate: advice.releaseRate || null,
          });
        }
      });
      onProgress?.(
        Math.min(i + 5, instanceTypes.length),
        instanceTypes.length,
      );
    }

    return result;
  }
}
