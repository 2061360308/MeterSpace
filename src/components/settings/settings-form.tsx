"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Globe, Check } from "lucide-react";
import {
  REGIONS,
  INSTANCE_TYPES,
  DISK_CATEGORIES,
  SPOT_STRATEGIES,
} from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";

export function SettingsForm() {
  const router = useRouter();
  const [accessKeyId, setAccessKeyId] = useState("");
  const [accessKeySecret, setAccessKeySecret] = useState("");
  const [region, setRegion] = useState("cn-hangzhou");
  const [spec, setSpec] = useState("ecs.g6.xlarge");
  const [diskCategory, setDiskCategory] = useState("cloud_essd");
  const [diskSize, setDiskSize] = useState(40);
  const [bandwidth, setBandwidth] = useState(10);
  const [releaseHours, setReleaseHours] = useState(4);
  const [idleMinutes, setIdleMinutes] = useState(30);
  const [spotStrategy, setSpotStrategy] = useState("NoSpot");
  const [spotDuration, setSpotDuration] = useState(1);

  const [balance, setBalance] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // Region management state
  const [enabledRegions, setEnabledRegions] = useState<string[]>(["cn-hangzhou"]);
  const [regionDialogOpen, setRegionDialogOpen] = useState(false);
  const [tempEnabled, setTempEnabled] = useState<Set<string>>(new Set());
  const [savingRegions, setSavingRegions] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/account/balance").then((r) => r.json()).catch(() => null),
      fetch("/api/user/regions").then((r) => r.json()).catch(() => null),
    ]).then(([s, b, r]) => {
      if (s.settings) {
        setAccessKeyId(s.settings.accessKeyId ?? "");
        setRegion(s.settings.defaultRegion ?? "cn-hangzhou");
        setSpec(s.settings.defaultSpec ?? "ecs.g6.xlarge");
        setDiskCategory(s.settings.defaultDiskCategory ?? "cloud_essd");
        setDiskSize(s.settings.defaultDiskSize ?? 40);
        setBandwidth(s.settings.defaultBandwidth ?? 10);
        setReleaseHours(s.settings.defaultReleaseHours ?? 4);
        setIdleMinutes(s.settings.defaultIdleMinutes ?? 30);
        setSpotStrategy(s.settings.defaultSpotStrategy ?? "NoSpot");
        setSpotDuration(s.settings.defaultSpotDuration ?? 1);
      }
      if (b?.availableAmount != null) setBalance(b.availableAmount);
      if (r?.regions) {
        setEnabledRegions(r.regions);
        setTempEnabled(new Set(r.regions));
      }
      setLoaded(true);
    });
  }, []);

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const body: Record<string, unknown> = {
        defaultRegion: region,
        defaultSpec: spec,
        defaultDiskCategory: diskCategory,
        defaultDiskSize: diskSize,
        defaultBandwidth: bandwidth,
        defaultReleaseHours: releaseHours,
        defaultIdleMinutes: idleMinutes,
        defaultSpotStrategy: spotStrategy,
        defaultSpotDuration: spotDuration,
      };
      if (accessKeyId) body.accessKeyId = accessKeyId;
      if (accessKeySecret) body.accessKeySecret = accessKeySecret;

      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "保存失败");
      }
      setSaved(true);
      setAccessKeySecret("");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const toggleRegion = (regionId: string) => {
    setTempEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(regionId)) {
        next.delete(regionId);
      } else {
        next.add(regionId);
      }
      return next;
    });
  };

  const handleSaveRegions = async () => {
    setSavingRegions(true);
    try {
      const res = await fetch("/api/user/regions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regions: Array.from(tempEnabled) }),
      });
      if (res.ok) {
        const data = await res.json();
        setEnabledRegions(data.regions);
        setRegionDialogOpen(false);
      }
    } finally {
      setSavingRegions(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <>
    <Card className="space-y-6 p-6">
      <h1 className="text-xl font-semibold">全局设置</h1>

      <section className="space-y-4">
        <h2 className="font-medium">阿里云账号</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>AccessKey ID</Label>
            <Input
              value={accessKeyId}
              onChange={(e) => setAccessKeyId(e.target.value)}
            />
          </div>
          <div>
            <Label>AccessKey Secret（留空保持不变）</Label>
            <Input
              type="password"
              value={accessKeySecret}
              onChange={(e) => setAccessKeySecret(e.target.value)}
              placeholder="不修改请留空"
            />
          </div>
        </div>
        <p className="text-sm text-gray-600">
          当前余额: {formatCurrency(balance)}
        </p>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">地域管理</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setTempEnabled(new Set(enabledRegions));
              setRegionDialogOpen(true);
            }}
          >
            管理地域
          </Button>
        </div>
        <p className="text-sm text-gray-600">
          已开通 {enabledRegions.length} 个地域：{enabledRegions.map((r) => REGIONS.find((region) => region.id === r)?.label ?? r).join("、")}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-medium">默认配置</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>默认地域</Label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {REGIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>默认规格</Label>
            <select
              value={spec}
              onChange={(e) => setSpec(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {INSTANCE_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id} ({t.note})
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>磁盘类型</Label>
            <select
              value={diskCategory}
              onChange={(e) => setDiskCategory(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {DISK_CATEGORIES.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>磁盘大小 (GB)</Label>
            <Input
              type="number"
              value={diskSize}
              onChange={(e) => setDiskSize(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>带宽 (Mbps)</Label>
            <Input
              type="number"
              value={bandwidth}
              onChange={(e) => setBandwidth(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>自动释放 (小时)</Label>
            <Input
              type="number"
              value={releaseHours}
              onChange={(e) => setReleaseHours(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>空闲阈值 (分钟)</Label>
            <Input
              type="number"
              value={idleMinutes}
              onChange={(e) => setIdleMinutes(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>抢占策略</Label>
            <select
              value={spotStrategy}
              onChange={(e) => setSpotStrategy(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {SPOT_STRATEGIES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>抢占保障 (小时)</Label>
            <select
              value={spotDuration}
              onChange={(e) => setSpotDuration(Number(e.target.value))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value={0}>0（无保障）</option>
              <option value={1}>1 小时</option>
            </select>
          </div>
        </div>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-600">✅ 已保存</p>}

      <Button onClick={save} disabled={saving}>
        {saving ? <Spinner /> : "保存设置"}
      </Button>
    </Card>

    <Dialog open={regionDialogOpen} onOpenChange={setRegionDialogOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>管理地域</DialogTitle>
          <DialogDescription>
            开通新地域时会自动创建 OSS 存储桶（meterspace-地域ID）
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          {REGIONS.map((region) => {
            const isEnabled = tempEnabled.has(region.id);
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
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setRegionDialogOpen(false)}>取消</Button>
          <Button onClick={handleSaveRegions} disabled={savingRegions}>
            {savingRegions ? <Spinner className="mr-2 h-4 w-4" /> : null}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
