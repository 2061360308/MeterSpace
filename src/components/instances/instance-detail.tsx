"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { STATUS_META, formatBytes } from "@/lib/utils";

interface InstanceLog {
  id: string;
  timestamp: string;
  level: string;
  phase: string | null;
  message: string;
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
  lastActiveAt: string | null;
  ossUsageBytes: number | null;
  stoppedAt: string | null;
  stopReason: string | null;
  createdAt: string;
  workspaceName: string;
  cloudInstanceName: string | null;
  cloudInstanceType: string | null;
  logs: InstanceLog[];
}

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

export function InstanceDetail({ id }: { id: string }) {
  const router = useRouter();
  const [instance, setInstance] = useState<Instance | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/instances/${id}`);
    if (res.status === 404) {
      router.replace("/");
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setInstance(data.instance);
    }
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!instance) return;
    if (instance.status === "STOPPED" || instance.status === "FAILED") return;

    const eventSource = new EventSource(`/api/instances/${id}/logs/stream`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "done") {
        eventSource.close();
        load();
        return;
      }
      setInstance((prev) => {
        if (!prev) return prev;
        const exists = prev.logs.some((l) => l.id === data.id);
        if (exists) return prev;
        return { ...prev, logs: [...prev.logs, data] };
      });
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [id, instance?.status, load]);

  useEffect(() => {
    if (!instance) return;
    if (instance.status !== "PROVISIONING" && instance.status !== "BOOTING") return;

    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [instance?.status, load]);

  async function handleStop() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/instances/${id}/stop`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "停止失败");
    }
    await load();
    setBusy(false);
  }

  if (!instance) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const status = instance.status;
  const meta = STATUS_META[status] ?? STATUS_META.STOPPED;
  const isRunning = status === "RUNNING";
  const isBooting = status === "PROVISIONING" || status === "BOOTING";
  const ideUrl = isRunning
    ? `http://${instance.publicIp}:${instance.port ?? 8080}`
    : null;

  const currentPhaseIndex = instance.bootPhase
    ? BOOT_PHASES.findIndex((p) => p.key === instance.bootPhase)
    : -1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href={`/workspaces/${instance.workspaceId}`}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              ← {instance.workspaceName}
            </Link>
          </div>
          <h1 className="text-xl font-semibold">实例</h1>
          <p className="text-sm text-gray-500">
            {instance.cloudInstanceName ?? ""} · {instance.cloudInstanceType ?? ""} ·{" "}
            {instance.diskSize}GB · {instance.bandwidth}Mbps
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {isBooting && instance.bootStartedAt && (
            <span className="text-sm text-gray-500">
              耗时: {formatDuration(instance.bootStartedAt)}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button className="ml-2 underline" onClick={() => setError("")}>
            关闭
          </button>
        </div>
      )}

      {status === "FAILED" && instance.bootError && (
        <Card className="p-4">
          <h2 className="font-medium text-red-600">启动失败</h2>
          <p className="mt-2 text-sm text-gray-600">{instance.bootError}</p>
          <Button
            className="mt-4"
            size="sm"
            onClick={() => router.push(`/workspaces/${instance.workspaceId}`)}
          >
            返回工作区
          </Button>
        </Card>
      )}

      {isBooting && (
        <Card className="p-6">
          <h2 className="mb-4 font-medium">启动进度</h2>
          <div className="space-y-2">
            {BOOT_PHASES.map((phase, index) => {
              const isCompleted = currentPhaseIndex > index;
              const isCurrent = currentPhaseIndex === index;
              return (
                <div
                  key={phase.key}
                  className={`flex items-center gap-3 text-sm ${
                    isCompleted
                      ? "text-green-600"
                      : isCurrent
                        ? "text-blue-600"
                        : "text-gray-400"
                  }`}
                >
                  <span className="w-5 text-center">
                    {isCompleted ? "✓" : isCurrent ? "●" : "○"}
                  </span>
                  <span>{phase.label}</span>
                  {isCurrent && (
                    <Spinner className="h-4 w-4" />
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {isRunning && ideUrl && (
        <Card className="space-y-3 p-6">
          <h2 className="font-medium">访问方式</h2>
          <p className="text-sm text-gray-600">
            IDE 地址:{" "}
            <a
              href={ideUrl}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline"
            >
              {ideUrl}
            </a>
          </p>
          <div className="flex gap-2">
            <a href={ideUrl} target="_blank" rel="noreferrer">
              <Button>进入 IDE</Button>
            </a>
            <Button variant="secondary" onClick={handleStop} disabled={busy}>
              停止实例
            </Button>
          </div>
        </Card>
      )}

      {!isRunning && !isBooting && status !== "FAILED" && (
        <Card className="p-6">
          <h2 className="font-medium">实例已停止</h2>
          <p className="mt-2 text-sm text-gray-600">
            {instance.stoppedAt && (
              <>停止时间: {new Date(instance.stoppedAt).toLocaleString()}</>
            )}
            {instance.stopReason && <> · 原因: {instance.stopReason}</>}
          </p>
          <Button
            className="mt-4"
            size="sm"
            onClick={() => router.push(`/workspaces/${instance.workspaceId}`)}
          >
            返回工作区
          </Button>
        </Card>
      )}

      <Card className="p-6">
        <h2 className="mb-4 font-medium">实例日志</h2>
        {instance.logs.length === 0 ? (
          <p className="text-sm text-gray-400">暂无日志</p>
        ) : (
          <div className="max-h-96 overflow-y-auto rounded bg-gray-900 p-4 font-mono text-xs">
            {instance.logs.map((log, index) => (
              <div key={index} className="flex gap-2">
                <span className="text-gray-500">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span
                  className={
                    log.level === "error"
                      ? "text-red-400"
                      : log.level === "warn"
                        ? "text-yellow-400"
                        : "text-green-400"
                  }
                >
                  [{log.level.toUpperCase()}]
                </span>
                {log.phase && (
                  <span className="text-blue-400">[{log.phase}]</span>
                )}
                <span className="text-gray-300">{log.message}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 font-medium">实例信息</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-gray-500">实例 ID</dt>
          <dd className="font-mono">{instance.id}</dd>
          <dt className="text-gray-500">ECS 实例 ID</dt>
          <dd className="font-mono">{instance.ecsInstanceId ?? "—"}</dd>
          <dt className="text-gray-500">公网 IP</dt>
          <dd>{instance.publicIp ?? "—"}</dd>
          <dt className="text-gray-500">端口</dt>
          <dd>{instance.port ?? "—"}</dd>
          <dt className="text-gray-500">创建时间</dt>
          <dd>{new Date(instance.createdAt).toLocaleString()}</dd>
          <dt className="text-gray-500">完成时间</dt>
          <dd>
            {instance.bootCompletedAt
              ? new Date(instance.bootCompletedAt).toLocaleString()
              : "—"}
          </dd>
          <dt className="text-gray-500">OSS 占用</dt>
          <dd>{formatBytes(instance.ossUsageBytes)}</dd>
        </dl>
      </Card>
    </div>
  );
}

function formatDuration(startIso: string): string {
  const start = new Date(startIso).getTime();
  const now = Date.now();
  const diff = Math.floor((now - start) / 1000);
  const minutes = Math.floor(diff / 60);
  const seconds = diff % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
