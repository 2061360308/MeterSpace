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

interface RawImage {
  id: string;
  name: string;
  description: string;
  uri: string;
  architecture: string;
  tags: string[];
  source: string;
}

interface RawFeature {
  id: string;
  name: string;
  description: string;
  uri: string;
  tags: string[];
  source: string;
  options?: Record<string, unknown>;
}

interface ImagesIndex {
  count: number;
  updatedAt: string;
  images: RawImage[];
}

interface FeaturesIndex {
  count: number;
  updatedAt: string;
  features: RawFeature[];
}

const BASE_URL =
  process.env.MARKETPLACE_URL ??
  "https://oilu.cn/MeterSpaceMarket";

let cachedImages: MarketplaceImage[] | null = null;
let cachedFeatures: MarketplaceFeature[] | null = null;
let cachedAt = 0;
const CACHE_TTL = 10 * 60 * 1000;

function mapImage(raw: RawImage): MarketplaceImage {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    imageUri: raw.uri,
    architecture: raw.architecture,
    category: raw.source,
    tags: raw.tags,
  };
}

function mapFeature(raw: RawFeature): MarketplaceFeature {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    featureUri: raw.uri,
    category: raw.source,
    tags: raw.tags,
    options: raw.options,
  };
}

export async function getMarketplaceImages(): Promise<MarketplaceImage[]> {
  if (cachedImages && Date.now() - cachedAt < CACHE_TTL) {
    return cachedImages;
  }

  const res = await fetch(`${BASE_URL}/api/images.json`, {
    next: { revalidate: 600 },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch marketplace images: ${res.status}`);
  }

  const data = (await res.json()) as ImagesIndex;
  cachedImages = data.images.map(mapImage);
  cachedAt = Date.now();
  return cachedImages;
}

export async function getMarketplaceFeatures(): Promise<MarketplaceFeature[]> {
  if (cachedFeatures && Date.now() - cachedAt < CACHE_TTL) {
    return cachedFeatures;
  }

  const res = await fetch(`${BASE_URL}/api/features.json`, {
    next: { revalidate: 600 },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch marketplace features: ${res.status}`);
  }

  const data = (await res.json()) as FeaturesIndex;
  cachedFeatures = data.features.map(mapFeature);
  cachedAt = Date.now();
  return cachedFeatures;
}
