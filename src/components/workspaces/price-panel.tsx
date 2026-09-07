"use client";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

export interface PricePanelData {
  loading: boolean;
  hourly?: {
    instance: number;
    disk: number;
    bandwidth: number;
    total: number;
  };
  breakdown?: {
    instanceOriginal: number;
    instanceDiscount: number;
    instanceDiscountRate: number;
    spotMode: string;
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
  useSpot,
  currentStep,
  totalSteps,
  hint,
  onPrev,
  onNext,
  onProceed,
  proceeding,
}: {
  data: PricePanelData;
  useSpot: boolean;
  currentStep: number;
  totalSteps: number;
  hint?: string;
  onPrev: () => void;
  onNext: () => void;
  onProceed: () => void;
  proceeding: boolean;
}) {
  const total = data.hourly?.total ?? 0;
  const saved =
    data.breakdown && data.hourly
      ? data.breakdown.instanceOriginal - data.hourly.instance
      : 0;
  const isLastStep = currentStep === totalSteps;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-10 border-t bg-background px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
      {hint && (
        <div className="mx-auto mb-2 flex max-w-6xl items-center rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {hint}
        </div>
      )}

      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="flex items-baseline gap-2">
            {data.loading ? (
              <span className="text-sm text-muted-foreground">
                正在计算价格...
              </span>
            ) : (
              <>
                <span className="text-sm text-muted-foreground">
                  {useSpot ? "当前配置市场价格" : "当前配置费用"}
                </span>
                <span className="text-2xl font-semibold text-orange-500">
                  {formatCurrency(total)}
                  <span className="text-sm">/时</span>
                </span>
                {useSpot && data.spotAdvice && (
                  <span className="text-xs text-muted-foreground">
                    共减 {formatCurrency(saved)}/时 · 释放率{" "}
                    {(data.spotAdvice.releaseRate * 100).toFixed(0)}%
                  </span>
                )}
              </>
            )}
          </div>

          <div className="hidden items-center gap-4 text-xs text-muted-foreground md:flex">
            {data.hourly && (
              <>
                <span>实例 {formatCurrency(data.hourly.instance)}</span>
                <span>系统盘 {formatCurrency(data.hourly.disk)}</span>
                <span>带宽 {formatCurrency(data.hourly.bandwidth)}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            第 {currentStep} / {totalSteps} 步
          </span>
          {currentStep > 1 && (
            <Button variant="outline" onClick={onPrev}>
              上一步
            </Button>
          )}
          {isLastStep ? (
            <Button
              onClick={onProceed}
              disabled={proceeding}
              className="bg-orange-500 hover:bg-orange-600"
            >
              {proceeding ? "创建中..." : "创建工作区"}
            </Button>
          ) : (
            <Button
              onClick={onNext}
              disabled={proceeding}
              className="bg-orange-500 hover:bg-orange-600"
            >
              下一步
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}