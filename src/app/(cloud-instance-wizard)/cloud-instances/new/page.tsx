"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Skeleton } from "@/components/ui/skeleton"
import { APIError } from "@/components/ui/error"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { InstanceTable } from "@/components/workspaces/steps/instance-table"
import { REGIONS_BY_PROVIDER } from "@/lib/constants"
import { type InstanceTypeInfo } from "@/components/workspaces/instance-selector"
import { type InstanceAvailability } from "@/lib/aliyun/ecs"
import { ArrowLeft, ArrowRight, Check } from "lucide-react"

const PROVIDERS = [
  { id: "aliyun", label: "阿里云" },
  { id: "tencent", label: "腾讯云" },
  { id: "aws", label: "AWS" },
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
    return () => {
      cancelled = true
    }
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
    return () => {
      cancelled = true
    }
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
    <div className="flex h-full flex-col">
      {/* Step indicators */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-center gap-6">
          {[
            { id: 1, label: "名称和提供商" },
            { id: 2, label: "选择实例规格" },
          ].map((s, idx) => (
            <div key={s.id} className="flex items-center gap-6">
              {idx > 0 && (
                <div
                  className={`h-px w-12 ${step >= s.id ? "bg-foreground" : "bg-border"}`}
                />
              )}
              <div className="flex items-center gap-2 text-[13px] leading-6">
                <div
                  className={`flex size-6 items-center justify-center rounded-full text-[12px] font-medium ${
                    step >= s.id
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {step > s.id ? <Check className="size-3.5" /> : s.id}
                </div>
                <span className={step >= s.id ? "font-medium" : "text-muted-foreground"}>
                  {s.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {step === 1 ? (
          <div className="mx-auto max-w-2xl space-y-8 px-6 py-8">
            <div className="space-y-1.5">
              <h1 className="text-[20px] font-semibold leading-7 tracking-[-0.01em]">
                创建弹性规格
              </h1>
              <p className="text-[13px] leading-6 text-muted-foreground">
                给规格起个名字，选好云服务商和地域，下一步再挑具体机型。
              </p>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="ci-name">名称</Label>
                <Input
                  id="ci-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：标准开发机"
                />
              </div>

              <div className="space-y-2">
                <Label>提供商</Label>
                <div className="grid grid-cols-3 gap-3">
                  {PROVIDERS.map((p) => {
                    const active = provider === p.id
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setProvider(p.id)}
                        className={`flex items-center justify-center gap-1.5 rounded-lg px-4 py-3 text-[13px] font-medium leading-6 transition-colors ${
                          active
                            ? "bg-foreground text-background"
                            : "bg-card text-muted-foreground shadow-border hover:text-foreground"
                        }`}
                      >
                        {active && <Check className="size-3.5" />}
                        {p.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label>地域</Label>
                {regionsLoading ? (
                  <Skeleton className="h-8 w-full rounded-md" />
                ) : (
                  <Select value={region} onValueChange={setRegion}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="请选择地域" />
                    </SelectTrigger>
                    <SelectContent>
                      {regions.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {error && <APIError message={error} />}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => router.back()}>
                取消
              </Button>
              <Button onClick={handleNext} disabled={!name.trim() || regionsLoading}>
                下一步
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col px-6 py-4">
            <div className="mb-4 space-y-1.5">
              <h2 className="text-[15px] font-semibold leading-6 tracking-[-0.01em]">
                选择实例规格
              </h2>
              <p className="text-[13px] leading-6 text-muted-foreground">
                {name} · {PROVIDERS.find((p) => p.id === provider)?.label} ·{" "}
                {regions.find((r) => r.id === region)?.label}
              </p>
            </div>

            <div className="min-h-0 flex-1">
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

            {error && <APIError message={error} className="mt-3" />}

            <div className="mt-4 flex justify-between">
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft data-icon="inline-start" />
                上一步
              </Button>
              <Button onClick={handleSave} disabled={saving || !instanceType}>
                {saving && <Spinner data-icon="inline-start" />}
                {saving ? "保存中…" : "保存"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
