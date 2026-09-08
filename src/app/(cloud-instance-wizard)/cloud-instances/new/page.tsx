"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { InstanceTable } from "@/components/workspaces/steps/instance-table"
import { REGIONS_BY_PROVIDER } from "@/lib/constants"
import { type InstanceTypeInfo } from "@/components/workspaces/instance-selector"
import { type InstanceAvailability } from "@/lib/aliyun/ecs"
import { ArrowLeft, ArrowRight, Check } from "lucide-react"

const PROVIDERS = [
  { id: "aliyun", label: "阿里云", icon: "☁️" },
  { id: "tencent", label: "腾讯云", icon: "☁️" },
  { id: "aws", label: "AWS", icon: "☁️" },
]

interface RegionInfo {
  id: string
  label: string
}

interface InstanceData {
  instances: Array<{
    instanceTypeId: string
    spec: InstanceTypeInfo | null
  }>
}

export default function NewCloudInstancePage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [step, setStep] = useState(1)
  const [name, setName] = useState("")
  const [provider, setProvider] = useState(searchParams.get("provider") ?? "aliyun")
  const [region, setRegion] = useState("")
  const [regions, setRegions] = useState<RegionInfo[]>([])
  const [regionsLoading, setRegionsLoading] = useState(false)
  const [instanceType, setInstanceType] = useState("")
  const [instanceTypes, setInstanceTypes] = useState<InstanceTypeInfo[]>([])
  const [instanceTypesLoading, setInstanceTypesLoading] = useState(false)
  const [availability, setAvailability] = useState<Record<string, InstanceAvailability>>({})
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // Load regions when provider changes
  useEffect(() => {
    let cancelled = false
    setRegionsLoading(true)

    async function load() {
      try {
        const res = await fetch(`/api/ecs/regions?provider=${encodeURIComponent(provider)}`)
        const data = await res.json()
        if (!cancelled) {
          const regionList: RegionInfo[] = data.regions ?? REGIONS_BY_PROVIDER[provider] ?? []
          setRegions(regionList)
          if (regionList.length > 0 && !regionList.find((r) => r.id === region)) {
            setRegion(regionList[0].id)
          }
          setRegionsLoading(false)
        }
      } catch {
        if (!cancelled) {
          const fallback: RegionInfo[] = REGIONS_BY_PROVIDER[provider] ?? []
          setRegions(fallback)
          if (fallback.length > 0 && !fallback.find((r) => r.id === region)) {
            setRegion(fallback[0].id)
          }
          setRegionsLoading(false)
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [provider, region])

  // Load instance types when region changes
  useEffect(() => {
    if (!region || step !== 2) return
    let cancelled = false

    async function load() {
      setInstanceTypesLoading(true)
      setAvailabilityLoading(true)
      try {
        const res = await fetch(`/api/ecs/instances?region=${encodeURIComponent(region)}`)
        const d: InstanceData = await res.json()
        if (!cancelled) {
          const instances = d.instances ?? []
          const types = instances.map((i) => i.spec).filter(Boolean) as InstanceTypeInfo[]
          const avail: Record<string, InstanceAvailability> = {}
          for (const i of instances) {
            if (i.spec) {
              avail[i.instanceTypeId] = i as unknown as InstanceAvailability
            }
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
  }, [region, step])

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
      router.push("/cloud-instances")
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  function handleNext() {
    if (!name.trim()) {
      setError("请填写名称")
      return
    }
    setError("")
    setStep(2)
  }

  function handleBack() {
    setError("")
    setStep(1)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Step indicators */}
      <div className="border-b bg-background px-6 py-4">
        <div className="flex items-center justify-center gap-8">
          <div className="flex items-center gap-2">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
              step >= 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              {step > 1 ? <Check className="h-4 w-4" /> : "1"}
            </div>
            <span className={step >= 1 ? "font-medium" : "text-muted-foreground"}>名称和提供商</span>
          </div>
          <div className={`h-px w-12 ${step >= 2 ? "bg-primary" : "bg-muted"}`} />
          <div className="flex items-center gap-2">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
              step >= 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              2
            </div>
            <span className={step >= 2 ? "font-medium" : "text-muted-foreground"}>选择实例规格</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {step === 1 ? (
          <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
            <div>
              <h1 className="text-lg font-semibold">创建弹性规格</h1>
              <p className="text-sm text-muted-foreground mt-1">设置名称并选择云服务提供商</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">名称</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：标准开发机"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">提供商</label>
                <div className="grid grid-cols-3 gap-3">
                  {PROVIDERS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setProvider(p.id)}
                      className={`flex items-center justify-center gap-2 rounded-md border p-4 text-sm transition-colors ${
                        provider === p.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <span>{p.icon}</span>
                      <span className="font-medium">{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">地域</label>
                {regionsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner className="h-4 w-4" />
                    加载地域列表...
                  </div>
                ) : (
                  <select
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {regions.map((r) => (
                      <option key={r.id} value={r.id}>{r.label}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => router.back()}
              >
                取消
              </Button>
              <Button
                onClick={handleNext}
                disabled={!name.trim() || regionsLoading}
              >
                下一步
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col px-6 py-4">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">选择实例规格</h2>
              <p className="text-sm text-muted-foreground">
                {name} · {PROVIDERS.find((p) => p.id === provider)?.label} · {regions.find((r) => r.id === region)?.label}
              </p>
            </div>

            <div className="flex-1 min-h-0">
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

            {error && (
              <p className="text-sm text-destructive mt-2">{error}</p>
            )}

            <div className="flex justify-between mt-4">
              <Button
                variant="outline"
                onClick={handleBack}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                上一步
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !instanceType}
              >
                {saving ? <Spinner className="mr-2 h-4 w-4" /> : null}
                保存
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
