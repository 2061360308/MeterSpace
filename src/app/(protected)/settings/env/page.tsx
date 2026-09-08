"use client"

import { useState, useEffect, useCallback } from "react"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Trash2, Eye, EyeOff } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

interface EnvVariable {
  id: string
  key: string
  value: string
  description: string | null
}

export default function EnvSettingsPage() {
  const [envVars, setEnvVars] = useState<EnvVariable[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newEnv, setNewEnv] = useState({ key: "", value: "", description: "" })
  const [showValues, setShowValues] = useState<Record<string, boolean>>({})

  const fetchVars = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/env")
      const data = await res.json()
      setEnvVars(data.variables ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchVars() }, [fetchVars])

  const handleAddEnv = async () => {
    if (!newEnv.key || !newEnv.value) return
    try {
      await fetch("/api/settings/env", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newEnv),
      })
      await fetchVars()
      setNewEnv({ key: "", value: "", description: "" })
      setDialogOpen(false)
    } catch {
      // ignore
    }
  }

  const handleDeleteEnv = async (id: string) => {
    try {
      await fetch(`/api/settings/env/${id}`, { method: "DELETE" })
      await fetchVars()
    } catch {
      // ignore
    }
  }

  const toggleShowValue = (id: string) => {
    setShowValues((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="环境变量" description="管理全局环境变量" />
        <div className="flex-1 overflow-auto p-6">
          <div className="text-muted-foreground">加载中...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="环境变量" description="管理全局环境变量" />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>全局环境变量</CardTitle>
                  <CardDescription>
                    这些环境变量将在所有工作区中可用
                  </CardDescription>
                </div>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      添加变量
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>添加环境变量</DialogTitle>
                      <DialogDescription>
                        添加一个新的全局环境变量
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="key">变量名</Label>
                        <Input
                          id="key"
                          placeholder="例如：API_KEY"
                          value={newEnv.key}
                          onChange={(e) =>
                            setNewEnv({ ...newEnv, key: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="value">值</Label>
                        <Input
                          id="value"
                          placeholder="变量值"
                          value={newEnv.value}
                          onChange={(e) =>
                            setNewEnv({ ...newEnv, value: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="description">描述（可选）</Label>
                        <Input
                          id="description"
                          placeholder="变量描述"
                          value={newEnv.description}
                          onChange={(e) =>
                            setNewEnv({ ...newEnv, description: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setDialogOpen(false)}>
                        取消
                      </Button>
                      <Button onClick={handleAddEnv}>添加</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {envVars.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    暂无环境变量
                  </p>
                ) : (
                  envVars.map((env) => (
                    <div
                      key={env.id}
                      className="flex items-center gap-4 p-4 border rounded-lg"
                    >
                      <div className="flex-1 grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <div className="text-sm text-muted-foreground">变量名</div>
                          <div className="font-mono text-sm">{env.key}</div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-sm text-muted-foreground">值</div>
                          <div className="font-mono text-sm flex items-center gap-2">
                            {showValues[env.id] ? env.value : "••••••••"}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => toggleShowValue(env.id)}
                            >
                              {showValues[env.id] ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteEnv(env.id)}
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
