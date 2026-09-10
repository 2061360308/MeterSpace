"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { SettingGroup, SettingItemRow } from "@/components/settings/setting-item"
import { toast } from "sonner"
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
    if (!newEnv.key || !newEnv.value) {
      toast.error("请填写变量名和值")
      return
    }
    try {
      const res = await fetch("/api/settings/env", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newEnv),
      })
      if (!res.ok) throw new Error("添加失败")
      await fetchVars()
      setNewEnv({ key: "", value: "", description: "" })
      setDialogOpen(false)
      toast.success("环境变量已添加")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handleDeleteEnv = async (id: string) => {
    try {
      const res = await fetch(`/api/settings/env/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("删除失败")
      await fetchVars()
      toast.success("环境变量已删除")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const toggleShowValue = (id: string) => {
    setShowValues((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  return (
    <SettingGroup
      title="全局环境变量"
      description="这些环境变量将在所有工作区中可用"
      action={
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
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
      }
    >
      {envVars.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">
          暂无环境变量
        </div>
      ) : (
        envVars.map((env) => (
          <SettingItemRow key={env.id}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-mono text-sm font-medium">
                  {env.key}
                </span>
                {env.description && (
                  <span className="truncate text-sm text-muted-foreground">
                    {env.description}
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-1 font-mono text-sm text-muted-foreground">
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDeleteEnv(env.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </SettingItemRow>
        ))
      )}
    </SettingGroup>
  )
}