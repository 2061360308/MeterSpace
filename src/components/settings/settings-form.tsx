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
import { SettingGroup, SettingItem } from "@/components/settings/setting-item";
import {
  REGIONS,
  INSTANCE_TYPES,
  DISK_CATEGORIES,
  SPOT_STRATEGIES,
} from "@/lib/constants";

export function SettingsForm() {
  const router = useRouter();
  const [region, setRegion] = useState("cn-hangzhou");
  const [spec, setSpec] = useState("ecs.g6.xlarge");
  const [diskCategory, setDiskCategory] = useState("cloud_essd");
  const [diskSize, setDiskSize] = useState(40);
  const [bandwidth, setBandwidth] = useState(10);
  const [releaseHours, setReleaseHours] = useState(4);
  const [idleMinutes, setIdleMinutes] = useState(30);
  const [spotStrategy, setSpotStrategy] = useState("NoSpot");
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
          setRegion(s.settings.defaultRegion ?? "cn-hangzhou");
          setSpec(s.settings.defaultSpec ?? "ecs.g6.xlarge");
          setDiskCategory(s.settings.defaultDiskCategory ?? "cloud_essd");
          setDiskSize(s.settings.defaultDiskSize ?? 40);
          setBandwidth(s.settings.defaultBandwidth ?? 10);
          setReleaseHours(s.settings.defaultReleaseHours ?? 4);
          setIdleMinutes(s.settings.defaultIdleMinutes ?? 30);
          setSpotStrategy(s.settings.defaultSpotStrategy ?? "NoSpot");
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
        defaultRegion: region,
        defaultSpec: spec,
        defaultDiskCategory: diskCategory,
        defaultDiskSize: diskSize,
        defaultBandwidth: bandwidth,
        defaultReleaseHours: releaseHours,
        defaultIdleMinutes: idleMinutes,
        defaultSpotStrategy: spotStrategy,
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
      <div className="flex items-center justify-center py-20">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingGroup
        title="工作区默认值"
        description="新建工作区时默认使用的地域、规格与存储配置"
      >
        <SettingItem label="默认地域">
          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="选择地域" />
            </SelectTrigger>
            <SelectContent>
              {REGIONS.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingItem>
        <SettingItem label="默认规格">
          <Select value={spec} onValueChange={setSpec}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="选择规格" />
            </SelectTrigger>
            <SelectContent>
              {INSTANCE_TYPES.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.id} ({t.note})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingItem>
        <SettingItem label="磁盘类型">
          <Select value={diskCategory} onValueChange={setDiskCategory}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="选择磁盘类型" />
            </SelectTrigger>
            <SelectContent>
              {DISK_CATEGORIES.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingItem>
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
        description="控制工作区的自动释放、空闲回收与抢占式实例策略"
      >
        <SettingItem
          label="自动释放 (小时)"
          description="创建后无操作达到该时长自动释放"
        >
          <Input
            type="number"
            min={1}
            value={releaseHours}
            onChange={(e) => setReleaseHours(Number(e.target.value))}
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
        <SettingItem label="抢占策略">
          <Select value={spotStrategy} onValueChange={setSpotStrategy}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="选择抢占策略" />
            </SelectTrigger>
            <SelectContent>
              {SPOT_STRATEGIES.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingItem>
        <SettingItem label="抢占保障 (小时)">
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
        <div className="flex justify-end rounded-lg border bg-card p-4">
          <Button onClick={save} disabled={saving}>
            {saving && <Spinner className="mr-2 size-4" />}
            保存设置
          </Button>
        </div>
      </SettingGroup>
    </div>
  );
}