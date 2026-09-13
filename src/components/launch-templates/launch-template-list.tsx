"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Rocket, Search as SearchIcon } from "lucide-react";
import { toast } from "sonner";
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
  ORIGIN_LABEL,
  entryKindLabel,
  fetchLaunchTemplates,
  type LaunchTemplateSummary,
} from "@/lib/launch-templates/client";

/**
 * 启动模板列表（/launch-templates）。
 *
 * 只展示当前用户的 launch_templates；这是「已填好的可绑定对象」——
 * 工作区创建向导只能从这里选。
 *
 * 卡片动作（v3 移除「编辑」）：
 *   - 「创建工作区」：跳 /workspaces/new?launchTemplate=<id>
 *   - 「查看」：跳详情页（只读）
 *
 * 上方入口：「新建启动模板」→ /launch-templates/new（二选一：上传 / 使用配方）
 */
export function LaunchTemplateList() {
  const router = useRouter();
  const [items, setItems] = useState<LaunchTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const list = await fetchLaunchTemplates();
      setItems(list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((t) =>
      [t.name, t.id, t.description ?? "", ...t.tags]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [items, query]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="px-5">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-12 w-full" />
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
          placeholder="搜索启动模板"
          className="sm:max-w-xs"
        />
        <Button variant="outline" size="sm" onClick={() => toast.info("占位：搜索高亮待实现")}>
          清除
        </Button>
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
        items.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Rocket />
              </EmptyMedia>
              <EmptyTitle>还没有启动模板</EmptyTitle>
              <EmptyDescription>
                两种方式创建：上传一份不含占位符的 zip，或从配方页「使用配方」自动生成。
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => router.push("/launch-templates/new")}>
                新建启动模板
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push("/recipes")}
              >
                去配方页挑一份
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchIcon />
              </EmptyMedia>
              <EmptyTitle>没有匹配的启动模板</EmptyTitle>
              <EmptyDescription>换个关键词再试试。</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={() => setQuery("")}>
                清除搜索
              </Button>
            </EmptyContent>
          </Empty>
        )
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => (
            <LaunchTemplateCard
              key={t.id}
              template={t}
              onInstantiate={() =>
                router.push(
                  `/workspaces/new?launchTemplate=${encodeURIComponent(t.id)}`,
                )
              }
              onOpen={() =>
                router.push(`/launch-templates/${encodeURIComponent(t.id)}`)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LaunchTemplateCard({
  template,
  onInstantiate,
  onOpen,
}: {
  template: LaunchTemplateSummary;
  onInstantiate: () => void;
  onOpen: () => void;
}) {
  const ports = (template.activity?.ports ?? []).filter((p) => !p.private);

  return (
    <Card className="px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold leading-6 tracking-[-0.01em]">
            {template.name}
          </div>
          <div className="truncate font-mono text-[12px] leading-5 text-muted-foreground">
            {template.id}
          </div>
        </div>
        <Badge tone="green">可绑定</Badge>
      </div>

      <p className="line-clamp-2 min-h-[44px] text-[13px] leading-6 text-muted-foreground">
        {template.description ?? "—"}
      </p>

      <div className="flex flex-wrap gap-1.5">
        <Badge tone="gray">{entryKindLabel(template.entry)}</Badge>
        {template.category && (
          <Badge tone="gray">
            {CATEGORY_LABEL[template.category] ?? template.category}
          </Badge>
        )}
        <Badge tone="gray">{template.fileCount} 个文件</Badge>
        <Badge tone="gray">{ORIGIN_LABEL[template.originKind]}</Badge>
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
        <Button size="sm" className="flex-1" onClick={onInstantiate}>
          创建工作区
        </Button>
        <Button size="sm" variant="outline" onClick={onOpen}>
          查看
        </Button>
      </div>
    </Card>
  );
}
