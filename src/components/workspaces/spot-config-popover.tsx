"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SpotPriceChart } from "./spot-price-chart";
import { formatCurrency } from "@/lib/utils";
import { type PricePanelData } from "./price-panel";
import { Settings2 } from "lucide-react";

interface SpotConfigPopoverProps {
  region: string;
  instanceType: string;
  priceData: PricePanelData;
  spotDuration: number;
  spotPriceLimit: number | null;
  onDurationChange: (duration: number) => void;
  onPriceLimitChange: (limit: number | null) => void;
}

interface SpotPriceHistory {
  timestamp: string;
  spotPrice: number;
}

export function SpotConfigPopover({
  region,
  instanceType,
  priceData,
  spotDuration,
  spotPriceLimit,
  onDurationChange,
  onPriceLimitChange,
}: SpotConfigPopoverProps) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<SpotPriceHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);

  const onDemandPrice = priceData.breakdown?.instanceOriginal ?? 0;
  const currentSpotPrice = priceData.spotAdvice?.estimatedSpotPrice ?? 0;
  const isAuto = spotPriceLimit === null;

  // Slider range: 10% ~ 100% of on-demand price
  const sliderMin = Math.max(0, Math.floor(onDemandPrice * 0.1 * 100) / 100);
  const sliderMax = Math.ceil(onDemandPrice * 100) / 100;
  const sliderValue = isAuto ? currentSpotPrice : (spotPriceLimit ?? currentSpotPrice);
  const sliderPercent = onDemandPrice > 0 ? Math.round((sliderValue / onDemandPrice) * 100) : 0;

  // Fetch spot price history when popover opens
  const fetchHistory = useCallback(async () => {
    if (!instanceType || !region) return;
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({
        region,
        instanceType,
        spotDuration: String(spotDuration),
      });
      const res = await fetch(`/api/ecs/spot-price-history?${params}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history ?? []);
      }
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }, [region, instanceType, spotDuration]);

  // Fetch current spot price with guarantee setting
  const fetchCurrentPrice = useCallback(async () => {
    if (!instanceType || !region) return;
    setFetchingPrice(true);
    try {
      // Query the current spot price using DescribePrice
      const params = new URLSearchParams({
        region,
        instanceType,
        spotStrategy: "SpotAsPriceGo",
        spotDuration: String(spotDuration),
      });
      const res = await fetch(`/api/ecs/price?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (data.details && Array.isArray(data.details)) {
          // Find the instance price from details
          const instanceDetail = data.details.find(
            (d: { resource?: string }) =>
              d.resource?.toLowerCase() === "instancetype" ||
              d.resource?.toLowerCase() === "instance"
          );
          if (instanceDetail?.tradePrice) {
            // Set the slider to the current spot price
            onPriceLimitChange(instanceDetail.tradePrice);
          }
        }
      }
    } catch {
      // ignore
    } finally {
      setFetchingPrice(false);
    }
  }, [region, instanceType, spotDuration, onPriceLimitChange]);

  useEffect(() => {
    if (open && instanceType && region) {
      fetchHistory();
    }
  }, [open, fetchHistory, instanceType, region]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="抢占式配置"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-4" align="end">
        <div className="space-y-4">
          {/* Checkboxes */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="spot-1h"
                checked={spotDuration === 1}
                onCheckedChange={(checked) =>
                  onDurationChange(checked ? 1 : 0)
                }
              />
              <Label htmlFor="spot-1h" className="text-sm font-normal cursor-pointer">
                使用 1 小时
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="spot-auto"
                checked={isAuto}
                onCheckedChange={(checked) =>
                  onPriceLimitChange(checked ? null : (currentSpotPrice || 1))
                }
              />
              <Label htmlFor="spot-auto" className="text-sm font-normal cursor-pointer">
                自动出价
              </Label>
            </div>
          </div>

          <Separator />

          {/* Price Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">上限价格</Label>
              <span className="text-sm font-medium text-orange-500">
                {formatCurrency(sliderValue)}/时
              </span>
            </div>

            <Slider
              min={sliderMin}
              max={sliderMax}
              step={0.001}
              value={[sliderValue]}
              disabled={isAuto}
              onValueChange={([v]) => onPriceLimitChange(v)}
            />

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{formatCurrency(sliderMin)} ({Math.round(sliderMin / onDemandPrice * 100) || 10}%)</span>
              <span>{sliderPercent}%</span>
              <span>按量 {formatCurrency(sliderMax)}</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={fetchingPrice || !priceData.hourly}
              onClick={fetchCurrentPrice}
            >
              {fetchingPrice ? (
                <Spinner className="mr-2 h-3 w-3" />
              ) : null}
              设置当前实例价格
            </Button>
          </div>

          <Separator />

          {/* Chart */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">近30天价格走势</Label>
            {historyLoading ? (
              <div className="flex items-center justify-center h-[140px]">
                <Spinner className="h-5 w-5" />
              </div>
            ) : (
              <SpotPriceChart
                history={history}
                onDemandPrice={onDemandPrice}
              />
            )}
          </div>

          {/* Stats */}
          {priceData.spotAdvice && (
            <>
              <Separator />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  释放率 {(priceData.spotAdvice.releaseRate * 100).toFixed(1)}%
                </span>
                <span>
                  历史折扣 {(priceData.spotAdvice.historicalDiscount * 100).toFixed(0)}%
                </span>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
