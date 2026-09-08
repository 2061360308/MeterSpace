export interface MarketplaceImage {
  id: string;
  name: string;
  description: string;
  imageUri: string;
  architecture: string;
  category: string;
  icon?: string;
  tags: string[];
}

export interface MarketplaceFeature {
  id: string;
  name: string;
  description: string;
  featureUri: string;
  category: string;
  icon?: string;
  tags: string[];
  options?: Record<string, unknown>;
}

export interface MarketplaceManifest {
  version: string;
  images: MarketplaceImage[];
  features: MarketplaceFeature[];
}

const MANIFEST_URL =
  process.env.MARKETPLACE_URL ??
  "https://oilu.cn/MeterSpaceMarket/api/manifest.json";

let cachedManifest: MarketplaceManifest | null = null;
let cachedAt = 0;
const CACHE_TTL = 10 * 60 * 1000;

export async function fetchManifest(): Promise<MarketplaceManifest> {
  if (cachedManifest && Date.now() - cachedAt < CACHE_TTL) {
    return cachedManifest;
  }

  const res = await fetch(MANIFEST_URL, {
    next: { revalidate: 600 },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch marketplace manifest: ${res.status}`);
  }

  const data = (await res.json()) as MarketplaceManifest;
  cachedManifest = data;
  cachedAt = Date.now();
  return data;
}

export async function getMarketplaceImages(): Promise<MarketplaceImage[]> {
  const manifest = await fetchManifest();
  return manifest.images ?? [];
}

export async function getMarketplaceFeatures(): Promise<MarketplaceFeature[]> {
  const manifest = await fetchManifest();
  return manifest.features ?? [];
}
