"use client";

import { useEffect, useMemo, useState } from "react";
import { FAMILY_CATEGORIES } from "@/lib/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface InstanceTypeInfo {
  instanceTypeId: string;
  cpuCoreCount: number;
  memorySize: number;
  instanceTypeFamily?: string;
  cpuArchitecture?: string;
  gpuAmount?: number;
  gpuSpec?: string;
  localStorage?: string;
  internetMaxBandwidthOut?: number;
}

const CPU_OPTIONS = [1, 2, 4, 8, 16, 32, 64, 128];
const MEM_OPTIONS = ["1", "2", "4", "8", "16", "32", "64", "128", "256"];

const ALL = "all";

export function InstanceSelector({
  value,
  types,
  loading,
  onChange,
}: {
  region?: string;
  value: string;
  types: InstanceTypeInfo[];
  loading: boolean;
  onChange: (instanceTypeId: string) => void;
}) {
  const [architecture, setArchitecture] = useState<"x86" | "arm">("x86");
  const [category, setCategory] = useState(ALL);
  const [cpuFilter, setCpuFilter] = useState(ALL);
  const [memFilter, setMemFilter] = useState(ALL);
  const [genFilter, setGenFilter] = useState(ALL);
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  // Reset category when architecture changes.
  useEffect(() => {
    setCategory(ALL);
  }, [architecture]);

  const filtered = useMemo(() => {
    let list = types.filter(
      (t) => (t.instanceTypeFamily ?? "").startsWith("ecs."),
    );
    // 架构
    if (architecture === "arm") {
      list = list.filter((t) =>
        /g8y|c8y|r8y|yitian|ampere|am\./i.test(t.instanceTypeFamily ?? ""),
      );
    } else {
      list = list.filter(
        (t) =>
          !/g8y|c8y|r8y|yitian|ampere|am\./i.test(
            t.instanceTypeFamily ?? "",
          ),
      );
    }
    // 分类
    if (category !== ALL) {
      const cat = FAMILY_CATEGORIES.find((c) => c.id === category);
      if (cat) {
        const pats = cat.families;
        list = list.filter((t) =>
          pats.length === 0
            ? true
            : pats.some((p) =>
                (t.instanceTypeFamily ?? "").toLowerCase().includes(p.toLowerCase()),
              ),
        );
      }
    }
    // vCPU
    if (cpuFilter !== ALL) {
      list = list.filter((t) => t.cpuCoreCount === Number(cpuFilter));
    }
    // 内存
    if (memFilter !== ALL) {
      list = list.filter((t) => t.memorySize === Number(memFilter));
    }
    // 代际（匹配规格族里的数字代际，如 g6/g7/g8）
    if (genFilter !== ALL) {
      list = list.filter((t) =>
        new RegExp(`[a-z]${genFilter}\\.`, "i").test(t.instanceTypeId),
      );
    }
    // 排序：CPU → 内存
    return list.sort((a, b) => {
      if (a.cpuCoreCount !== b.cpuCoreCount) {
        return a.cpuCoreCount - b.cpuCoreCount;
      }
      return a.memorySize - b.memorySize;
    });
  }, [types, architecture, category, cpuFilter, memFilter, genFilter]);

  return (
    <div className="space-y-4">
      {/* 筛选行 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] leading-5 text-muted-foreground">筛选</span>
        <Select value={cpuFilter} onValueChange={setCpuFilter}>
          <SelectTrigger size="sm" className="w-28">
            <SelectValue placeholder="vCPU" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部 vCPU</SelectItem>
            {CPU_OPTIONS.map((c) => (
              <SelectItem key={c} value={String(c)}>
                {c} 核
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={memFilter} onValueChange={setMemFilter}>
          <SelectTrigger size="sm" className="w-28">
            <SelectValue placeholder="内存" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部内存</SelectItem>
            {MEM_OPTIONS.map((m) => (
              <SelectItem key={m} value={m}>
                {m} GiB
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={genFilter} onValueChange={setGenFilter}>
          <SelectTrigger size="sm" className="w-28">
            <SelectValue placeholder="代际" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部代际</SelectItem>
            {[7, 8, 6, 5, 4, 3].map((g) => (
              <SelectItem key={g} value={String(g)}>
                {g} 代
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          className="text-[12px] font-medium leading-5 underline decoration-border underline-offset-4 hover:decoration-foreground"
          onClick={() => setShowMoreFilters((v) => !v)}
        >
          {showMoreFilters ? "收起规格参数" : "查看更多规格参数"}
        </button>
        <span className="tnum ml-auto text-[12px] leading-5 text-muted-foreground">
          共 {filtered.length} 个规格
        </span>
      </div>

      {/* 架构 Tab */}
      <Tabs
        value={architecture}
        onValueChange={(v) => setArchitecture(v as "x86" | "arm")}
      >
        <TabsList>
          <TabsTrigger value="x86">X86 计算</TabsTrigger>
          <TabsTrigger value="arm">Arm 计算</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* 分类 tab（横向 chips） */}
      <div className="flex flex-wrap gap-1.5">
        {FAMILY_CATEGORIES.map((c) => {
          const active = category === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium leading-5 transition-colors ${
                active
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* 规格表格 */}
      <div className="overflow-hidden rounded-lg bg-card shadow-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>实例规格</TableHead>
              <TableHead>规格族</TableHead>
              <TableHead className="w-24">vCPU</TableHead>
              <TableHead className="w-24">内存</TableHead>
              <TableHead className="w-28">架构-分类</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-6 text-center text-[13px] text-muted-foreground"
                >
                  没有匹配的规格
                </TableCell>
              </TableRow>
            ) : (
              filtered.slice(0, 100).map((t) => {
                const selected = value === t.instanceTypeId;
                return (
                  <TableRow
                    key={t.instanceTypeId}
                    onClick={() => onChange(t.instanceTypeId)}
                    className={`cursor-pointer ${selected ? "bg-accent" : ""}`}
                  >
                    <TableCell>
                      <span
                        aria-hidden
                        className="flex size-4 items-center justify-center rounded-full border border-border"
                      >
                        {selected && <span className="size-2 rounded-full bg-foreground" />}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-[12px]">
                      {t.instanceTypeId}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.instanceTypeFamily ?? "—"}
                    </TableCell>
                    <TableCell className="tnum text-muted-foreground">
                      {t.cpuCoreCount} vCPU
                    </TableCell>
                    <TableCell className="tnum text-muted-foreground">
                      {t.memorySize} GiB
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {architecture === "arm" ? "Arm 计算" : "X86 计算"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        {!loading && filtered.length > 100 && (
          <p className="border-t border-border/70 px-3 py-2 text-[12px] leading-5 text-muted-foreground">
            仅显示前 100 个，请用筛选精确选择
          </p>
        )}
      </div>
    </div>
  );
}
