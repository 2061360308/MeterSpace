"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { APIError } from "@/components/ui/error";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Play } from "lucide-react";
import { isTransientStatus, statusMeta } from "@/lib/utils";
import {
  apiGet,
  apiSend,
  isNotFound,
  pingMaintenance,
  queryKeys,
  POLL_ACTIVE_MS,
  POLL_SETTLING_MS,
} from "@/lib/api-client";

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
  imageUri: string | null;
  templateId: string | null;
  entry: string | null;
  features: { id: string; name: string; version: string }[];
  gitRepoUrl: string | null;
  gitBranch: string | null;
  createdAt: string;
  proxyMode: "inherit" | "disabled" | "clash" | "upstream";
  proxyClashSubscription: string | null;
  proxyClashYaml: string | null;
  proxyUpstreamUrl: string | null;
  proxyUpstreamUsername: string | null;
  proxyUpstreamSecret: string | null;
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

const PROXY_LABEL: Record<string, string> = {
  inherit: "跟随全局",
  disabled: "直连",
  clash: "Clash",
  upstream: "上游代理",
};

export function WorkspaceDetail({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState(searchParams.get("tab") ?? "basic");
  const [selectedCloudInstanceId, setSelectedCloudInstanceId] = useState("");
  const [useSpot, setUseSpot] = useState(false);

  // 表单态（详情加载后同步一次）
  const [defaultDiskSize, setDefaultDiskSize] = useState<number>(40);
  const [defaultBandwidth, setDefaultBandwidth] = useState<number>(10);
  const [proxyMode, setProxyMode] =
    useState<NonNullable<Detail["proxyMode"]>>("inherit");
  const [proxyClashSubscription, setProxyClashSubscription] = useState("");
  const [proxyClashYaml, setProxyClashYaml] = useState("");
  const [proxyUpstreamUrl, setProxyUpstreamUrl] = useState("");
  const [proxyUpstreamUsername, setProxyUpstreamUsername] = useState("");
  const [proxyUpstreamSecret, setProxyUpstreamSecret] = useState("");
  const [hasProxySecret, setHasProxySecret] = useState(false);

  // ─── 数据查询 ───────────────────────────────────────────────
  const detailQuery = useQuery({
    queryKey: queryKeys.workspace(id),
    queryFn: () => {
      pingMaintenance();
      return apiGet<{ workspace: Detail }>(`/api/workspaces/${id}`);
    },
  });

  const instancesQuery = useQuery({
    queryKey: queryKeys.workspaceInstances(id),
    queryFn: () =>
      apiGet<{ instances: Instance[] }>(`/api/workspaces/${id}/instances`),
    refetchInterval: (query) =>
      (query.state.data?.instances ?? []).some((i) =>
        isTransientStatus(i.status),
      )
        ? POLL_ACTIVE_MS
        : false,
  });

  const detail = detailQuery.data?.workspace ?? null;
  const instances = useMemo(
    () => instancesQuery.data?.instances ?? [],
    [instancesQuery.data],
  );

  // 404 → 回首页（工作区已被删除）
  useEffect(() => {
    if (isNotFound(detailQuery.error)) router.replace("/");
  }, [detailQuery.error, router]);

  // 详情到达后同步表单初值
  useEffect(() => {
    if (!detail) return;
    setDefaultDiskSize(detail.defaultDiskSize ?? 40);
    setDefaultBandwidth(detail.defaultBandwidth ?? 10);
    setProxyMode(detail.proxyMode ?? "inherit");
    setProxyClashSubscription(detail.proxyClashSubscription ?? "");
    setProxyClashYaml(detail.proxyClashYaml ?? "");
    setProxyUpstreamUrl(detail.proxyUpstreamUrl ?? "");
    setProxyUpstreamUsername(detail.proxyUpstreamUsername ?? "");
    setProxyUpstreamSecret("");
    setHasProxySecret(Boolean(detail.proxyUpstreamSecret));
  }, [detail]);

  // 同步 URL tab 参数
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  // 启动中的实例 → 单独查云侧状态（仅 BOOTING/PROVISIONING 时才开）
  const bootingInstance = instances.find(
    (i) =>
      (i.status === "PROVISIONING" || i.status === "BOOTING") &&
      i.ecsInstanceId,
  );

  const cloudStatusQuery = useQuery({
    queryKey: queryKeys.cloudStatus(id, bootingInstance?.id ?? ""),
    enabled: Boolean(bootingInstance),
    queryFn: () =>
      apiGet<{ cloudStatus: string | null }>(
        `/api/workspaces/${id}/instances/${bootingInstance!.id}/cloud-status`,
      ),
    refetchInterval: POLL_SETTLING_MS,
  });
  const cloudStatus = cloudStatusQuery.data?.cloudStatus ?? null;

  // 规格与价格（进入 specs tab 才查，避免无谓请求）
  const specsEnabled = activeTab === "specs" && !!detail?.provider;

  // 抢占保障时长是全局偏好（settings），报价必须跟真实创建的参数一致，
  // 否则会出现「按 0 小时报价、按 1 小时扣费」。
  const settingsQuery = useQuery({
    queryKey: ["settings"] as const,
    enabled: specsEnabled,
    staleTime: 10 * 60_000,
    queryFn: () =>
      apiGet<{ settings: { defaultSpotDuration?: number | null } | null }>(
        "/api/settings",
      ),
  });
  const spotDuration = settingsQuery.data?.settings?.defaultSpotDuration ?? 1;

  const cloudInstancesQuery = useQuery({
    queryKey: queryKeys.cloudInstances(detail?.provider ?? "", detail?.region ?? ""),
    enabled: specsEnabled,
    staleTime: 5 * 60_000,
    queryFn: () =>
      apiGet<{ instances: CloudInstance[] }>(
        `/api/cloud-instances?provider=${detail!.provider}&region=${detail!.region}`,
      ),
  });
  const cloudInstances = useMemo(
    () => cloudInstancesQuery.data?.instances ?? [],
    [cloudInstancesQuery.data],
  );

  useEffect(() => {
    if (cloudInstances.length > 0 && !selectedCloudInstanceId) {
      setSelectedCloudInstanceId(cloudInstances[0].id);
    }
  }, [cloudInstances, selectedCloudInstanceId]);

  const typesQuery = useQuery({
    queryKey: queryKeys.ecsTypes(detail?.region ?? ""),
    enabled: specsEnabled && !!detail?.region,
    staleTime: 60 * 60_000,
    queryFn: () =>
      apiGet<{ types: InstanceType[] }>(`/api/ecs/types?region=${detail!.region}`),
  });
  const instanceTypes = typesQuery.data?.types ?? [];

  const selected = cloudInstances.find((i) => i.id === selectedCloudInstanceId);

  const priceParams = selected
    ? new URLSearchParams({
        region: detail?.region ?? "",
        instanceType: selected.instanceType,
        diskSize: String(defaultDiskSize),
        bandwidth: String(defaultBandwidth),
        ...(useSpot
          ? { spotStrategy: "SpotAsPriceGo", spotDuration: String(spotDuration) }
          : {}),
      }).toString()
    : "";

  const priceQuery = useQuery({
    queryKey: queryKeys.ecsPrice(priceParams),
    enabled: Boolean(priceParams),
    staleTime: 5 * 60_000,
    queryFn: () =>
      apiGet<{ details: PriceDetail[] }>(`/api/ecs/price?${priceParams}`),
  });
  const priceDetails = priceQuery.data?.details ?? [];

  const totalHourlyPrice = priceDetails.reduce(
    (sum, d) => sum + (d.tradePrice ?? 0),
    0,
  );
  const instancePriceDetail = priceDetails.find((d) =>
    ["instancetype", "instance"].includes((d.resource ?? "").toLowerCase()),
  );
  const spotHourlySavings =
    useSpot && instancePriceDetail
      ? Math.max(
          0,
          (instancePriceDetail.originalPrice ?? 0) -
            (instancePriceDetail.tradePrice ?? 0),
        )
      : 0;

  // ─── 变更操作 ───────────────────────────────────────────────
  const startMutation = useMutation({
    mutationFn: () =>
      apiSend<{ instanceId?: string; personalCode?: string }>(
        `/api/workspaces/${id}/instances`,
        "POST",
        {
          cloudInstanceId: selectedCloudInstanceId,
          diskSize: defaultDiskSize,
          bandwidth: defaultBandwidth,
          spotStrategy: useSpot ? "SpotAsPriceGo" : "NoSpot",
          spotDuration: useSpot ? spotDuration : 1,
          spotPriceLimit: null,
        },
      ),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.workspaceInstances(id),
      });
      if (data?.instanceId && data.personalCode) {
        router.push(`/access/${data.instanceId}?code=${data.personalCode}`);
        return;
      }
      toast.success("实例创建中，请稍候");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "启动失败"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiSend(`/api/workspaces/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces });
      router.push("/");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "删除失败"),
  });

  const saveSettingsMutation = useMutation({
    mutationFn: () =>
      apiSend(`/api/workspaces/${id}`, "PATCH", {
        defaultDiskSize,
        defaultBandwidth,
      }),
    onMutate: async () => {
      // 乐观更新：详情缓存里立刻反映新值
      await queryClient.cancelQueries({ queryKey: queryKeys.workspace(id) });
      const previous = queryClient.getQueryData<{ workspace: Detail }>(
        queryKeys.workspace(id),
      );
      queryClient.setQueryData<{ workspace: Detail }>(
        queryKeys.workspace(id),
        (old) =>
          old
            ? {
                workspace: {
                  ...old.workspace,
                  defaultDiskSize,
                  defaultBandwidth,
                },
              }
            : old,
      );
      return { previous };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(queryKeys.workspace(id), ctx.previous);
      }
      toast.error(e instanceof Error ? e.message : "保存失败");
    },
    onSuccess: () => toast.success("设置已保存"),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace(id) }),
  });

  const saveProxyMutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { proxyMode };
      if (proxyMode === "clash") {
        body.proxyClashSubscription = proxyClashSubscription.trim() || null;
        body.proxyClashYaml = proxyClashYaml.trim() || null;
      }
      if (proxyMode === "upstream") {
        body.proxyUpstreamUrl = proxyUpstreamUrl.trim() || null;
        body.proxyUpstreamUsername = proxyUpstreamUsername.trim() || null;
        const secret = proxyUpstreamSecret.trim();
        if (secret) body.proxyUpstreamSecret = secret;
      }
      return apiSend(`/api/workspaces/${id}`, "PATCH", body);
    },
    onSuccess: () => {
      setProxyUpstreamSecret("");
      if (proxyUpstreamSecret.trim()) setHasProxySecret(true);
      toast.success("网络设置已保存");
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace(id) });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  async function openWorkbench(instanceId: string) {
    try {
      const data = await apiGet<{ url?: string }>(
        `/api/instances/${instanceId}/access-link`,
      );
      if (data.url) router.push(data.url);
    } catch {
      toast.error("无法打开工作台，请重试");
    }
  }

  // ─── 渲染 ───────────────────────────────────────────────────
  if (detailQuery.isPending) {
    return <WorkspaceDetailSkeleton />;
  }

  if (detailQuery.error || !detail) {
    return (
      <div>
        <APIError
          message={
            detailQuery.error instanceof Error
              ? detailQuery.error.message
              : "工作区加载失败"
          }
          onRetry={() => detailQuery.refetch()}
        />
      </div>
    );
  }

  const currentInstance = instances.find((i) =>
    ["RUNNING", "BOOTING", "PROVISIONING", "RELEASING"].includes(i.status),
  );
  const isRunning = currentInstance?.status === "RUNNING";
  const isReleasing = currentInstance?.status === "RELEASING";
  const imageName = detail.imageUri
    ? detail.imageUri.split("/").pop() ?? detail.imageUri
    : detail.templateId ?? "模板工作区";

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={detail.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 tnum">
            <span>{detail.region}</span>
            <span className="text-border">|</span>
            <span>
              {currentInstance?.cloudInstanceName ?? "未启动"}
              {currentInstance?.cloudInstanceType
                ? ` · ${currentInstance.cloudInstanceType}`
                : ""}
            </span>
            <span className="text-border">|</span>
            <span className="font-mono text-xs">{imageName}</span>
          </span>
        }
        actions={
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="basic">基本信息</TabsTrigger>
              <TabsTrigger value="specs">弹性规格</TabsTrigger>
              <TabsTrigger value="history">启动记录</TabsTrigger>
              <TabsTrigger value="settings">设置</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {currentInstance && (
        <Card className="mb-5 py-0">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0 text-[13px] leading-6">
              <span className="text-muted-foreground">当前实例　</span>
              <span className="font-medium">
                {currentInstance.cloudInstanceName ?? "未知"}
              </span>
              <span className="text-muted-foreground tnum">
                （{currentInstance.diskSize}GB · {currentInstance.bandwidth}Mbps）
              </span>
              {currentInstance.publicIp && (
                <span className="ml-2 font-mono text-xs text-muted-foreground tnum">
                  {currentInstance.publicIp}:{currentInstance.port ?? 8080}
                </span>
              )}
              {isTransientStatus(currentInstance.status) &&
                cloudStatus &&
                (currentInstance.status === "BOOTING" ||
                  currentInstance.status === "PROVISIONING") && (
                  <span className="ml-2 text-muted-foreground">
                    · 云侧状态 {cloudStatus === "Released" ? "已释放" : cloudStatus}
                  </span>
                )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge tone={statusMeta(currentInstance.status).tone} dot>
                {statusMeta(currentInstance.status).label}
              </Badge>
              {isRunning ? (
                <Button size="sm" onClick={() => openWorkbench(currentInstance.id)}>
                  进入工作台
                </Button>
              ) : (
                <Link href={`/instances/${currentInstance.id}`}>
                  <Button size="sm" variant="outline">
                    查看详情
                  </Button>
                </Link>
              )}
            </div>
          </div>
          {currentInstance.bootError && !isReleasing && (
            <div className="px-5 pb-4 text-[13px] leading-6 text-[#c53030]">
              {currentInstance.bootError}
            </div>
          )}
        </Card>
      )}

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="min-h-0 flex-1"
      >
        <TabsContent value="basic">
          <Card>
            <div className="px-5">
              <SectionHeader title="工作区配置" className="mb-4" />
              <dl className="grid gap-x-8 gap-y-3 text-[13px] leading-6 sm:grid-cols-2">
                <InfoRow label="区域" value={detail.region} />
                <InfoRow
                  label={detail.imageUri ? "镜像" : "模板"}
                  value={
                    <span className="font-mono text-xs">
                      {detail.imageUri ?? detail.templateId ?? "—"}
                    </span>
                  }
                />
                <InfoRow label="默认磁盘" value={`${detail.defaultDiskSize ?? 40} GB`} />
                <InfoRow
                  label="默认带宽"
                  value={`${detail.defaultBandwidth ?? 10} Mbps`}
                />
                {detail.gitRepoUrl && (
                  <>
                    <InfoRow
                      label="代码仓库"
                      value={
                        <span className="font-mono text-xs">{detail.gitRepoUrl}</span>
                      }
                    />
                    <InfoRow label="分支" value={detail.gitBranch ?? "main"} />
                  </>
                )}
                {detail.features?.length > 0 && (
                  <InfoRow
                    label="开发环境"
                    value={detail.features.map((f) => f.name).join("、")}
                  />
                )}
                <InfoRow
                  label="网络加速"
                  value={
                    <Badge
                      tone={
                        detail.proxyMode === "inherit"
                          ? "gray"
                          : detail.proxyMode === "disabled"
                            ? "red"
                            : "blue"
                      }
                    >
                      {PROXY_LABEL[detail.proxyMode] ?? detail.proxyMode}
                    </Badge>
                  }
                />
              </dl>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="specs">
          {currentInstance ? (
            <Card>
              <Empty className="min-h-[280px]">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Play />
                  </EmptyMedia>
                  <EmptyTitle>
                    {isRunning
                      ? "工作区运行中"
                      : isReleasing
                        ? "实例正在释放"
                        : "实例正在启动"}
                  </EmptyTitle>
                  <EmptyDescription>
                    当前工作区
                    {isRunning
                      ? "已有实例在运行"
                      : isReleasing
                        ? "正在释放上一个实例"
                        : "上一个实例仍在启动"}
                    ，同一时间仅支持一个实例，无法重复创建。
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  {isRunning ? (
                    <Button onClick={() => openWorkbench(currentInstance.id)}>
                      进入工作台
                    </Button>
                  ) : (
                    <Link href={`/instances/${currentInstance.id}`}>
                      <Button variant="outline">查看实例进度</Button>
                    </Link>
                  )}
                </EmptyContent>
              </Empty>
            </Card>
          ) : (
            <div className="space-y-4 pb-24">
              <Card>
                <div className="px-5">
                  <SectionHeader
                    title="选择弹性规格"
                    description={`已自动筛选 ${detail.provider} · ${detail.region} 的可用规格`}
                    className="mb-4"
                  />
                  {cloudInstancesQuery.isPending ? (
                    <TableSkeleton rows={4} cols={5} />
                  ) : cloudInstances.length === 0 ? (
                    <div className="rounded-lg bg-muted px-4 py-6 text-center text-[13px] leading-6 text-muted-foreground">
                      该地域暂无弹性规格，请先在{" "}
                      <Link href="/cloud-instances" className="underline underline-offset-4">
                        弹性规格管理
                      </Link>{" "}
                      中创建
                    </div>
                  ) : (
                    <div className="-mx-5">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[44px]" />
                            <TableHead>名称</TableHead>
                            <TableHead>规格</TableHead>
                            <TableHead className="text-right">CPU</TableHead>
                            <TableHead className="text-right">内存</TableHead>
                            <TableHead>架构</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {cloudInstances.map((ci) => {
                            const typeInfo = instanceTypes.find(
                              (t) => t.instanceTypeId === ci.instanceType,
                            );
                            const active = selectedCloudInstanceId === ci.id;
                            return (
                              <TableRow
                                key={ci.id}
                                data-state={active ? "selected" : undefined}
                                className="cursor-pointer"
                                onClick={() => setSelectedCloudInstanceId(ci.id)}
                              >
                                <TableCell>
                                  <input
                                    type="radio"
                                    name="cloudInstance"
                                    checked={active}
                                    onChange={() =>
                                      setSelectedCloudInstanceId(ci.id)
                                    }
                                    className="size-3.5 accent-foreground"
                                  />
                                </TableCell>
                                <TableCell className="font-medium">
                                  {ci.name}
                                </TableCell>
                                <TableCell className="font-mono text-xs text-muted-foreground">
                                  {ci.instanceType}
                                </TableCell>
                                <TableCell className="text-right tnum">
                                  {typeInfo?.cpuCoreCount ?? "—"}
                                </TableCell>
                                <TableCell className="text-right tnum">
                                  {typeInfo ? `${typeInfo.memorySize} GB` : "—"}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {typeInfo?.cpuArchitecture ?? "—"}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </Card>

              {/* 浮动价格面板：Vercel 式白面 + 阴影边，不用 border-t */}
              <div className="sticky bottom-0 z-10 -mx-6 border-t border-border bg-background/95 px-6 py-3 backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="use-spot"
                        checked={useSpot}
                        onCheckedChange={setUseSpot}
                      />
                      <Label
                        htmlFor="use-spot"
                        className="cursor-pointer select-none text-[13px]"
                      >
                        抢占式使用
                      </Label>
                    </div>
                    <div className="border-l border-border pl-6">
                      <div className="text-xs text-muted-foreground">磁盘 / 带宽</div>
                      <div className="mt-1 flex items-center gap-2">
                        <Input
                          type="number"
                          min={20}
                          max={500}
                          value={defaultDiskSize}
                          onChange={(e) =>
                            setDefaultDiskSize(parseInt(e.target.value) || 40)
                          }
                          className="h-7 w-20 text-xs tnum"
                        />
                        <span className="text-xs text-muted-foreground">GB</span>
                        <span className="text-muted-foreground">/</span>
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          value={defaultBandwidth}
                          onChange={(e) =>
                            setDefaultBandwidth(parseInt(e.target.value) || 10)
                          }
                          className="h-7 w-16 text-xs tnum"
                        />
                        <span className="text-xs text-muted-foreground">Mbps</span>
                      </div>
                    </div>
                    <div className="border-l border-border pl-6">
                      <div className="text-xs text-muted-foreground">
                        {useSpot ? "抢占价" : "预估费用"}
                      </div>
                      {priceQuery.isFetching && !priceQuery.data ? (
                        <Skeleton className="mt-1 h-6 w-28" />
                      ) : (
                        <div>
                          <div className="text-lg font-semibold leading-6 tracking-[-0.01em] tnum">
                            {totalHourlyPrice > 0
                              ? `¥${totalHourlyPrice.toFixed(4)}`
                              : "—"}
                            <span className="ml-1 text-xs font-normal text-muted-foreground">
                              /小时
                            </span>
                          </div>
                          {useSpot && spotHourlySavings > 0 && (
                            <div className="text-xs text-[#0d7a43] tnum">
                              每小时省 ¥{spotHourlySavings.toFixed(4)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    onClick={() => startMutation.mutate()}
                    disabled={
                      startMutation.isPending || !selectedCloudInstanceId || isRunning
                    }
                  >
                    {startMutation.isPending && <Spinner className="size-4" />}
                    {isRunning ? "运行中" : "启动"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <div className="px-5">
              <SectionHeader title="启动记录" className="mb-4" />
              {instancesQuery.isPending ? (
                <div className="space-y-2 py-1">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : instances.length === 0 ? (
                <p className="py-2 text-[13px] leading-6 text-muted-foreground">
                  暂无启动记录
                </p>
              ) : (
                <div className="space-y-2">
                  {instances.map((instance) => (
                    <div
                      key={instance.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/60 px-4 py-3"
                    >
                      <div className="min-w-0 text-[13px] leading-6">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={statusMeta(instance.status).tone} dot>
                            {statusMeta(instance.status).label}
                          </Badge>
                          <span className="text-muted-foreground tnum">
                            {new Date(instance.createdAt).toLocaleString("zh-CN")}
                          </span>
                          {instance.stoppedAt && (
                            <span className="text-muted-foreground tnum">
                              → {new Date(instance.stoppedAt).toLocaleString("zh-CN")}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground tnum">
                          {instance.cloudInstanceName ?? "未知规格"} ·{" "}
                          {instance.diskSize}GB · {instance.bandwidth}Mbps
                          {instance.stopReason && <> · {instance.stopReason}</>}
                        </div>
                      </div>
                      <Link href={`/instances/${instance.id}`}>
                        <Button size="sm" variant="outline">
                          查看详情
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <div className="space-y-4">
            <Card>
              <div className="px-5">
                <SectionHeader
                  title="资源默认值"
                  description="影响该工作区下次启动时使用的系统盘与带宽。"
                  className="mb-4"
                />
                <div className="grid max-w-xl gap-4">
                  <Field orientation="vertical">
                    <FieldLabel htmlFor="defaultDiskSize">
                      默认磁盘大小（GB）
                    </FieldLabel>
                    <FieldContent>
                      <Input
                        id="defaultDiskSize"
                        type="number"
                        min={20}
                        max={500}
                        value={defaultDiskSize}
                        onChange={(e) =>
                          setDefaultDiskSize(parseInt(e.target.value) || 40)
                        }
                        className="tnum"
                      />
                      <FieldDescription>系统盘大小，范围 20–500 GB</FieldDescription>
                    </FieldContent>
                  </Field>
                  <Field orientation="vertical">
                    <FieldLabel htmlFor="defaultBandwidth">
                      默认带宽峰值（Mbps）
                    </FieldLabel>
                    <FieldContent>
                      <Input
                        id="defaultBandwidth"
                        type="number"
                        min={1}
                        max={100}
                        value={defaultBandwidth}
                        onChange={(e) =>
                          setDefaultBandwidth(parseInt(e.target.value) || 10)
                        }
                        className="tnum"
                      />
                      <FieldDescription>公网带宽峰值，范围 1–100 Mbps</FieldDescription>
                    </FieldContent>
                  </Field>
                  <div>
                    <Button
                      onClick={() => saveSettingsMutation.mutate()}
                      disabled={saveSettingsMutation.isPending}
                    >
                      {saveSettingsMutation.isPending && (
                        <Spinner className="size-4" />
                      )}
                      保存设置
                    </Button>
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <div className="px-5">
                <SectionHeader
                  title="网络加速"
                  description="覆盖全局出口代理配置；ECS 启动时自动探测境外可达性，不通时经代理出口。"
                  className="mb-4"
                />
                <div className="grid max-w-xl gap-4">
                  <Field orientation="vertical">
                    <FieldLabel htmlFor="proxyMode">代理模式</FieldLabel>
                    <FieldContent>
                      <Select
                        value={proxyMode}
                        onValueChange={(v) => setProxyMode(v as typeof proxyMode)}
                      >
                        <SelectTrigger id="proxyMode" className="w-full sm:w-72">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inherit">跟随全局设置</SelectItem>
                          <SelectItem value="disabled">直连（不启用代理）</SelectItem>
                          <SelectItem value="clash">Clash（mihomo）</SelectItem>
                          <SelectItem value="upstream">上游代理（HTTP/SOCKS5）</SelectItem>
                        </SelectContent>
                      </Select>
                    </FieldContent>
                  </Field>

                  {proxyMode === "clash" && (
                    <>
                      <Field orientation="vertical">
                        <FieldLabel htmlFor="proxyClashSubscription">
                          Clash 订阅地址
                        </FieldLabel>
                        <FieldContent>
                          <Input
                            id="proxyClashSubscription"
                            value={proxyClashSubscription}
                            onChange={(e) =>
                              setProxyClashSubscription(e.target.value)
                            }
                            placeholder="https://example.com/sub?token=xxx"
                          />
                        </FieldContent>
                      </Field>
                      <Field orientation="vertical">
                        <FieldLabel htmlFor="proxyClashYaml">
                          Clash 配置（YAML，可选）
                        </FieldLabel>
                        <FieldContent>
                          <Textarea
                            id="proxyClashYaml"
                            rows={5}
                            value={proxyClashYaml}
                            onChange={(e) => setProxyClashYaml(e.target.value)}
                            placeholder={"proxies:\n  - name: my-proxy\n    type: socks5\n    ..."}
                            className="font-mono text-xs"
                          />
                        </FieldContent>
                      </Field>
                    </>
                  )}

                  {proxyMode === "upstream" && (
                    <>
                      <Field orientation="vertical">
                        <FieldLabel htmlFor="proxyUpstreamUrl">上游代理地址</FieldLabel>
                        <FieldContent>
                          <Input
                            id="proxyUpstreamUrl"
                            value={proxyUpstreamUrl}
                            onChange={(e) => setProxyUpstreamUrl(e.target.value)}
                            placeholder="http://host:port 或 socks5://host:port"
                          />
                        </FieldContent>
                      </Field>
                      <Field orientation="vertical">
                        <FieldLabel htmlFor="proxyUpstreamUsername">
                          用户名（可选）
                        </FieldLabel>
                        <FieldContent>
                          <Input
                            id="proxyUpstreamUsername"
                            value={proxyUpstreamUsername}
                            onChange={(e) => setProxyUpstreamUsername(e.target.value)}
                            placeholder="username"
                          />
                        </FieldContent>
                      </Field>
                      <Field orientation="vertical">
                        <FieldLabel htmlFor="proxyUpstreamSecret">
                          密码（可选）
                        </FieldLabel>
                        <FieldContent>
                          <Input
                            id="proxyUpstreamSecret"
                            type="password"
                            value={proxyUpstreamSecret}
                            onChange={(e) => setProxyUpstreamSecret(e.target.value)}
                            placeholder={
                              hasProxySecret ? "已保存，留空不修改" : "password"
                            }
                          />
                        </FieldContent>
                      </Field>
                    </>
                  )}

                  <div>
                    <Button
                      onClick={() => saveProxyMutation.mutate()}
                      disabled={saveProxyMutation.isPending}
                    >
                      {saveProxyMutation.isPending && <Spinner className="size-4" />}
                      保存网络设置
                    </Button>
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <div className="px-5">
                <SectionHeader
                  title="危险操作"
                  description="删除工作区将清除所有实例数据与云端存储，此操作不可恢复。"
                  className="mb-4"
                />
                <Button
                  variant="destructive"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (
                      confirm(
                        `确定删除工作区「${detail.name}」？所有实例数据将被清除，不可恢复。`,
                      )
                    ) {
                      deleteMutation.mutate();
                    }
                  }}
                >
                  {deleteMutation.isPending && <Spinner className="size-4" />}
                  删除工作区
                </Button>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right">{value}</dd>
    </div>
  );
}

function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="-mx-5 space-y-0">
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 border-b border-border/70 px-3 py-2.5"
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className={c === 1 ? "h-4 w-40" : "h-4 w-16"}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function WorkspaceDetailSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-4 pb-5">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-8 w-[300px]" />
      </div>
      <Card className="mb-5">
        <div className="flex items-center justify-between px-5">
          <div className="space-y-2">
            <Skeleton className="h-4 w-72" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-7 w-28" />
        </div>
      </Card>
      <Card>
        <div className="space-y-4 px-5">
          <Skeleton className="h-5 w-32" />
          <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
