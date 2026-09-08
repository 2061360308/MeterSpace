"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Trash2, Edit } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface UserFeature {
  id: string
  name: string
  description: string | null
  featureUri: string
  options: Record<string, unknown>
  source: string | null
}

export default function MyFeaturesPage() {
  const [search, setSearch] = useState("")
  const [features, setFeatures] = useState<UserFeature[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editFeature, setEditFeature] = useState<UserFeature | null>(null)
  const [form, setForm] = useState({ name: "", description: "", featureUri: "" })

  const fetchFeatures = useCallback(async () => {
    try {
      const res = await fetch("/api/my-resources/features")
      const data = await res.json()
      setFeatures(data.features ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchFeatures() }, [fetchFeatures])

  const filteredFeatures = features.filter(
    (feat) =>
      feat.name.toLowerCase().includes(search.toLowerCase()) ||
      (feat.description ?? "").toLowerCase().includes(search.toLowerCase())
  )

  const handleSubmit = async () => {
    if (!form.name || !form.featureUri) return
    try {
      if (editFeature) {
        await fetch(`/api/my-resources/features/${editFeature.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
      } else {
        await fetch("/api/my-resources/features", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
      }
      await fetchFeatures()
      closeDialog()
    } catch {
      // ignore
    }
  }

  const handleEdit = (feature: UserFeature) => {
    setEditFeature(feature)
    setForm({ name: feature.name, description: feature.description ?? "", featureUri: feature.featureUri })
    setDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/my-resources/features/${id}`, { method: "DELETE" })
      await fetchFeatures()
    } catch {
      // ignore
    }
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setEditFeature(null)
    setForm({ name: "", description: "", featureUri: "" })
  }

  if (loading) {
    return <div className="flex-1 overflow-auto p-6"><div className="text-muted-foreground">加载中...</div></div>
  }

  return (
    <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索 Features..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <ButtonGroup>
              <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) closeDialog() }}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon-sm">
                    <Plus />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editFeature ? "编辑 Feature" : "添加自定义 Feature"}</DialogTitle>
                    <DialogDescription>
                      {editFeature ? "修改 Feature 信息" : "输入 Feature URI 来添加自定义 Feature"}
                    </DialogDescription>
                  </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">名称</Label>
                    <Input id="name" placeholder="例如：My Custom Feature" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">描述</Label>
                    <Textarea id="description" placeholder="Feature 描述..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="uri">Feature URI</Label>
                    <Input id="uri" placeholder="例如：ghcr.io/devcontainers/features/node:1" value={form.featureUri} onChange={(e) => setForm({ ...form, featureUri: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={closeDialog}>取消</Button>
                  <Button onClick={handleSubmit}>{editFeature ? "保存" : "添加"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button asChild variant="outline" size="sm">
              <Link href="/marketplace/features">浏览市场</Link>
            </Button>
          </ButtonGroup>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredFeatures.map((feature) => (
              <Card key={feature.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{feature.name}</CardTitle>
                      <CardDescription className="mt-1">{feature.description}</CardDescription>
                    </div>
                    <Badge tone={feature.source === "marketplace" ? "blue" : "gray"}>
                      {feature.source === "marketplace" ? "市场" : "自定义"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-sm text-muted-foreground font-mono truncate">{feature.featureUri}</div>
                    {Object.keys(feature.options).length > 0 && (
                      <div className="text-sm text-muted-foreground">
                        选项: {JSON.stringify(feature.options)}
                      </div>
                    )}
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleEdit(feature)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(feature.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
  )
}
