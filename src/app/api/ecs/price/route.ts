import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getAliyunProvider } from "@/lib/providers";
import { ok, fail } from "@/lib/api";
import { getCachedQuote, upsertQuote } from "@/lib/price/service";
import type { CloudPriceDetail } from "@/lib/providers/types";

/**
 * ECS 报价明细。
 *
 * 改走 **DB 缓存**（`price_quote_cache`，24h TTL）：用户每改一次磁盘/带宽就会
 * 触发一次新的报价请求，原先用进程内 Map 缓存 —— serverless 下等于没有缓存，
 * 每次交互都实时打云，是规格页最明显的卡顿来源。见 docs/UI-PERFORMANCE.md U4。
 *
 * `?refresh=1` 可强制绕过缓存（前端「刷新报价」按钮用）。
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const p = req.nextUrl.searchParams;
    const region = p.get("region") ?? "cn-hangzhou";
    const instanceType = p.get("instanceType");
    if (!instanceType) return fail(new Error("instanceType is required"));

    const spotStrategy = p.get("spotStrategy") ?? "NoSpot";
    const spotDuration = Number(p.get("spotDuration") ?? 1);
    const diskCategory = p.get("diskCategory") ?? "cloud_essd";
    const diskSize = Number(p.get("diskSize") ?? 40);
    const bandwidth = Number(p.get("bandwidth") ?? 10);
    const forceRefresh = p.get("refresh") === "1";

    const params = {
      provider: "aliyun",
      region,
      instanceType,
      diskCategory,
      diskSize,
      bandwidth,
      spotStrategy,
      spotDuration,
    };

    if (!forceRefresh) {
      const cached = await getCachedQuote<CloudPriceDetail[]>(params);
      if (cached) {
        return ok({
          details: cached.details,
          cached: true,
          refreshedAt: cached.refreshedAt,
        });
      }
    }

    // 缓存未命中才真正打云。userId 上面已经校验过，这里复用同一个 provider 凭据。
    void userId;
    const provider = getAliyunProvider();
    const imageId = await provider.findImage(region, "debian", "12");
    const details = await provider.describePrice({
      region,
      imageId,
      instanceType,
      spotStrategy,
      spotDuration,
      diskCategory,
      diskSize,
      bandwidth,
    });

    await upsertQuote(params, details);

    return ok({ details, cached: false });
  } catch (e) {
    return fail(e);
  }
}
