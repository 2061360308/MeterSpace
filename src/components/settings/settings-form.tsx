"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingGroup, SettingItem } from "@/components/settings/setting-item";

export function SettingsForm() {
  const router = useRouter();
  const [diskSize, setDiskSize] = useState(40);
  const [bandwidth, setBandwidth] = useState(10);
  const [autoRenewalMinutes, setAutoRenewalMinutes] = useState(35);
  const [idleMinutes, setIdleMinutes] = useState(30);
  const [spotDuration, setSpotDuration] = useState(1);
  const [logRetentionDays, setLogRetentionDays] = useState(7);
  const [githubMirror, setGithubMirror] = useState("");
  const [dockerMirror, setDockerMirror] = useState("");

  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => {
        if (s.settings) {
          setDiskSize(s.settings.defaultDiskSize ?? 40);
          setBandwidth(s.settings.defaultBandwidth ?? 10);
          setAutoRenewalMinutes(s.settings.defaultAutoRenewalMinutes ?? 35);
          setIdleMinutes(s.settings.defaultIdleMinutes ?? 30);
          setSpotDuration(s.settings.defaultSpotDuration ?? 1);
          setLogRetentionDays(s.settings.logRetentionDays ?? 7);
          setGithubMirror(s.settings.githubMirror ?? "");
          setDockerMirror(s.settings.dockerMirror ?? "");
        }
        setLoaded(true);
      });
  }, []);

  async function save() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        defaultDiskSize: diskSize,
        defaultBandwidth: bandwidth,
        defaultAutoRenewalMinutes: autoRenewalMinutes,
        defaultIdleMinutes: idleMinutes,
        defaultSpotDuration: spotDuration,
        logRetentionDays,
        githubMirror: githubMirror || null,
        dockerMirror: dockerMirror || null,
      };

      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "保存失败");
      }
      toast.success("设置已保存");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <div className="space-y-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-4">
            <Skeleton className="h-4 w-28" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-[62px] w-full rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingGroup
        title="工作区默认值"
        description="新建工作区时默认使用的存储与网络配置。地域与规格在新建工作区时按需选择"
      >
        <SettingItem label="磁盘大小 (GB)" description="系统盘容量，最小 20 GB">
          <Input
            type="number"
            min={20}
            value={diskSize}
            onChange={(e) => setDiskSize(Number(e.target.value))}
          />
        </SettingItem>
        <SettingItem label="带宽 (Mbps)" description="公网带宽峰值">
          <Input
            type="number"
            min={1}
            value={bandwidth}
            onChange={(e) => setBandwidth(Number(e.target.value))}
          />
        </SettingItem>
      </SettingGroup>

      <SettingGroup
        title="生命周期与抢占"
        description="控制工作区的自动释放、空闲回收，以及抢占式实例的保障时长"
      >
        <SettingItem
          label="自动续期 (分钟)"
          description="创建后按该周期自动续期租约；云侧到点未续期即自动释放，范围 35-7200"
        >
          <Input
            type="number"
            min={35}
            max={7200}
            step={5}
            value={autoRenewalMinutes}
            onChange={(e) => setAutoRenewalMinutes(Number(e.target.value))}
          />
        </SettingItem>
        <SettingItem label="空闲阈值 (分钟)" description="超过该时长的空闲时间触发回收">
          <Input
            type="number"
            min={1}
            value={idleMinutes}
            onChange={(e) => setIdleMinutes(Number(e.target.value))}
          />
        </SettingItem>
        <SettingItem
          label="抢占保障 (小时)"
          description="启动实例时勾选「抢占」后，向云厂商申请的保障时长。0 = 无保障（随时可释放、最便宜），1 = 保障 1 小时"
        >
          <Select
            value={String(spotDuration)}
            onValueChange={(v) => setSpotDuration(Number(v))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="选择保障时长" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">0（无保障）</SelectItem>
              <SelectItem value="1">1 小时</SelectItem>
            </SelectContent>
          </Select>
        </SettingItem>
      </SettingGroup>

      <SettingGroup
        title="网络与日志"
        description="镜像加速源与日志保留策略等进阶配置"
      >
        <SettingItem
          label="GitHub 镜像"
          description="用于加速拉取 GitHub 资源，留空使用默认"
        >
          <Input
            value={githubMirror}
            onChange={(e) => setGithubMirror(e.target.value)}
            placeholder="例如 https://ghproxy.com/"
          />
        </SettingItem>
        <SettingItem
          label="Docker 镜像"
          description="用于容器镜像加速，留空使用默认"
        >
          <Input
            value={dockerMirror}
            onChange={(e) => setDockerMirror(e.target.value)}
            placeholder="例如 https://docker.m.daocloud.io"
          />
        </SettingItem>
        <SettingItem label="日志保留 (天)" description="实例日志保留天数，1-365 天">
          <Input
            type="number"
            min={1}
            max={365}
            value={logRetentionDays}
            onChange={(e) => setLogRetentionDays(Number(e.target.value))}
          />
        </SettingItem>
        <div className="flex justify-end rounded-lg bg-card p-4 shadow-border">
          <Button onClick={save} disabled={saving}>
            {saving && <Spinner data-icon="inline-start" />}
            保存设置
          </Button>
        </div>
      </SettingGroup>
    </div>
  );
}