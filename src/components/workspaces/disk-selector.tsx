"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

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
    <div className="space-y-5">
      <RadioGroup
        value={value.category}
        onValueChange={(v) => onChange({ ...value, category: v })}
        className="grid grid-cols-1 gap-2 sm:grid-cols-3"
      >
        {DISK_OPTIONS.map((d) => {
          const active = value.category === d.id;
          return (
            <Label
              key={d.id}
              htmlFor={`disk-${d.id}`}
              className={`cursor-pointer flex-col items-stretch gap-1 rounded-lg bg-card p-3 font-normal shadow-border transition-colors ${
                active ? "bg-accent" : "hover:bg-accent/50"
              }`}
            >
              <span className="flex items-center gap-2">
                <RadioGroupItem id={`disk-${d.id}`} value={d.id} />
                <span className="text-[13px] font-medium leading-6">{d.label}</span>
              </span>
              <span className="pl-6 text-[12px] leading-5 text-muted-foreground">
                最大 IOPS/吞吐 (MB/s)：{d.iops}
              </span>
              <span className="pl-6 text-[12px] leading-5 text-muted-foreground/80">
                {d.note}
              </span>
            </Label>
          );
        })}
      </RadioGroup>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] leading-6 text-muted-foreground">容量</span>
          <Input
            type="number"
            className="tnum w-24"
            value={value.size}
            onChange={(e) => onChange({ ...value, size: Number(e.target.value) })}
          />
          <span className="text-[13px] leading-6 text-muted-foreground">GiB</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <Label className="text-[13px] font-normal leading-6">
          <Checkbox
            checked={value.releaseWithInstance}
            onCheckedChange={(c) =>
              onChange({ ...value, releaseWithInstance: c === true })
            }
          />
          随实例释放
        </Label>
        <Label className="text-[13px] font-normal leading-6">
          <Checkbox
            checked={value.encrypted}
            onCheckedChange={(c) => onChange({ ...value, encrypted: c === true })}
          />
          加密
        </Label>
      </div>
    </div>
  );
}
