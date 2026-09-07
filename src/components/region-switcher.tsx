"use client"

import * as React from "react"
import { ChevronsUpDown, Globe, Plus, Check } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { REGIONS } from "@/lib/constants"

export function RegionSwitcher() {
  const { isMobile } = useSidebar()
  const [enabledRegions, setEnabledRegions] = React.useState<string[]>(["cn-hangzhou"])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [tempEnabled, setTempEnabled] = React.useState<Set<string>>(new Set())
  const [activeRegion, setActiveRegion] = React.useState(REGIONS[0])

  // Load enabled regions
  React.useEffect(() => {
    fetch("/api/user/regions")
      .then((r) => r.json())
      .then((data) => {
        const regions = data.regions ?? ["cn-hangzhou"]
        setEnabledRegions(regions)
        setTempEnabled(new Set(regions))
        const active = REGIONS.find((r) => regions.includes(r.id))
        if (active) setActiveRegion(active)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/user/regions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regions: Array.from(tempEnabled) }),
      })
      if (res.ok) {
        const data = await res.json()
        setEnabledRegions(data.regions)
        setDialogOpen(false)
      }
    } finally {
      setSaving(false)
    }
  }

  const toggleRegion = (regionId: string) => {
    setTempEnabled((prev) => {
      const next = new Set(prev)
      if (next.has(regionId)) {
        next.delete(regionId)
      } else {
        next.add(regionId)
      }
      return next
    })
  }

  const enabledRegionList = REGIONS.filter((r) => enabledRegions.includes(r.id))

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Globe className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{activeRegion.label}</span>
                  <span className="truncate text-xs">地域选择</span>
                </div>
                <ChevronsUpDown className="ml-auto" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
              align="start"
              side={isMobile ? "bottom" : "right"}
              sideOffset={4}
            >
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                已开通地域
              </DropdownMenuLabel>
              {enabledRegionList.map((region) => (
                <DropdownMenuItem
                  key={region.id}
                  onClick={() => setActiveRegion(region)}
                  className="gap-2 p-2"
                >
                  <Globe className="size-3.5 shrink-0" />
                  {region.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                onClick={() => {
                  setTempEnabled(new Set(enabledRegions))
                  setDialogOpen(true)
                }}
                className="gap-2 p-2 text-muted-foreground"
              >
                <Plus className="size-3.5 shrink-0" />
                管理地域
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>管理地域</DialogTitle>
            <DialogDescription>
              开通新地域时会自动创建 OSS 存储桶（meterspace-地域ID）
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {REGIONS.map((region) => {
              const isEnabled = tempEnabled.has(region.id)
              return (
                <button
                  key={region.id}
                  onClick={() => toggleRegion(region.id)}
                  className={`w-full flex items-center justify-between rounded-md border p-3 text-sm transition-colors ${
                    isEnabled
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Globe className="size-4 text-muted-foreground" />
                    <span>{region.label}</span>
                  </div>
                  {isEnabled && <Check className="size-4 text-primary" />}
                </button>
              )
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Spinner className="mr-2 h-4 w-4" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
