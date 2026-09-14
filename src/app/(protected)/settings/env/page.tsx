"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { RegisterHeaderActions } from "@/components/header-actions"
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

  useEffect(() => {
    fetchVars()
  }, [fetchVars])

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
    // 乐观删除：先从列表移除，失败再还原（U7）
    const prev = envVars
    setEnvVars((list) => list.filter((v) => v.id !== id))
    try {
      const res = await fetch(`/api/settings/env/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("删除失败")
      toast.success("环境变量已删除")
    } catch (e) {
      setEnvVars(prev)
      toast.error((e as Error).message)
    }
  }

  const toggleShowValue = (id: string) => {
    setShowValues((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="space-y-6">
      <RegisterHeaderActions>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus data-icon="inline-start" />
              添加变量
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>添加环境变量</DialogTitle>
              <DialogDescription>
                变量名建议使用大写加下划线，例如 API_KEY。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="key">变量名</Label>
                <Input
                  id="key"
                  placeholder="例如：API_KEY"
                  value={newEnv.key}
                  onChange={(e) => setNewEnv({ ...newEnv, key: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="value">值</Label>
                <Input
                  id="value"
                  placeholder="变量值"
                  value={newEnv.value}
                  onChange={(e) => setNewEnv({ ...newEnv, value: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">描述（可选）</Label>
                <Input
                  id="description"
                  placeholder="这个变量是做什么的？"
                  value={newEnv.description}
                  onChange={(e) => setNewEnv({ ...newEnv, description: e.target.value })}
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
      </RegisterHeaderActions>

      <SettingGroup title="已定义的变量">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[64px] w-full rounded-lg" />
            ))}
          </div>
        ) : envVars.length === 0 ? (
          <div className="rounded-lg bg-card px-4 py-8 text-center text-[13px] leading-6 text-muted-foreground shadow-border">
            还没有环境变量。点右上角「添加变量」创建第一个。
          </div>
        ) : (
          envVars.map((env) => (
            <SettingItemRow key={env.id}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-[13px] font-medium leading-6">
                    {env.key}
                  </span>
                  {env.description && (
                    <span className="truncate text-[12px] leading-5 text-muted-foreground">
                      {env.description}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-1 font-mono text-[12px] leading-5 text-muted-foreground">
                  {showValues[env.id] ? env.value : "••••••••"}
                  <Button
                    variant="ghost"
                    size="icon-xs"
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
              <Button variant="outline" size="sm" onClick={() => handleDeleteEnv(env.id)}>
                <Trash2 data-icon="inline-start" />
                删除
              </Button>
            </SettingItemRow>
          ))
        )}
      </SettingGroup>
    </div>
  )
}
