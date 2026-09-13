"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HardDrive,
  Play,
  Square,
  MoreHorizontal,
  Trash2,
  Share2,
  Pencil,
  FolderCode,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { APIError } from "@/components/ui/error";
import {
  formatBytes,
  formatRelativeTime,
  isTransientStatus,
  statusMeta,
} from "@/lib/utils";
import {
  apiGet,
  apiSend,
  pingMaintenance,
  queryKeys,
  POLL_SETTLING_MS,
} from "@/lib/api-client";

interface WorkspaceFeature {
  id: string;
  name: string;
  version: string;
}

interface WorkspaceRow {
  id: string;
  name: string;
  provider: string;
  region: string;
  imageUri: string | null;
  templateId: string | null;
  features: WorkspaceFeature[];
  createdAt: string;
  state: {
    instanceId?: string | null;
    status: string;
    publicIp?: string | null;
    port?: number | null;
    ossUsageBytes?: number | null;
    lastActiveAt?: string | null;
    releasedAt?: string | null;
  } | null;
}

type WorkspaceListResponse = { workspaces: WorkspaceRow[] };

const providerLabel = (p: string) => (p === "aliyun" ? "阿里云" : p);

export function WorkspaceList() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.workspaces,
    queryFn: () => {
      // 懒处理打点：不 await，只借这次加载触发超时 / 空闲 / 异步停止收尾
      pingMaintenance();
      return apiGet<WorkspaceListResponse>("/api/workspaces");
    },
    // 只在有实例处于进行中状态时轮询；全部稳定则完全停轮询
    refetchInterval: (query) =>
      (query.state.data?.workspaces ?? []).some((w) =>
        isTransientStatus(w.state?.status),
      )
        ? POLL_SETTLING_MS
        : false,
  });

  const workspaces = data?.workspaces ?? [];

  const stopMutation = useMutation({
    mutationFn: (id: string) => apiSend(`/api/workspaces/${id}/stop`, "POST"),
    // 乐观更新：立刻把该行标成「释放中」，不等接口回来
    onMutate: async (id: string) => {
      setPendingId(id);
      await queryClient.cancelQueries({ queryKey: queryKeys.workspaces });
      const previous = queryClient.getQueryData<WorkspaceListResponse>(
        queryKeys.workspaces,
      );
      queryClient.setQueryData<WorkspaceListResponse>(
        queryKeys.workspaces,
        (old) =>
          old
            ? {
                workspaces: old.workspaces.map((w) =>
                  w.id === id && w.state
                    ? { ...w, state: { ...w.state, status: "RELEASING" } }
                    : w,
                ),
              }
            : old,
      );
      return { previous };
    },
    onError: (e, _id, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(queryKeys.workspaces, ctx.previous);
      }
      toast.error(e instanceof Error ? e.message : "停止失败");
    },
    onSuccess: () => {
      toast.success("已开始释放，快照完成后自动停止");
    },
    onSettled: () => {
      setPendingId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiSend(`/api/workspaces/${id}`, "DELETE"),
    onMutate: async (id: string) => {
      setPendingId(id);
      await queryClient.cancelQueries({ queryKey: queryKeys.workspaces });
      const previous = queryClient.getQueryData<WorkspaceListResponse>(
        queryKeys.workspaces,
      );
      // 乐观移除该行
      queryClient.setQueryData<WorkspaceListResponse>(
        queryKeys.workspaces,
        (old) =>
          old ? { workspaces: old.workspaces.filter((w) => w.id !== id) } : old,
      );
      return { previous };
    },
    onError: (e, _id, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(queryKeys.workspaces, ctx.previous);
      }
      toast.error(e instanceof Error ? e.message : "删除失败");
    },
    onSuccess: () => toast.success("工作区已删除"),
    onSettled: () => {
      setPendingId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces });
    },
  });

  async function openWorkbench(instanceId?: string | null) {
    if (!instanceId) return;
    setPendingId(instanceId);
    try {
      const data = await apiGet<{ url?: string }>(
        `/api/instances/${instanceId}/access-link`,
      );
      if (data.url) {
        router.push(data.url);
        return;
      }
      toast.error("无法打开工作台，请重试");
    } catch {
      toast.error("无法打开工作台，请重试");
    } finally {
      setPendingId(null);
    }
  }

  const actionsBusy = isPending || error !== null;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="工作区"
        description="每个工作区对应一套云端开发环境，按需启动、用完释放。"
        actions={
          <Link href="/workspaces/new">
            <Button>
              <FolderCode className="size-4" />
              新建工作区
            </Button>
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto">
        {error && (
          <APIError
            message={error instanceof Error ? error.message : "加载失败"}
            className="mb-4"
          />
        )}

        {isPending ? (
          <WorkspaceListSkeleton />
        ) : workspaces.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderCode />
              </EmptyMedia>
              <EmptyTitle>还没有工作区</EmptyTitle>
              <EmptyDescription>
                点击上方按钮创建您的第一个云端开发环境。
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link href="/workspaces/new">
                <Button>新建工作区</Button>
              </Link>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="space-y-2">
            {workspaces.map((w) => {
              const status = w.state?.status ?? "STOPPED";
              const meta = statusMeta(status);
              const isRunning = status === "RUNNING";
              const rowBusy = isTransientStatus(status);
              const imageName = w.imageUri
                ? w.imageUri.split("/").pop() ?? w.imageUri
                : w.templateId ?? "模板工作区";
              const featureNames = (w.features ?? [])
                .map((f) => f.name)
                .join(" · ");

              return (
                <Card key={w.id} interactive className="py-0">
                  <div className="flex items-center gap-4 px-4 py-3">
                    {/* 左侧：主信息 */}
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 truncate font-mono text-[11px] leading-4 text-muted-foreground">
                        {imageName}
                      </div>
                      <div className="mb-1 flex items-center gap-2">
                        <Link
                          href={`/workspaces/${w.id}`}
                          className="truncate text-[15px] font-semibold leading-6 tracking-[-0.01em] hover:underline"
                        >
                          {w.name}
                        </Link>
                        <Badge tone={meta.tone} dot>
                          {meta.label}
                        </Badge>
                      </div>
                      <div className="truncate text-xs leading-5 text-muted-foreground">
                        {featureNames || "未安装开发环境"}
                      </div>
                    </div>

                    {/* 中间：元信息。中文环境用竖线分隔比圆点更清晰 */}
                    <div className="hidden shrink-0 items-center gap-3 text-xs text-muted-foreground tnum lg:flex">
                      <span>
                        {providerLabel(w.provider)} · {w.region}
                      </span>
                      <span className="h-3 w-px bg-border" aria-hidden />
                      <span className="inline-flex items-center gap-1">
                        <HardDrive className="size-3.5" />
                        {formatBytes(w.state?.ossUsageBytes)}
                      </span>
                      <span className="h-3 w-px bg-border" aria-hidden />
                      <span>
                        {w.state?.lastActiveAt
                          ? `上次使用 ${formatRelativeTime(w.state.lastActiveAt)}`
                          : "从未启动"}
                      </span>
                    </div>

                    {/* 右侧：操作 */}
                    <div className="flex shrink-0 items-center">
                      <ButtonGroup>
                        {isRunning ? (
                          <>
                            <Button
                              size="icon-sm"
                              variant="outline"
                              disabled={actionsBusy}
                              title="进入工作台"
                              onClick={() => openWorkbench(w.state?.instanceId)}
                            >
                              <Play className="size-3.5" />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="outline"
                              disabled={rowBusy}
                              title="停止并释放"
                              onClick={() => stopMutation.mutate(w.id)}
                            >
                              {pendingId === w.id ? (
                                <Spinner className="size-3.5" />
                              ) : (
                                <Square className="size-3.5" />
                              )}
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="icon-sm"
                            variant="outline"
                            disabled={rowBusy}
                            title="选择规格并启动"
                            onClick={() =>
                              router.push(`/workspaces/${w.id}?tab=specs`)
                            }
                          >
                            {rowBusy ? (
                              <Spinner className="size-3.5" />
                            ) : (
                              <Play className="size-3.5" />
                            )}
                          </Button>
                        )}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon-sm"
                              variant="outline"
                              title="更多操作"
                            >
                              <MoreHorizontal className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            {isRunning ? (
                              <DropdownMenuItem
                                disabled={rowBusy}
                                onClick={() => stopMutation.mutate(w.id)}
                              >
                                <Square className="size-4" />
                                停止
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                disabled={rowBusy}
                                onClick={() =>
                                  router.push(`/workspaces/${w.id}?tab=specs`)
                                }
                              >
                                <Play className="size-4" />
                                启动
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() =>
                                router.push(`/workspaces/${w.id}?tab=settings`)
                              }
                            >
                              <Share2 className="size-4" />
                              分享与设置
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                router.push(`/workspaces/${w.id}?tab=settings`)
                              }
                            >
                              <Pencil className="size-4" />
                              重命名
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              disabled={rowBusy}
                              onClick={() => {
                                if (
                                  confirm(
                                    `确定删除工作区「${w.name}」？所有实例数据将被清除，不可恢复。`,
                                  )
                                ) {
                                  deleteMutation.mutate(w.id);
                                }
                              }}
                            >
                              <Trash2 className="size-4" />
                              删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </ButtonGroup>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** 列表骨架屏：与真实行同高，避免加载完成时的跳动。 */
function WorkspaceListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="py-0">
          <div className="flex items-center gap-4 px-4 py-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-5 w-52" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="hidden h-3 w-64 lg:block" />
            <Skeleton className="h-7 w-[68px]" />
          </div>
        </Card>
      ))}
    </div>
  );
}
