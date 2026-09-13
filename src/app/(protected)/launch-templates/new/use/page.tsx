"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Loader2, Search as SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { APIError } from "@/components/ui/error";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { ParamField } from "@/lib/templates/param-form";
import {
  fetchRecipes,
  fetchRecipe,
  applyRecipe,
  CATEGORY_LABEL,
  entryKindLabel,
  SOURCE_LABEL,
  type RecipeSummary,
  type RecipeDetail,
} from "@/lib/recipes/client";
import { cn } from "@/lib/utils";

/**
 * /launch-templates/new/use —— 在启动模板新建流程里选择配方。
 *
 * 单页内三段：
 *   1. 配方列表（左侧）
 *   2. 参数填写（右侧上半）
 *   3. 确认落库（右侧下半）
 *
 * 与 /recipes/[id]/use 类似，但放在 /launch-templates/new 的语境下——提交后跳到
 * /launch-templates/[newId]，而不是回到 /recipes。
 */
export default function NewLaunchTemplateFromUsePage() {
  const router = useRouter();
  const [recipes, setRecipes] = React.useState<RecipeSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string>("");
  const [detail, setDetail] = React.useState<RecipeDetail | null>(null);
  const [values, setValues] = React.useState<Record<string, unknown>>({});
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setLoading(true);
    fetchRecipes()
      .then((list) => setRecipes(list))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  // 选配方 → 拉详情 → 用默认值预填
  React.useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setValues({});
      return;
    }
    setBusy(true);
    fetchRecipe(selectedId)
      .then((d) => {
        setDetail(d);
        const seed: Record<string, unknown> = {};
        for (const p of d.params) {
          if (p.default !== undefined) seed[p.key] = p.default;
          else if (p.type === "boolean") seed[p.key] = false;
          else seed[p.key] = p.type === "select" ? "" : "";
        }
        setValues(seed);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setBusy(false));
  }, [selectedId]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter((r) =>
      [r.name, r.id, r.description ?? "", ...r.tags]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [recipes, query]);

  const handleConfirm = async () => {
    if (!detail) return;
    setBusy(true);
    setError("");
    try {
      const { launchTemplateId } = await applyRecipe(detail.id, values);
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
        <PageHeader title="使用配方新建" />
        <Card className="px-5 py-12 text-center text-[13px] text-muted-foreground">
          <Loader2 className="mx-auto size-5 animate-spin" />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="使用配方新建启动模板"
        description={
          <span className="flex items-center gap-2">
            <Link href="/launch-templates/new" className="hover:underline">
              <ArrowLeft className="inline size-4" />
              返回第 1 步
            </Link>
          </span>
        }
      />

      {error && <APIError message={error} />}

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        {/* 配方列表 */}
        <div className="space-y-4">
          <SectionHeader title="选一份配方" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索"
            className="sm:max-w-xs"
          />
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {filtered.length === 0 ? (
              <Card className="px-5 py-6 text-center text-[13px] text-muted-foreground">
                <SearchIcon className="mx-auto mb-2 size-4" />
                没有匹配的配方
              </Card>
            ) : (
              filtered.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={cn(
                    "block w-full rounded-lg border px-4 py-3 text-left transition-colors",
                    selectedId === r.id
                      ? "border-foreground bg-foreground/5"
                      : "hover:bg-muted",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold leading-6">
                        {r.name}
                      </div>
                      <div className="truncate font-mono text-[12px] leading-5 text-muted-foreground">
                        {r.id}
                      </div>
                    </div>
                    <Badge tone="gray">{SOURCE_LABEL[r.source]}</Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge tone="gray">{entryKindLabel(r.entry)}</Badge>
                    {r.category && (
                      <Badge tone="gray">
                        {CATEGORY_LABEL[r.category] ?? r.category}
                      </Badge>
                    )}
                    {r.params.length > 0 && (
                      <Badge tone="blue">{r.params.length} 项参数</Badge>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* 参数 + 确认 */}
        <div className="space-y-4">
          {!detail ? (
            <Card className="px-5 py-12 text-center text-[13px] text-muted-foreground">
              选个配方开始填参
            </Card>
          ) : (
            <>
              <SectionHeader
                title="参数"
                description={
                  detail.params.length > 0
                    ? `${detail.params.length} 项参数；提交后服务器会替换占位符并落为启动模板。`
                    : "该配方无需参数；提交后直接落为启动模板。"
                }
              />
              {detail.params.length === 0 ? (
                <Card className="px-5 py-6 text-center text-[13px] text-muted-foreground">
                  无参数要填
                </Card>
              ) : (
                <Card className="space-y-4 px-5 py-5">
                  {detail.params.map((p) => (
                    <ParamField
                      key={p.key}
                      param={p}
                      value={values[p.key]}
                      onChange={(v) =>
                        setValues((s) => ({ ...s, [p.key]: v }))
                      }
                    />
                  ))}
                </Card>
              )}

              <div className="flex items-center justify-end gap-2">
                <Button onClick={handleConfirm} disabled={busy}>
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <>
                      落为启动模板
                      <ArrowRight className="size-4" />
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
