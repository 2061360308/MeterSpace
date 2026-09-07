"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { NetworkSelector } from "@/components/workspaces/network-selector";
import { Badge } from "@/components/ui/badge";
import { type StepProps } from "./types";
import { type DiskCategory } from "@/lib/aliyun/ecs";

const STATUS_CONFIG: Record<string, { label: string; tone: "green" | "gray" | "blue" | "red" | "yellow" }> = {
  WithStock: { label: "充足", tone: "green" },
  ClosedWithStock: { label: "紧张", tone: "yellow" },
  WithoutStock: { label: "缺货", tone: "red" },
  ClosedWithoutStock: { label: "已下架", tone: "gray" },
};

export function StepStorage({ state, setState }: StepProps) {
  const [disksLoading, setDisksLoading] = useState(false);

  // Fetch disk categories when region is available
  useEffect(() => {
    if (!state.region) return;
    setDisksLoading(true);
    fetch(`/api/ecs/disks?region=${encodeURIComponent(state.region)}`)
      .then((r) => r.json())
      .then((data) => {
        const disks: DiskCategory[] = data.disks ?? [];
        setState((s) => ({
          ...s,
          systemDiskCategories: disks,
          systemDiskCategory: disks.find((d) => d.status === "Available")?.category ?? disks[0]?.category ?? "cloud_essd",
        }));
        setDisksLoading(false);
      })
      .catch(() => {
        setState((s) => ({
          ...s,
          systemDiskCategories: [],
          systemDiskCategory: "cloud_essd",
        }));
        setDisksLoading(false);
      });
  }, [state.region, setState]);

  // Get availability zones for the selected instance
  const instanceAvailability = state.instanceAvailability[state.instanceType];
  const zones = instanceAvailability?.zones ?? [];

  return (
    <div className="space-y-6">
      {/* System Disk */}
      <Field orientation="vertical">
        <FieldLabel>系统盘类型</FieldLabel>
        <FieldContent>
          {disksLoading ? (
            <div className="flex items-center gap-2 h-10">
              <Spinner className="h-4 w-4" />
              <span className="text-sm text-muted-foreground">加载磁盘类型...</span>
            </div>
          ) : (
            <Select
              value={state.systemDiskCategory}
              onValueChange={(v) => setState((s) => ({ ...s, systemDiskCategory: v }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="请选择系统盘类型" />
              </SelectTrigger>
              <SelectContent>
                {state.systemDiskCategories.map((disk) => (
                  <SelectItem key={disk.category} value={disk.category} disabled={disk.status === "SoldOut"}>
                    {disk.label}
                    {disk.status === "SoldOut" && " (售罄)"}
                    {disk.min && disk.max && ` (${disk.min}-${disk.max} GiB)`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <FieldDescription>
            系统盘类型取决于实例规格，不同规格支持的磁盘类型不同
          </FieldDescription>
        </FieldContent>
      </Field>

      {/* Disk Size */}
      <Field orientation="vertical">
        <FieldLabel>系统盘容量</FieldLabel>
        <FieldContent>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              className="w-32"
              value={state.disk.size}
              onChange={(e) => setState((s) => ({ ...s, disk: { ...s.disk, size: Number(e.target.value) } }))}
            />
            <span className="text-sm text-muted-foreground">GiB</span>
          </div>
          <FieldDescription>
            {state.systemDiskCategories.find((d) => d.category === state.systemDiskCategory) &&
              `可选范围：${state.systemDiskCategories.find((d) => d.category === state.systemDiskCategory)?.min ?? 20} - ${state.systemDiskCategories.find((d) => d.category === state.systemDiskCategory)?.max ?? 2048} GiB`}
          </FieldDescription>
        </FieldContent>
      </Field>

      {/* Network */}
      <Field orientation="vertical">
        <FieldLabel>网络配置</FieldLabel>
        <FieldContent>
          <NetworkSelector
            value={state.network}
            onChange={(network) => setState((s) => ({ ...s, network }))}
          />
        </FieldContent>
      </Field>

      {/* Zone */}
      <Field orientation="vertical">
        <FieldLabel>可用区</FieldLabel>
        <FieldContent>
          <Select
            value={state.zone || "__auto__"}
            onValueChange={(v) => setState((s) => ({ ...s, zone: v === "__auto__" ? "" : v }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="自动分配（推荐）" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__auto__">自动分配（推荐）</SelectItem>
              {zones.map((z) => {
                const cfg = STATUS_CONFIG[z.statusCategory] ?? STATUS_CONFIG.WithStock;
                return (
                  <SelectItem key={z.zoneId} value={z.zoneId} disabled={z.statusCategory === "ClosedWithoutStock"}>
                    {z.zoneId}
                    <Badge tone={cfg.tone} className="ml-2">{cfg.label}</Badge>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <FieldDescription>
            可用区是指在同一地域内，电力和网络互相独立的物理区域。选择&ldquo;自动分配&rdquo;将由系统自动选择最优可用区。
          </FieldDescription>
        </FieldContent>
      </Field>
    </div>
  );
}
