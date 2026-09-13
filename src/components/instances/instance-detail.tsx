"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { APIError } from "@/components/ui/error";
import {
  formatBytes,
  formatDuration,
  isTransientStatus,
  statusMeta,
} from "@/lib/utils";
import {
  apiGet,
  apiSend,
  isNotFound,
  pingMaintenance,
  queryKeys,
  POLL_ACTIVE_MS,
} from "@/lib/api-client";

interface InstanceLog {
  id: string;
  timestamp: string;
  level: string;
  phase: string | null;
  message: string;
}

interface ExposedPort {
  port: number;
  label?: string;
  protocol?: string;
  private?: boolean;
}

interface Instance {
  id: string;
  workspaceId: string;
  diskSize: number;
  bandwidth: number;
  status: string;
  ecsInstanceId: string | null;
  publicIp: string | null;
  port: number | null;
  bootPhase: string | null;
  bootStartedAt: string | null;
  bootCompletedAt: string | null;
  bootError: string | null;
  currentEntry: string | null;
  lastActiveAt: string | null;
  accessSummary: unknown;
  ossUsageBytes: number | null;
  stoppedAt: string | null;
  stopReason: string | null;
  createdAt: string;
  workspaceName: string;
  workspaceRegion: string;
  workspaceProvider: string;
  workspaceActivityConfig: { ports?: ExposedPort[] } | null;
  cloudInstanceName: string | null;
  cloudInstanceType: string | null;
  logs: {
    id?: string;
    timestamp: string;
    level: string;
    phase: string | null;
    message: string;
  }[];
}

/** 启动阶段顺序，与 agent 上报的 phase 对齐。 */
const BOOT_PHASES = [
  { key: "installing_deps", label: "安装基础依赖" },
  { key: "mounting_oss", label: "挂载 OSS 存储" },
  { key: "pulling_image", label: "拉取容器镜像" },
  { key: "starting_container", label: "启动容器" },
  { key: "restoring_config", label: "恢复配置" },
  { key: "restoring_snapshot", label: "恢复快照" },
  { key: "cloning_repo", label: "克隆代码仓库" },
  { key: "installing_features", label: "安装开发环境" },
  { key: "running_scripts", label: "执行自定义脚本" },
  { key: "health_check", label: "健康检查" },
];

/** 日志行高（px），虚拟滚动按它估算。中文行高比拉丁版略高。 */
const LOG_ROW_HEIGHT = 24;

/** 兼容旧数据：没有 id 的日志用时间戳+内容构造稳定 key。 */
function logKey(log: { id?: string; timestamp: string; message: string }): string {
  return log.id ?? `${log.timestamp}|${log.message}`;
}

export function InstanceDetail({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [stopping, setStopping] = useState(false);

  // 流式日志：与查询结果合并（按 id 去重）
  const [streamLogs, setStreamLogs] = useState<InstanceLog[]>([]);
  // 流里出现过的最新阶段，用于让步骤条不依赖轮询也能推进
  const [streamPhase, setStreamPhase] = useState<string | null>(null);

  const {
    data,
    isPending,
    error,
  } = useQuery({
    queryKey: queryKeys.instance(id),
    queryFn: () => {
      pingMaintenance();
      return apiGet<{ instance: Instance }>(`/api/instances/${id}`);
    },
    // 只在进行中状态轮询；终态完全停轮询（U3）
    refetchInterval: (query) =>
      isTransientStatus(query.state.data?.instance?.status)
        ? POLL_ACTIVE_MS
        : false,
  });

  const instance = data?.instance ?? null;

  useEffect(() => {
    if (isNotFound(error)) router.replace("/");
  }, [error, router]);

  const status = instance?.status ?? null;
  const isBooting = status === "BOOTING" || status === "PROVISIONING";
  const isStreamable = Boolean(status) && status !== "STOPPED" && status !== "FAILED";

  /**
   * SSE 日志流。
   *
   * 只在实例未进入终态时连接；`done` 事件后关闭并校正一次查询结果。
   * 去重必须按 id —— 这正是之前缺 `id` 时每次重连都重复追加整批日志的原因。
   */
  useEffect(() => {
    if (!isStreamable) return;

    const eventSource = new EventSource(`/api/instances/${id}/logs/stream`);

    eventSource.onmessage = (event) => {
      let payload: {
        id?: string;
        timestamp?: string;
        level?: string;
        phase?: string | null;
        message?: string;
        type?: string;
      };
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (payload.type === "done") {
        eventSource.close();
        queryClient.invalidateQueries({ queryKey: queryKeys.instance(id) });
        return;
      }
      if (!payload.timestamp) return;

      if (payload.phase) setStreamPhase(payload.phase);

      const incoming: InstanceLog = {
        id: logKey(payload as { timestamp: string; message: string }),
        timestamp: payload.timestamp,
        level: payload.level ?? "info",
        phase: payload.phase ?? null,
        message: payload.message ?? "",
      };

      setStreamLogs((prev) =>
        prev.some((l) => l.id === incoming.id) ? prev : [...prev, incoming],
      );
    };

    eventSource.onerror = () => eventSource.close();

    return () => eventSource.close();
  }, [id, isStreamable, queryClient]);

  // 合并两条来源，按 id 去重、按时间升序
  const logs = useMemo(() => {
    const map = new Map<string, InstanceLog>();
    for (const l of instance?.logs ?? []) {
      const key = logKey(l as { timestamp: string; message: string });
      map.set(key, {
        id: key,
        timestamp: l.timestamp,
        level: l.level,
        phase: l.phase,
        message: l.message,
      });
    }
    for (const l of streamLogs) {
      if (!map.has(l.id)) map.set(l.id, l);
    }
    return [...map.values()].sort((a, b) =>
      a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0,
    );
  }, [instance?.logs, streamLogs]);

  // 启动耗时：启动中每秒走一次（纯本地计时，不打接口）
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!isBooting) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isBooting]);

  // 个人访问码：仅运行中需要，且只在运行中查询
  const codesQuery = useQuery({
    queryKey: [...queryKeys.instance(id), "codes"] as const,
    enabled: instance?.status === "RUNNING",
    staleTime: 5 * 60_000,
    queryFn: () =>
      apiGet<{ codes?: { code: string; isPersonal: boolean }[] }>(
        `/api/instances/${id}/codes`,
      ),
  });
  const personalCode =
    codesQuery.data?.codes?.find((c) => c.isPersonal)?.code ?? null;

  async function handleStop() {
    if (stopping) return;
    setStopping(true);
    try {
      await apiSend(`/api/instances/${id}/stop`, "POST");
      toast.success("已开始释放，快照完成后自动停止");
      await queryClient.invalidateQueries({ queryKey: queryKeys.instance(id) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "停止失败");
    } finally {
      setStopping(false);
    }
  }
  if (isPending) return <InstanceDetailSkeleton />;

  if (error || !instance) {
    return (
      <APIError
        message={error instanceof Error ? error.message : "实例加载失败"}
        onRetry={() =>
          queryClient.invalidateQueries({ queryKey: queryKeys.instance(id) })
        }
      />
    );
  }

  const meta = statusMeta(instance.status);
  const isRunning = instance.status === "RUNNING";
  const isReleasing = instance.status === "RELEASING";

  // 步骤条：取「轮询到的 bootPhase」与「流里最新 phase」中更靠后的一个
  const polledIndex = instance.bootPhase
    ? BOOT_PHASES.findIndex((p) => p.key === instance.bootPhase)
    : -1;
  const streamIndex = streamPhase
    ? BOOT_PHASES.findIndex((p) => p.key === streamPhase)
    : -1;
  const currentPhaseIndex = Math.max(polledIndex, streamIndex);

  return (
    <div className="space-y-5">
      <PageHeader
        title="实例"
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 tnum">
            <Link
              href={`/workspaces/${instance.workspaceId}`}
              className="underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              {instance.workspaceName}
            </Link>
            <span className="text-border">|</span>
            <span>
              {instance.cloudInstanceName ?? "未知规格"}
              {instance.cloudInstanceType ? ` · ${instance.cloudInstanceType}` : ""}
            </span>
            <span className="text-border">|</span>
            <span>
              {instance.diskSize}GB · {instance.bandwidth}Mbps
            </span>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            {isBooting && instance.bootStartedAt && (
              <span className="text-[13px] text-muted-foreground tnum">
                耗时 {formatDuration(instance.bootStartedAt, nowMs)}
              </span>
            )}
            <Badge tone={meta.tone} dot>
              {meta.label}
            </Badge>
          </div>
        }
      />

      {instance.status === "FAILED" && instance.bootError && (
        <Card>
          <div className="px-5">
            <SectionHeader
              title={<span className="text-[#c53030]">启动失败</span>}
              description={instance.bootError}
              className="mb-4"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push(`/workspaces/${instance.workspaceId}`)}
            >
              返回工作区
            </Button>
          </div>
        </Card>
      )}

      {isReleasing && (
        <Card>
          <div className="px-5">
            <SectionHeader
              title="正在释放"
              description="正在打包未提交的改动到快照并导出编辑器配置。完成后实例会自动停止，期间请勿关闭页面。"
            />
          </div>
        </Card>
      )}

      {isBooting && (
        <Card>
          <div className="px-5">
            <SectionHeader
              title="启动进度"
              description="阶段来自实例日志流，无需刷新页面。"
              className="mb-4"
            />
            <ol className="space-y-0">
              {BOOT_PHASES.map((phase, index) => {
                const isDone = currentPhaseIndex > index;
                const isCurrent = currentPhaseIndex === index;
                return (
                  <li key={phase.key} className="flex items-stretch gap-3">
                    {/* 左侧导轨：Vercel 式细线 + 状态点 */}
                    <div className="flex flex-col items-center pt-2">
                      <span
                        className={
                          isDone
                            ? "size-1.5 rounded-full bg-foreground"
                            : isCurrent
                              ? "size-1.5 rounded-full bg-foreground ring-4 ring-foreground/10"
                              : "size-1.5 rounded-full bg-border"
                        }
                      />
                      {index < BOOT_PHASES.length - 1 && (
                        <span
                          className={
                            isDone ? "w-px flex-1 bg-foreground/25" : "w-px flex-1 bg-border"
                          }
                        />
                      )}
                    </div>
                    <div
                      className={
                        "flex flex-1 items-center gap-2 pb-3 text-[13px] leading-6 " +
                        (isDone
                          ? "text-muted-foreground"
                          : isCurrent
                            ? "font-medium text-foreground"
                            : "text-muted-foreground/60")
                      }
                    >
                      <span>{phase.label}</span>
                      {isCurrent && <Spinner className="size-3.5" />}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </Card>
      )}

      {isRunning && instance.publicIp && (
        <Card>
          <div className="px-5">
            <SectionHeader
              title="访问方式"
              description={
                instance.currentEntry ? (
                  <span className="font-mono text-xs">
                    当前入口 {instance.currentEntry}
                  </span>
                ) : undefined
              }
              className="mb-4"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              {portsFor(instance).map((p) => {
                const url = `http://${instance.publicIp}:${p.port}`;
                return (
                  <a
                    key={p.port}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-lg bg-muted/60 px-4 py-3 transition-colors hover:bg-muted"
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium leading-6">
                        {p.label ?? `端口 ${p.port}`}
                      </div>
                      <div className="truncate font-mono text-xs text-muted-foreground tnum">
                        {instance.publicIp}:{p.port} · {p.protocol ?? "tcp"}
                      </div>
                    </div>
                    <span className="text-muted-foreground" aria-hidden>
                      ↗
                    </span>
                  </a>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                onClick={() => {
                  if (personalCode) router.push(`/access/${id}?code=${personalCode}`);
                }}
                disabled={stopping || !personalCode}
              >
                进入访问页
              </Button>
              <Button
                variant="outline"
                onClick={handleStop}
                disabled={stopping}
              >
                {stopping && <Spinner className="size-4" />}
                停止实例
              </Button>
            </div>
          </div>
        </Card>
      )}

      {!isRunning && !isBooting && !isReleasing && instance.status !== "FAILED" && (
        <Card>
          <div className="px-5">
            <SectionHeader
              title="实例已停止"
              description={
                <span className="tnum">
                  {instance.stoppedAt &&
                    `停止时间 ${new Date(instance.stoppedAt).toLocaleString("zh-CN")}`}
                  {instance.stopReason && ` · 原因 ${instance.stopReason}`}
                </span>
              }
              className="mb-4"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push(`/workspaces/${instance.workspaceId}`)}
            >
              返回工作区
            </Button>
          </div>
        </Card>
      )}

      <Card className="py-0">
        <LogViewer logs={logs} />
      </Card>

      <Card>
        <div className="px-5">
          <SectionHeader title="实例信息" className="mb-4" />
          <dl className="grid gap-x-8 gap-y-3 text-[13px] leading-6 sm:grid-cols-2">
            <InfoRow label="实例 ID" value={<Mono>{instance.id}</Mono>} />
            <InfoRow
              label="ECS 实例 ID"
              value={<Mono>{instance.ecsInstanceId ?? "—"}</Mono>}
            />
            <InfoRow label="公网 IP" value={instance.publicIp ?? "—"} />
            <InfoRow label="端口" value={instance.port ?? "—"} />
            <InfoRow
              label="创建时间"
              value={new Date(instance.createdAt).toLocaleString("zh-CN")}
            />
            <InfoRow
              label="完成时间"
              value={
                instance.bootCompletedAt
                  ? new Date(instance.bootCompletedAt).toLocaleString("zh-CN")
                  : "—"
              }
            />
            <InfoRow label="OSS 占用" value={formatBytes(instance.ossUsageBytes)} />
          </dl>
        </div>
      </Card>
    </div>
  );
}

/* ───────────────────────────── 日志视图 ───────────────────────────── */

/**
 * 日志查看器。
 *
 * 两个要点：
 * 1. **虚拟滚动**：日志可达数百行，全量渲染会拖慢主线程。只渲染视口内的行。
 * 2. **稳定 key**：行 key 用日志 id（服务端已下发），不用数组下标 ——
 *    下标在增量追加时会让 React 复用错误的 DOM 节点。
 */
function LogViewer({ logs }: { logs: InstanceLog[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const virtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => LOG_ROW_HEIGHT,
    overscan: 16,
  });

  // 贴底时才自动滚（用户往上翻历史时不打断）
  useEffect(() => {
    if (!autoScroll || logs.length === 0) return;
    virtualizer.scrollToIndex(logs.length - 1, { align: "end" });
  }, [logs.length, autoScroll, virtualizer]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    setAutoScroll(distanceFromBottom < 48);
  }

  const items = virtualizer.getVirtualItems();

  return (
    <div>
      <div className="flex items-center justify-between px-5 py-4">
        <SectionHeader
          title="实例日志"
          description={
            logs.length > 0 ? `共 ${logs.length} 条` : undefined
          }
        />
        {logs.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setAutoScroll(true);
              virtualizer.scrollToIndex(logs.length - 1, { align: "end" });
            }}
            disabled={autoScroll}
          >
            跳到最新
          </Button>
        )}
      </div>

      {logs.length === 0 ? (
        <p className="px-5 pb-5 text-[13px] leading-6 text-muted-foreground">
          暂无日志
        </p>
      ) : (
        <div
          ref={parentRef}
          onScroll={onScroll}
          className="max-h-80 overflow-y-auto rounded-b-lg bg-[#0a0a0a] px-4 py-3 font-mono text-xs leading-4 text-[#ededed]"
        >
          <div
            className="relative w-full"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {items.map((item) => {
              const log = logs[item.index];
              return (
                <div
                  key={log.id}
                  className="absolute inset-x-0 flex gap-2 py-1"
                  style={{
                    height: `${item.size}px`,
                    transform: `translateY(${item.start}px)`,
                  }}
                >
                  <span className="shrink-0 text-[#8f8f8f] tnum">
                    {new Date(log.timestamp).toLocaleTimeString("zh-CN", {
                      hour12: false,
                    })}
                  </span>
                  <span
                    className={
                      "shrink-0 " +
                      (log.level === "error"
                        ? "text-[#ff6369]"
                        : log.level === "warn"
                          ? "text-[#e2b53e]"
                          : "text-[#4cc38a]")
                    }
                  >
                    [{log.level.toUpperCase()}]
                  </span>
                  {log.phase && (
                    <span className="shrink-0 text-[#6cb6ff]">[{log.phase}]</span>
                  )}
                  <span className="min-w-0 whitespace-pre-wrap break-all text-[#d4d4d4]">
                    {log.message}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── 辅助 ───────────────────────────── */

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-xs">{children}</span>;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right">{value}</dd>
    </div>
  );
}

function InstanceDetailSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 pb-5">
        <div className="space-y-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-6 w-20" />
      </div>
      <Card>
        <div className="space-y-3 px-5">
          <Skeleton className="h-5 w-28" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-52" />
          ))}
        </div>
      </Card>
      <Card>
        <div className="space-y-3 px-5">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-40 w-full" />
        </div>
      </Card>
    </div>
  );
}

/** 组合模板声明的端口和 agent 运行时上报的端口，过滤私有端口。 */
function portsFor(instance: Instance): ExposedPort[] {
  const declared = instance.workspaceActivityConfig?.ports ?? [];

  const runtime: ExposedPort[] = [];
  const summary = instance.accessSummary;
  if (
    summary &&
    typeof summary === "object" &&
    "ports" in summary &&
    Array.isArray((summary as { ports?: unknown }).ports)
  ) {
    for (const p of (summary as { ports: unknown[] }).ports) {
      if (p && typeof p === "object" && typeof (p as { port?: unknown }).port === "number") {
        runtime.push(p as ExposedPort);
      }
    }
  }

  const merged = new Map<number, ExposedPort>();
  for (const p of declared) merged.set(p.port, p);
  for (const p of runtime) merged.set(p.port, p);

  return [...merged.values()]
    .filter((p) => !p.private)
    .sort((a, b) => a.port - b.port);
}

