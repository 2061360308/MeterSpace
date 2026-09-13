"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { APIError } from "@/components/ui/error";
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
    <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto max-w-[1200px] space-y-2">
        {hint && <APIError message={hint} />}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            {data.loading ? (
              <span className="text-[13px] leading-6 text-muted-foreground">
                正在计算价格…
              </span>
            ) : (
              <>
                <span className="text-[13px] leading-6 text-muted-foreground">
                  {useSpot ? "当前配置市场价格" : "当前配置费用"}
                </span>
                <span className="tnum text-[24px] font-semibold leading-8 tracking-[-0.02em]">
                  {formatCurrency(total)}
                  <span className="text-[13px] font-normal leading-6 text-muted-foreground">
                    /时
                  </span>
                </span>
                {useSpot && data.spotAdvice && (
                  <span className="tnum text-[12px] leading-5 text-muted-foreground">
                    共减 {formatCurrency(saved)}/时 · 释放率{" "}
                    {(data.spotAdvice.releaseRate * 100).toFixed(0)}%
                  </span>
                )}
              </>
            )}

            {data.hourly && (
              <div className="tnum hidden items-center gap-3 text-[12px] leading-5 text-muted-foreground md:flex">
                <span>实例 {formatCurrency(data.hourly.instance)}</span>
                <span className="text-border">·</span>
                <span>系统盘 {formatCurrency(data.hourly.disk)}</span>
                <span className="text-border">·</span>
                <span>带宽 {formatCurrency(data.hourly.bandwidth)}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="tnum text-[12px] leading-5 text-muted-foreground">
              第 {currentStep} / {totalSteps} 步
            </span>
            {currentStep > 1 && (
              <Button variant="outline" onClick={onPrev}>
                上一步
              </Button>
            )}
            {isLastStep ? (
              <Button onClick={onProceed} disabled={proceeding}>
                {proceeding && <Spinner data-icon="inline-start" />}
                {proceeding ? "创建中…" : "创建工作区"}
              </Button>
            ) : (
              <Button onClick={onNext} disabled={proceeding}>
                下一步
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
