import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { instanceCache, priceCache, priceQuoteCache } from "@/lib/db/schema";
import type { PriceProvider } from "@/lib/price/provider";
import type { SpotPriceEstimate } from "@/lib/price/types";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function isFresh(date: Date | null): boolean {
  if (!date) return false;
  return Date.now() - date.getTime() < CACHE_TTL_MS;
}

// ─── Instance Cache ───────────────────────────────────────

export interface CachedInstanceType {
  instanceTypeId: string;
  cpuCoreCount: number;
  memorySize: number;
  gpuCount: number;
  instanceTypeFamily?: string | null;
  cpuArchitecture?: string | null;
  gpuSpec?: string | null;
}

export async function getCachedInstanceTypes(
  providerName: string,
  region: string,
): Promise<{ instances: CachedInstanceType[]; cached: boolean; refreshedAt: Date | null }> {
  const rows = await db.query.instanceCache.findMany({
    where: and(
      eq(instanceCache.provider, providerName),
      eq(instanceCache.region, region),
    ),
  });

  if (rows.length > 0 && isFresh(rows[0].refreshedAt)) {
    return {
      instances: rows.map((r) => ({
        instanceTypeId: r.instanceType,
        cpuCoreCount: r.cpuCoreCount,
        memorySize: r.memorySize,
        gpuCount: r.gpuCount,
        instanceTypeFamily: r.instanceTypeFamily,
        cpuArchitecture: r.cpuArchitecture,
        gpuSpec: r.gpuSpec,
      })),
      cached: true,
      refreshedAt: rows[0].refreshedAt,
    };
  }

  return { instances: [], cached: false, refreshedAt: null };
}

export async function upsertInstanceTypes(
  providerName: string,
  region: string,
  instances: CachedInstanceType[],
): Promise<void> {
  if (instances.length === 0) return;

  const now = new Date();
  const batchSize = 100;

  for (let i = 0; i < instances.length; i += batchSize) {
    const batch = instances.slice(i, i + batchSize);
    await db
      .insert(instanceCache)
      .values(
        batch.map((inst) => ({
          provider: providerName,
          region,
          instanceType: inst.instanceTypeId,
          cpuCoreCount: inst.cpuCoreCount,
          memorySize: inst.memorySize,
          gpuCount: inst.gpuCount,
          instanceTypeFamily: inst.instanceTypeFamily ?? null,
          cpuArchitecture: inst.cpuArchitecture ?? null,
          gpuSpec: inst.gpuSpec ?? null,
          refreshedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [instanceCache.provider, instanceCache.region, instanceCache.instanceType],
        set: {
          cpuCoreCount: sql`excluded.cpu_core_count`,
          memorySize: sql`excluded.memory_size`,
          gpuCount: sql`excluded.gpu_count`,
          instanceTypeFamily: sql`excluded.instance_type_family`,
          cpuArchitecture: sql`excluded.cpu_architecture`,
          gpuSpec: sql`excluded.gpu_spec`,
          refreshedAt: now,
        },
      });
  }
}

// ─── Price Cache ──────────────────────────────────────────

export async function getCachedPrices(
  providerName: string,
  region: string,
  instanceTypes: string[],
): Promise<Map<string, { estimate: SpotPriceEstimate; fresh: boolean }>> {
  const result = new Map<string, { estimate: SpotPriceEstimate; fresh: boolean }>();

  if (instanceTypes.length === 0) return result;

  const rows = await db.query.priceCache.findMany({
    where: and(
      eq(priceCache.provider, providerName),
      eq(priceCache.region, region),
      inArray(priceCache.instanceType, instanceTypes),
    ),
  });

  for (const row of rows) {
    const fresh = isFresh(row.refreshedAt);
    result.set(row.instanceType, {
      estimate: {
        onDemandPrice: row.onDemandPrice ?? 0,
        historicalDiscount: row.historicalDiscount ?? 0,
        releaseRate: row.releaseRate,
      },
      fresh,
    });
  }

  return result;
}

export async function upsertPrices(
  providerName: string,
  region: string,
  estimates: Map<string, SpotPriceEstimate>,
): Promise<void> {
  const now = new Date();
  const entries = [...estimates.entries()];
  const batchSize = 50;

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    await db
      .insert(priceCache)
      .values(
        batch.map(([instanceType, est]) => ({
          provider: providerName,
          region,
          instanceType,
          onDemandPrice: est.onDemandPrice,
          historicalDiscount: est.historicalDiscount,
          releaseRate: est.releaseRate,
          refreshedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [priceCache.provider, priceCache.region, priceCache.instanceType],
        set: {
          onDemandPrice: sql`excluded.on_demand_price`,
          historicalDiscount: sql`excluded.historical_discount`,
          releaseRate: sql`excluded.release_rate`,
          refreshedAt: now,
        },
      });
  }
}

// ─── Combined: Get or Fetch Prices ────────────────────────

export async function getOrFetchPrices(
  provider: PriceProvider,
  region: string,
  instanceTypes: string[],
): Promise<Map<string, SpotPriceEstimate & { cached: boolean }>> {
  const cached = await getCachedPrices(provider.name, region, instanceTypes);
  const result = new Map<string, SpotPriceEstimate & { cached: boolean }>();
  const toFetch: string[] = [];

  for (const t of instanceTypes) {
    const entry = cached.get(t);
    if (entry && entry.fresh) {
      result.set(t, { ...entry.estimate, cached: true });
    } else {
      toFetch.push(t);
    }
  }

  if (toFetch.length > 0) {
    const fresh = await provider.batchGetEstimates(region, toFetch);
    await upsertPrices(provider.name, region, fresh);

    for (const [t, est] of fresh) {
      result.set(t, { ...est, cached: false });
    }
  }

  return result;
}

// ─── Quote Cache (describePrice 明细) ─────────────────────

export interface QuoteParams {
  provider: string;
  region: string;
  instanceType: string;
  diskCategory: string;
  diskSize: number;
  bandwidth: number;
  spotStrategy: string;
  spotDuration: number;
}

export async function getCachedQuote<T>(
  params: QuoteParams,
): Promise<{ details: T; refreshedAt: Date | null } | null> {
  const row = await db.query.priceQuoteCache.findFirst({
    where: and(
      eq(priceQuoteCache.provider, params.provider),
      eq(priceQuoteCache.region, params.region),
      eq(priceQuoteCache.instanceType, params.instanceType),
      eq(priceQuoteCache.diskCategory, params.diskCategory),
      eq(priceQuoteCache.diskSize, params.diskSize),
      eq(priceQuoteCache.bandwidth, params.bandwidth),
      eq(priceQuoteCache.spotStrategy, params.spotStrategy),
      eq(priceQuoteCache.spotDuration, params.spotDuration),
    ),
  });

  if (!row || !isFresh(row.refreshedAt)) return null;
  return { details: row.details as T, refreshedAt: row.refreshedAt };
}

export async function upsertQuote(
  params: QuoteParams,
  details: unknown,
): Promise<void> {
  const now = new Date();
  await db
    .insert(priceQuoteCache)
    .values({
      provider: params.provider,
      region: params.region,
      instanceType: params.instanceType,
      diskCategory: params.diskCategory,
      diskSize: params.diskSize,
      bandwidth: params.bandwidth,
      spotStrategy: params.spotStrategy,
      spotDuration: params.spotDuration,
      details,
      refreshedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        priceQuoteCache.provider,
        priceQuoteCache.region,
        priceQuoteCache.instanceType,
        priceQuoteCache.diskCategory,
        priceQuoteCache.diskSize,
        priceQuoteCache.bandwidth,
        priceQuoteCache.spotStrategy,
        priceQuoteCache.spotDuration,
      ],
      set: { details: sql`excluded.details`, refreshedAt: now },
    });
}

// ─── Refresh Region ───────────────────────────────────────
export async function refreshRegionInstances(
  provider: PriceProvider,
  region: string,
  fetchInstances: () => Promise<CachedInstanceType[]>,
): Promise<{ total: number }> {
  const instances = await fetchInstances();
  await upsertInstanceTypes(provider.name, region, instances);
  return { total: instances.length };
}
