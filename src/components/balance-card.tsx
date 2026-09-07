"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

export function BalanceCard() {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    try {
      const url = refresh ? "/api/account/balance?refresh=true" : "/api/account/balance";
      const res = await fetch(url);
      const data = await res.json();
      setBalance(data.availableAmount);
    } catch {
      // ignore
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
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">账户余额</h2>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={refreshing}
          onClick={handleRefresh}
        >
          <RefreshCw className={refreshing ? "animate-spin" : ""} />
        </Button>
      </div>
      <p className="mt-2 text-2xl font-semibold">
        {loading ? "加载中..." : formatCurrency(balance)}
      </p>
    </div>
  );
}
