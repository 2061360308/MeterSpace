"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { InstanceTable } from "@/components/workspaces/steps/instance-table"
import { REGIONS } from "@/lib/constants"
import { type InstanceTypeInfo } from "@/components/workspaces/instance-selector"
import { type InstanceAvailability } from "@/lib/aliyun/ecs"

export default function NewCloudInstancePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const provider = searchParams.get("provider") ?? "aliyun"

  const [name, setName] = useState("")
  const [region, setRegion] = useState("cn-hangzhou")
  const [instanceType, setInstanceType] = useState("")
  const [instanceTypes, setInstanceTypes] = useState<InstanceTypeInfo[]>([])
  const [instanceTypesLoading, setInstanceTypesLoading] = useState(false)
  const [availability, setAvailability] = useState<Record<string, InstanceAvailability>>({})
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // Load instance types when region changes
  useEffect(() => {
    if (!region) return
    let cancelled = false

    async function load() {
      setInstanceTypesLoading(true)
      setAvailabilityLoading(true)
      try {
        const res = await fetch(`/api/ecs/instances?region=${encodeURIComponent(region)}`)
        const d = await res.json()
        if (!cancelled) {
          const instances = d.instances ?? []
          const types = instances.map((i: any) => i.spec).filter(Boolean)
          const avail: Record<string, any> = {}
          for (const i of instances) {
            avail[i.instanceTypeId] = i
          }
          setInstanceTypes(types)
          setAvailability(avail)
          setInstanceTypesLoading(false)
          setAvailabilityLoading(false)
        }
      } catch {
        if (!cancelled) {
          setInstanceTypes([])
          setAvailability({})
          setInstanceTypesLoading(false)
          setAvailabilityLoading(false)
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [region])

  async function handleSave() {
    if (!name.trim()) {
      setError("请填写名称")
      return
    }
    if (!instanceType) {
      setError("请选择实例规格")
      return
    }
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/cloud-instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          provider,
          region,
          instanceType,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "创建失败")
      }
      router.push("/")
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)]">
      {/* 左侧内容 */}
      <div className="flex-1 overflow-y-auto">
        {/* 顶部配置区 */}
        <div className="sticky top-0 z-10 bg-background px-6 pt-6 pb-4 space-y-4 border-b">
          <h1 className="text-lg font-semibold">创建弹性规格</h1>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">名称</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：标准开发机"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">地域</label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {REGIONS.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">厂商</label>
              <input
                type="text"
                value={provider === "aliyun" ? "阿里云" : provider}
                disabled
                className="w-full rounded-md border border-input bg-muted px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        {/* 实例表格 */}
        <div className="px-6 py-4 h-[calc(100%-140px)]">
          <InstanceTable
            region={region}
            types={instanceTypes}
            loading={instanceTypesLoading}
            value={instanceType}
            onChange={setInstanceType}
            availability={availability}
            availabilityLoading={availabilityLoading}
          />
        </div>
      </div>

      {/* 右侧操作栏 */}
      <div className="w-[320px] border-l flex flex-col bg-background">
        <div className="flex-1 p-4 space-y-4">
          <h2 className="font-medium">配置概要</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">名称</dt>
              <dd className="font-medium">{name || "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">地域</dt>
              <dd className="font-medium">
                {REGIONS.find((r) => r.id === region)?.label ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">厂商</dt>
              <dd className="font-medium">
                {provider === "aliyun" ? "阿里云" : provider}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">实例规格</dt>
              <dd className="font-medium truncate ml-2">{instanceType || "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="border-t p-4 space-y-3">
          {error && (
            <p className="text-xs text-destructive text-center">{error}</p>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => router.back()}
              disabled={saving}
              className="flex-1"
            >
              取消
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !name.trim() || !instanceType}
              className="flex-1"
            >
              {saving ? <Spinner className="mr-2 h-4 w-4" /> : null}
              保存
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
