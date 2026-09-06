"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Input,
  Label,
  Select,
  Spinner,
} from "@/components/ui";
import {
  REGIONS,
  INSTANCE_TYPES,
  DISK_CATEGORIES,
  SPOT_STRATEGIES,
} from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";

export function SetupForm() {
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
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function testConnection() {
    setTesting(true);
    setError("");
    setBalance(null);
    try {
      const res = await fetch("/api/account/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessKeyId, accessKeySecret }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "连接失败");
      setBalance(data.balance?.availableAmount ?? 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessKeyId,
          accessKeySecret,
          defaultRegion: region,
          defaultSpec: spec,
          defaultDiskCategory: diskCategory,
          defaultDiskSize: diskSize,
          defaultBandwidth: bandwidth,
          defaultReleaseHours: releaseHours,
          defaultIdleMinutes: idleMinutes,
          defaultSpotStrategy: spotStrategy,
          defaultSpotDuration: spotDuration,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "保存失败");
      }
      router.push("/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-6 p-6">
      <h1 className="text-xl font-semibold">首次设置</h1>

      <section className="space-y-4">
        <h2 className="font-medium">① 阿里云账号</h2>
        <div>
          <Label>AccessKey ID</Label>
          <Input
            value={accessKeyId}
            onChange={(e) => setAccessKeyId(e.target.value)}
            placeholder="LTAI5t..."
          />
        </div>
        <div>
          <Label>AccessKey Secret</Label>
          <Input
            type="password"
            value={accessKeySecret}
            onChange={(e) => setAccessKeySecret(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={testConnection} disabled={testing}>
            {testing ? <Spinner /> : "测试连接"}
          </Button>
          {balance !== null && (
            <span className="text-sm text-green-600">
              ✅ 连接成功！余额: {formatCurrency(balance)}
            </span>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-medium">② 全局默认设置</h2>
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
            <Label>默认实例规格</Label>
            <Select value={spec} onChange={(e) => setSpec(e.target.value)}>
              {INSTANCE_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id} ({t.note})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>默认磁盘类型</Label>
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
            <Label>默认磁盘大小 (GB)</Label>
            <Input
              type="number"
              value={diskSize}
              onChange={(e) => setDiskSize(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>默认公网带宽 (Mbps)</Label>
            <Input
              type="number"
              value={bandwidth}
              onChange={(e) => setBandwidth(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>自动释放时长 (小时)</Label>
            <Input
              type="number"
              value={releaseHours}
              onChange={(e) => setReleaseHours(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>无操作休眠阈值 (分钟)</Label>
            <Input
              type="number"
              value={idleMinutes}
              onChange={(e) => setIdleMinutes(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>默认抢占策略</Label>
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
            <Label>抢占保障时长 (小时)</Label>
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

      <Button className="w-full" onClick={save} disabled={saving}>
        {saving ? <Spinner /> : "保存并进入仪表盘 →"}
      </Button>
    </Card>
  );
}
