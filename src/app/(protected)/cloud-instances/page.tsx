"use client"

import * as React from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ListFilterIcon, Plus, Cloud, Trash2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RegisterHeaderActions } from "@/components/header-actions"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type CloudInstance = {
  id: string
  name: string
  provider: string
  region: string
  instanceType: string
  cpuCoreCount?: number | null
  memorySize?: number | null
  instanceTypeFamily?: string | null
  cpuArchitecture?: string | null
  gpuCount?: number | null
  gpuSpec?: string | null
  createdAt: string
}

const PROVIDERS = [
  { id: "aliyun", label: "阿里云" },
  { id: "tencent", label: "腾讯云" },
  { id: "aws", label: "AWS" },
]

const REGION_LABELS: Record<string, string> = {
  "cn-hangzhou": "杭州",
  "cn-shanghai": "上海",
  "cn-beijing": "北京",
  "cn-shenzhen": "深圳",
  "cn-guangzhou": "广州",
  "cn-hongkong": "香港",
  "ap-guangzhou": "广州",
  "ap-shanghai": "上海",
  "ap-beijing": "北京",
  "ap-shenzhen": "深圳",
  "ap-hongkong": "香港",
  "us-east-1": "弗吉尼亚",
  "us-west-2": "俄勒冈",
  "ap-northeast-1": "东京",
  "ap-southeast-1": "新加坡",
  "eu-west-1": "爱尔兰",
}

const PROVIDER_LABELS: Record<string, string> = {
  aliyun: "阿里云",
  tencent: "腾讯云",
  aws: "AWS",
}

const CPU_OPTIONS = ["全部", "2核", "4核", "8核", "16核", "32核"]
const CPU_VALUES = [0, 2, 4, 8, 16, 32]
const MEMORY_OPTIONS = ["全部", "4G", "8G", "16G", "32G", "64G"]
const MEMORY_VALUES = [0, 4, 8, 16, 32, 64]

export default function CloudInstancesPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const provider = searchParams.get("provider") ?? "all"

  const [instances, setInstances] = React.useState<CloudInstance[]>([])
  const [loading, setLoading] = React.useState(true)
  const [deleting, setDeleting] = React.useState<string | null>(null)
  const [cpuIndex, setCpuIndex] = React.useState(0)
  const [memoryIndex, setMemoryIndex] = React.useState(0)

  React.useEffect(() => {
    setLoading(true)
    fetch("/api/cloud-instances")
      .then((r) => r.json())
      .then((data) => {
        setInstances(data.instances ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const filtered = React.useMemo(() => {
    return instances.filter((i) => {
      if (provider !== "all" && i.provider !== provider) return false
      const cpuVal = CPU_VALUES[cpuIndex]
      const memVal = MEMORY_VALUES[memoryIndex]
      if (cpuVal > 0 && !i.instanceType.includes(String(cpuVal))) return false
      if (memVal > 0 && !i.instanceType.includes(String(memVal))) return false
      return true
    })
  }, [instances, provider, cpuIndex, memoryIndex])

  const hasFilter = cpuIndex !== 0 || memoryIndex !== 0
  const hasInstances = instances.length > 0

  function handleProviderChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === "all") {
      params.delete("provider")
    } else {
      params.set("provider", value)
    }
    router.push(`/cloud-instances?${params.toString()}`)
  }

  function clearFilter() {
    setCpuIndex(0)
    setMemoryIndex(0)
  }

  async function handleDelete(id: string) {
    if (!confirm("确定删除此弹性规格？")) return
    setDeleting(id)
    const res = await fetch(`/api/cloud-instances/${id}`, { method: "DELETE" })
    if (res.ok) {
      setInstances((prev) => prev.filter((i) => i.id !== id))
    }
    setDeleting(null)
  }

  return (
    <div className="flex h-full flex-col">
      <RegisterHeaderActions>
        <Button size="sm" asChild>
          <Link href={`/cloud-instances/new?provider=${provider}`}>
            添加
            <Plus data-icon="inline-end" />
          </Link>
        </Button>
      </RegisterHeaderActions>

      {/* 筛选栏 */}
      <div className="flex items-center gap-2 px-6 pb-3">
        <Select value={provider} onValueChange={handleProviderChange}>
          <SelectTrigger className="w-32 h-8">
            <SelectValue placeholder="选择提供商" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部提供商</SelectItem>
            {PROVIDERS.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon-sm">
              <ListFilterIcon data-icon="inline-start" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0">
            <div className="px-4 py-2.5 text-[13px] font-medium">规格参数</div>
            <Separator />
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">CPU</div>
                  <div className="text-xs font-medium">{CPU_OPTIONS[cpuIndex]}</div>
                </div>
                <Slider
                  value={[cpuIndex]}
                  onValueChange={([v]) => setCpuIndex(v)}
                  min={0}
                  max={CPU_OPTIONS.length - 1}
                  step={1}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">内存</div>
                  <div className="text-xs font-medium">{MEMORY_OPTIONS[memoryIndex]}</div>
                </div>
                <Slider
                  value={[memoryIndex]}
                  onValueChange={([v]) => setMemoryIndex(v)}
                  min={0}
                  max={MEMORY_OPTIONS.length - 1}
                  step={1}
                />
              </div>
              {hasFilter && (
                <>
                  <Separator />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-7 text-xs text-muted-foreground"
                    onClick={clearFilter}
                  >
                    清除筛选
                  </Button>
                </>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* 实例列表 */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {loading ? (
          <div className="space-y-2 pt-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-3 py-2.5">
                <Skeleton className="h-4 w-[180px]" />
                <Skeleton className="h-4 w-[72px]" />
                <Skeleton className="h-4 w-[88px]" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-[48px]" />
                <Skeleton className="h-4 w-[56px]" />
                <Skeleton className="h-4 w-[120px]" />
                <Skeleton className="h-7 w-7 rounded-md" />
              </div>
            ))}
          </div>
        ) : !hasInstances ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Cloud />
              </EmptyMedia>
              <EmptyTitle>还没有弹性规格</EmptyTitle>
              <EmptyDescription>
                您还没有创建任何弹性规格。点击下方按钮开始创建您的第一个弹性规格。
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild>
                <Link href={`/cloud-instances/new?provider=${provider}`}>
                  <Plus data-icon="inline-start" />
                  创建第一个
                </Link>
              </Button>
            </EmptyContent>
          </Empty>
        ) : filtered.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Search />
              </EmptyMedia>
              <EmptyTitle>没有符合筛选条件的实例</EmptyTitle>
              <EmptyDescription>
                请尝试调整筛选条件，或切换提供商查看其他实例。
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={clearFilter}>
                清除筛选
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="overflow-hidden rounded-lg bg-card shadow-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">名称</TableHead>
                  <TableHead className="w-[100px]">提供商</TableHead>
                  <TableHead className="w-[120px]">地域</TableHead>
                  <TableHead>实例规格</TableHead>
                  <TableHead className="w-[72px]">vCPU</TableHead>
                  <TableHead className="w-[88px]">内存</TableHead>
                  <TableHead className="w-[160px]">创建时间</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((inst) => (
                  <TableRow key={inst.id}>
                    <TableCell className="font-medium">{inst.name}</TableCell>
                    <TableCell>{PROVIDER_LABELS[inst.provider] ?? inst.provider}</TableCell>
                    <TableCell>{REGION_LABELS[inst.region] ?? inst.region}</TableCell>
                    <TableCell className="font-mono text-[12px]">{inst.instanceType}</TableCell>
                    <TableCell className="tnum text-[12px]">
                      {inst.cpuCoreCount != null ? `${inst.cpuCoreCount} 核` : "—"}
                    </TableCell>
                    <TableCell className="tnum text-[12px]">
                      {inst.memorySize != null ? `${inst.memorySize} GiB` : "—"}
                    </TableCell>
                    <TableCell className="tnum text-[12px] text-muted-foreground">
                      {new Date(inst.createdAt).toLocaleString("zh-CN")}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(inst.id)}
                        disabled={deleting === inst.id}
                      >
                        {deleting === inst.id ? (
                          <Spinner className="h-3.5 w-3.5" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
