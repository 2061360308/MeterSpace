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

interface UserImage {
  id: string
  name: string
  description: string | null
  imageUri: string
  architecture: string | null
  source: string | null
}

export default function MyImagesPage() {
  const [search, setSearch] = useState("")
  const [images, setImages] = useState<UserImage[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editImage, setEditImage] = useState<UserImage | null>(null)
  const [form, setForm] = useState({ name: "", description: "", imageUri: "" })

  const fetchImages = useCallback(async () => {
    try {
      const res = await fetch("/api/my-resources/images")
      const data = await res.json()
      setImages(data.images ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchImages() }, [fetchImages])

  const filteredImages = images.filter(
    (img) =>
      img.name.toLowerCase().includes(search.toLowerCase()) ||
      (img.description ?? "").toLowerCase().includes(search.toLowerCase())
  )

  const handleSubmit = async () => {
    if (!form.name || !form.imageUri) return
    try {
      if (editImage) {
        await fetch(`/api/my-resources/images/${editImage.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
      } else {
        await fetch("/api/my-resources/images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
      }
      await fetchImages()
      closeDialog()
    } catch {
      // ignore
    }
  }

  const handleEdit = (image: UserImage) => {
    setEditImage(image)
    setForm({ name: image.name, description: image.description ?? "", imageUri: image.imageUri })
    setDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/my-resources/images/${id}`, { method: "DELETE" })
      await fetchImages()
    } catch {
      // ignore
    }
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setEditImage(null)
    setForm({ name: "", description: "", imageUri: "" })
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
                placeholder="搜索镜像..."
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
                    <DialogTitle>{editImage ? "编辑镜像" : "添加自定义镜像"}</DialogTitle>
                    <DialogDescription>
                      {editImage ? "修改镜像信息" : "输入镜像 URI 来添加自定义镜像"}
                    </DialogDescription>
                  </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">名称</Label>
                    <Input id="name" placeholder="例如：My Custom Node" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">描述</Label>
                    <Textarea id="description" placeholder="镜像描述..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="uri">镜像 URI</Label>
                    <Input id="uri" placeholder="例如：docker.io/library/node:22" value={form.imageUri} onChange={(e) => setForm({ ...form, imageUri: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={closeDialog}>取消</Button>
                  <Button onClick={handleSubmit}>{editImage ? "保存" : "添加"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button asChild variant="outline" size="sm">
              <Link href="/marketplace/images">浏览市场</Link>
            </Button>
          </ButtonGroup>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredImages.map((image) => (
              <Card key={image.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{image.name}</CardTitle>
                      <CardDescription className="mt-1">{image.description}</CardDescription>
                    </div>
                    <Badge tone={image.source === "marketplace" ? "blue" : "gray"}>
                      {image.source === "marketplace" ? "市场" : "自定义"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-sm text-muted-foreground font-mono truncate">{image.imageUri}</div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">{image.architecture}</div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleEdit(image)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDelete(image.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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
