"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Plus, Search, Trash2, Edit, GripVertical } from "lucide-react"
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
import { Switch } from "@/components/ui/switch"

interface UserScript {
  id: string
  name: string
  description: string | null
  script: string
  sortOrder: number | null
  enabled: boolean | null
}

export default function ScriptsPage() {
  const [search, setSearch] = useState("")
  const [scripts, setScripts] = useState<UserScript[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editScript, setEditScript] = useState<UserScript | null>(null)
  const [form, setForm] = useState({ name: "", description: "", script: "" })

  const fetchScripts = useCallback(async () => {
    try {
      const res = await fetch("/api/my-resources/scripts")
      const data = await res.json()
      setScripts(data.scripts ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchScripts() }, [fetchScripts])

  const filteredScripts = scripts.filter(
    (script) =>
      script.name.toLowerCase().includes(search.toLowerCase()) ||
      (script.description ?? "").toLowerCase().includes(search.toLowerCase())
  )

  const handleSubmit = async () => {
    if (!form.name || !form.script) return
    try {
      if (editScript) {
        await fetch(`/api/my-resources/scripts/${editScript.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
      } else {
        await fetch("/api/my-resources/scripts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, sortOrder: scripts.length }),
        })
      }
      await fetchScripts()
      closeDialog()
    } catch {
      // ignore
    }
  }

  const handleEdit = (script: UserScript) => {
    setEditScript(script)
    setForm({ name: script.name, description: script.description ?? "", script: script.script })
    setDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/my-resources/scripts/${id}`, { method: "DELETE" })
      await fetchScripts()
    } catch {
      // ignore
    }
  }

  const handleToggle = async (script: UserScript) => {
    try {
      await fetch(`/api/my-resources/scripts/${script.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !script.enabled }),
      })
      await fetchScripts()
    } catch {
      // ignore
    }
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setEditScript(null)
    setForm({ name: "", description: "", script: "" })
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
                placeholder="搜索脚本..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Dialog
              open={dialogOpen}
              onOpenChange={(open) => { setDialogOpen(open); if (!open) closeDialog() }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  添加脚本
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{editScript ? "编辑脚本" : "添加新脚本"}</DialogTitle>
                  <DialogDescription>
                    {editScript ? "修改脚本内容" : "创建一个新的自定义脚本"}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">名称</Label>
                    <Input id="name" placeholder="例如：安装开发工具" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">描述</Label>
                    <Input id="description" placeholder="脚本描述..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="script">脚本内容</Label>
                    <Textarea
                      id="script"
                      placeholder={"#!/bin/bash\n# 在这里编写脚本..."}
                      className="font-mono text-sm min-h-[200px]"
                      value={form.script}
                      onChange={(e) => setForm({ ...form, script: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={closeDialog}>取消</Button>
                  <Button onClick={handleSubmit}>{editScript ? "保存" : "添加"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-4">
            {filteredScripts.map((script) => (
              <Card key={script.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <GripVertical className="h-5 w-5 text-muted-foreground mt-1 cursor-move" />
                      <div>
                        <CardTitle className="text-lg">{script.name}</CardTitle>
                        <CardDescription className="mt-1">{script.description}</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={script.enabled ?? true}
                        onCheckedChange={() => handleToggle(script)}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <pre className="bg-muted p-4 rounded-lg text-sm font-mono overflow-x-auto">
                      {script.script}
                    </pre>
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleEdit(script)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(script.id)}>
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
