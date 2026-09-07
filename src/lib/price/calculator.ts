import {
  describePrice,
  describeSpotAdvice,
  type PriceDetailInfo,
} from "@/lib/aliyun/ecs";
import type { AliCredentials } from "@/lib/aliyun/client";

export interface CalculatePriceInput {
  region: string;
  imageId: string;
  instanceType: string;
  spotStrategy: string;
  spotDuration: number;
  spotPriceLimit?: number | null;
  diskCategory: string;
  diskSize: number;
  bandwidth: number;
  durationHours: number;
}

export interface CalculatePriceResult {
  hourly: {
    instance: number;
    disk: number;
    bandwidth: number;
    total: number;
  };
  breakdown: {
    instanceOriginal: number;
    instanceDiscount: number;
    instanceDiscountRate: number;
    diskOriginal: number;
    diskDiscount: number;
    spotMode: string;
  };
  estimates: { hours: number; total: number; label: string }[];
  spotAdvice?: {
    releaseRate: number;
    historicalDiscount: number;
    estimatedSpotPrice: number;
  };
  ossStorage: {
    hourlyRatePerGB: number;
    monthlyRatePerGB: number;
    note: string;
  };
  currency: string;
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

const OSS_MONTHLY_RATE_PER_GB = 0.09;

function pick(
  details: PriceDetailInfo[],
  ...names: string[]
): PriceDetailInfo | undefined {
  return details.find((d) =>
    names.some((n) => d.resource?.toLowerCase() === n.toLowerCase()),
  );
}

export async function calculatePrice(
  creds: AliCredentials,
  input: CalculatePriceInput,
): Promise<CalculatePriceResult> {
  const details = await describePrice(creds, {
    region: input.region,
    imageId: input.imageId,
    instanceType: input.instanceType,
    spotStrategy: input.spotStrategy,
    spotDuration: input.spotDuration,
    spotPriceLimit: input.spotPriceLimit,
    diskCategory: input.diskCategory,
    diskSize: input.diskSize,
    bandwidth: input.bandwidth,
  });

  const instance = pick(details, "instance", "instancetype");
  const disk = pick(details, "systemdisk");
  const bandwidth = pick(details, "bandwidth", "internetmaxbandwidthout");

  const instanceDiscount = round(instance?.tradePrice ?? 0);
  const instanceOriginal = round(instance?.originalPrice ?? 0);
  const diskDiscount = round(disk?.tradePrice ?? 0);
  const diskOriginal = round(disk?.originalPrice ?? 0);
  const bandwidthPrice = round(bandwidth?.tradePrice ?? 0);

  const hourlyTotal = round(instanceDiscount + diskDiscount + bandwidthPrice);

  const result: CalculatePriceResult = {
    hourly: {
      instance: instanceDiscount,
      disk: diskDiscount,
      bandwidth: bandwidthPrice,
      total: hourlyTotal,
    },
    breakdown: {
      instanceOriginal,
      instanceDiscount,
      instanceDiscountRate: instanceOriginal
        ? round(instanceDiscount / instanceOriginal)
        : 1,
      diskOriginal,
      diskDiscount,
      spotMode: input.spotStrategy,
    },
    estimates: [1, 4, 8, 24].map((hours) => ({
      hours,
      total: round(hourlyTotal * hours),
      label: hours === 24 ? "1 天" : `${hours} 小时`,
    })),
    ossStorage: {
      hourlyRatePerGB: round(OSS_MONTHLY_RATE_PER_GB / 720),
      monthlyRatePerGB: OSS_MONTHLY_RATE_PER_GB,
      note: "实际费用取决于工作区数据量",
    },
    currency: "CNY",
  };

  if (input.spotStrategy !== "NoSpot") {
    try {
      const advice = await describeSpotAdvice(
        creds,
        input.region,
        input.instanceType,
        input.spotDuration,
      );
      result.spotAdvice = {
        releaseRate: advice.releaseRate,
        historicalDiscount: advice.historicalDiscount,
        // instanceDiscount (tradePrice) is already the spot price when using SpotAsPriceGo/SpotWithPriceLimit
        // historicalDiscount is just a reference for the typical discount rate
        estimatedSpotPrice: round(instanceDiscount),
      };
    } catch (e) {
      // Spot advice is best-effort; degrade gracefully without dropping the price.
      console.warn("[price] describeSpotAdvice failed:", e);
    }
  }

  return result;
}
