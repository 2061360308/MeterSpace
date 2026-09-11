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

/** 市场模板条目：definition 是标准模板元数据，payload 是内联文件数组（§9 / §14）。 */
export interface MarketplaceTemplate {
  id: string;
  name: string;
  description: string;
  definition: unknown;
  payload: unknown[];
  version: string;
  category?: string;
  tags: string[];
}

interface RawTemplate {
  id: string;
  name: string;
  description?: string;
  definition?: unknown;
  payload?: unknown[];
  version?: string;
  category?: string;
  tags?: string[];
}

interface TemplatesIndex {
  count: number;
  updatedAt: string;
  templates: RawTemplate[];
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
let cachedTemplates: MarketplaceTemplate[] | null = null;
let cachedAt = 0;
let cachedTemplatesAt = 0;
const CACHE_TTL = 10 * 60 * 1000;

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (e) {
    console.warn(`[marketplace] fetch ${url} failed:`, (e as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

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

  const data = await fetchJson<ImagesIndex>(`${BASE_URL}/api/images.json`);
  if (!data) return [];
  cachedImages = data.images.map(mapImage);
  cachedAt = Date.now();
  return cachedImages;
}

/**
 * 市场模板（G5）。拉取失败时返回空数组而非抛错 —— 市场是可选增强，
 * 不能因为它挂了就让 /api/templates 整个 500。
 */
export async function getMarketplaceTemplates(): Promise<MarketplaceTemplate[]> {
  if (cachedTemplates && Date.now() - cachedTemplatesAt < CACHE_TTL) {
    return cachedTemplates;
  }

  const data = await fetchJson<TemplatesIndex>(`${BASE_URL}/api/templates.json`);
  if (!data) return [];

  const list = (data.templates ?? [])
    .filter((t) => t?.id && t?.definition)
    .map((t) => ({
      id: t.id,
      name: t.name ?? t.id,
      description: t.description ?? "",
      definition: t.definition,
      payload: Array.isArray(t.payload) ? t.payload : [],
      version: t.version ?? "1",
      category: t.category,
      tags: Array.isArray(t.tags) ? t.tags : [],
    }));
  cachedTemplates = list;
  cachedTemplatesAt = Date.now();
  return list;
}

export async function getMarketplaceFeatures(): Promise<MarketplaceFeature[]> {
  if (cachedFeatures && Date.now() - cachedAt < CACHE_TTL) {
    return cachedFeatures;
  }

  const data = await fetchJson<FeaturesIndex>(`${BASE_URL}/api/features.json`);
  if (!data) return [];
  cachedFeatures = data.features.map(mapFeature);
  cachedAt = Date.now();
  return cachedFeatures;
}
