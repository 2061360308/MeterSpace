"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  CATEGORY_LABEL,
  SOURCE_LABEL,
  entryKindLabel,
  fetchTemplates,
  type TemplateSummary,
} from "@/lib/templates/client";
import type { Param } from "@/lib/templates/types";
import { cn } from "@/lib/utils";

export function TemplateList() {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");

  /** 当前正在实例化的模板（null = 未打开弹窗） */
  const [active, setActive] = useState<TemplateSummary | null>(null);

  const load = useCallback(async () => {
    try {
      setTemplates(await fetchTemplates());
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
    for (const t of templates) if (t.category) set.add(t.category);
    return [...set].sort();
  }, [templates]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      if (category !== "all" && t.category !== category) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [templates, query, category]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-8 text-muted-foreground">
        <Spinner className="h-4 w-4" />
        加载模板...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 筛选栏 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索模板名称 / 标签 / id"
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
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          没有匹配的模板
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onUse={() => setActive(t)}
              onEdit={() => router.push(`/templates/${t.id}`)}
            />
          ))}
        </div>
      )}

      <InstantiateDialog
        template={active}
        onClose={() => setActive(null)}
        onCreated={(workspaceId) => {
          setActive(null);
          router.push(`/workspaces/${workspaceId}`);
        }}
      />
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
        "rounded-full border px-3 py-1 text-sm transition",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function TemplateCard({
  template,
  onUse,
  onEdit,
}: {
  template: TemplateSummary;
  onUse: () => void;
  onEdit: () => void;
}) {
  const ports = (template.activity?.ports ?? []).filter((p) => !p.private);

  return (
    <div className="flex flex-col rounded-xl border bg-card p-5 transition hover:border-primary/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{template.name}</div>
          <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
            {template.id}
          </div>
        </div>
        <Badge tone={template.source === "user" ? "green" : "gray"}>
          {SOURCE_LABEL[template.source]}
        </Badge>
      </div>

      <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
        {template.description ?? "—"}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        <Badge tone="gray">{entryKindLabel(template.entry)}</Badge>
        {template.category && (
          <Badge tone="gray">{CATEGORY_LABEL[template.category] ?? template.category}</Badge>
        )}
        <Badge tone="gray">{template.fileCount} 个文件</Badge>
        {template.activity?.idleMinutes != null && (
          <Badge tone="gray">空闲 {template.activity.idleMinutes} 分钟</Badge>
        )}
      </div>

      {ports.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-xs text-muted-foreground">
          {ports.map((p) => (
            <span key={p.port} className="rounded bg-muted px-1.5 py-0.5">
              :{p.port}
              {p.label ? ` ${p.label}` : ""}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex gap-2 pt-4">
        <Button size="sm" onClick={onUse} className="flex-1">
          使用模板
        </Button>
        {template.source === "user" && (
          <Button size="sm" variant="outline" onClick={onEdit}>
            编辑
          </Button>
        )}
      </div>
    </div>
  );
}

/* ---------- F2：params → 表单 ---------- */

interface InstantiateDialogProps {
  template: TemplateSummary | null;
  onClose: () => void;
  onCreated: (workspaceId: string) => void;
}

function InstantiateDialog({ template, onClose, onCreated }: InstantiateDialogProps) {
  const [name, setName] = useState("");
  const [region, setRegion] = useState("cn-hangzhou");
  const [regions, setRegions] = useState<{ id: string; label: string }[]>([]);
  const [diskSize, setDiskSize] = useState(40);
  const [bandwidth, setBandwidth] = useState(10);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // 每次打开弹窗重置表单，并注入 params 默认值
  useEffect(() => {
    if (!template) return;
    setName(template.id + "-" + Math.random().toString(36).slice(2, 6));
    const defaults: Record<string, unknown> = {};
    for (const p of template.params ?? []) {
      if (p.default !== undefined) defaults[p.key] = p.default;
    }
    setValues(defaults);
    setError("");
    setBusy(false);
  }, [template]);

  useEffect(() => {
    fetch("/api/user/regions")
      .then((r) => r.json())
      .then((d) => setRegions(d.regions ?? []))
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!template) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/templates/${template.id}/instantiate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          region,
          provider: "aliyun",
          params: values,
          diskSize,
          bandwidth,
          publicIp: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "创建失败");
      onCreated(data.workspaceId);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!template} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>使用「{template?.name}」</DialogTitle>
          <DialogDescription>
            填写参数后创建对应工作区；实例规格在下一步选择。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <Field orientation="vertical">
            <FieldLabel htmlFor="tpl-name">工作区名称</FieldLabel>
            <FieldContent>
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </FieldContent>
          </Field>

          <Field orientation="vertical">
            <FieldLabel>地域</FieldLabel>
            <FieldContent>
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="请选择地域" />
                </SelectTrigger>
                <SelectContent>
                  {(regions.length > 0 ? regions : [{ id: "cn-hangzhou", label: "杭州" }]).map(
                    (r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field orientation="vertical">
              <FieldLabel htmlFor="tpl-disk">磁盘 (GB)</FieldLabel>
              <FieldContent>
                <Input
                  id="tpl-disk"
                  type="number"
                  min={20}
                  max={500}
                  value={diskSize}
                  onChange={(e) => setDiskSize(parseInt(e.target.value) || 40)}
                />
              </FieldContent>
            </Field>
            <Field orientation="vertical">
              <FieldLabel htmlFor="tpl-bw">带宽 (Mbps)</FieldLabel>
              <FieldContent>
                <Input
                  id="tpl-bw"
                  type="number"
                  min={1}
                  max={100}
                  value={bandwidth}
                  onChange={(e) => setBandwidth(parseInt(e.target.value) || 10)}
                />
              </FieldContent>
            </Field>
          </div>

          {(template?.params ?? []).length > 0 && (
            <>
              <div className="border-t pt-4 text-sm font-medium">
                模板参数
              </div>
              {(template?.params ?? []).map((p) => (
                <ParamField
                  key={p.key}
                  param={p}
                  value={values[p.key]}
                  onChange={(v) => setValues((s) => ({ ...s, [p.key]: v }))}
                />
              ))}
            </>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={busy || !name.trim()}>
            {busy ? <Spinner className="h-4 w-4" /> : null}
            创建工作区
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 按 param.type 渲染对应控件（§9.1 ①）。 */
export function ParamField({
  param,
  value,
  onChange,
}: {
  param: Param;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const desc = param.required ? "必填" : "可选";

  if (param.type === "boolean") {
    return (
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel>{param.label}</FieldLabel>
          <FieldDescription>{desc}</FieldDescription>
        </FieldContent>
        <Switch checked={value === true} onCheckedChange={(v) => onChange(v)} />
      </Field>
    );
  }

  if (param.type === "select") {
    return (
      <Field orientation="vertical">
        <FieldLabel>{param.label}</FieldLabel>
        <FieldContent>
          <Select
            value={String(value ?? "")}
            onValueChange={(v) => onChange(v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="请选择" />
            </SelectTrigger>
            <SelectContent>
              {(param.options ?? []).map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>{desc}</FieldDescription>
        </FieldContent>
      </Field>
    );
  }

  if (param.type === "text") {
    return (
      <Field orientation="vertical">
        <FieldLabel htmlFor={`p-${param.key}`}>{param.label}</FieldLabel>
        <FieldContent>
          <Textarea
            id={`p-${param.key}`}
            value={String(value ?? "")}
            placeholder={param.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
          <FieldDescription>{desc}</FieldDescription>
        </FieldContent>
      </Field>
    );
  }

  // string / number
  return (
    <Field orientation="vertical">
      <FieldLabel htmlFor={`p-${param.key}`}>{param.label}</FieldLabel>
      <FieldContent>
        <Input
          id={`p-${param.key}`}
          type={param.type === "number" ? "number" : "text"}
          min={param.min}
          max={param.max}
          value={String(value ?? "")}
          placeholder={param.placeholder}
          onChange={(e) =>
            onChange(
              param.type === "number"
                ? e.target.value === ""
                  ? ""
                  : Number(e.target.value)
                : e.target.value,
            )
          }
        />
        <FieldDescription>{desc}</FieldDescription>
      </FieldContent>
    </Field>
  );
}
