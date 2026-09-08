"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

interface CloudInstanceDetail {
  id: string
  name: string
  provider: string
  region: string
  instanceType: string
  createdAt: string
}

const PROVIDER_LABELS: Record<string, string> = {
  aliyun: "阿里云",
  aws: "AWS",
}

const REGION_LABELS: Record<string, string> = {
  "cn-hangzhou": "杭州",
  "cn-shanghai": "上海",
  "cn-beijing": "北京",
  "cn-shenzhen": "深圳",
}

export default function CloudInstanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const router = useRouter()
  const [detail, setDetail] = useState<CloudInstanceDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    const { id } = await params
    const res = await fetch(`/api/cloud-instances/${id}`)
    if (res.status === 404) {
      router.replace("/")
      return
    }
    if (res.ok) {
      const data = await res.json()
      setDetail(data)
    }
  }, [params, router])

  useEffect(() => {
    load()
  }, [load])

  async function handleDelete() {
    if (!confirm("确定删除此弹性规格？")) return
    setBusy(true)
    setError("")
    const { id } = await params
    const res = await fetch(`/api/cloud-instances/${id}`, { method: "DELETE" })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? "删除失败")
      setBusy(false)
      return
    }
    router.push("/")
  }

  if (!detail) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{detail.name}</h1>
        <Button
          variant="destructive"
          onClick={handleDelete}
          disabled={busy}
        >
          {busy ? <Spinner className="mr-2 h-4 w-4" /> : null}
          删除
        </Button>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card className="p-6">
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <dt className="text-muted-foreground">厂商</dt>
          <dd>{PROVIDER_LABELS[detail.provider] ?? detail.provider}</dd>

          <dt className="text-muted-foreground">地域</dt>
          <dd>{REGION_LABELS[detail.region] ?? detail.region}</dd>

          <dt className="text-muted-foreground">实例规格</dt>
          <dd className="font-mono">{detail.instanceType}</dd>

          <dt className="text-muted-foreground">创建时间</dt>
          <dd>{new Date(detail.createdAt).toLocaleString("zh-CN")}</dd>
        </dl>
      </Card>
    </div>
  )
}
