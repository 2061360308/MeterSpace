"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { formatBytes, formatRelativeTime, STATUS_META } from "@/lib/utils";

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
  imageUri: string;
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

export function WorkspaceList() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const wsRes = await fetch("/api/workspaces");
    if (wsRes.ok) {
      const data = await wsRes.json();
      setWorkspaces(data.workspaces);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  async function handleAction(path: string, method: string) {
    setBusyId(path);
    setError("");
    const res = await fetch(path, { method });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "操作失败，请重试");
    }
    await load();
    router.refresh();
    setBusyId(null);
  }

  async function openWorkbench(instanceId?: string | null) {
    if (!instanceId) return;
    setBusyId(instanceId);
    setError("");
    try {
      const res = await fetch(`/api/instances/${instanceId}/access-link`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        router.push(data.url);
        return;
      }
    } catch {
      // 网络异常，走失败提示
    }
    setBusyId(null);
    setError("无法打开工作台，请重试");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4">
        <h1 className="text-xl font-semibold">工作区</h1>
        <Link href="/workspaces/new">
          <Button>
            <FolderCode className="mr-2 h-4 w-4" />
            新建工作区
          </Button>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            <button className="ml-2 underline" onClick={() => setError("")}>
              关闭
            </button>
          </div>
        )}

        {workspaces.length === 0 ? (
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
              const meta = STATUS_META[status] ?? STATUS_META.STOPPED;
              const isRunning = status === "RUNNING";
              const isBusy = status === "PROVISIONING" || status === "TERMINATING";
              const imageName = w.imageUri.split("/").pop() ?? w.imageUri;
              const providerLabel = w.provider === "aliyun" ? "阿里云" : w.provider;
              const featureNames = w.features?.map((f) => f.name).join(", ");
              const displayFeatures = featureNames
                ? featureNames.length > 30
                  ? featureNames.slice(0, 30) + "..."
                  : featureNames
                : "-";

              return (
                <Card key={w.id} className="py-0 gap-0 overflow-hidden">
                  <CardContent className="px-4 py-3">
                    <div className="flex items-center gap-4">
                      {/* 左侧信息区 */}
                      <div className="flex-1 min-w-0">
                        {/* 上方：镜像名称 */}
                        <div className="text-[11px] text-muted-foreground font-mono truncate mb-1">
                          {imageName}
                        </div>
                        {/* 中间：名称 + 状态徽章 */}
                        <div className="flex items-center gap-2 mb-1">
                          <Link
                            href={`/workspaces/${w.id}`}
                            className="text-lg font-semibold truncate hover:underline"
                          >
                            {w.name}
                          </Link>
                          <Badge tone={meta.tone} className="shrink-0 text-[10px] px-1.5 py-0">
                            {meta.label}
                          </Badge>
                        </div>
                        {/* 下方：features + scripts */}
                        <div className="text-xs text-muted-foreground truncate">
                          {displayFeatures}
                        </div>
                      </div>

                      {/* 中间：OSS + 时间 */}
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                        <span>{providerLabel} · {w.region}</span>
                        <span>·</span>
                        <HardDrive className="h-3.5 w-3.5" />
                        <span>{formatBytes(w.state?.ossUsageBytes)}</span>
                        <span>·</span>
                        <span>{w.state?.lastActiveAt ? `Last used ${formatRelativeTime(w.state.lastActiveAt)}` : "从未启动"}</span>
                      </div>

                      {/* 右侧：按钮组 */}
                      <div className="flex items-center shrink-0">
                        <ButtonGroup>
                          {isRunning ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 w-8 p-0"
                                disabled={busyId !== null}
                                onClick={() => openWorkbench(w.state?.instanceId)}
                              >
                                <Play className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 w-8 p-0"
                                disabled={busyId !== null}
                                onClick={() => handleAction(`/api/workspaces/${w.id}/stop`, "POST")}
                              >
                                <Square className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-8 p-0"
                              disabled={busyId !== null || isBusy}
                              onClick={() => router.push(`/workspaces/${w.id}?tab=specs`)}
                            >
                              {isBusy ? (
                                <Spinner className="h-3.5 w-3.5" />
                              ) : (
                                <Play className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          )}

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {isRunning ? (
                                <DropdownMenuItem onClick={() => handleAction(`/api/workspaces/${w.id}/stop`, "POST")}>
                                  <Square className="mr-2 h-4 w-4" />
                                  停止
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem disabled={isBusy} onClick={() => handleAction(`/api/workspaces/${w.id}/start`, "POST")}>
                                  <Play className="mr-2 h-4 w-4" />
                                  启动
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem>
                                <Share2 className="mr-2 h-4 w-4" />
                                分享
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Pencil className="mr-2 h-4 w-4" />
                                重命名
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onClick={() => handleAction(`/api/workspaces/${w.id}`, "DELETE")}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                删除
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </ButtonGroup>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
