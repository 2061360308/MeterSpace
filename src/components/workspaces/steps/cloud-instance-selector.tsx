"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { InstanceTable } from "./instance-table"
import { type InstanceTypeInfo } from "@/components/workspaces/instance-selector"
import { type InstanceAvailability } from "@/lib/aliyun/ecs"

type CloudInstance = {
  id: string
  name: string
  provider: string
  region: string
  instanceType: string
}

interface CloudInstanceSelectorProps {
  region: string
  cloudInstances: CloudInstance[]
  cloudInstancesLoading: boolean
  selectedId: string | null
  onSelect: (instance: CloudInstance | null) => void
  onCreateNew: (instanceType: string) => void
  // Instance table props for creating new
  instanceTypes: InstanceTypeInfo[]
  instanceTypesLoading: boolean
  instanceAvailability: Record<string, InstanceAvailability>
  availabilityLoading: boolean
}

export function CloudInstanceSelector({
  region,
  cloudInstances,
  cloudInstancesLoading,
  selectedId,
  onSelect,
  onCreateNew,
  instanceTypes,
  instanceTypesLoading,
  instanceAvailability,
  availabilityLoading,
}: CloudInstanceSelectorProps) {
  const [mode, setMode] = React.useState<"select" | "create">(
    selectedId ? "select" : "create"
  )
  const [newInstanceType, setNewInstanceType] = React.useState("")

  const compatibleInstances = React.useMemo(
    () => cloudInstances.filter((i) => i.region === region),
    [cloudInstances, region]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant={mode === "select" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("select")}
        >
          选择已有
        </Button>
        <Button
          variant={mode === "create" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("create")}
        >
          新建
        </Button>
      </div>

      {mode === "select" ? (
        <div className="space-y-2">
          {cloudInstancesLoading ? (
            <div className="space-y-2 py-2">
              <Skeleton className="h-[62px] w-full rounded-lg" />
              <Skeleton className="h-[62px] w-full rounded-lg" />
            </div>
          ) : compatibleInstances.length === 0 ? (
            <div className="rounded-lg bg-muted px-4 py-6 text-center text-[13px] leading-6 text-muted-foreground">
              当前地域没有可用的弹性规格，请新建一个。
            </div>
          ) : (
            <div className="space-y-2">
              {compatibleInstances.map((inst) => (
                <button
                  key={inst.id}
                  onClick={() => onSelect(inst)}
                  className={`w-full rounded-lg bg-card p-3 text-left shadow-border transition-colors ${
                    selectedId === inst.id ? "bg-accent" : "hover:bg-accent/50"
                  }`}
                >
                  <div className="text-[13px] font-medium leading-6">{inst.name}</div>
                  <div className="mt-0.5 font-mono text-[12px] leading-5 text-muted-foreground">
                    {inst.instanceType}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col h-[400px]">
          <div className="flex-1 min-h-0">
            <InstanceTable
              region={region}
              types={instanceTypes}
              loading={instanceTypesLoading}
              value={newInstanceType}
              onChange={setNewInstanceType}
              availability={instanceAvailability}
              availabilityLoading={availabilityLoading}
            />
          </div>
          {newInstanceType && (
            <div className="border-t border-border/70 pt-4">
              <Button onClick={() => onCreateNew(newInstanceType)}>
                创建并选择 {newInstanceType}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
