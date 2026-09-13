"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/ui/page-header"
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

  useEffect(() => {
    fetchKeys()
  }, [fetchKeys])

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
    // 乐观删除：先从列表移除，失败再还原（U7）
    const prev = keys
    setKeys((list) => list.filter((k) => k.id !== id))
    try {
      const res = await fetch(`/api/settings/keys/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("删除失败")
      toast.success("密钥已删除")
    } catch (e) {
      setKeys(prev)
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="API 密钥"
        description="用于通过 API 访问 MeterSpace。完整密钥只在创建时显示一次，请及时保存。"
        actions={
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open)
              if (!open) closeDialog()
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus data-icon="inline-start" />
                创建密钥
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{createdKey ? "密钥已创建" : "创建新密钥"}</DialogTitle>
                <DialogDescription>
                  {createdKey
                    ? "请立即复制密钥，关闭后将无法再次查看完整密钥。"
                    : "给密钥起个容易辨认的名字，例如它会被哪个服务使用。"}
                </DialogDescription>
              </DialogHeader>
              {createdKey ? (
                <div className="space-y-4">
                  <div className="break-all rounded-md bg-muted p-4 font-mono text-[12px] leading-6">
                    {createdKey}
                  </div>
                  <Button onClick={handleCopy} className="w-full">
                    {copied ? (
                      <>
                        <Check data-icon="inline-start" />
                        已复制
                      </>
                    ) : (
                      <>
                        <Copy data-icon="inline-start" />
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
                      onChange={(e) => setNewKey({ ...newKey, name: e.target.value })}
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
      />

      <SettingGroup title="已创建的密钥">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[72px] w-full rounded-lg" />
            ))}
          </div>
        ) : keys.length === 0 ? (
          <div className="rounded-lg bg-card px-4 py-8 text-center text-[13px] leading-6 text-muted-foreground shadow-border">
            还没有密钥。点右上角「创建密钥」生成第一个。
          </div>
        ) : (
          keys.map((key) => (
            <SettingItemRow key={key.id}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Key className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium leading-6">{key.name}</div>
                <div className="font-mono text-[12px] leading-5 text-muted-foreground">
                  {key.keyPrefix}...
                </div>
                <div className="tnum text-[12px] leading-5 text-muted-foreground">
                  创建于 {new Date(key.createdAt).toLocaleDateString()}
                  {key.lastUsedAt &&
                    ` · 最后使用 ${new Date(key.lastUsedAt).toLocaleDateString()}`}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleDeleteKey(key.id)}>
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
