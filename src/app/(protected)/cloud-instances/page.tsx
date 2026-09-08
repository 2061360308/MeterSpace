"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { Plus, Cloud, Trash2 } from "lucide-react"

type CloudInstance = {
  id: string
  name: string
  provider: string
  region: string
  instanceType: string
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
  "ap-guangzhou": "广州",
  "us-east-1": "弗吉尼亚",
}

export default function CloudInstancesPage() {
  const searchParams = useSearchParams()
  const provider = searchParams.get("provider") ?? "aliyun"

  const [instances, setInstances] = React.useState<CloudInstance[]>([])
  const [loading, setLoading] = React.useState(true)
  const [deleting, setDeleting] = React.useState<string | null>(null)

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

  const filtered = React.useMemo(
    () => instances.filter((i) => i.provider === provider),
    [instances, provider]
  )

  const currentProvider = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0]

  async function handleDelete(id: string) {
    if (!confirm("确定删除此云实例？")) return
    setDeleting(id)
    const res = await fetch(`/api/cloud-instances/${id}`, { method: "DELETE" })
    if (res.ok) {
      setInstances((prev) => prev.filter((i) => i.id !== id))
    }
    setDeleting(null)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{currentProvider.label}</h1>
          <p className="text-sm text-muted-foreground">管理云实例规格，创建工作区时可绑定使用</p>
        </div>
        <Button asChild>
          <Link href={`/cloud-instances/new?provider=${provider}`}>
            <Plus className="mr-2 h-4 w-4" />
            创建实例
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner className="h-8 w-8" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 space-y-4">
          <Cloud className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">暂无云实例</p>
          <Button asChild>
            <Link href={`/cloud-instances/new?provider=${provider}`}>
              <Plus className="mr-2 h-4 w-4" />
              创建第一个云实例
            </Link>
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((inst) => (
            <Card key={inst.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <Link
                  href={`/cloud-instances/${inst.id}`}
                  className="font-medium hover:underline"
                >
                  {inst.name}
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(inst.id)}
                  disabled={deleting === inst.id}
                >
                  {deleting === inst.id ? (
                    <Spinner className="h-4 w-4" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <dl className="text-sm space-y-1">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">地域</dt>
                  <dd>{REGION_LABELS[inst.region] ?? inst.region}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">规格</dt>
                  <dd className="font-mono text-xs">{inst.instanceType}</dd>
                </div>
              </dl>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
