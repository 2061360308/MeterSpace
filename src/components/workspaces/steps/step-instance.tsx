"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { CloudInstanceSelector } from "./cloud-instance-selector";
import { formatCurrency } from "@/lib/utils";
import { type StepProps } from "./types";

const BANDWIDTH_OPTIONS = [1, 2, 3, 5, 10, 50, 100];

export function StepInstance({ state, setState }: StepProps) {
  const [activeTab, setActiveTab] = useState("instance");

  return (
    <div className="flex flex-col h-full">
      {/* 价格面板 - 顶部吸附 */}
      <div className="sticky top-0 z-10 bg-background px-6 pt-6 pb-4 space-y-4">
        <div className="flex items-center justify-between text-sm bg-muted/50 rounded-lg p-3">
          {state.priceData.loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>计算中...</span>
            </div>
          ) : state.priceData.hourly ? (
            <>
              <div className="flex items-center gap-4 text-muted-foreground">
                <span>实例 {formatCurrency(state.priceData.hourly.instance)}</span>
                <span>系统盘 {formatCurrency(state.priceData.hourly.disk)}</span>
                <span>带宽 {formatCurrency(state.priceData.hourly.bandwidth)}</span>
              </div>
              <span className="font-medium text-orange-500">
                {formatCurrency(state.priceData.hourly.total)}/时
              </span>
            </>
          ) : (
            <>
              <div className="flex items-center gap-4 text-muted-foreground">
                <span>实例 -</span>
                <span>系统盘 -</span>
                <span>带宽 -</span>
              </div>
              <span className="font-medium text-orange-500">¥0.00/时</span>
            </>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="instance">弹性规格</TabsTrigger>
            <TabsTrigger value="advanced">高级配置</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Tab 内容区域 */}
      <div className="flex-1 min-h-0 px-6 pb-6">
        {activeTab === "instance" ? (
          <div className="flex flex-col h-full">
            <div className="flex-1 min-h-0">
              <CloudInstanceSelector
                region={state.region}
                cloudInstances={state.cloudInstances}
                cloudInstancesLoading={state.cloudInstancesLoading}
                selectedId={state.cloudInstanceId}
                onSelect={(inst) =>
                  setState((s) => ({
                    ...s,
                    cloudInstanceId: inst?.id ?? null,
                    instanceType: inst?.instanceType ?? "",
                  }))
                }
                onCreateNew={(instanceType) => {
                  // TODO: open create dialog
                }}
                instanceTypes={state.instanceTypes}
                instanceTypesLoading={state.instanceTypesLoading}
                instanceAvailability={state.instanceAvailability}
                availabilityLoading={state.availabilityLoading}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <Field orientation="vertical">
              <FieldLabel>Docker 镜像地址</FieldLabel>
              <FieldContent>
                <Input
                  value={state.imageUri}
                  onChange={(e) => setState((s) => ({ ...s, imageUri: e.target.value }))}
                  placeholder="registry.cn-hangzhou.aliyuncs.com/ns/repo:tag"
                />
                <FieldDescription>
                  支持任意 Docker 镜像链接（ACR / ghcr.io / Docker Hub）
                </FieldDescription>
              </FieldContent>
            </Field>

            <Field orientation="vertical">
              <FieldLabel>系统盘容量</FieldLabel>
              <FieldContent>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    className="w-32"
                    value={state.diskSize}
                    onChange={(e) => setState((s) => ({ ...s, diskSize: Number(e.target.value) }))}
                  />
                  <span className="text-sm text-muted-foreground">GiB</span>
                </div>
                <FieldDescription>
                  系统盘类型为高效云盘，默认随实例释放
                </FieldDescription>
              </FieldContent>
            </Field>

            <Field orientation="vertical">
              <FieldLabel>带宽峰值</FieldLabel>
              <FieldContent>
                <div className="flex flex-wrap items-center gap-2">
                  {BANDWIDTH_OPTIONS.map((b) => (
                    <button
                      key={b}
                      onClick={() => setState((s) => ({ ...s, bandwidth: b }))}
                      className={
                        "rounded-md border px-3 py-1.5 text-sm " +
                        (state.bandwidth === b
                          ? "border-blue-500 bg-blue-50 text-blue-600"
                          : "border-gray-200 text-gray-600 hover:border-blue-300")
                      }
                    >
                      {b} Mbps
                    </button>
                  ))}
                </div>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={state.bandwidth}
                  onChange={(e) => setState((s) => ({ ...s, bandwidth: Number(e.target.value) }))}
                  className="mt-2 w-full"
                />
                <div className="text-right text-sm text-gray-500">{state.bandwidth} Mbps</div>
                <FieldDescription>
                  按流量计费，入带宽自动等于出带宽，不额外收费
                </FieldDescription>
              </FieldContent>
            </Field>
          </div>
        )}
      </div>
    </div>
  );
}
