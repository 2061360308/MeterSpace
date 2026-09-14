"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { APIError } from "@/components/ui/error";
import { formatCurrency } from "@/lib/utils";
import { Check } from "lucide-react";

export function SetupForm() {
  const router = useRouter();
  const [accessKeyId, setAccessKeyId] = useState("");
  const [accessKeySecret, setAccessKeySecret] = useState("");
  const [diskSize, setDiskSize] = useState(40);
  const [bandwidth, setBandwidth] = useState(10);
  const [autoRenewalMinutes, setAutoRenewalMinutes] = useState(35);
  const [idleMinutes, setIdleMinutes] = useState(30);

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
          defaultDiskSize: diskSize,
          defaultBandwidth: bandwidth,
          defaultAutoRenewalMinutes: autoRenewalMinutes,
          defaultIdleMinutes: idleMinutes,
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
    <Card className="gap-8 px-6 py-6">
      <div className="space-y-1.5">
        <h1 className="text-[20px] font-semibold leading-7 tracking-[-0.01em]">
          首次设置
        </h1>
        <p className="text-[13px] leading-6 text-muted-foreground">
          绑定云账号并设定默认值，之后随时可以在「设置」里改。
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-[15px] font-semibold leading-6 tracking-[-0.01em]">
          ① 阿里云账号
        </h2>
        <div className="space-y-2">
          <Label htmlFor="setup-ak">AccessKey ID</Label>
          <Input
            id="setup-ak"
            value={accessKeyId}
            onChange={(e) => setAccessKeyId(e.target.value)}
            placeholder="LTAI5t..."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="setup-sk">AccessKey Secret</Label>
          <Input
            id="setup-sk"
            type="password"
            value={accessKeySecret}
            onChange={(e) => setAccessKeySecret(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={testConnection} disabled={testing}>
            {testing && <Spinner data-icon="inline-start" />}
            测试连接
          </Button>
          {balance !== null && (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium leading-6 text-[#0d7a43] dark:text-[#4cc38a]">
              <Check className="size-4" />
              连接成功，余额 {formatCurrency(balance)}
            </span>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-[15px] font-semibold leading-6 tracking-[-0.01em]">
          ② 全局默认设置
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="setup-disk">默认磁盘大小 (GB)</Label>
            <Input
              id="setup-disk"
              type="number"
              value={diskSize}
              onChange={(e) => setDiskSize(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-bw">默认公网带宽 (Mbps)</Label>
            <Input
              id="setup-bw"
              type="number"
              value={bandwidth}
              onChange={(e) => setBandwidth(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-release">自动续期 (分钟)</Label>
            <Input
              id="setup-release"
              type="number"
              min={35}
              max={7200}
              step={5}
              value={autoRenewalMinutes}
              onChange={(e) => setAutoRenewalMinutes(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-idle">无操作休眠阈值 (分钟)</Label>
            <Input
              id="setup-idle"
              type="number"
              value={idleMinutes}
              onChange={(e) => setIdleMinutes(Number(e.target.value))}
            />
          </div>
        </div>
      </section>

      {error && <APIError message={error} />}

      <Button className="w-full" onClick={save} disabled={saving}>
        {saving && <Spinner data-icon="inline-start" />}
        {saving ? "保存中…" : "保存并进入仪表盘"}
      </Button>
    </Card>
  );
}
