"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
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
}

interface Detail {
  id: string;
  name: string;
  provider: string;
  region: string;
  cloudInstanceName: string | null;
  cloudInstanceType: string | null;
  defaultDiskSize: number | null;
  defaultBandwidth: number | null;
  imageUri: string;
  features: { id: string; name: string; version: string }[];
  gitRepoUrl: string | null;
  gitBranch: string | null;
  createdAt: string;
}

export function WorkspaceDetail({ id }: { id: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

  async function handleStart() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/workspaces/${id}/instances`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "启动失败");
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
  const historyInstances = instances.filter(
    (i) => i.status === "STOPPED" || i.status === "FAILED",
  );

  const isRunning = currentInstance?.status === "RUNNING";
  const isBooting =
    currentInstance?.status === "PROVISIONING" || currentInstance?.status === "BOOTING";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{detail.name}</h1>
          <p className="text-sm text-gray-500">
            {detail.region} · {detail.cloudInstanceName ?? "未绑定弹性规格"} ·{" "}
            {detail.cloudInstanceType ?? ""} · {detail.imageUri.split("/").pop()}
          </p>
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

      {currentInstance && (
        <Card className="space-y-3 p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">当前实例</h2>
            <Badge tone={STATUS_META[currentInstance.status]?.tone ?? "gray"}>
              {STATUS_META[currentInstance.status]?.label ?? currentInstance.status}
            </Badge>
          </div>
          <div className="text-sm text-gray-600">
            <p>
              配置: {currentInstance.diskSize}GB · {currentInstance.bandwidth}Mbps
            </p>
            {currentInstance.publicIp && (
              <p>
                地址: {currentInstance.publicIp}:{currentInstance.port ?? 8080}
              </p>
            )}
            {currentInstance.bootError && (
              <p className="text-red-600">错误: {currentInstance.bootError}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Link href={`/instances/${currentInstance.id}`}>
              <Button size="sm">
                {isRunning ? "查看详情" : isBooting ? "查看进度" : "查看详情"}
              </Button>
            </Link>
            {isRunning && (
              <a
                href={`http://${currentInstance.publicIp}:${currentInstance.port ?? 8080}`}
                target="_blank"
                rel="noreferrer"
              >
                <Button size="sm" variant="secondary">
                  进入 IDE
                </Button>
              </a>
            )}
          </div>
        </Card>
      )}

      {!currentInstance && (
        <Card className="p-6">
          <h2 className="font-medium">启动新实例</h2>
          <p className="mt-2 text-sm text-gray-600">
            当前没有运行中的实例。启动后将创建一个新的 ECS 实例。
          </p>
          <Button className="mt-4" disabled={busy} onClick={handleStart}>
            {busy ? <Spinner className="mr-2 h-4 w-4" /> : null}
            启动实例
          </Button>
        </Card>
      )}

      {historyInstances.length > 0 && (
        <Card className="p-6">
          <h2 className="mb-4 font-medium">历史实例</h2>
          <div className="space-y-3">
            {historyInstances.map((instance) => (
              <div
                key={instance.id}
                className="flex items-center justify-between rounded border p-3"
              >
                <div className="text-sm">
                  <div className="flex items-center gap-2">
                    <Badge tone={STATUS_META[instance.status]?.tone ?? "gray"}>
                      {STATUS_META[instance.status]?.label ?? instance.status}
                    </Badge>
                    <span className="text-gray-500">
                      {new Date(instance.createdAt).toLocaleString()}
                    </span>
                    {instance.stoppedAt && (
                      <span className="text-gray-400">
                        → {new Date(instance.stoppedAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {instance.diskSize}GB · {instance.bandwidth}Mbps
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
        </Card>
      )}

      <Card className="p-6">
        <h2 className="mb-4 font-medium">工作区配置</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-gray-500">区域</dt>
          <dd>{detail.region}</dd>
          <dt className="text-gray-500">规格</dt>
          <dd>{detail.cloudInstanceName ?? "未绑定"}</dd>
          <dt className="text-gray-500">镜像</dt>
          <dd className="font-mono text-xs">{detail.imageUri}</dd>
          <dt className="text-gray-500">默认磁盘</dt>
          <dd>{detail.defaultDiskSize ?? 40}GB</dd>
          <dt className="text-gray-500">默认带宽</dt>
          <dd>{detail.defaultBandwidth ?? 10}Mbps</dd>
          {detail.gitRepoUrl && (
            <>
              <dt className="text-gray-500">代码仓库</dt>
              <dd className="font-mono text-xs">{detail.gitRepoUrl}</dd>
              <dt className="text-gray-500">分支</dt>
              <dd>{detail.gitBranch ?? "main"}</dd>
            </>
          )}
          {detail.features && detail.features.length > 0 && (
            <>
              <dt className="text-gray-500">开发环境</dt>
              <dd>{detail.features.map((f) => f.name).join(", ")}</dd>
            </>
          )}
        </dl>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 font-medium">操作</h2>
        <div className="flex gap-2">
          <Button variant="destructive" disabled={busy} onClick={handleDelete}>
            删除工作区
          </Button>
        </div>
      </Card>
    </div>
  );
}
