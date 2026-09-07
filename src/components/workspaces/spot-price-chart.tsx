"use client";

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";

interface SpotPriceChartProps {
  history: { timestamp: string; spotPrice: number }[];
  onDemandPrice: number;
}

export function SpotPriceChart({ history, onDemandPrice }: SpotPriceChartProps) {
  if (history.length === 0) {
    return (
      <div className="flex items-center justify-center h-[140px] text-xs text-muted-foreground">
        暂无历史价格数据
      </div>
    );
  }

  const data = history.map((p) => ({
    time: new Date(p.timestamp).toLocaleDateString("zh-CN", { month: "short", day: "numeric" }),
    price: p.spotPrice,
  }));

  const minPrice = Math.min(...data.map((d) => d.price));
  const maxPrice = Math.max(...data.map((d) => d.price));
  const yMin = Math.max(0, Math.floor(minPrice * 0.8 * 100) / 100);
  const yMax = Math.ceil(maxPrice * 1.1 * 100) / 100;

  return (
    <div className="h-[140px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="spotGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `¥${v.toFixed(2)}`}
            width={48}
          />
          <Tooltip
            contentStyle={{
              fontSize: 11,
              borderRadius: 6,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--background))",
            }}
            formatter={(value) => [`¥${Number(value).toFixed(4)}/时`, "抢占价"]}
          />
          <ReferenceLine
            y={onDemandPrice}
            stroke="hsl(var(--destructive))"
            strokeDasharray="3 3"
            strokeWidth={1}
            label={{
              value: "按量",
              position: "right",
              fontSize: 9,
              fill: "hsl(var(--destructive))",
            }}
          />
          <Area
            type="monotone"
            dataKey="price"
            stroke="hsl(var(--primary))"
            strokeWidth={1.5}
            fill="url(#spotGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
