"use client";

import { Input, Select } from "@/components/ui";

export interface DiskSelection {
  category: string;
  size: number;
  releaseWithInstance: boolean;
  encrypted: boolean;
}

const DISK_OPTIONS = [
  { id: "cloud_essd_entry", label: "ESSD Entry", iops: "6,000 / 150", note: "适合低 IO 负载或测试场景" },
  { id: "cloud_essd", label: "ESSD PL0", iops: "1 万 / 180", note: "系统盘、轻量生产业务" },
  { id: "cloud_essd_pl1", label: "ESSD PL1", iops: "5 万 / 350", note: "企业级应用" },
] as const;

export function DiskSelector({
  value,
  onChange,
}: {
  value: DiskSelection;
  onChange: (v: DiskSelection) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {DISK_OPTIONS.map((d) => (
          <label
            key={d.id}
            onClick={() => onChange({ ...value, category: d.id })}
            className={
              "cursor-pointer rounded-md border p-3 text-sm " +
              (value.category === d.id
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 hover:border-blue-300")
            }
          >
            <div className="flex items-center gap-2">
              <input
                type="radio"
                name="diskCategory"
                checked={value.category === d.id}
                onChange={() => onChange({ ...value, category: d.id })}
              />
              <span className="font-medium">{d.label}</span>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              最大 IOPS/吞吐 (MB/s): {d.iops}
            </div>
            <div className="mt-0.5 text-xs text-gray-400">{d.note}</div>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <Select className="w-40" value={value.category} onChange={(e) => onChange({ ...value, category: e.target.value })}>
          {DISK_OPTIONS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">容量</span>
          <Input
            type="number"
            className="w-24"
            value={value.size}
            onChange={(e) => onChange({ ...value, size: Number(e.target.value) })}
          />
          <span className="text-sm text-gray-500">GiB</span>
        </div>
      </div>

      <div className="flex gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.releaseWithInstance}
            onChange={(e) =>
              onChange({ ...value, releaseWithInstance: e.target.checked })
            }
          />
          随实例释放
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.encrypted}
            onChange={(e) => onChange({ ...value, encrypted: e.target.checked })}
          />
          加密
        </label>
      </div>
    </div>
  );
}
