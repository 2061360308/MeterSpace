"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface LogEntry {
  timestamp: string;
  level: string;
  phase: string | null;
  message: string;
}

interface Snapshot {
  status: string;
  bootPhase: string | null;
  bootError: string | null;
  cloudStatus: string | null;
  publicIp: string | null;
  port: number | null;
  bootStartedAt: string | null;
  bootCompletedAt: string | null;
  createdAt: string | null;
  workspaceName: string;
  imageUri: string;
  region: string;
  provider: string;
  instanceType: string | null;
  cpu: number | null;
  memoryMb: number | null;
  diskSize: number;
  bandwidth: number;
  allowedPorts: number[];
  logs: LogEntry[];
}

export default function AccessPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const instanceId = (params.instanceId as string) ?? "";
  const code = searchParams.get("code") ?? "";

  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const sinceRef = useRef<string | undefined>(undefined);
  const cloudRequestedRef = useRef(false);

  // IP 白名单授权：后台并行执行，不阻塞视图；5xx/网络错误后台重试，4xx 停止
  useEffect(() => {
    if (!code) {
      setError("缺少访问码");
      return;
    }
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      try {
        const res = await fetch(`/api/access/${instanceId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code }),
        });
        if (cancelled) return;
        if (res.ok || res.status < 500) return;
        retry = setTimeout(run, 5000);
      } catch {
        if (!cancelled) retry = setTimeout(run, 5000);
      }
    };
    run();

    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      clearInterval(timer);
    };
  }, [instanceId, code]);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const q = new URLSearchParams({ code });
        if (sinceRef.current) q.set("since", sinceRef.current);
        const res = await fetch(`/api/access/${instanceId}?${q.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "查询失败");
        if (cancelled) return;

        const snap: Snapshot = data.snapshot;
        setSnapshot((prev) =>
          prev && prev.cloudStatus ? { ...snap, cloudStatus: prev.cloudStatus } : snap,
        );

        const incoming = snap.logs ?? [];
        setLogs((prev) => {
          const last = prev[prev.length - 1]?.timestamp;
          const startIdx = last
            ? incoming.findIndex((l) => l.timestamp > last)
            : 0;
          const appended = startIdx >= 0 ? incoming.slice(startIdx) : [];
          const next = [...prev, ...appended];
          if (next.length > 0) {
            sinceRef.current = next[next.length - 1].timestamp;
          }
          return next;
        });

        if (snap.status === "RUNNING") {
          setReady(true);
          return;
        }
        if (snap.status === "FAILED" || snap.status === "TERMINATING") {
          setError(snap.bootError ?? "实例创建失败");
          return;
        }
        timer = setTimeout(tick, 3000);
      } catch {
        if (!cancelled) {
          timer = setTimeout(tick, 5000);
        }
      }
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [instanceId, code]);

  // 首屏后异步补充一次 ECS 实时状态（不阻塞首帧）
  useEffect(() => {
    if (!snapshot || cloudRequestedRef.current) return;
    if (snapshot.status !== "PROVISIONING" && snapshot.status !== "BOOTING") return;

    cloudRequestedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const q = new URLSearchParams({ code, cloud: "1" });
        const res = await fetch(`/api/access/${instanceId}?${q.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok) return;
        const snap: Snapshot = data.snapshot;
        setSnapshot((prev) => (prev ? { ...prev, cloudStatus: snap.cloudStatus } : prev));
      } catch {
        // 忽略，步骤 detail 不带实时 ECS 状态
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [snapshot, instanceId, code]);

  if (error) return <ErrorView message={error} />;
  if (!snapshot) return <LoadingView />;

  if (ready) return <SuccessView snapshot={snapshot} now={now} />;

  return (
    <CreatingView snapshot={snapshot} logs={logs} now={now} />
  );
}

/* ---------- 公共 ---------- */

function Logo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 font-bold text-white",
        className,
      )}
    >
      W
    </div>
  );
}

function formatElapsed(startIso: string | null, endIso: string | null | undefined, now: number): string {
  const start = startIso ? new Date(startIso).getTime() : now;
  if (!start) return "00:00";
  const end = endIso ? new Date(endIso).getTime() : now;
  const diff = Math.max(0, Math.floor((end - start) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function LoaderCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex items-center gap-3 text-slate-300">{children}</div>
    </div>
  );
}

function LoadingView() {
  return (
    <LoaderCard>
      <Spinner className="h-5 w-5" />
      <span>正在加载实例...</span>
    </LoaderCard>
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
        <div className="text-lg font-semibold text-red-300">无法访问实例</div>
        <p className="mt-2 text-sm text-slate-300">{message}</p>
      </div>
    </div>
  );
}

/* ---------- 创建中视图 ---------- */

interface StepDef {
  key: string;
  title: string;
  detail?: string;
}

function computeSteps(snapshot: Snapshot): { steps: StepDef[]; current: number } {
  const { status, cloudStatus, bootPhase } = snapshot;

  const steps: StepDef[] = [
    {
      key: "ecs",
      title: "创建云服务器",
      detail: cloudStatus ? `ECS 状态 ${cloudStatus}` : "等待云厂商下发实例",
    },
    {
      key: "env",
      title: "初始化开发环境",
      detail: bootPhase ?? "正在拉取镜像并启动容器",
    },
    {
      key: "ready",
      title: "环境就绪",
    },
  ];

  let current = 0;
  if (status === "RUNNING") current = steps.length;
  else if (
    cloudStatus !== null &&
    cloudStatus.toLowerCase() !== "pending" &&
    cloudStatus.toLowerCase() !== "starting"
  ) {
    current = 1;
  }
  return { steps, current };
}

function CreatingView({
  snapshot,
  logs,
  now,
}: {
  snapshot: Snapshot;
  logs: LogEntry[];
  now: number;
}) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  const { steps, current } = computeSteps(snapshot);

  const rows = [
    {
      label: "规格",
      value: snapshot.instanceType
        ? `${snapshot.instanceType} ${snapshot.cpu ?? "?"}核 ${snapshot.memoryMb ?? "?"}GB`
        : "—",
    },
    { label: "磁盘", value: `${snapshot.diskSize} GB` },
    { label: "带宽", value: `${snapshot.bandwidth} Mbps` },
  ];

  return (
    <div className="relative h-full">
      {/* 背景日志 */}
      <div
        ref={logRef}
        className="absolute inset-0 overflow-y-auto bg-black p-6 font-mono text-xs leading-5 text-emerald-400/60"
      >
        {logs.length === 0 && (
          <div className="text-slate-600">等待日志输出...</div>
        )}
        {logs.map((l, i) => (
          <div key={`${l.timestamp}-${i}`} className="whitespace-pre-wrap">
            {l.message}
          </div>
        ))}
      </div>

      {/* 半透明遮罩 */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />

      {/* 中央卡片 */}
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div className="w-[80vw] rounded-2xl border border-white/15 bg-white/10 bg-gradient-to-br from-white/25 via-white/[0.06] to-white/0 p-6 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Logo />
              <div className="text-xl font-semibold text-white">环境创建中</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-white/50">已创建</div>
              <div className="font-mono text-lg text-white">
                {formatElapsed(
                  snapshot.bootStartedAt ?? snapshot.createdAt,
                  undefined,
                  now,
                )}
              </div>
            </div>
          </div>

          {/* 状态一行 */}
          <div className="mt-6 flex items-center gap-2">
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs",
                current >= steps.length
                  ? "bg-emerald-500 text-white"
                  : "bg-white/20 text-white",
              )}
            >
              {current >= steps.length ? "✓" : <Spinner className="h-3 w-3" />}
            </span>
            <span className="shrink-0 text-sm text-white">
              {current >= steps.length
                ? "环境就绪"
                : (steps[current]?.title ?? "准备中")}
            </span>
            {current < steps.length && steps[current]?.detail && (
              <span className="truncate text-xs text-white/50">
                {steps[current]?.detail}
              </span>
            )}
          </div>

          <Separator className="my-6 bg-white/20" />

          {/* 信息行 */}
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center gap-2 text-sm">
                <span className="shrink-0 text-xs text-white/50">{r.label}</span>
                <span className="min-w-0 truncate text-white" title={r.value}>
                  {r.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- 成功视图 ---------- */

interface EditorLink {
  id: string;
  label: string;
  desc: string;
  url: string;
}

function buildEditorLinks(snapshot: Snapshot): EditorLink[] {
  const host = snapshot.publicIp ?? "";
  const port = snapshot.port ?? 8080;
  const baseUrl = `http://${host}:${port}`;
  return [
    { id: "webide", label: "WebIDE", desc: "浏览器直接打开", url: baseUrl },
    {
      id: "vscode",
      label: "VSCode",
      desc: "VSCode 客户端连接",
      url: host ? `vscode://vscode-remote/ssh-remote+${host}/workspace` : baseUrl,
    },
    {
      id: "cursor",
      label: "Cursor",
      desc: "Cursor 客户端连接",
      url: host ? `cursor://` : baseUrl,
    },
    {
      id: "windsurf",
      label: "Windsurf",
      desc: "Codeium Windsurf",
      url: host ? `windsurf://` : baseUrl,
    },
    {
      id: "antigravity",
      label: "Antigravity",
      desc: "Google Antigravity",
      url: host ? `antigravity://` : baseUrl,
    },
    {
      id: "zed",
      label: "Zed",
      desc: "Zed 编辑器",
      url: host ? `zed://` : baseUrl,
    },
  ];
}

function SuccessView({ snapshot, now }: { snapshot: Snapshot; now: number }) {
  const links = buildEditorLinks(snapshot);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div className="flex items-center gap-3">
          <Logo className="h-8 w-8" />
          <div>
            <div className="text-lg font-semibold">工作区创建成功</div>
            <div className="text-xs text-white/60">
              {snapshot.workspaceName} · {snapshot.region}
            </div>
          </div>
        </div>
        <div className="hidden items-center gap-6 text-sm sm:flex">
          <div className="text-right">
            <div className="text-xs text-white/50">CPU / 内存</div>
            <div className="font-medium">
              {snapshot.cpu != null ? `${snapshot.cpu} 核` : "—"} /{" "}
              {snapshot.memoryMb != null ? `${snapshot.memoryMb} GB` : "—"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-white/50">耗时</div>
            <div className="font-medium">
              {formatElapsed(
                snapshot.bootStartedAt ?? snapshot.createdAt,
                snapshot.bootCompletedAt,
                now,
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {links[0]?.url && (
          <div className="mx-auto max-w-3xl">
            <a
              href={links[0].url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 px-6 py-3 text-base font-semibold text-white transition hover:opacity-90"
            >
              打开工作台
              <span>↗</span>
            </a>
            <div className="mt-2 text-center text-xs text-white/40">
              浏览器打开 VS Code Web 环境（地址
              {` ${snapshot.publicIp}:${snapshot.port ?? 8080}`}）
            </div>
          </div>
        )}
        <div className="mx-auto mt-6 grid max-w-3xl grid-cols-2 gap-4 md:grid-cols-3">
          {links.map((l) => (
            <a
              key={l.id}
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="group rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-white/30 hover:bg-white/10"
            >
              <div className="flex items-center justify-between">
                <div className="font-medium">{l.label}</div>
                <span className="text-white/40 transition group-hover:text-white">
                  ↗
                </span>
              </div>
              <div className="mt-1 text-xs text-white/50">{l.desc}</div>
            </a>
          ))}
        </div>
        {snapshot.publicIp && (
          <p className="mt-6 text-center text-xs text-white/40">
            访问地址 {`http://${snapshot.publicIp}:${snapshot.port ?? 8080}`}
          </p>
        )}
      </main>
    </div>
  );
}