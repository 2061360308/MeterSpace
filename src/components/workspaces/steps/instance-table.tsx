"use client";

import { useState, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { type InstanceTypeInfo } from "@/components/workspaces/instance-selector";
import { type InstanceAvailability } from "@/lib/aliyun/ecs";
import { FAMILY_CATEGORIES, familyLabel, classifyArchitecture } from "@/lib/constants";
import { Spinner } from "@/components/ui/spinner";

interface InstanceTableProps {
  types: InstanceTypeInfo[];
  loading: boolean;
  value: string;
  onChange: (instanceTypeId: string) => void;
  availability: Record<string, InstanceAvailability>;
  availabilityLoading: boolean;
}

const columnHelper = createColumnHelper<InstanceTypeInfo>();
const ROW_HEIGHT = 44;

const STATUS_CONFIG: Record<string, { label: string; tone: "green" | "gray" | "blue" | "red" | "yellow" }> = {
  WithStock: { label: "充足", tone: "green" },
  ClosedWithStock: { label: "紧张", tone: "yellow" },
  WithoutStock: { label: "缺货", tone: "red" },
  ClosedWithoutStock: { label: "已下架", tone: "gray" },
};

export function InstanceTable({ types, loading, value, onChange, availability, availabilityLoading }: InstanceTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [architecture, setArchitecture] = useState<"x86" | "arm">("x86");
  const [familyCategory, setFamilyCategory] = useState("all");
  const [cpuFilter, setCpuFilter] = useState<string>("");
  const [memFilter, setMemFilter] = useState<string>("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const filteredTypes = useMemo(() => {
    let result = types;
    if (architecture) {
      result = result.filter((t) => classifyArchitecture(t.instanceTypeFamily) === architecture);
    }
    if (familyCategory !== "all") {
      const cat = FAMILY_CATEGORIES.find((c) => c.id === familyCategory);
      if (cat && cat.families.length > 0) {
        result = result.filter((t) =>
          cat.families.some((f) => t.instanceTypeFamily?.toLowerCase().includes(f))
        );
      }
    }
    if (cpuFilter) {
      result = result.filter((t) => t.cpuCoreCount === Number(cpuFilter));
    }
    if (memFilter) {
      result = result.filter((t) => t.memorySize === Number(memFilter));
    }
    return result;
  }, [types, architecture, familyCategory, cpuFilter, memFilter]);

  const columns = useMemo(() => [
    columnHelper.display({
      id: "select",
      header: "",
      size: 40,
    }),
    columnHelper.accessor("instanceTypeId", {
      header: "规格",
      size: 200,
    }),
    columnHelper.accessor("cpuCoreCount", {
      header: "vCPU",
      cell: (info) => `${info.getValue()} 核`,
      size: 80,
    }),
    columnHelper.accessor("memorySize", {
      header: "内存",
      cell: (info) => `${info.getValue()} GiB`,
      size: 80,
    }),
    columnHelper.accessor("instanceTypeFamily", {
      header: "规格族",
      cell: (info) => familyLabel(info.getValue()),
      size: 100,
    }),
    {
      id: "availability",
      header: "库存状态",
      cell: (info: any) => {
        const a = availability[info.row.original.instanceTypeId];
        if (availabilityLoading) return <Spinner className="h-3 w-3" />;
        if (!a) return <span className="text-muted-foreground">-</span>;
        const config = STATUS_CONFIG[a.statusCategory ?? "WithoutStock"] ?? STATUS_CONFIG.WithoutStock;
        const isDisabled = a.statusCategory === "ClosedWithoutStock";
        return (
          <Badge tone={config.tone} className={isDisabled ? "opacity-50" : ""}>
            {config.label}
          </Badge>
        );
      },
      size: 100,
    },
  ], [availability, availabilityLoading]);

  const table = useReactTable({
    data: filteredTypes,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const rows = table.getRowModel().rows;

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const selected = types.find((t) => t.instanceTypeId === value);
  const selectedAvailability = value ? availability[value] : undefined;
  const isDisabled = selectedAvailability?.statusCategory === "ClosedWithoutStock";

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex flex-wrap gap-4">
        <div className="flex gap-2">
          <Button
            variant={architecture === "x86" ? "default" : "outline"}
            size="sm"
            onClick={() => setArchitecture("x86")}
          >
            x86
          </Button>
          <Button
            variant={architecture === "arm" ? "default" : "outline"}
            size="sm"
            onClick={() => setArchitecture("arm")}
          >
            Arm
          </Button>
        </div>

        <select
          className="h-8 rounded-md border border-input bg-background px-3 text-sm"
          value={familyCategory}
          onChange={(e) => setFamilyCategory(e.target.value)}
        >
          {FAMILY_CATEGORIES.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.label}
            </option>
          ))}
        </select>

        <select
          className="h-8 rounded-md border border-input bg-background px-3 text-sm"
          value={cpuFilter}
          onChange={(e) => setCpuFilter(e.target.value)}
        >
          <option value="">vCPU</option>
          {[1, 2, 4, 8, 16, 32, 64].map((v) => (
            <option key={v} value={v}>
              {v} 核
            </option>
          ))}
        </select>

        <select
          className="h-8 rounded-md border border-input bg-background px-3 text-sm"
          value={memFilter}
          onChange={(e) => setMemFilter(e.target.value)}
        >
          <option value="">内存</option>
          {[1, 2, 4, 8, 16, 32, 64, 128].map((v) => (
            <option key={v} value={v}>
              {v} GiB
            </option>
          ))}
        </select>
      </div>

      <RadioGroup
        value={value}
        onValueChange={onChange}
        className="space-y-0 flex-1 min-h-0 flex flex-col"
      >
        <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-auto rounded-md border">
          <Table className="grid" style={{ minWidth: "700px" }}>
            <TableHeader className="grid sticky top-0 bg-background z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="grid flex w-full">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      style={{ width: header.getSize() }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody
              className="grid relative"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index];
                const rowAvail = availability[row.original.instanceTypeId];
                const rowDisabled = rowAvail?.statusCategory === "ClosedWithoutStock";
                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className={`grid flex absolute w-full ${
                      value === row.original.instanceTypeId ? "bg-muted" : ""
                    } ${rowDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                    style={{
                      height: `${ROW_HEIGHT}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    onClick={() => !rowDisabled && onChange(row.original.instanceTypeId)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        style={{ width: cell.column.getSize() }}
                      >
                        {cell.column.id === "select" ? (
                          <RadioGroupItem value={row.original.instanceTypeId} disabled={rowDisabled} />
                        ) : cell.column.id === "instanceTypeId" ? (
                          <div className="font-mono text-sm">
                            {row.original.instanceTypeId}
                          </div>
                        ) : (
                          flexRender(cell.column.columnDef.cell, cell.getContext())
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-muted-foreground">
            共 {filteredTypes.length} 项
          </span>
          <div className="flex items-center text-sm text-muted-foreground">
            <span>已选择：</span>
            {selected ? (
              <>
                <span className="font-medium text-foreground">{value}</span>
                <span className="mx-1">·</span>

                <HoverCard>
                  <HoverCardTrigger asChild>
                    <span className="cursor-pointer underline decoration-dotted text-foreground">
                      {selected.cpuCoreCount} vCPU · {selected.memorySize} GiB
                    </span>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-72">
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">实例规格详情</h4>
                      <div className="grid grid-cols-2 gap-y-1 gap-x-3 text-xs">
                        <span className="text-muted-foreground">规格 ID</span>
                        <span className="font-mono">{value}</span>
                        <span className="text-muted-foreground">vCPU</span>
                        <span>{selected.cpuCoreCount} 核</span>
                        <span className="text-muted-foreground">内存</span>
                        <span>{selected.memorySize} GiB</span>
                        <span className="text-muted-foreground">规格族</span>
                        <span>{familyLabel(selected.instanceTypeFamily)}</span>
                        <span className="text-muted-foreground">架构</span>
                        <span>{selected.cpuArchitecture ?? "x86_64"}</span>
                        {selected.gpuAmount != null && selected.gpuAmount > 0 && (
                          <>
                            <span className="text-muted-foreground">GPU</span>
                            <span>{selected.gpuAmount} {selected.gpuSpec ?? ""}</span>
                          </>
                        )}
                        {selected.localStorage && (
                          <>
                            <span className="text-muted-foreground">本地存储</span>
                            <span>{selected.localStorage}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </HoverCardContent>
                </HoverCard>

                <span className="mx-1">·</span>

                {selectedAvailability && (
                  <HoverCard>
                    <HoverCardTrigger asChild>
                      <span className="cursor-pointer underline decoration-dotted text-foreground">
                        {selectedAvailability.availableZones}个可用区
                      </span>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-64">
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm">可用区状态</h4>
                        <div className="space-y-1.5">
                          {selectedAvailability.zones.map((z) => {
                            const cfg = STATUS_CONFIG[z.statusCategory] ?? STATUS_CONFIG.WithoutStock;
                            return (
                              <div key={z.zoneId} className="flex items-center justify-between text-xs">
                                <span className="font-mono">{z.zoneId}</span>
                                <Badge tone={cfg.tone}>{cfg.label}</Badge>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                )}

                <span className="mx-1">·</span>

                {selectedAvailability?.statusCategory && (() => {
                  const cfg = STATUS_CONFIG[selectedAvailability.statusCategory];
                  if (selectedAvailability.statusCategory === "WithStock") {
                    return (
                      <HoverCard>
                        <HoverCardTrigger asChild>
                          <span className="cursor-pointer underline decoration-dotted text-green-600">
                            {cfg.label}
                          </span>
                        </HoverCardTrigger>
                        <HoverCardContent className="w-56">
                          <p className="text-xs text-muted-foreground">
                            当前库存充足，建议使用抢占式实例节省最高 90% 费用。
                          </p>
                        </HoverCardContent>
                      </HoverCard>
                    );
                  }
                  return <span className="text-foreground">{cfg.label}</span>;
                })()}
              </>
            ) : (
              <span className="text-muted-foreground">未选择</span>
            )}
          </div>
        </div>
      </RadioGroup>
    </div>
  );
}
