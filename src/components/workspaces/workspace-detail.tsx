"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Play } from "lucide-react";
import { STATUS_META } from "@/lib/utils";

interface Instance {
  id: string;
  diskSize: number;
  bandwidth: number;
  status: string;
  publicIp: string | null;
  port: number | null;
  bootError: string | null;
  stoppedAt: string | null;
  stopReason: string | null;
  createdAt: string;
  cloudInstanceId: string | null;
  cloudInstanceName: string | null;
  cloudInstanceType: string | null;
  ecsInstanceId: string | null;
}

interface Detail {
  id: string;
  name: string;
  provider: string;
  region: string;
  defaultDiskSize: number | null;
  defaultBandwidth: number | null;
  imageUri: string;
  features: { id: string; name: string; version: string }[];
  gitRepoUrl: string | null;
  gitBranch: string | null;
  createdAt: string;
}

interface CloudInstance {
  id: string;
  name: string;
  provider: string;
  region: string;
  instanceType: string;
}

interface PriceDetail {
  resource: string;
  originalPrice: number;
  tradePrice: number;
}

interface InstanceType {
  instanceTypeId: string;
  cpuCoreCount: number;
  memorySize: number;
  instanceTypeFamily: string;
  cpuArchitecture: string;
  gpuAmount: number;
  gpuSpec: string | null;
}

export function WorkspaceDetail({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") ?? "basic");

  // 弹性规格相关状态
  const [cloudInstances, setCloudInstances] = useState<CloudInstance[]>([]);
  const [instanceTypes, setInstanceTypes] = useState<InstanceType[]>([]);
  const [selectedCloudInstanceId, setSelectedCloudInstanceId] = useState<string>("");
  const [loadingInstances, setLoadingInstances] = useState(false);
  const [priceDetails, setPriceDetails] = useState<PriceDetail[]>([]);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [useSpot, setUseSpot] = useState(false);

  // 设置相关状态
  const [defaultDiskSize, setDefaultDiskSize] = useState<number>(40);
  const [defaultBandwidth, setDefaultBandwidth] = useState<number>(10);
  const [saving, setSaving] = useState(false);

  // 阿里云状态轮询
  const [cloudStatus, setCloudStatus] = useState<string | null>(null);

  async function openWorkbench(instanceId: string) {
    try {
      const res = await fetch(`/api/instances/${instanceId}/access-link`);
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          router.push(data.url);
        }
      }
    } catch {
      // 忽略，保持原页面
    }
  }

  const load = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${id}`);
    if (res.status === 404) {
      router.replace("/");
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setDetail(data.workspace);
      setDefaultDiskSize(data.workspace.defaultDiskSize ?? 40);
      setDefaultBandwidth(data.workspace.defaultBandwidth ?? 10);
    }

    const instancesRes = await fetch(`/api/workspaces/${id}/instances`);
    if (instancesRes.ok) {
      const instancesData = await instancesRes.json();
      setInstances(instancesData.instances ?? []);
    }
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const hasActiveInstance = instances.some(
      (i) => i.status === "PROVISIONING" || i.status === "BOOTING" || i.status === "RUNNING",
    );
    if (!hasActiveInstance) return;

    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [instances, load]);

  // 轮询阿里云状态（仅用于 BOOTING/PROVISIONING 状态的实例）
  useEffect(() => {
    const bootingInstance = instances.find(
      (i) => (i.status === "PROVISIONING" || i.status === "BOOTING") && i.ecsInstanceId,
    );
    if (!bootingInstance) {
      setCloudStatus(null);
      return;
    }

    let cancelled = false;

    const pollCloudStatus = async () => {
      try {
        const res = await fetch(
          `/api/workspaces/${id}/instances/${bootingInstance.id}/cloud-status`,
        );
        if (res.ok && !cancelled) {
          const data = await res.json();
          setCloudStatus(data.cloudStatus);
        }
      } catch {
        // ignore
      }
    };

    pollCloudStatus();
    const t = setInterval(pollCloudStatus, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [instances, id]);

  // 同步 URL tab 参数
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  // 加载弹性规格列表
  useEffect(() => {
    if (!detail?.provider || !detail?.region) return;
    
    setLoadingInstances(true);
    fetch(`/api/cloud-instances?provider=${detail.provider}&region=${detail.region}`)
      .then((r) => r.json())
      .then((data) => {
        const list = data.instances ?? [];
        setCloudInstances(list);
        if (list.length > 0 && !selectedCloudInstanceId) {
          setSelectedCloudInstanceId(list[0].id);
        }
      })
      .catch(() => {
        setCloudInstances([]);
      })
      .finally(() => {
        setLoadingInstances(false);
      });
  }, [detail?.provider, detail?.region]);

  // 加载实例类型详情（用于显示 CPU/内存）
  useEffect(() => {
    if (!detail?.region || cloudInstances.length === 0) return;
    
    fetch(`/api/ecs/types?region=${detail.region}`)
      .then((r) => r.json())
      .then((data) => {
        setInstanceTypes(data.types ?? []);
      })
      .catch(() => {
        setInstanceTypes([]);
      });
  }, [detail?.region, cloudInstances]);

  // 选中规格变化时获取价格
  useEffect(() => {
    if (!selectedCloudInstanceId || !detail?.region) {
      setPriceDetails([]);
      return;
    }

    const selected = cloudInstances.find((i) => i.id === selectedCloudInstanceId);
    if (!selected) return;

    const params = new URLSearchParams({
      region: detail.region,
      instanceType: selected.instanceType,
      diskSize: String(defaultDiskSize),
      bandwidth: String(defaultBandwidth),
    });
    if (useSpot) {
      params.set("spotStrategy", "SpotAsPriceGo");
      params.set("spotDuration", "0");
    }

    setLoadingPrice(true);
    fetch(`/api/ecs/price?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setPriceDetails(data.details ?? []);
      })
      .catch(() => {
        setPriceDetails([]);
      })
      .finally(() => {
        setLoadingPrice(false);
      });
  }, [selectedCloudInstanceId, detail?.region, defaultDiskSize, defaultBandwidth, cloudInstances, useSpot]);

  const totalHourlyPrice = priceDetails.reduce((sum, d) => sum + (d.tradePrice ?? 0), 0);

  const instancePriceDetail = priceDetails.find(
    (d) =>
      (d.resource ?? "").toLowerCase() === "instancetype" ||
      (d.resource ?? "").toLowerCase() === "instance",
  );

  const spotHourlySavings =
    useSpot && instancePriceDetail
      ? Math.max(
          0,
          (instancePriceDetail.originalPrice ?? 0) -
            (instancePriceDetail.tradePrice ?? 0),
        )
      : 0;

  function getInstanceTypeInfo(instanceType: string) {
    return instanceTypes.find((t) => t.instanceTypeId === instanceType);
  }

  async function handleStart() {
    setBusy(true);
    setError("");
    
    if (!selectedCloudInstanceId) {
      setError("请先选择一个弹性规格");
      setBusy(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const res = await fetch(`/api/workspaces/${id}/instances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cloudInstanceId: selectedCloudInstanceId,
          diskSize: defaultDiskSize,
          bandwidth: defaultBandwidth,
          spotStrategy: useSpot ? "SpotAsPriceGo" : "NoSpot",
          spotDuration: useSpot ? 0 : 1,
          spotPriceLimit: null,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "启动失败");
      } else {
        setError("");
        const data = (await res.json().catch(() => null)) as {
          instanceId?: string;
          personalCode?: string;
        } | null;
        if (data?.instanceId && data.personalCode) {
          router.push(`/access/${data.instanceId}?code=${data.personalCode}`);
          return;
        }
      }
    } catch (e) {
      clearTimeout(timeoutId);
      const err = e as { name?: string; message?: string };
      if (err.name === "AbortError") {
        setError("请求超时，请检查网络或阿里云配置");
      } else {
        setError(err.message ?? "启动失败");
      }
    }
    
    await load();
    setBusy(false);
  }

  async function handleDelete() {
    if (!confirm("确定删除该工作区？所有实例数据将被清除，不可恢复。")) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/workspaces/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/");
    } else {
      setError("删除失败");
    }
    setBusy(false);
  }

  async function handleSaveSettings() {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/workspaces/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        defaultDiskSize,
        defaultBandwidth,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "保存失败");
    } else {
      await load();
    }
    setSaving(false);
  }

  if (!detail) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const currentInstance = instances.find(
    (i) => i.status === "RUNNING" || i.status === "BOOTING" || i.status === "PROVISIONING",
  );

  const isRunning = currentInstance?.status === "RUNNING";
  return (
    <div className="flex flex-col h-full">
      {/* 固定头部 */}
      <div className="shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold">{detail.name}</h1>
            <p className="text-sm text-muted-foreground">
              {detail.region} · {currentInstance?.cloudInstanceName ?? "未启动"} ·{" "}
              {currentInstance?.cloudInstanceType ?? ""} · {detail.imageUri.split("/").pop()}
            </p>
          </div>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="basic">基本信息</TabsTrigger>
              <TabsTrigger value="specs">弹性规格</TabsTrigger>
              <TabsTrigger value="history">启动记录</TabsTrigger>
              <TabsTrigger value="settings">设置</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            <button className="ml-2 underline" onClick={() => setError("")}>
              关闭
            </button>
          </div>
        )}

        {currentInstance && (
          <div className="mb-4 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="font-medium">当前实例: </span>
                {currentInstance.cloudInstanceName ?? "未知"} ({currentInstance.diskSize}GB · {currentInstance.bandwidth}Mbps)
                {currentInstance.publicIp && (
                  <span className="ml-2 text-muted-foreground">
                    {currentInstance.publicIp}:{currentInstance.port ?? 8080}
                  </span>
                )}
                {(currentInstance.status === "BOOTING" || currentInstance.status === "PROVISIONING") && cloudStatus && (
                  <span className="ml-2 text-muted-foreground">
                    · 阿里云状态: {cloudStatus === "Released" ? "已释放" : cloudStatus}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={STATUS_META[currentInstance.status]?.tone ?? "gray"}>
                  {STATUS_META[currentInstance.status]?.label ?? currentInstance.status}
                </Badge>
                {isRunning ? (
                  <Button size="sm" onClick={() => openWorkbench(currentInstance.id)}>
                    进入工作台
                  </Button>
                ) : (
                  <Link href={`/instances/${currentInstance.id}`}>
                    <Button size="sm" variant="ghost">详情</Button>
                  </Link>
                )}
              </div>
            </div>
            {currentInstance.bootError && (
              <p className="mt-2 text-sm text-red-600">错误: {currentInstance.bootError}</p>
            )}
          </div>
        )}
      </div>
      <Separator />

      {/* 可滚动内容区 */}
      <div className="flex-1 overflow-y-auto mt-4">
        {activeTab === "basic" && (
          <div className="p-6">
            <h2 className="mb-4 font-medium">工作区配置</h2>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">区域</dt>
              <dd>{detail.region}</dd>
              <dt className="text-muted-foreground">镜像</dt>
              <dd className="font-mono text-xs">{detail.imageUri}</dd>
              <dt className="text-muted-foreground">默认磁盘</dt>
              <dd>{detail.defaultDiskSize ?? 40}GB</dd>
              <dt className="text-muted-foreground">默认带宽</dt>
              <dd>{detail.defaultBandwidth ?? 10}Mbps</dd>
              {detail.gitRepoUrl && (
                <>
                  <dt className="text-muted-foreground">代码仓库</dt>
                  <dd className="font-mono text-xs">{detail.gitRepoUrl}</dd>
                  <dt className="text-muted-foreground">分支</dt>
                  <dd>{detail.gitBranch ?? "main"}</dd>
                </>
              )}
              {detail.features && detail.features.length > 0 && (
                <>
                  <dt className="text-muted-foreground">开发环境</dt>
                  <dd>{detail.features.map((f) => f.name).join(", ")}</dd>
                </>
              )}
            </dl>
          </div>
        )}

        {activeTab === "specs" &&
          (currentInstance ? (
            <Empty className="mx-6 my-4 min-h-[300px]">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Play />
                </EmptyMedia>
                <EmptyTitle>
                  {isRunning ? "工作区运行中" : "实例正在启动"}
                </EmptyTitle>
                <EmptyDescription>
                  当前工作区
                  {isRunning ? "已有实例在运行" : "上一个实例仍在启动"}，同一时间仅支持一个实例，无法重复创建。
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                {isRunning ? (
                  <Button onClick={() => openWorkbench(currentInstance.id)}>
                    进入工作台
                  </Button>
                ) : (
                  <Link href={`/instances/${currentInstance.id}`}>
                    <Button>查看运行实例</Button>
                  </Link>
                )}
              </EmptyContent>
            </Empty>
          ) : (
          <div className="space-y-4 pb-20">
            <div className="p-6">
              <h2 className="mb-4 font-medium">选择弹性规格</h2>
              <p className="text-sm text-muted-foreground mb-4">
                已自动筛选 {detail.provider} · {detail.region} 的可用规格
              </p>

              {loadingInstances ? (
                <div className="flex items-center gap-2 py-4">
                  <Spinner className="h-4 w-4" />
                  <span className="text-sm text-muted-foreground">加载弹性规格...</span>
                </div>
              ) : cloudInstances.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    该地域暂无弹性规格，请先在{" "}
                    <a href="/cloud-instances" className="text-primary underline">
                      弹性规格管理
                    </a>{" "}
                    中创建
                  </p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]"></TableHead>
                        <TableHead>名称</TableHead>
                        <TableHead>规格</TableHead>
                        <TableHead>CPU</TableHead>
                        <TableHead>内存</TableHead>
                        <TableHead>架构</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cloudInstances.map((instance) => {
                        const typeInfo = getInstanceTypeInfo(instance.instanceType);
                        return (
                          <TableRow
                            key={instance.id}
                            className={`cursor-pointer ${
                              selectedCloudInstanceId === instance.id ? "bg-muted" : ""
                            }`}
                            onClick={() => setSelectedCloudInstanceId(instance.id)}
                          >
                            <TableCell>
                              <input
                                type="radio"
                                name="cloudInstance"
                                checked={selectedCloudInstanceId === instance.id}
                                onChange={() => setSelectedCloudInstanceId(instance.id)}
                                className="h-4 w-4"
                              />
                            </TableCell>
                            <TableCell className="font-medium">{instance.name}</TableCell>
                            <TableCell className="font-mono text-xs">{instance.instanceType}</TableCell>
                            <TableCell>{typeInfo?.cpuCoreCount ?? "-"} 核</TableCell>
                            <TableCell>{typeInfo?.memorySize ?? "-"} GB</TableCell>
                            <TableCell>{typeInfo?.cpuArchitecture ?? "-"}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* 浮动价格面板 */}
            <div className="sticky bottom-0 left-0 right-0 border-t bg-background shadow-lg z-10 -mx-6 px-6 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="use-spot"
                      checked={useSpot}
                      onCheckedChange={setUseSpot}
                    />
                    <Label
                      htmlFor="use-spot"
                      className="text-sm cursor-pointer select-none"
                    >
                      抢占式使用
                    </Label>
                  </div>
                  <div className="border-l pl-6">
                    <div className="text-xs text-muted-foreground">磁盘 / 带宽</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        type="number"
                        min={20}
                        max={500}
                        value={defaultDiskSize}
                        onChange={(e) => setDefaultDiskSize(parseInt(e.target.value) || 40)}
                        className="w-20 h-8 text-xs"
                      />
                      <span className="text-xs text-muted-foreground">GB</span>
                      <span className="text-muted-foreground">/</span>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={defaultBandwidth}
                        onChange={(e) => setDefaultBandwidth(parseInt(e.target.value) || 10)}
                        className="w-16 h-8 text-xs"
                      />
                      <span className="text-xs text-muted-foreground">Mbps</span>
                    </div>
                  </div>
                  <div className="border-l pl-6">
                    <div className="text-xs text-muted-foreground">
                      {useSpot ? "抢占价" : "预估费用"}
                    </div>
                    {loadingPrice ? (
                      <Spinner className="h-4 w-4 mt-1" />
                    ) : (
                      <div>
                        <div className="text-lg font-bold text-primary">
                          {totalHourlyPrice > 0 ? `¥${totalHourlyPrice.toFixed(4)}/小时` : "—"}
                        </div>
                        {useSpot && spotHourlySavings > 0 && (
                          <div className="text-xs text-emerald-600">
                            每小时省 ¥{spotHourlySavings.toFixed(4)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  onClick={handleStart}
                  disabled={busy || !selectedCloudInstanceId || isRunning}
                >
                  {busy ? <Spinner className="mr-2 h-4 w-4" /> : null}
                  {isRunning ? "运行中" : "启动"}
                </Button>
              </div>
            </div>
          </div>
        ))}

        {activeTab === "history" && (
          <div className="p-6">
            <h2 className="mb-4 font-medium">启动记录</h2>
            {instances.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无启动记录</p>
            ) : (
              <div className="space-y-3">
                {instances.map((instance) => (
                  <div
                    key={instance.id}
                    className="flex items-center justify-between rounded border p-3"
                  >
                    <div className="text-sm">
                      <div className="flex items-center gap-2">
                        <Badge tone={STATUS_META[instance.status]?.tone ?? "gray"}>
                          {STATUS_META[instance.status]?.label ?? instance.status}
                        </Badge>
                        <span className="text-muted-foreground">
                          {new Date(instance.createdAt).toLocaleString()}
                        </span>
                        {instance.stoppedAt && (
                          <span className="text-muted-foreground">
                            → {new Date(instance.stoppedAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {instance.cloudInstanceName ?? "未知规格"} · {instance.diskSize}GB · {instance.bandwidth}Mbps
                        {instance.stopReason && <> · {instance.stopReason}</>}
                      </div>
                    </div>
                    <Link href={`/instances/${instance.id}`}>
                      <Button size="sm" variant="ghost">
                        查看详情
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "settings" && (
          <>
            <div className="p-6">
              <h2 className="mb-4 font-medium">工作区设置</h2>
              
              <div className="space-y-4">
                <Field orientation="vertical">
                  <FieldLabel htmlFor="defaultDiskSize">默认磁盘大小 (GB)</FieldLabel>
                  <FieldContent>
                    <Input
                      id="defaultDiskSize"
                      type="number"
                      min={20}
                      max={500}
                      value={defaultDiskSize}
                      onChange={(e) => setDefaultDiskSize(parseInt(e.target.value) || 40)}
                    />
                    <FieldDescription>
                      系统盘大小，范围 20-500 GB
                    </FieldDescription>
                  </FieldContent>
                </Field>

                <Field orientation="vertical">
                  <FieldLabel htmlFor="defaultBandwidth">默认带宽峰值 (Mbps)</FieldLabel>
                  <FieldContent>
                    <Input
                      id="defaultBandwidth"
                      type="number"
                      min={1}
                      max={100}
                      value={defaultBandwidth}
                      onChange={(e) => setDefaultBandwidth(parseInt(e.target.value) || 10)}
                    />
                    <FieldDescription>
                      公网带宽峰值，范围 1-100 Mbps
                    </FieldDescription>
                  </FieldContent>
                </Field>

                <div className="flex gap-2">
                  <Button onClick={handleSaveSettings} disabled={saving}>
                    {saving ? <Spinner className="mr-2 h-4 w-4" /> : null}
                    保存设置
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-4 p-6">
              <h2 className="mb-4 font-medium text-red-600">危险操作</h2>
              <p className="text-sm text-muted-foreground mb-4">
                删除工作区将清除所有实例数据，此操作不可恢复。
              </p>
              <Button variant="destructive" disabled={busy} onClick={handleDelete}>
                {busy ? <Spinner className="mr-2 h-4 w-4" /> : null}
                删除工作区
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
