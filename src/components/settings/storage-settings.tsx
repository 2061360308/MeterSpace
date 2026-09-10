"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { SettingGroup, SettingItemRow } from "@/components/settings/setting-item"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import {
  Plus,
  Trash2,
  Folder,
  MapPin,
  Check,
  Cloud,
  AlertCircle,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

interface StorageVolume {
  id: string
  name: string
  mountPath: string
  description: string | null
}

interface AvailableRegion {
  id: string
  label: string
}

const PROVIDER_TABS = [
  { id: "aliyun", label: "阿里云", supported: true },
  { id: "tencent", label: "腾讯云", supported: false },
  { id: "aws", label: "AWS", supported: false },
]

function ProviderPlaceholder({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border bg-card px-4 py-12 text-center">
      <Cloud className="h-8 w-8 text-muted-foreground/50" />
      <p className="text-sm font-medium">{name} 地域开通即将支持</p>
      <p className="text-sm text-muted-foreground">敬请期待</p>
    </div>
  )
}

export function StorageSettings() {
  const [regions, setRegions] = useState<string[]>(["cn-hangzhou"])
  const [regionLabels, setRegionLabels] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)

  const [addOpen, setAddOpen] = useState(false)
  const [availableRegions, setAvailableRegions] = useState<AvailableRegion[]>([])
  const [regionsLoading, setRegionsLoading] = useState(false)
  const [regionsError, setRegionsError] = useState<string | null>(null)
  const [selectedRegion, setSelectedRegion] = useState("")
  const [activating, setActivating] = useState(false)
  const [removingRegion, setRemovingRegion] = useState("")

  const [volumes, setVolumes] = useState<StorageVolume[]>([])
  const [volumeLoading, setVolumeLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newVolume, setNewVolume] = useState({
    name: "",
    mountPath: "",
    description: "",
  })

  const fetchVolumes = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/storage")
      const data = await res.json()
      setVolumes(data.volumes ?? [])
    } catch {
      // ignore
    } finally {
      setVolumeLoading(false)
    }
  }, [])

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/user/regions")
        const data = await res.json()
        if (data?.regions) setRegions(data.regions)
      } catch {
        // ignore
      }
      try {
        const res = await fetch("/api/ecs/regions?provider=aliyun")
        const data = await res.json()
        if (Array.isArray(data.regions)) {
          const map: Record<string, string> = {}
          for (const r of data.regions) map[r.id] = r.label
          setRegionLabels(map)
        }
      } catch {
        // ignore
      }
      setLoaded(true)
    })()
    fetchVolumes()
  }, [fetchVolumes])

  const loadAvailableRegions = async () => {
    setSelectedRegion("")
    setRegionsError(null)
    setAvailableRegions([])
    setRegionsLoading(true)
    try {
      const res = await fetch("/api/ecs/regions?provider=aliyun")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "获取可用地域失败")
      const all: AvailableRegion[] = data.regions ?? []
      const map = { ...regionLabels }
      for (const r of all) map[r.id] = r.label
      setRegionLabels(map)
      setAvailableRegions(all.filter((r) => !regions.includes(r.id)))
    } catch (e) {
      setRegionsError((e as Error).message)
    } finally {
      setRegionsLoading(false)
    }
  }

  const handleActivate = async () => {
    if (!selectedRegion) {
      toast.error("请选择要开通的地域")
      return
    }
    setActivating(true)
    try {
      const res = await fetch("/api/user/regions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ region: selectedRegion }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "开通失败")
      setRegions(data.regions ?? regions)
      setAddOpen(false)
      toast.success(
        `已开通 ${regionLabels[selectedRegion] ?? selectedRegion}，OSS 存储桶已注册`,
      )
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setActivating(false)
    }
  }

  const handleRemoveRegion = async (region: string) => {
    setRemovingRegion(region)
    try {
      const res = await fetch("/api/user/regions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ region }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "删除失败")
      setRegions(data.regions ?? regions.filter((r) => r !== region))
      toast.success(`已取消开通 ${regionLabels[region] ?? region}`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setRemovingRegion("")
    }
  }

  const handleAddVolume = async () => {
    if (!newVolume.name || !newVolume.mountPath) {
      toast.error("请填写名称和挂载路径")
      return
    }
    try {
      const res = await fetch("/api/settings/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newVolume),
      })
      if (!res.ok) throw new Error("添加失败")
      await fetchVolumes()
      setNewVolume({ name: "", mountPath: "", description: "" })
      setDialogOpen(false)
      toast.success("存储卷已添加")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handleDeleteVolume = async (id: string) => {
    try {
      const res = await fetch(`/api/settings/storage/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("删除失败")
      await fetchVolumes()
      toast.success("存储卷已删除")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="aliyun">
        <TabsList>
          {PROVIDER_TABS.map((p) => (
            <TabsTrigger key={p.id} value={p.id}>
              {p.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="aliyun">
          <SettingGroup
            title="已开通地域"
            description="开通地域时会自动注册对应的 OSS 存储桶（my-dev-workspace-地域ID）"
            action={
              <Dialog
                open={addOpen}
                onOpenChange={(open) => {
                  setAddOpen(open)
                  if (open) loadAvailableRegions()
                }}
              >
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    添加地域
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>开通阿里云地域</DialogTitle>
                    <DialogDescription>
                      选择要开通的地域，系统会自动注册对应的 OSS 存储桶
                    </DialogDescription>
                  </DialogHeader>
                  {regionsLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <Spinner className="h-6 w-6" />
                    </div>
                  ) : regionsError ? (
                    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center">
                      <AlertCircle className="h-6 w-6 text-destructive" />
                      <p className="text-sm text-muted-foreground">
                        获取可用地域失败：{regionsError}
                      </p>
                      <Button variant="outline" onClick={loadAvailableRegions}>
                        重试
                      </Button>
                    </div>
                  ) : availableRegions.length === 0 ? (
                    <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                      所有可用地域均已完成开通
                    </div>
                  ) : (
                    <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                      {availableRegions.map((r) => {
                        const active = selectedRegion === r.id
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => setSelectedRegion(r.id)}
                            className={
                              "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors " +
                              (active
                                ? "border-primary bg-primary/5"
                                : "bg-card hover:bg-accent")
                            }
                          >
                            <span>{r.label}</span>
                            {active && (
                              <Check className="h-4 w-4 shrink-0 text-primary" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAddOpen(false)}>
                      取消
                    </Button>
                    <Button
                      onClick={handleActivate}
                      disabled={!selectedRegion || activating}
                    >
                      {activating && <Spinner className="mr-2 h-4 w-4" />}
                      开通
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            }
          >
            {regions.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground sm:px-6">
                尚未开通任何地域，点击右上角「添加地域」开始
              </div>
            ) : (
              regions.map((region) => (
                <SettingItemRow key={region}>
                  <div className="flex items-center justify-center h-10 w-10 shrink-0 rounded-lg bg-muted">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {regionLabels[region] ?? region}
                    </div>
                    <div className="mt-1 font-mono text-sm text-muted-foreground">
                      {region}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      OSS 存储桶: my-dev-workspace-{region}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={removingRegion === region}
                    onClick={() => handleRemoveRegion(region)}
                  >
                    {removingRegion === region ? (
                      <Spinner className="h-4 w-4" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </SettingItemRow>
              ))
            )}
          </SettingGroup>
        </TabsContent>

        <TabsContent value="tencent">
          <ProviderPlaceholder name="腾讯云" />
        </TabsContent>

        <TabsContent value="aws">
          <ProviderPlaceholder name="AWS" />
        </TabsContent>
      </Tabs>

      <SettingGroup
        title="持久化存储卷"
        description="配置跨工作区共享的持久化存储目录"
        action={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                添加存储卷
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>添加持久化存储卷</DialogTitle>
                <DialogDescription>
                  创建一个新的持久化存储卷
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">名称</Label>
                  <Input
                    id="name"
                    placeholder="例如：home-directory"
                    value={newVolume.name}
                    onChange={(e) =>
                      setNewVolume({ ...newVolume, name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mountPath">挂载路径</Label>
                  <Input
                    id="mountPath"
                    placeholder="例如：/home"
                    value={newVolume.mountPath}
                    onChange={(e) =>
                      setNewVolume({ ...newVolume, mountPath: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">描述（可选）</Label>
                  <Input
                    id="description"
                    placeholder="存储卷描述"
                    value={newVolume.description}
                    onChange={(e) =>
                      setNewVolume({ ...newVolume, description: e.target.value })
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  取消
                </Button>
                <Button onClick={handleAddVolume}>添加</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      >
        {volumeLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            加载中...
          </div>
        ) : volumes.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            暂无存储卷
          </div>
        ) : (
          volumes.map((volume) => (
            <SettingItemRow key={volume.id}>
              <div className="flex items-center justify-center h-10 w-10 shrink-0 rounded-lg bg-muted">
                <Folder className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{volume.name}</div>
                <div className="mt-1 font-mono text-sm text-muted-foreground">
                  {volume.mountPath}
                </div>
                {volume.description && (
                  <div className="mt-1 text-sm text-muted-foreground">
                    {volume.description}
                  </div>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDeleteVolume(volume.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </SettingItemRow>
          ))
        )}
      </SettingGroup>
    </div>
  )
}