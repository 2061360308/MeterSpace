"use client"

import { useState } from "react"
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
  isSecret: boolean
}

export default function EnvSettingsPage() {
  const [envVars, setEnvVars] = useState<EnvVariable[]>([
    { id: "1", key: "NODE_ENV", value: "development", isSecret: false },
    { id: "2", key: "API_KEY", value: "sk-1234567890", isSecret: true },
    { id: "3", key: "DATABASE_URL", value: "postgresql://localhost:5432/mydb", isSecret: true },
  ])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newEnv, setNewEnv] = useState({ key: "", value: "", isSecret: false })
  const [showValues, setShowValues] = useState<Record<string, boolean>>({})

  const handleAddEnv = () => {
    if (!newEnv.key || !newEnv.value) return

    const env: EnvVariable = {
      id: Date.now().toString(),
      key: newEnv.key,
      value: newEnv.value,
      isSecret: newEnv.isSecret,
    }

    setEnvVars([...envVars, env])
    setNewEnv({ key: "", value: "", isSecret: false })
    setDialogOpen(false)
  }

  const handleDeleteEnv = (id: string) => {
    setEnvVars(envVars.filter((env) => env.id !== id))
  }

  const toggleShowValue = (id: string) => {
    setShowValues((prev) => ({ ...prev, [id]: !prev[id] }))
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
                          type={newEnv.isSecret ? "password" : "text"}
                          value={newEnv.value}
                          onChange={(e) =>
                            setNewEnv({ ...newEnv, value: e.target.value })
                          }
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="isSecret"
                          checked={newEnv.isSecret}
                          onChange={(e) =>
                            setNewEnv({ ...newEnv, isSecret: e.target.checked })
                          }
                          className="rounded"
                        />
                        <Label htmlFor="isSecret">标记为敏感值</Label>
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
                {envVars.map((env) => (
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
                          {env.isSecret && !showValues[env.id]
                            ? "••••••••"
                            : env.value}
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
                    {env.isSecret && (
                      <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                        敏感
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteEnv(env.id)}
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