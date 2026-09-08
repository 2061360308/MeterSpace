"use client"

import { useState, useEffect, useCallback } from "react"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Trash2, Folder } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

interface StorageVolume {
  id: string
  name: string
  mountPath: string
  description: string | null
}

export default function StorageSettingsPage() {
  const [volumes, setVolumes] = useState<StorageVolume[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newVolume, setNewVolume] = useState({
    name: "",
    mountPath: "",
    description: "",
  })

  const fetchVolumes = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/storage")
      const data = await res.json()
      setVolumes(data.volumes ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchVolumes() }, [fetchVolumes])

  const handleAddVolume = async () => {
    if (!newVolume.name || !newVolume.mountPath) return
    try {
      await fetch("/api/settings/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newVolume),
      })
      await fetchVolumes()
      setNewVolume({ name: "", mountPath: "", description: "" })
      setDialogOpen(false)
    } catch {
      // ignore
    }
  }

  const handleDeleteVolume = async (id: string) => {
    try {
      await fetch(`/api/settings/storage/${id}`, { method: "DELETE" })
      await fetchVolumes()
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="持久化目录" description="管理持久化存储卷" />
        <div className="flex-1 overflow-auto p-6">
          <div className="text-muted-foreground">加载中...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="持久化目录" description="管理持久化存储卷" />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>持久化存储卷</CardTitle>
                  <CardDescription>
                    配置跨工作区共享的持久化存储目录
                  </CardDescription>
                </div>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      添加存储卷
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>添加持久化存储卷</DialogTitle>
                      <DialogDescription>
                        创建一个新的持久化存储卷
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">名称</Label>
                        <Input
                          id="name"
                          placeholder="例如：home-directory"
                          value={newVolume.name}
                          onChange={(e) =>
                            setNewVolume({ ...newVolume, name: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="mountPath">挂载路径</Label>
                        <Input
                          id="mountPath"
                          placeholder="例如：/home"
                          value={newVolume.mountPath}
                          onChange={(e) =>
                            setNewVolume({
                              ...newVolume,
                              mountPath: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="description">描述（可选）</Label>
                        <Input
                          id="description"
                          placeholder="存储卷描述"
                          value={newVolume.description}
                          onChange={(e) =>
                            setNewVolume({
                              ...newVolume,
                              description: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setDialogOpen(false)}>
                        取消
                      </Button>
                      <Button onClick={handleAddVolume}>添加</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {volumes.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    暂无存储卷
                  </p>
                ) : (
                  volumes.map((volume) => (
                    <div
                      key={volume.id}
                      className="flex items-center gap-4 p-4 border rounded-lg"
                    >
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted">
                        <Folder className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className="font-medium">{volume.name}</div>
                        </div>
                        <div className="text-sm text-muted-foreground font-mono mt-1">
                          {volume.mountPath}
                        </div>
                        {volume.description && (
                          <div className="text-sm text-muted-foreground mt-1">
                            {volume.description}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteVolume(volume.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
