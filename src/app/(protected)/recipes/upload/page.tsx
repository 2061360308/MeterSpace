"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Download, Loader2, Upload as UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { APIError } from "@/components/ui/error";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import {
  uploadRecipePreview,
  confirmRecipeCreate,
  type RecipeUploadPreview,
} from "@/lib/recipes/client";

type Step = "select" | "preview";

/**
 * /recipes/upload —— 上传 zip → 系统解析 → 浏览 → 确认入库。
 *
 * 两步走：
 *   1. select：选 zip → POST /api/recipes/upload → 服务端只解析不入库 → 返回 preview
 *   2. preview：浏览文件清单、编辑元数据 → POST /api/recipes 入库 → 跳详情页
 *
 * 元数据编辑只暴露 name / description / category / tags，因为 entry / params / payload 都由
 * zip 决定（在 IDE 里写更合适，避免与文件内容漂移）。
 */
export default function RecipesUploadPage() {
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [step, setStep] = React.useState<Step>("select");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [preview, setPreview] = React.useState<RecipeUploadPreview | null>(null);

  // 编辑中的元数据字段
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [tagsText, setTagsText] = React.useState("");

  const handleFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("文件超过 10 MB，请精简后重试");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await uploadRecipePreview(file);
      setPreview(data);
      setName(data.definition.name ?? "");
      setDescription(data.definition.description ?? "");
      setCategory(data.definition.category ?? "");
      setTagsText((data.definition.tags ?? []).join(", "));
      setStep("preview");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const validCategories = new Set([
        "container",
        "web",
        "database",
        "dev-env",
        "ai",
        "toolchain",
        "blank",
      ]);
      const categoryValue: string =
        category || preview.definition.category || "";
      const normalizedCategory =
        validCategories.has(categoryValue) ? (categoryValue as never) : undefined;
      const definition = {
        ...preview.definition,
        name: name.trim() || preview.definition.name,
        description: description.trim() || undefined,
        category: normalizedCategory,
        tags: tagsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      const saved = await confirmRecipeCreate({
        definition,
        payload: preview.files,
      });
      toast.success(`配方 ${saved.id} 已创建`);
      router.push(`/recipes/${encodeURIComponent(saved.id)}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={step === "select" ? "上传配方 zip" : "浏览与确认"}
        description={
          step === "select"
            ? "系统会解析元数据与文件但**不会入库**；你浏览确认后再提交。"
            : "调整名称 / 描述 / 分类，确认后入配方表。"
        }
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />

      {error && <APIError message={error} />}

      {step === "select" ? (
        <Card className="px-8 py-12">
          <div className="mx-auto flex max-w-md flex-col items-center text-center">
            <div className="flex size-12 items-center justify-center rounded-md bg-muted text-foreground">
              {busy ? (
                <Loader2 className="size-6 animate-spin" />
              ) : (
                <UploadIcon className="size-6" />
              )}
            </div>
            <div className="mt-4 text-[15px] font-semibold">选择 zip 文件</div>
            <p className="mt-1 text-[13px] leading-6 text-muted-foreground">
              zip 内应有 <code className="rounded bg-muted px-1 py-0.5 font-mono">template.json</code>{" "}
              与所有载荷文件；entry 指向的文件必须在包内。
            </p>
            <Button
              className="mt-5"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  解析中…
                </>
              ) : (
                <>
                  <UploadIcon className="size-4" />
                  选择文件
                </>
              )}
            </Button>
            <p className="mt-3 text-[12px] leading-5 text-muted-foreground">
              单文件 ≤128KB、总数 ≤2MB、上限 200 个；详细约束见 docs/FINAL-PLAN §3.3。
            </p>
          </div>
        </Card>
      ) : (
        preview && (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            {/* 左侧：文件清单 */}
            <div className="space-y-4">
              <SectionHeader
                title="文件清单"
                description={`${preview.fileCount} 个文件，${(preview.totalSize / 1024).toFixed(1)} KB`}
              />
              <Card className="overflow-hidden">
                <table className="w-full text-[13px] leading-6">
                  <thead className="bg-muted text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">路径</th>
                      <th className="px-4 py-2 text-right font-medium">大小</th>
                      <th className="px-4 py-2 text-right font-medium">权限</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.files.map((f) => (
                      <tr key={f.path} className="border-t">
                        <td className="px-4 py-2 font-mono text-[12px]">{f.path}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {humanSize(f.size)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-muted-foreground">
                          {f.mode}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <div className="flex justify-end">
                <Button asChild variant="outline" size="sm">
                  <a
                    href={URL.createObjectURL(
                      new Blob(
                        [
                          JSON.stringify(
                            {
                              tags: tagsText.split(",").map((s) => s.trim()).filter(Boolean),
                              ...preview.definition,
                              name,
                              description,
                              category: category || preview.definition.category,
                            },
                            null,
                            2,
                          ),
                        ],
                        { type: "application/json" },
                      ),
                    )}
                    download="template.json"
                  >
                    <Download className="size-4" />
                    下载 template.json
                  </a>
                </Button>
              </div>
            </div>

            {/* 右侧：元数据 + 确认 */}
            <div className="space-y-4">
              <SectionHeader
                title="元数据"
                description="entry / params 由 zip 决定；这里只暴露展示用字段。"
              />
              <Card className="space-y-4 px-5 py-5">
                <div className="space-y-1.5">
                  <Label htmlFor="name">名称</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="给你的配方起个名"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="desc">描述</Label>
                  <Textarea
                    id="desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="一句话说明用途"
                    rows={2}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="category">分类</Label>
                  <Input
                    id="category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="container / web / database / dev-env / ai / toolchain / blank"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tags">标签（逗号分隔）</Label>
                  <Input
                    id="tags"
                    value={tagsText}
                    onChange={(e) => setTagsText(e.target.value)}
                    placeholder="rust, postgres"
                  />
                </div>
              </Card>

              <Card className="space-y-3 px-5 py-4">
                <div className="text-[13px] font-medium">entry</div>
                <div className="font-mono text-[12px] text-muted-foreground">
                  {preview.definition.entry}
                </div>
                <div className="text-[13px] font-medium">参数</div>
                <div className="flex flex-wrap gap-1.5">
                  {preview.definition.params && preview.definition.params.length > 0 ? (
                    preview.definition.params.map((p) => (
                      <Badge key={p.key} tone="blue">
                        {p.label}（{p.key}）
                      </Badge>
                    ))
                  ) : (
                    <span className="text-[12px] text-muted-foreground">无</span>
                  )}
                </div>
              </Card>

              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStep("select");
                    setPreview(null);
                  }}
                  disabled={busy}
                >
                  <ArrowLeft className="size-4" />
                  重新选择
                </Button>
                <Button onClick={handleConfirm} disabled={busy}>
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <>
                      确认入库
                      <ArrowRight className="size-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}

function humanSize(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}
