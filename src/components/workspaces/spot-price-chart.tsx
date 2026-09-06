"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface Point {
  timestamp: string;
  spotPrice: number;
}

export function SpotPriceChart({
  region,
  instanceType,
}: {
  region: string;
  instanceType: string;
}) {
  const [data, setData] = useState<{ time: string; price: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(
      `/api/ecs/spot-history?region=${encodeURIComponent(region)}&instanceType=${encodeURIComponent(instanceType)}`,
    )
      .then((r) => r.json())
      .then((points: Point[]) =>
        setData(
          points.map((p) => ({
            time: new Date(p.timestamp).toLocaleDateString(),
            price: p.spotPrice,
          })),
        ),
      )
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [region, instanceType]);

  if (loading) {
    return <div className="h-40 text-sm text-gray-400">加载历史价格...</div>;
  }
  if (data.length === 0) {
    return <div className="h-40 text-sm text-gray-400">暂无历史价格数据</div>;
  }

  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="time" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => `¥${Number(v).toFixed(4)}`} />
          <Line
            type="monotone"
            dataKey="price"
            name="抢占价"
            stroke="#2563eb"
            dot={false}
            strokeWidth={1.5}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
