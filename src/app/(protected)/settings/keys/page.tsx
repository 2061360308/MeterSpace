"use client"

import { useState, useEffect, useCallback } from "react"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
    if (!newKey.name) return
    try {
      const res = await fetch("/api/settings/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newKey),
      })
      const data = await res.json()
      if (data.rawKey) {
        setCreatedKey(data.rawKey)
      }
      await fetchKeys()
      setNewKey({ name: "" })
    } catch {
      // ignore
    }
  }

  const handleDeleteKey = async (id: string) => {
    try {
      await fetch(`/api/settings/keys/${id}`, { method: "DELETE" })
      await fetchKeys()
    } catch {
      // ignore
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
      <div className="flex flex-col h-full">
        <Header title="密钥管理" description="管理 API 密钥" />
        <div className="flex-1 overflow-auto p-6">
          <div className="text-muted-foreground">加载中...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="密钥管理" description="管理 API 密钥" />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>API 密钥</CardTitle>
                  <CardDescription>
                    管理用于 API 访问的密钥
                  </CardDescription>
                </div>
                <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) closeDialog() }}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
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
                        <div className="p-4 bg-muted rounded-lg font-mono text-sm break-all">
                          {createdKey}
                        </div>
                        <Button onClick={handleCopy} className="w-full">
                          {copied ? (
                            <>
                              <Check className="h-4 w-4 mr-2" />
                              已复制
                            </>
                          ) : (
                            <>
                              <Copy className="h-4 w-4 mr-2" />
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
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {keys.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    暂无密钥
                  </p>
                ) : (
                  keys.map((key) => (
                    <div
                      key={key.id}
                      className="flex items-center gap-4 p-4 border rounded-lg"
                    >
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted">
                        <Key className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className="font-medium">{key.name}</div>
                        </div>
                        <div className="font-mono text-sm text-muted-foreground mt-1">
                          {key.keyPrefix}...
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
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
