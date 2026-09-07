"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
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

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/account/balance").then((r) => r.json()).catch(() => null),
    ]).then(([s, b]) => {
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

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
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
        <h2 className="font-medium">默认配置</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>默认地域</Label>
            <Select value={region} onChange={(e) => setRegion(e.target.value)}>
              {REGIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>默认规格</Label>
            <Select value={spec} onChange={(e) => setSpec(e.target.value)}>
              {INSTANCE_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id} ({t.note})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>磁盘类型</Label>
            <Select
              value={diskCategory}
              onChange={(e) => setDiskCategory(e.target.value)}
            >
              {DISK_CATEGORIES.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </Select>
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
            <Select
              value={spotStrategy}
              onChange={(e) => setSpotStrategy(e.target.value)}
            >
              {SPOT_STRATEGIES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>抢占保障 (小时)</Label>
            <Select
              value={spotDuration}
              onChange={(e) => setSpotDuration(Number(e.target.value))}
            >
              <option value={0}>0（无保障）</option>
              <option value={1}>1 小时</option>
            </Select>
          </div>
        </div>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-600">✅ 已保存</p>}

      <Button onClick={save} disabled={saving}>
        {saving ? <Spinner /> : "保存设置"}
      </Button>
    </Card>
  );
}
