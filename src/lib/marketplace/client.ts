/** 市场模板条目：定义是标准模板元数据，payload 是内联文件数组（§9 / §14）。 */
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

const BASE_URL =
  process.env.MARKETPLACE_URL ??
  "https://oilu.cn/MeterSpaceMarket";

let cachedTemplates: MarketplaceTemplate[] | null = null;
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

/**
 * 市场模板。拉取失败时返回空数组而非抛错 —— 市场是可选增强，
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
  return cachedTemplates;
}
