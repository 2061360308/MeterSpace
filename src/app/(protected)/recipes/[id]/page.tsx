"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Download, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { APIError } from "@/components/ui/error";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { CodeEditor, detect } from "@/components/ui/code-editor";
import {
  fetchRecipe,
  deleteRecipe,
  CATEGORY_LABEL,
  entryKindLabel,
  SOURCE_LABEL,
} from "@/lib/recipes/client";
import type { RecipeDetail } from "@/lib/recipes/client";

/**
 * /recipes/[id] —— 配方详情（**只读**）。
 *
 * 系统不支持「在浏览器里编辑配方代码」——设计意图请见 docs/TEMPLATE-EDITOR.md v3。
 * 这里只能浏览；要修改，下载 zip → 在 IDE 里改 → 重新上传。
 */
export default function RecipeDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);

  const [detail, setDetail] = React.useState<RecipeDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [activeFilePath, setActiveFilePath] = React.useState<string>("");
  const [busyDelete, setBusyDelete] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const d = await fetchRecipe(id);
      setDetail(d);
      // 优先选 entry；否则第一个文件
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
    if (!confirm(`确认删除配方「${detail.name}」？此操作不可撤销。`)) return;
    setBusyDelete(true);
    try {
      await deleteRecipe(detail.id);
      toast.success("已删除");
      router.push("/recipes");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyDelete(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="配方详情" />
        <Card className="px-5 py-12 text-center text-[13px] text-muted-foreground">
          <Loader2 className="mx-auto size-5 animate-spin" />
        </Card>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-6">
        <PageHeader title="配方详情" />
        {error && <APIError message={error} />}
      </div>
    );
  }

  const activeFile = detail.payload.find((f) => f.path === activeFilePath);
  const ports = (detail.activity?.ports ?? []).filter((p) => !p.private);
  const showDelete =
    detail.source === "user" && !busyDelete;

  return (
    <div className="space-y-6">
      <PageHeader
        title={detail.name}
        description={
          <span className="flex items-center gap-2">
            <Link href="/recipes" className="hover:underline">
              <ArrowLeft className="inline size-4" />
              配方
            </Link>
            <span className="font-mono text-muted-foreground">·</span>
            <span className="font-mono text-muted-foreground">{detail.id}</span>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" asChild>
              <Link href={`/recipes/${encodeURIComponent(detail.id)}/use`}>
                使用配方
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={`/api/recipes/${encodeURIComponent(detail.id)}/download`}>
                <Download className="size-4" />
                下载 zip
              </a>
            </Button>
            {showDelete && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleDelete}
                disabled={busyDelete}
              >
                <Trash2 className="size-4" />
                删除
              </Button>
            )}
          </div>
        }
      />

      {error && <APIError message={error} />}

      {/* 基本信息 + 参数 */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="space-y-3 px-5 py-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="gray">{SOURCE_LABEL[detail.source]}</Badge>
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
          </div>
          <p className="text-[13px] leading-6 text-muted-foreground">
            {detail.description ?? "—"}
          </p>
        </Card>

        <div className="space-y-4">
          <SectionHeader title="参数" />
          {detail.params.length === 0 ? (
            <Card className="px-5 py-4 text-center text-[13px] text-muted-foreground">
              无参数
            </Card>
          ) : (
            <Card className="space-y-2 px-5 py-4">
              {detail.params.map((p) => (
                <div key={p.key} className="space-y-0.5">
                  <div className="flex items-center justify-between text-[13px] leading-6">
                    <span className="font-medium">{p.label}</span>
                    <Badge tone="blue">{p.type}</Badge>
                  </div>
                  <div className="font-mono text-[12px] text-muted-foreground">
                    {`{{${p.key}}}`}
                    {p.required ? " · 必填" : ""}
                  </div>
                </div>
              ))}
            </Card>
          )}
          {ports.length > 0 && (
            <Card className="space-y-2 px-5 py-4">
              <div className="text-[13px] font-medium">端口</div>
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

      {/* 文件（只读 CodeMirror） */}
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
