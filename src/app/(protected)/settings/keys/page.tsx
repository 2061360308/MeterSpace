"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { SettingGroup, SettingItemRow } from "@/components/settings/setting-item"
import { toast } from "sonner"
import { Plus, Trash2, Key, Copy, Check } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  lastUsedAt: string | null
  createdAt: string
}

export default function KeysSettingsPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newKey, setNewKey] = useState({ name: "" })
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/keys")
      const data = await res.json()
      setKeys(data.keys ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchKeys() }, [fetchKeys])

  const handleAddKey = async () => {
    if (!newKey.name) {
      toast.error("请填写密钥名称")
      return
    }
    try {
      const res = await fetch("/api/settings/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newKey),
      })
      if (!res.ok) throw new Error("创建失败")
      const data = await res.json()
      if (data.rawKey) {
        setCreatedKey(data.rawKey)
      }
      await fetchKeys()
      setNewKey({ name: "" })
      toast.success("密钥已创建")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handleDeleteKey = async (id: string) => {
    try {
      const res = await fetch(`/api/settings/keys/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("删除失败")
      await fetchKeys()
      toast.success("密钥已删除")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handleCopy = async () => {
    if (!createdKey) return
    await navigator.clipboard.writeText(createdKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setCreatedKey(null)
    setCopied(false)
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
      title="API 密钥"
      description="管理用于 API 访问的密钥"
      action={
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) closeDialog()
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              创建密钥
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{createdKey ? "密钥已创建" : "创建新密钥"}</DialogTitle>
              <DialogDescription>
                {createdKey
                  ? "请立即复制密钥，之后将无法再次查看完整密钥"
                  : "创建一个新的 API 密钥"}
              </DialogDescription>
            </DialogHeader>
            {createdKey ? (
              <div className="space-y-4">
                <div className="rounded-lg bg-muted p-4 font-mono text-sm break-all">
                  {createdKey}
                </div>
                <Button onClick={handleCopy} className="w-full">
                  {copied ? (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-4 w-4" />
                      复制密钥
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">密钥名称</Label>
                  <Input
                    id="name"
                    placeholder="例如：开发密钥"
                    value={newKey.name}
                    onChange={(e) =>
                      setNewKey({ ...newKey, name: e.target.value })
                    }
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              {createdKey ? (
                <Button onClick={closeDialog}>完成</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={closeDialog}>
                    取消
                  </Button>
                  <Button onClick={handleAddKey}>创建</Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      {keys.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">
          暂无密钥
        </div>
      ) : (
        keys.map((key) => (
          <SettingItemRow key={key.id}>
            <div className="flex items-center justify-center h-10 w-10 shrink-0 rounded-lg bg-muted">
              <Key className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{key.name}</div>
              <div className="mt-1 font-mono text-sm text-muted-foreground">
                {key.keyPrefix}...
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                创建于 {new Date(key.createdAt).toLocaleDateString()}
                {key.lastUsedAt &&
                  ` · 最后使用 ${new Date(key.lastUsedAt).toLocaleDateString()}`}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDeleteKey(key.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </SettingItemRow>
        ))
      )}
    </SettingGroup>
  )
}