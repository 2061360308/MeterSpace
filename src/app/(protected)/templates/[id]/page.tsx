"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CATEGORY_LABEL, type TemplateSource } from "@/lib/templates/client";
import type { ActivityConfig, Param, TemplateCategory } from "@/lib/templates/types";

interface TemplateDetail {
  id: string;
  name: string;
  description: string | null;
  category: TemplateCategory | null;
  icon: string | null;
  tags: string[];
  entry: string;
  params: Param[];
  activity: ActivityConfig | null;
  timeout: number | null;
  source: TemplateSource;
  version: string;
  files: { path: string; content: string; mode: string; size: number }[];
}

const CATEGORIES = Object.keys(CATEGORY_LABEL) as TemplateCategory[];

export default function TemplateEditPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [t, setT] = useState<TemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("meta");

  useEffect(() => {
    fetch(`/api/templates/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setT(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const save = async () => {
    if (!t) return;
    if (t.source === "builtin" || t.source === "marketplace") {
      setError("内置/市场模板不可编辑，请「另存为」创建副本（当前仅支持复制后编辑）。");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const definition = {
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        icon: t.icon,
        tags: t.tags,
        entry: t.entry,
        params: t.params,
        activity: t.activity,
        timeout: t.timeout,
      };

      const payload = t.files.map((f) => ({
        path: f.path,
        content: f.content,
        mode: f.mode,
        size: new Blob([f.content]).size,
      }));

      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ definition, payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "保存失败");
      router.push("/templates");
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const deleteT = async () => {
    if (!t) return;
    if (!confirm("确定删除这个模板？")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      router.push("/templates");
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Spinner className="h-4 w-4" /> 加载模板...
      </div>
    );
  }

  if (!t) return <div className="p-6 text-destructive">模板不存在</div>;

  const readonly = t.source === "builtin" || t.source === "marketplace";

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{readonly ? "查看模板" : "编辑模板"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.id} · {t.source === "builtin" ? "内置" : t.source === "marketplace" ? "市场" : "我的"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {t.source === "user" && (
            <Button variant="destructive" onClick={deleteT} disabled={saving}>
              删除
            </Button>
          )}
          <Button onClick={save} disabled={saving || readonly}>
            {saving ? <Spinner className="h-4 w-4" /> : null}
            {readonly ? "只读" : "保存"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="meta">基本信息</TabsTrigger>
          <TabsTrigger value="params">参数</TabsTrigger>
          <TabsTrigger value="ports">端口</TabsTrigger>
          <TabsTrigger value="files">文件</TabsTrigger>
        </TabsList>

        <TabsContent value="meta" className="space-y-4">
          <Field orientation="vertical">
            <FieldLabel>名称</FieldLabel>
            <FieldContent>
              <Input
                value={t.name}
                onChange={(e) => setT((s) => s && { ...s, name: e.target.value })}
                disabled={readonly}
              />
            </FieldContent>
          </Field>

          <Field orientation="vertical">
            <FieldLabel>描述</FieldLabel>
            <FieldContent>
              <Textarea
                value={t.description ?? ""}
                onChange={(e) => setT((s) => s && { ...s, description: e.target.value })}
                disabled={readonly}
              />
            </FieldContent>
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field orientation="vertical">
              <FieldLabel>分类</FieldLabel>
              <FieldContent>
                <Select
                  value={t.category ?? ""}
                  onValueChange={(v) =>
                    setT((s) => s && { ...s, category: (v as TemplateCategory) || null })
                  }
                  disabled={readonly}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择分类" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_LABEL[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>

            <Field orientation="vertical">
              <FieldLabel>入口文件</FieldLabel>
              <FieldContent>
                <Input
                  value={t.entry}
                  onChange={(e) => setT((s) => s && { ...s, entry: e.target.value })}
                  disabled={readonly}
                />
                <FieldDescription>如 run.sh / docker-compose.yml / .devcontainer/devcontainer.json</FieldDescription>
              </FieldContent>
            </Field>
          </div>

          <Field orientation="vertical">
            <FieldLabel>标签</FieldLabel>
            <FieldContent>
              <Input
                value={t.tags.join(", ")}
                onChange={(e) =>
                  setT((s) => s && { ...s, tags: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })
                }
                disabled={readonly}
                placeholder="用逗号分隔"
              />
            </FieldContent>
          </Field>

          <Field orientation="vertical">
            <FieldLabel>执行超时（秒）</FieldLabel>
            <FieldContent>
              <Input
                type="number"
                value={t.timeout ?? ""}
                onChange={(e) =>
                  setT((s) => s && { ...s, timeout: e.target.value ? Number(e.target.value) : null })
                }
                disabled={readonly}
              />
            </FieldContent>
          </Field>
        </TabsContent>

        <TabsContent value="params" className="space-y-4">
          <div className="space-y-4">
            {t.params.map((p, i) => (
              <div key={i} className="rounded-lg border p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    placeholder="key"
                    value={p.key}
                    onChange={(e) => updateParam(t, setT, i, "key", e.target.value)}
                    disabled={readonly}
                  />
                  <Input
                    placeholder="label"
                    value={p.label}
                    onChange={(e) => updateParam(t, setT, i, "label", e.target.value)}
                    disabled={readonly}
                  />
                  <Select
                    value={p.type}
                    onValueChange={(v) => updateParam(t, setT, i, "type", v)}
                    disabled={readonly}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["string", "text", "number", "boolean", "select"].map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="默认值"
                    value={String(p.default ?? "")}
                    onChange={(e) => updateParam(t, setT, i, "default", e.target.value)}
                    disabled={readonly}
                  />
                  <Input
                    placeholder="placeholder"
                    value={p.placeholder ?? ""}
                    onChange={(e) => updateParam(t, setT, i, "placeholder", e.target.value)}
                    disabled={readonly}
                  />
                  {p.type === "number" && (
                    <>
                      <Input
                        type="number"
                        placeholder="min"
                        value={p.min ?? ""}
                        onChange={(e) =>
                          updateParam(t, setT, i, "min", e.target.value === "" ? undefined : Number(e.target.value))
                        }
                        disabled={readonly}
                      />
                      <Input
                        type="number"
                        placeholder="max"
                        value={p.max ?? ""}
                        onChange={(e) =>
                          updateParam(t, setT, i, "max", e.target.value === "" ? undefined : Number(e.target.value))
                        }
                        disabled={readonly}
                      />
                    </>
                  )}
                  {p.type === "select" && (
                    <Textarea
                      placeholder={`选项 JSON：[{"value":"x","label":"X"}]`}
                      value={JSON.stringify(p.options ?? [])}
                      onChange={(e) => {
                        try {
                          const opts = JSON.parse(e.target.value);
                          updateParam(t, setT, i, "options", opts);
                        } catch {
                          // ignore invalid JSON while typing
                        }
                      }}
                      disabled={readonly}
                    />
                  )}
                </div>
                {!readonly && (
                  <Button
                    variant="ghost"
                    className="mt-2 text-destructive"
                    onClick={() => setT((s) => s && { ...s, params: s.params.filter((_, idx) => idx !== i) })}
                  >
                    删除
                  </Button>
                )}
              </div>
            ))}
          </div>
          {!readonly && (
            <Button
              onClick={() =>
                setT((s) =>
                  s && {
                    ...s,
                    params: [
                      ...s.params,
                      { key: "param" + (s.params.length + 1), label: "参数", type: "string" },
                    ],
                  }
                )
              }
            >
              添加参数
            </Button>
          )}
        </TabsContent>

        <TabsContent value="ports" className="space-y-4">
          <div className="space-y-3">
            {(t.activity?.ports ?? []).map((port, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="端口"
                  value={port.port}
                  onChange={(e) => updatePort(t, setT, i, "port", Number(e.target.value))}
                  disabled={readonly}
                  className="w-28"
                />
                <Input
                  placeholder="标签"
                  value={port.label ?? ""}
                  onChange={(e) => updatePort(t, setT, i, "label", e.target.value)}
                  disabled={readonly}
                />
                <Select
                  value={port.protocol ?? "http"}
                  onValueChange={(v) => updatePort(t, setT, i, "protocol", v)}
                  disabled={readonly}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="http">http</SelectItem>
                    <SelectItem value="tcp">tcp</SelectItem>
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={port.private === true}
                    onChange={(e) => updatePort(t, setT, i, "private", e.target.checked)}
                    disabled={readonly}
                  />
                  私有
                </label>
                {!readonly && (
                  <Button
                    variant="ghost"
                    className="text-destructive"
                    onClick={() =>
                      setT((s) =>
                        s && {
                          ...s,
                          activity: {
                            ...s.activity,
                            ports: (s.activity?.ports ?? []).filter((_, idx) => idx !== i),
                          },
                        }
                      )
                    }
                  >
                    删除
                  </Button>
                )}
              </div>
            ))}
          </div>
          {!readonly && (
            <Button
              onClick={() =>
                setT((s) =>
                  s && {
                    ...s,
                    activity: {
                      ...s.activity,
                      ports: [...(s.activity?.ports ?? []), { port: 8080, label: "", protocol: "http" }],
                    },
                  }
                )
              }
            >
              添加端口
            </Button>
          )}
        </TabsContent>

        <TabsContent value="files" className="space-y-4">
          <div className="space-y-3">
            {t.files.map((f, i) => (
              <div key={i} className="rounded-lg border p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Input
                    value={f.path}
                    onChange={(e) => updateFile(t, setT, i, "path", e.target.value)}
                    disabled={readonly}
                    className="flex-1"
                  />
                  <Input
                    value={f.mode}
                    onChange={(e) => updateFile(t, setT, i, "mode", e.target.value)}
                    disabled={readonly}
                    className="w-24"
                    placeholder="0644"
                  />
                  {!readonly && (
                    <Button
                      variant="ghost"
                      className="text-destructive"
                      onClick={() =>
                        setT((s) => s && { ...s, files: s.files.filter((_, idx) => idx !== i) })
                      }
                    >
                      删除
                    </Button>
                  )}
                </div>
                <Textarea
                  value={f.content}
                  onChange={(e) => updateFile(t, setT, i, "content", e.target.value)}
                  disabled={readonly}
                  className="min-h-[200px] font-mono text-xs"
                />
              </div>
            ))}
          </div>
          {!readonly && (
            <Button
              onClick={() =>
                setT((s) =>
                  s && {
                    ...s,
                    files: [...s.files, { path: "new-file.sh", content: "", mode: "0644", size: 0 }],
                  }
                )
              }
            >
              添加文件
            </Button>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function updateParam(
  t: TemplateDetail,
  setT: (fn: (t: TemplateDetail | null) => TemplateDetail | null) => void,
  index: number,
  key: keyof Param,
  value: unknown,
) {
  setT((s) => {
    if (!s) return s;
    const params = [...s.params];
    params[index] = { ...params[index], [key]: value } as Param;
    return { ...s, params };
  });
}

function updatePort(
  t: TemplateDetail,
  setT: (fn: (t: TemplateDetail | null) => TemplateDetail | null) => void,
  index: number,
  key: "port" | "label" | "protocol" | "private",
  value: unknown,
) {
  setT((s) => {
    if (!s) return s;
    const ports = [...(s.activity?.ports ?? [])];
    ports[index] = { ...ports[index], [key]: value } as NonNullable<ActivityConfig["ports"]>[number];
    return { ...s, activity: { ...s.activity, ports } };
  });
}

function updateFile(
  t: TemplateDetail,
  setT: (fn: (t: TemplateDetail | null) => TemplateDetail | null) => void,
  index: number,
  key: "path" | "content" | "mode",
  value: string,
) {
  setT((s) => {
    if (!s) return s;
    const files = [...s.files];
    files[index] = { ...files[index], [key]: value };
    return { ...s, files };
  });
}
