"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Spinner } from "@/components/ui";
import { formatBytes, STATUS_META } from "@/lib/utils";

interface Log {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

interface Detail {
  id: string;
  name: string;
  instanceType: string;
  diskCategory: string;
  diskSize: number;
  bandwidth: number;
  imageUri: string;
  features: { id: string; name: string; version: string }[];
  gitRepoUrl: string | null;
  gitBranch: string | null;
  region: string;
  createdAt: string;
  state: {
    status: string;
    instanceId: string | null;
    publicIp: string | null;
    port: number | null;
    accessToken: string | null;
    ossUsageBytes: number | null;
    releasedAt: string | null;
  } | null;
  logs: Log[];
}

export function WorkspaceDetail({ id }: { id: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${id}`);
    if (res.status === 404) {
      router.replace("/");
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setDetail(data.workspace);
    }
  }, [id, router]);

  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (
        detail?.state?.status === "PROVISIONING" ||
        detail?.state?.status === "TERMINATING"
      ) {
        load();
      }
    }, 8000);
    return () => clearInterval(t);
  }, [load, detail?.state?.status]);

  async function action(path: string, method: string) {
    setBusy(true);
    await fetch(path, { method });
    await load();
    router.refresh();
    setBusy(false);
  }

  if (!detail) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const status = detail.state?.status ?? "STOPPED";
  const meta = STATUS_META[status] ?? STATUS_META.STOPPED;
  const running = status === "RUNNING";
  const ideUrl = running
    ? `http://${detail.state?.publicIp}:${detail.state?.port ?? 8080}`
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{detail.name}</h1>
          <p className="text-sm text-gray-500">
            {detail.instanceType} · {detail.diskCategory} {detail.diskSize}GB ·{" "}
            {detail.bandwidth}Mbps
          </p>
        </div>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>

      {running && ideUrl && (
        <Card className="space-y-3 p-6">
          <h2 className="font-medium">进入 IDE</h2>
          <p className="text-sm text-gray-600">
            地址:{" "}
            <a href={ideUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
              {ideUrl}
            </a>
          </p>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-600">密码:</span>
            <code className="rounded bg-gray-100 px-2 py-1">
              {detail.state?.accessToken}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(detail.state?.accessToken ?? "");
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "已复制" : "复制"}
            </Button>
          </div>
          <div className="flex gap-2">
            <a href={ideUrl} target="_blank" rel="noreferrer">
              <Button>🔗 进入 IDE</Button>
            </a>
            <Button
              variant="secondary"
              onClick={() => action(`/api/workspaces/${id}/renew`, "POST").catch(() => {})}
            >
              续期 +1h
            </Button>
          </div>
        </Card>
      )}

      <Card className="space-y-4 p-6">
        <h2 className="font-medium">操作</h2>
        <div className="flex flex-wrap gap-2">
          {status === "STOPPED" && (
            <>
              <Button
                disabled={busy}
                onClick={() => action(`/api/workspaces/${id}/start`, "POST")}
              >
                按量启动
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  action(`/api/workspaces/${id}/start`, "POST")
                }
              >
                抢占式启动
              </Button>
            </>
          )}
          {running && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => action(`/api/workspaces/${id}/stop`, "POST")}
            >
              停止
            </Button>
          )}
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              if (confirm("确定删除该工作区？OSS 数据将被清除，不可恢复。")) {
                await action(`/api/workspaces/${id}`, "DELETE");
                router.push("/");
              }
            }}
          >
            删除工作区
          </Button>
        </div>
        <p className="text-sm text-gray-500">
          OSS 占用: {formatBytes(detail.state?.ossUsageBytes)} · 最后释放:{" "}
          {detail.state?.releasedAt
            ? new Date(detail.state.releasedAt).toLocaleString()
            : "—"}
        </p>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 font-medium">操作历史</h2>
        {detail.logs.length === 0 ? (
          <p className="text-sm text-gray-400">暂无记录</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {detail.logs.map((log) => (
              <li key={log.id} className="flex items-center gap-3">
                <span className="text-gray-400">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
                <Badge tone="gray">{log.action}</Badge>
                <span className="text-gray-600">
                  {log.details?.instanceId
                    ? `ecs.${log.details.instanceId}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
