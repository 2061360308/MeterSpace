"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";

/**
 * 余额指标卡 —— Vercel 的 Metric Card 形态。
 *
 * 三个细节：
 * - 数字用大字号 + 负字距（拉丁数字适用），并开 tnum 等宽，
 *   刷新时数字不会左右跳动；
 * - 加载态用骨架屏而不是「加载中...」文案，避免文字从短到长跳动；
 * - 刷新按钮固定在右上角，不随内容变化移动。
 */
export function BalanceCard() {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    try {
      const url = refresh
        ? "/api/account/balance?refresh=true"
        : "/api/account/balance";
      const res = await fetch(url);
      const data = await res.json();
      setBalance(data.availableAmount);
    } catch {
      // 静默失败：余额只是参考信息，不该阻塞页面
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleRefresh() {
    setRefreshing(true);
    load(true);
  }

  return (
    <Card>
      <div className="px-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[13px] leading-6 text-muted-foreground">
              账户余额
            </div>
            {loading ? (
              <Skeleton className="mt-1 h-9 w-36" />
            ) : (
              <p className="mt-1 text-[32px] font-semibold leading-10 tracking-[-0.02em] tnum">
                {formatCurrency(balance)}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={refreshing || loading}
            onClick={handleRefresh}
            title="刷新余额"
          >
            <RefreshCw className={refreshing ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>
    </Card>
  );
}
