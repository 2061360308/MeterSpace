"use client";

import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";

export interface NetworkSelection {
  publicIp: boolean;
  chargeType: "fixed" | "traffic"; // 按固定带宽 / 按使用流量
  bandwidth: number;
}

const BANDWIDTH_OPTIONS = [1, 2, 3, 5, 10, 50, 100];

const CHARGE_MODES = [
  { id: "fixed", label: "按固定带宽", note: "适用于流量较大、稳定的场景" },
  { id: "traffic", label: "按使用流量", note: "适用于流量小、波动大的场景" },
] as const;

export function NetworkSelector({
  value,
  onChange,
}: {
  value: NetworkSelection;
  onChange: (v: NetworkSelection) => void;
}) {
  return (
    <div className="space-y-5">
      <Label className="text-[13px] font-normal leading-6">
        <Checkbox
          checked={value.publicIp}
          onCheckedChange={(c) => onChange({ ...value, publicIp: c === true })}
        />
        分配公网 IPv4 地址
      </Label>

      <div className="space-y-2">
        <div className="text-[13px] font-medium leading-6">带宽计费模式</div>
        <RadioGroup
          value={value.chargeType}
          onValueChange={(v) =>
            onChange({ ...value, chargeType: v as NetworkSelection["chargeType"] })
          }
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        >
          {CHARGE_MODES.map((m) => {
            const active = value.chargeType === m.id;
            return (
              <Label
                key={m.id}
                htmlFor={`charge-${m.id}`}
                className={`cursor-pointer flex-col items-stretch gap-1 rounded-lg bg-card p-3 font-normal shadow-border transition-colors ${
                  active ? "bg-accent" : "hover:bg-accent/50"
                }`}
              >
                <span className="flex items-center gap-2">
                  <RadioGroupItem id={`charge-${m.id}`} value={m.id} />
                  <span className="text-[13px] font-medium leading-6">{m.label}</span>
                </span>
                <span className="pl-6 text-[12px] leading-5 text-muted-foreground">
                  {m.note}
                </span>
              </Label>
            );
          })}
        </RadioGroup>
      </div>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <div className="text-[13px] font-medium leading-6">带宽峰值</div>
          <div className="tnum text-[13px] leading-6 text-muted-foreground">
            {value.bandwidth} Mbps
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {BANDWIDTH_OPTIONS.map((b) => {
            const active = value.bandwidth === b;
            return (
              <button
                key={b}
                type="button"
                onClick={() => onChange({ ...value, bandwidth: b })}
                className={`tnum rounded-full px-3 py-1 text-[12px] font-medium leading-5 transition-colors ${
                  active
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {b} Mbps
              </button>
            );
          })}
        </div>
        <Slider
          value={[value.bandwidth]}
          onValueChange={([b]) => onChange({ ...value, bandwidth: b })}
          min={1}
          max={100}
          step={1}
        />
      </div>
    </div>
  );
}
