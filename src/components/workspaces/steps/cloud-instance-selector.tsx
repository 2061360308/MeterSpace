"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
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

  const selected = cloudInstances.find((i) => i.id === selectedId)

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
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Spinner className="h-4 w-4" />
              <span>加载中...</span>
            </div>
          ) : compatibleInstances.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">
              当前地域没有可用的云实例，请新建一个
            </div>
          ) : (
            <div className="space-y-2">
              {compatibleInstances.map((inst) => (
                <button
                  key={inst.id}
                  onClick={() => onSelect(inst)}
                  className={`w-full text-left rounded-md border p-3 text-sm transition-colors ${
                    selectedId === inst.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="font-medium">{inst.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">
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
            <div className="pt-4 border-t">
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
