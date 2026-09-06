"use client";

import { formatCurrency } from "@/lib/utils";

export interface PricePanelData {
  loading: boolean;
  hourly?: {
    instance: number;
    disk: number;
    bandwidth: number;
    total: number;
  };
  estimates?: { hours: number; total: number; label: string }[];
  spotAdvice?: {
    releaseRate: number;
    historicalDiscount: number;
    estimatedSpotPrice: number;
  };
}

export function PricePanel({
  data,
  billingMode,
  onProceed,
  proceeding,
}: {
  data: PricePanelData;
  billingMode: "ondemand" | "spot";
  onProceed: () => void;
  proceeding: boolean;
}) {
  const total = data.hourly?.total ?? 0;
  const discountTotal = data.spotAdvice
    ? total * (1 - data.spotAdvice.historicalDiscount)
    : 0;

  return (
    <div className="sticky bottom-0 z-10 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          {data.loading ? (
            <span className="text-sm text-gray-400">正在计算价格...</span>
          ) : (
            <>
              <span className="text-sm text-gray-500">
                {billingMode === "spot" ? "当前配置市场价格" : "当前配置费用"}
                (总价)
              </span>
              <span className="text-2xl font-semibold text-orange-500">
                {formatCurrency(total)}
                <span className="text-sm">/时</span>
              </span>
              {billingMode === "spot" && data.spotAdvice && (
                <span className="text-xs text-gray-400">
                  共减 {formatCurrency(discountTotal)}/时
                </span>
              )}
            </>
          )}
        </div>

        <div className="hidden items-center gap-4 text-xs text-gray-500 md:flex">
          {data.hourly && (
            <>
              <span>
                实例 {formatCurrency(data.hourly.instance)}
              </span>
              <span>系统盘 {formatCurrency(data.hourly.disk)}</span>
              <span>带宽 {formatCurrency(data.hourly.bandwidth)}</span>
            </>
          )}
        </div>

        <button
          onClick={onProceed}
          disabled={proceeding || data.loading}
          className="rounded-md bg-orange-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {proceeding ? "创建中..." : "确认下单"}
        </button>
      </div>
    </div>
  );
}
