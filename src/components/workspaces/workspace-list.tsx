"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconFolderCode } from "@tabler/icons-react";
import { ArrowUpRightIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { formatBytes, STATUS_META } from "@/lib/utils";

interface WorkspaceRow {
  id: string;
  name: string;
  instanceType: string;
  imageUri: string;
  createdAt: string;
  state: {
    status: string;
    publicIp?: string | null;
    port?: number | null;
    ossUsageBytes?: number | null;
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

  async function action(path: string, method: string) {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button
            className="ml-2 underline"
            onClick={() => setError("")}
          >
            关闭
          </button>
        </div>
      )}

      {workspaces.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconFolderCode />
            </EmptyMedia>
            <EmptyTitle>还没有工作区</EmptyTitle>
            <EmptyDescription>
              您还没有创建任何工作区。点击下方按钮开始创建您的第一个云端开发环境。
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex gap-2">
              <Link href="/workspaces/new">
                <Button>新建工作区</Button>
              </Link>
              <Button variant="outline">导入项目</Button>
            </div>
          </EmptyContent>
          <Button
            variant="link"
            asChild
            className="text-muted-foreground"
            size="sm"
          >
            <a href="/docs">
              了解更多 <ArrowUpRightIcon />
            </a>
          </Button>
        </Empty>
      ) : (
        <>
          <div className="flex justify-end">
            <Link href="/workspaces/new">
              <Button>
                <IconFolderCode className="mr-2 h-4 w-4" />
                新建工作区
              </Button>
            </Link>
          </div>
          <Card>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">名称</th>
                  <th className="px-4 py-3 font-medium">规格</th>
                  <th className="px-4 py-3 font-medium">镜像</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">OSS 占用</th>
                  <th className="px-4 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
            <tbody>
              {workspaces.map((w) => {
                const status = w.state?.status ?? "STOPPED";
                const meta = STATUS_META[status] ?? STATUS_META.STOPPED;
                return (
                  <tr key={w.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/workspaces/${w.id}`}
                        className="font-medium hover:underline"
                      >
                        {w.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{w.instanceType}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {w.imageUri.split("/").slice(-1)[0]}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatBytes(w.state?.ossUsageBytes)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {status === "RUNNING" && (
                        <>
                          <a
                            href={`http://${w.state?.publicIp}:${w.state?.port ?? 8080}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Button variant="outline" size="sm" className="mr-2">
                              进入
                            </Button>
                          </a>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="mr-2"
                            disabled={busyId !== null}
                            onClick={() =>
                              action(`/api/workspaces/${w.id}/stop`, "POST")
                            }
                          >
                            停止
                          </Button>
                        </>
                      )}
                      {status === "STOPPED" && (
                        <Button
                          variant="default"
                          size="sm"
                          className="mr-2"
                          disabled={busyId !== null}
                          onClick={() =>
                            action(`/api/workspaces/${w.id}/start`, "POST")
                          }
                        >
                          启动
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId !== null}
                        onClick={() =>
                          action(`/api/workspaces/${w.id}`, "DELETE")
                        }
                      >
                        删除
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        </>
      )}
    </div>
  );
}
