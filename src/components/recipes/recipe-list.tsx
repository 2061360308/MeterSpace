"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Search as SearchIcon, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { APIError } from "@/components/ui/error";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  CATEGORY_LABEL,
  SOURCE_LABEL,
  entryKindLabel,
  fetchRecipes,
  type RecipeSummary,
} from "@/lib/recipes/client";
import { cn } from "@/lib/utils";

/**
 * 配方列表（/recipes）。
 *
 * 展示三源（内置 + 市场 + 用户的 recipe 上传）——这些是带 {{param_key}} 占位符的
 * 待填空的源。
 *
 * 卡片动作：
 *   - 「使用配方」：跳 /recipes/[id]/use，填参数 → 创建 launch template
 *   - 「查看」：跳详情页 /recipes/[id]（只读）
 */
export function RecipeList() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");

  const load = useCallback(async () => {
    try {
      const list = await fetchRecipes();
      setRecipes(list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of recipes) if (r.category) set.add(r.category);
    return [...set].sort();
  }, [recipes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes.filter((r) => {
      if (category !== "all" && r.category !== category) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q) ||
        r.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [recipes, query, category]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="px-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-8 w-full" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索配方名称 / 标签 / id"
          className="sm:max-w-xs"
        />
        <div className="flex flex-wrap gap-2">
          <FilterChip active={category === "all"} onClick={() => setCategory("all")}>
            全部
          </FilterChip>
          {categories.map((c) => (
            <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
              {CATEGORY_LABEL[c] ?? c}
            </FilterChip>
          ))}
        </div>
      </div>

      {error && (
        <APIError
          message={error}
          onRetry={() => {
            setError("");
            setLoading(true);
            load();
          }}
        />
      )}

      {filtered.length === 0 ? (
        recipes.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchIcon />
              </EmptyMedia>
              <EmptyTitle>还没有配方</EmptyTitle>
              <EmptyDescription>
                内置配方应自动出现；如未出现，可能是网络或服务异常。可上传一份 zip 创建自己的配方。
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => router.push("/recipes/upload")}>
                <Upload className="h-4 w-4" />
                上传一份 zip
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchIcon />
              </EmptyMedia>
              <EmptyTitle>没有匹配的配方</EmptyTitle>
              <EmptyDescription>
                换个关键词，或者把分类切回「全部」再看看。
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setCategory("all");
                }}
              >
                清除筛选
              </Button>
            </EmptyContent>
          </Empty>
        )
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => (
            <RecipeCard
              key={r.id}
              recipe={r}
              onUse={() => router.push(`/recipes/${encodeURIComponent(r.id)}/use`)}
              onOpen={() => router.push(`/recipes/${encodeURIComponent(r.id)}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center rounded-full px-3 text-[13px] font-medium transition-colors",
        active
          ? "bg-foreground text-background"
          : "bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function RecipeCard({
  recipe,
  onUse,
  onOpen,
}: {
  recipe: RecipeSummary;
  onUse: () => void;
  onOpen: () => void;
}) {
  const ports = (recipe.activity?.ports ?? []).filter((p) => !p.private);

  return (
    <Card className="px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold leading-6 tracking-[-0.01em]">
            {recipe.name}
          </div>
          <div className="truncate font-mono text-[12px] leading-5 text-muted-foreground">
            {recipe.id}
          </div>
        </div>
        <Badge tone="gray">{SOURCE_LABEL[recipe.source]}</Badge>
      </div>

      <p className="line-clamp-2 min-h-[44px] text-[13px] leading-6 text-muted-foreground">
        {recipe.description ?? "—"}
      </p>

      <div className="flex flex-wrap gap-1.5">
        <Badge tone="gray">{entryKindLabel(recipe.entry)}</Badge>
        {recipe.category && (
          <Badge tone="gray">{CATEGORY_LABEL[recipe.category] ?? recipe.category}</Badge>
        )}
        <Badge tone="gray">{recipe.fileCount} 个文件</Badge>
        {recipe.params.length > 0 && (
          <Badge tone="blue">{recipe.params.length} 项参数</Badge>
        )}
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

      <div className="mt-auto flex gap-2">
        <Button size="sm" className="flex-1" onClick={onUse}>
          使用配方
        </Button>
        <Button size="sm" variant="outline" onClick={onOpen}>
          查看
        </Button>
      </div>
    </Card>
  );
}
