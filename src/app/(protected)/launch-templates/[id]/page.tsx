"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { APIError } from "@/components/ui/error";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { CodeEditor, detect } from "@/components/ui/code-editor";
import {
  fetchLaunchTemplate,
  deleteLaunchTemplate,
  CATEGORY_LABEL,
  entryKindLabel,
  ORIGIN_LABEL,
} from "@/lib/launch-templates/client";
import type { LaunchTemplateDetail } from "@/lib/launch-templates/client";

/**
 * /launch-templates/[id] —— 启动模板详情（**只读**）。
 *
 * 与配方详情同样禁止在浏览器内编辑；要修改就下载 → IDE 改 → 重新上传到
 * /launch-templates/new/upload。系统不维护「就地编辑」链路（v3 设计意图）。
 */
export default function LaunchTemplateDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);

  const [detail, setDetail] = React.useState<LaunchTemplateDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [activeFilePath, setActiveFilePath] = React.useState<string>("");
  const [busyDelete, setBusyDelete] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const d = await fetchLaunchTemplate(id);
      setDetail(d);
      if (d.payload.length > 0) {
        const entry = d.payload.find((f) => f.path === d.entry);
        setActiveFilePath(entry?.path ?? d.payload[0].path);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async () => {
    if (!detail) return;
    if (!confirm(`确认删除启动模板「${detail.name}」？此操作不可撤销。`)) return;
    setBusyDelete(true);
    try {
      await deleteLaunchTemplate(detail.id);
      toast.success("已删除");
      router.push("/launch-templates");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyDelete(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="启动模板详情" />
        <Card className="px-5 py-12 text-center text-[13px] text-muted-foreground">
          <Loader2 className="mx-auto size-5 animate-spin" />
        </Card>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-6">
        <PageHeader title="启动模板详情" />
        {error && <APIError message={error} />}
      </div>
    );
  }

  const activeFile = detail.payload.find((f) => f.path === activeFilePath);
  const ports = (detail.activity?.ports ?? []).filter((p) => !p.private);

  return (
    <div className="space-y-6">
      <PageHeader
        title={detail.name}
        description={
          <span className="flex items-center gap-2">
            <Link href="/launch-templates" className="hover:underline">
              <ArrowLeft className="inline size-4" />
              启动模板
            </Link>
            <span className="font-mono text-muted-foreground">·</span>
            <span className="font-mono text-muted-foreground">{detail.id}</span>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" asChild>
              <Link
                href={`/workspaces/new?launchTemplate=${encodeURIComponent(detail.id)}`}
              >
                创建工作区
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a
                href={`/api/launch-templates/${encodeURIComponent(detail.id)}/download`}
              >
                <Download className="size-4" />
                下载 zip
              </a>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDelete}
              disabled={busyDelete}
            >
              <Trash2 className="size-4" />
              删除
            </Button>
          </div>
        }
      />

      {error && <APIError message={error} />}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="space-y-3 px-5 py-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="green">可绑定</Badge>
            <Badge tone="gray">{entryKindLabel(detail.entry)}</Badge>
            {detail.category && (
              <Badge tone="gray">
                {CATEGORY_LABEL[detail.category] ?? detail.category}
              </Badge>
            )}
            {detail.tags.length > 0 &&
              detail.tags.map((t) => (
                <Badge key={t} tone="gray">
                  #{t}
                </Badge>
              ))}
            <Badge tone="gray">来源：{ORIGIN_LABEL[detail.originKind as "recipe" | "upload" | "migration"] ?? detail.originKind}</Badge>
            {detail.originRecipeId && (
              <Badge tone="gray">
                原配方：<span className="font-mono">{detail.originRecipeId}</span>
              </Badge>
            )}
          </div>
          <p className="text-[13px] leading-6 text-muted-foreground">
            {detail.description ?? "—"}
          </p>
        </Card>

        <div className="space-y-4">
          <SectionHeader title="契约与超时" />
          <Card className="space-y-2 px-5 py-4">
            <p className="flex items-baseline gap-2">
              <span className="text-muted-foreground">入口超时：</span>
              <span>{Math.round(detail.entryTimeout / 60)} 分钟</span>
            </p>
            <p className="flex items-baseline gap-2">
              <span className="text-muted-foreground">闲置阈值：</span>
              <span>{detail.activity?.idleMinutes ?? 30} 分钟</span>
            </p>
            <p className="text-[12px] leading-5 text-muted-foreground">
              入口是{detail.entry.endsWith(".sh") ? (
                <span className="font-mono"> Shell 脚本</span>
              ) : (
                " 命令型模板，按容器方式认同态"
              )}
              ；部署慢的集成请自行后台化（nohup / docker compose up -d）。
            </p>
          </Card>

          <SectionHeader title="端口" />
          {ports.length === 0 ? (
            <Card className="px-5 py-4 text-center text-[13px] text-muted-foreground">
              无
            </Card>
          ) : (
            <Card className="space-y-2 px-5 py-4">
              <div className="flex flex-wrap gap-1.5 font-mono text-[12px] leading-5 text-muted-foreground">
                {ports.map((p) => (
                  <span key={p.port} className="rounded bg-muted px-1.5 py-0.5">
                    :{p.port}
                    {p.label ? ` ${p.label}` : ""}
                  </span>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {detail.payload.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <Card className="overflow-hidden p-0">
            <div className="border-b px-4 py-2 text-[12px] uppercase tracking-wide text-muted-foreground">
              files
            </div>
            <ul className="divide-y text-[13px] leading-6">
              {detail.payload.map((f) => (
                <li key={f.path}>
                  <button
                    type="button"
                    className={
                      "flex w-full items-center justify-between gap-2 px-4 py-2 text-left font-mono text-[12px] hover:bg-muted " +
                      (activeFilePath === f.path ? "bg-muted font-semibold" : "")
                    }
                    onClick={() => setActiveFilePath(f.path)}
                  >
                    <span className="truncate">{f.path}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {humanSize(f.size)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="overflow-hidden p-0">
            {activeFile ? (
              <CodeEditor
                value={activeFile.content}
                language={detect(activeFile.path)}
                readOnly
                minHeight={420}
                onChange={() => {
                  /* readOnly — no-op */
                }}
              />
            ) : (
              <div className="px-5 py-12 text-center text-[13px] text-muted-foreground">
                选个文件看看
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function humanSize(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}
