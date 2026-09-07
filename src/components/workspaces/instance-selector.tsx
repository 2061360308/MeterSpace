"use client";

import { useEffect, useMemo, useState } from "react";
import { Select } from "@/components/ui/select";
import { FAMILY_CATEGORIES } from "@/lib/constants";

export interface InstanceTypeInfo {
  instanceTypeId: string;
  cpuCoreCount: number;
  memorySize: number;
  instanceTypeFamily?: string;
  cpuArchitecture?: string;
}

const CPU_OPTIONS = [1, 2, 4, 8, 16, 32, 64, 128];
const MEM_OPTIONS = ["1", "2", "4", "8", "16", "32", "64", "128", "256"];

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
  const [category, setCategory] = useState("all");
  const [cpuFilter, setCpuFilter] = useState("");
  const [memFilter, setMemFilter] = useState("");
  const [genFilter, setGenFilter] = useState("");
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  // Reset category when architecture changes.
  useEffect(() => {
    setCategory("all");
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
    if (category !== "all") {
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
    if (cpuFilter) {
      list = list.filter((t) => t.cpuCoreCount === Number(cpuFilter));
    }
    // 内存
    if (memFilter) {
      list = list.filter((t) => t.memorySize === Number(memFilter));
    }
    // 代际（匹配规格族里的数字代际，如 g6/g7/g8）
    if (genFilter) {
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
    <div className="space-y-3">
      {/* 筛选行 */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-500">筛选</span>
        <Select
          className="w-28"
          value={cpuFilter}
          onChange={(e) => setCpuFilter(e.target.value)}
        >
          <option value="">选择 vCPU</option>
          {CPU_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c} 核
            </option>
          ))}
        </Select>
        <Select
          className="w-28"
          value={memFilter}
          onChange={(e) => setMemFilter(e.target.value)}
        >
          <option value="">选择内存</option>
          {MEM_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m} GiB
            </option>
          ))}
        </Select>
        <Select
          className="w-28"
          value={genFilter}
          onChange={(e) => setGenFilter(e.target.value)}
        >
          <option value="">选择代际</option>
          {[7, 8, 6, 5, 4, 3].map((g) => (
            <option key={g} value={g}>
              {g} 代
            </option>
          ))}
        </Select>
        <button
          className="text-blue-600 hover:underline"
          onClick={() => setShowMoreFilters((v) => !v)}
        >
          {showMoreFilters ? "收起规格参数" : "查看更多规格参数"}
        </button>
        <span className="ml-auto text-xs text-gray-400">
          共 {filtered.length} 个规格
        </span>
      </div>

      {/* 架构 Tab */}
      <div className="flex gap-1 border-b border-gray-200">
        {(
          [
            ["x86", "X86 计算"],
            ["arm", "Arm 计算"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setArchitecture(id)}
            className={
              "px-3 py-2 text-sm font-medium " +
              (architecture === id
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-500 hover:text-gray-700")
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* 分类 tab（横向 chips） */}
      <div className="flex flex-wrap gap-1">
        {FAMILY_CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className={
              "rounded-full px-3 py-1 text-xs " +
              (category === c.id
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200")
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* 规格表格 */}
      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium"></th>
              <th className="px-3 py-2 font-medium">实例规格</th>
              <th className="px-3 py-2 font-medium">规格族</th>
              <th className="px-3 py-2 font-medium">vCPU</th>
              <th className="px-3 py-2 font-medium">内存</th>
              <th className="px-3 py-2 font-medium">架构-分类</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                  加载规格中...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                  没有匹配的规格
                </td>
              </tr>
            ) : (
              filtered.slice(0, 100).map((t) => (
                <tr
                  key={t.instanceTypeId}
                  onClick={() => onChange(t.instanceTypeId)}
                  className={
                    "cursor-pointer border-t border-gray-50 hover:bg-blue-50 " +
                    (value === t.instanceTypeId ? "bg-blue-50" : "")
                  }
                >
                  <td className="px-3 py-2">
                    <input
                      type="radio"
                      name="instanceType"
                      checked={value === t.instanceTypeId}
                      onChange={() => onChange(t.instanceTypeId)}
                    />
                  </td>
                  <td className="px-3 py-2 font-mono">{t.instanceTypeId}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {t.instanceTypeFamily ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {t.cpuCoreCount} vCPU
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {t.memorySize} GiB
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {architecture === "arm" ? "Arm 计算" : "X86 计算"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {!loading && filtered.length > 100 && (
          <p className="border-t border-gray-100 px-3 py-2 text-xs text-gray-400">
            仅显示前 100 个，请用筛选精确选择
          </p>
        )}
      </div>
    </div>
  );
}
