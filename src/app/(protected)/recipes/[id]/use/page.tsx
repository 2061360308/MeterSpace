"use client";

import * as React from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { APIError } from "@/components/ui/error";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { ParamField } from "@/lib/templates/param-form";
import {
  fetchRecipe,
  applyRecipe,
  CATEGORY_LABEL,
  entryKindLabel,
} from "@/lib/recipes/client";
import type { Param, RecipeDetail } from "@/lib/recipes/client";

/**
 * /recipes/[id]/use —— 使用配方。
 *
 * 两段式：
 *   1. 加载 details → 自动用默认值预填 params
 *   2. 用户确认 → POST /api/recipes/[id]/use → 跳 /launch-templates/[newId]
 *
 * 与 v1 的「Dialog 弹层」相比，**这是一个独立路由**：浏览器历史可回溯、可分享。
 */
export default function RecipeUsePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);

  const [detail, setDetail] = React.useState<RecipeDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [values, setValues] = React.useState<Record<string, unknown>>({});

  React.useEffect(() => {
    setLoading(true);
    fetchRecipe(id)
      .then((d) => {
        setDetail(d);
        // 用默认值预填
        const seed: Record<string, unknown> = {};
        for (const p of d.params) {
          if (p.default !== undefined) seed[p.key] = p.default;
          else if (p.type === "boolean") seed[p.key] = false;
          else if (p.type === "select") seed[p.key] = "";
          else if (p.type === "number") seed[p.key] = "";
          else seed[p.key] = "";
        }
        setValues(seed);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleConfirm = async () => {
    if (!detail) return;
    setBusy(true);
    setError("");
    try {
      const { launchTemplateId } = await applyRecipe(id, values);
      toast.success("已生成启动模板");
      router.push(`/launch-templates/${encodeURIComponent(launchTemplateId)}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="使用配方" description="加载中…" />
        <Card className="px-5 py-12 text-center text-[13px] text-muted-foreground">
          <Loader2 className="mx-auto size-5 animate-spin" />
        </Card>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-6">
        <PageHeader title="使用配方" />
        {error && <APIError message={error} />}
      </div>
    );
  }

  const ports = (detail.activity?.ports ?? []).filter((p) => !p.private);

  return (
    <div className="space-y-6">
      <PageHeader
        title="使用配方"
        description={
          <>
            来源：<span className="font-mono">{detail.id}</span> · {detail.name}
            。提交后会创建一个不含参数的启动模板，之后工作区可绑定。
          </>
        }
      />

      {error && <APIError message={error} />}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* 左侧：参数 */}
        <div className="space-y-4">
          <SectionHeader
            title="参数"
            description={
              detail.params.length > 0
                ? `${detail.params.length} 项参数；提交后服务器会替换 payload 中的 {{key}} 占位符。`
                : "该配方无需参数；提交后直接生成启动模板。"
            }
          />
          {detail.params.length === 0 ? (
            <Card className="px-5 py-6 text-center text-[13px] text-muted-foreground">
              无参数要填
            </Card>
          ) : (
            <Card className="space-y-4 px-5 py-5">
              {detail.params.map((p: Param) => (
                <ParamField
                  key={p.key}
                  param={p}
                  value={values[p.key]}
                  onChange={(v) => setValues((s) => ({ ...s, [p.key]: v }))}
                />
              ))}
            </Card>
          )}
        </div>

        {/* 右侧：摘要 + 动作 */}
        <div className="space-y-4">
          <SectionHeader title="摘要" />
          <Card className="space-y-3 px-5 py-4">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="gray">{entryKindLabel(detail.entry)}</Badge>
              {detail.category && (
                <Badge tone="gray">
                  {CATEGORY_LABEL[detail.category] ?? detail.category}
                </Badge>
              )}
              <Badge tone="gray">{detail.payload.length} 个文件</Badge>
            </div>
            {ports.length > 0 && (
              <div className="flex flex-wrap gap-1.5 font-mono text-[12px] leading-5 text-muted-foreground">
                {ports.map((p) => (
                  <span key={p.port} className="rounded bg-muted px-1.5 py-0.5">
                    :{p.port}
                    {p.label ? ` ${p.label}` : ""}
                  </span>
                ))}
              </div>
            )}
            <p className="text-[13px] leading-6 text-muted-foreground">
              {detail.description ?? "—"}
            </p>
          </Card>

          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/recipes/${encodeURIComponent(id)}`}>
                <ArrowLeft className="size-4" />
                返回详情
              </Link>
            </Button>
            <Button onClick={handleConfirm} disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  提交
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
