"use client"

import { useState } from "react"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Trash2, Eye, EyeOff, Key } from "lucide-react"
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
  key: string
  createdAt: Date
  lastUsedAt?: Date
}

export default function KeysSettingsPage() {
  const [keys, setKeys] = useState<ApiKey[]>([
    {
      id: "1",
      name: "开发密钥",
      key: "sk-1234567890abcdef1234567890abcdef",
      createdAt: new Date("2024-01-15"),
      lastUsedAt: new Date("2024-03-10"),
    },
    {
      id: "2",
      name: "生产密钥",
      key: "sk-9876543210fedcba9876543210fedcba",
      createdAt: new Date("2024-02-20"),
    },
  ])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newKey, setNewKey] = useState({ name: "" })
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})

  const handleAddKey = () => {
    if (!newKey.name) return

    const key: ApiKey = {
      id: Date.now().toString(),
      name: newKey.name,
      key: `sk-${Array.from({ length: 32 }, () =>
        Math.random().toString(16)[2]
      ).join("")}`,
      createdAt: new Date(),
    }

    setKeys([...keys, key])
    setNewKey({ name: "" })
    setDialogOpen(false)
  }

  const handleDeleteKey = (id: string) => {
    setKeys(keys.filter((k) => k.id !== id))
  }

  const toggleShowKey = (id: string) => {
    setShowKeys((prev) => ({ ...prev, [id]: !prev[id] }))
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
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      创建密钥
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>创建新密钥</DialogTitle>
                      <DialogDescription>
                        创建一个新的 API 密钥
                      </DialogDescription>
                    </DialogHeader>
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
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setDialogOpen(false)}>
                        取消
                      </Button>
                      <Button onClick={handleAddKey}>创建</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {keys.map((key) => (
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
                      <div className="font-mono text-sm text-muted-foreground mt-1 flex items-center gap-2">
                        {showKeys[key.id] ? key.key : `${key.key.slice(0, 8)}...`}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => toggleShowKey(key.id)}
                        >
                          {showKeys[key.id] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        创建于 {key.createdAt.toLocaleDateString()}
                        {key.lastUsedAt &&
                          ` · 最后使用 ${key.lastUsedAt.toLocaleDateString()}`}
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
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}