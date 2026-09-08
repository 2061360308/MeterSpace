"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Plus, Search, Trash2, Edit, Play, GripVertical } from "lucide-react"
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
  description: string
  script: string
  sortOrder: number
  enabled: boolean
}

export default function ScriptsPage() {
  const [search, setSearch] = useState("")
  const [scripts, setScripts] = useState<UserScript[]>([
    {
      id: "1",
      name: "安装 Git 配置",
      description: "配置 Git 用户名和邮箱",
      script: `#!/bin/bash
git config --global user.name "Your Name"
git config --global user.email "your@email.com"`,
      sortOrder: 0,
      enabled: true,
    },
    {
      id: "2",
      name: "安装常用工具",
      description: "安装开发常用工具",
      script: `#!/bin/bash
apt-get update
apt-get install -y curl wget jq tree htop`,
      sortOrder: 1,
      enabled: true,
    },
    {
      id: "3",
      name: "配置 SSH 密钥",
      description: "生成并配置 SSH 密钥",
      script: `#!/bin/bash
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -N ""
cat ~/.ssh/id_rsa.pub`,
      sortOrder: 2,
      enabled: false,
    },
  ])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editScript, setEditScript] = useState<UserScript | null>(null)
  const [newScript, setNewScript] = useState({
    name: "",
    description: "",
    script: "",
  })

  const filteredScripts = scripts.filter(
    (script) =>
      script.name.toLowerCase().includes(search.toLowerCase()) ||
      script.description.toLowerCase().includes(search.toLowerCase())
  )

  const handleAddScript = () => {
    if (!newScript.name || !newScript.script) return

    if (editScript) {
      setScripts(
        scripts.map((s) =>
          s.id === editScript.id
            ? { ...s, name: newScript.name, description: newScript.description, script: newScript.script }
            : s
        )
      )
    } else {
      const script: UserScript = {
        id: Date.now().toString(),
        name: newScript.name,
        description: newScript.description,
        script: newScript.script,
        sortOrder: scripts.length,
        enabled: true,
      }
      setScripts([...scripts, script])
    }

    setNewScript({ name: "", description: "", script: "" })
    setEditScript(null)
    setDialogOpen(false)
  }

  const handleEditScript = (script: UserScript) => {
    setEditScript(script)
    setNewScript({
      name: script.name,
      description: script.description,
      script: script.script,
    })
    setDialogOpen(true)
  }

  const handleDeleteScript = (id: string) => {
    setScripts(scripts.filter((s) => s.id !== id))
  }

  const handleToggleScript = (id: string) => {
    setScripts(
      scripts.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    )
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
              onOpenChange={(open) => {
                setDialogOpen(open)
                if (!open) {
                  setEditScript(null)
                  setNewScript({ name: "", description: "", script: "" })
                }
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  添加脚本
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {editScript ? "编辑脚本" : "添加新脚本"}
                  </DialogTitle>
                  <DialogDescription>
                    {editScript
                      ? "修改脚本内容"
                      : "创建一个新的自定义脚本"}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">名称</Label>
                    <Input
                      id="name"
                      placeholder="例如：安装开发工具"
                      value={newScript.name}
                      onChange={(e) =>
                        setNewScript({ ...newScript, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">描述</Label>
                    <Input
                      id="description"
                      placeholder="脚本描述..."
                      value={newScript.description}
                      onChange={(e) =>
                        setNewScript({
                          ...newScript,
                          description: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="script">脚本内容</Label>
                    <Textarea
                      id="script"
                      placeholder="#!/bin/bash&#10;# 在这里编写脚本..."
                      className="font-mono text-sm min-h-[200px]"
                      value={newScript.script}
                      onChange={(e) =>
                        setNewScript({ ...newScript, script: e.target.value })
                      }
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDialogOpen(false)
                      setEditScript(null)
                      setNewScript({ name: "", description: "", script: "" })
                    }}
                  >
                    取消
                  </Button>
                  <Button onClick={handleAddScript}>
                    {editScript ? "保存" : "添加"}
                  </Button>
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
                        <CardDescription className="mt-1">
                          {script.description}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={script.enabled}
                        onCheckedChange={() => handleToggleScript(script.id)}
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
                      <Button size="sm" variant="outline">
                        <Play className="h-4 w-4 mr-1" />
                        运行
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEditScript(script)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteScript(script.id)}
                      >
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