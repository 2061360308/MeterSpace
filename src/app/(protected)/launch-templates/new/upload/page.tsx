"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Download,
  Loader2,
  Upload as UploadIcon,
} from "lucide-react";
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
  uploadLaunchTemplatePreview,
  confirmLaunchTemplateCreate,
  type LaunchTemplateUploadPreview,
} from "@/lib/launch-templates/client";

type Step = "select" | "preview";

/**
 * /launch-templates/new/upload —— 上传 zip → 解析 → 浏览 → 确认入库。
 *
 * 与 /recipes/upload 的差异：
 *   - 校验更严：payload 不能含 `{{key}}` 占位符；
 *     若发现，服务端返回 hasPlaceholders=true，前端直接阻断，引导用户改去 /recipes/upload。
 */
export default function LaunchTemplateUploadPage() {
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [step, setStep] = React.useState<Step>("select");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [preview, setPreview] =
    React.useState<LaunchTemplateUploadPreview | null>(null);

  // 编辑中元数据
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
      const data = await uploadLaunchTemplatePreview(file);
      if (data.hasPlaceholders) {
        toast.error("检测到占位符，请改去配方上传", {
          description: `占位符 keys: ${data.placeholderKeys.join(", ")}`,
          duration: 8000,
        });
        return;
      }
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
      const saved = await confirmLaunchTemplateCreate({
        definition,
        payload: preview.files,
      });
      toast.success(`启动模板 ${saved.id} 已创建`);
      router.push(`/launch-templates/${encodeURIComponent(saved.id)}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          step === "select" ? "上传启动模板 zip" : "浏览与确认"
        }
        description={
          <span className="flex items-center gap-2">
            <Link href="/launch-templates/new" className="hover:underline">
              <ArrowLeft className="inline size-4" />
              返回第 1 步
            </Link>
          </span>
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
        <div className="grid gap-4">
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
                （含 entry 等元数据）与所有载荷文件。
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
                单文件 ≤128KB、总数 ≤2MB、上限 200 个。
              </p>
            </div>
          </Card>

          <Card className="space-y-2 border-amber-500/40 bg-amber-50/40 px-5 py-4">
            <div className="flex items-start gap-2 text-[13px] leading-6">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div className="text-amber-900">
                启动模板<span className="font-medium">不能含占位符</span>。若你的代码还需要根据参数动态生成，
                应该改去{" "}
                <Link href="/recipes/upload" className="underline">
                  配方上传
                </Link>
                ，使用配方生成启动模板。
              </div>
            </div>
          </Card>
        </div>
      ) : (
        preview && (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
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

            <div className="space-y-4">
              <SectionHeader
                title="元数据"
                description="entry / params 由 zip 决定；这里只暴露展示用字段。"
              />
              <Card className="space-y-4 px-5 py-5">
                <div className="space-y-1.5">
                  <Label htmlFor="lt-name">名称</Label>
                  <Input
                    id="lt-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lt-desc">描述</Label>
                  <Textarea
                    id="lt-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lt-category">分类</Label>
                  <Input
                    id="lt-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lt-tags">标签（逗号分隔）</Label>
                  <Input
                    id="lt-tags"
                    value={tagsText}
                    onChange={(e) => setTagsText(e.target.value)}
                  />
                </div>
              </Card>

              <Card className="space-y-3 px-5 py-4">
                <div className="text-[13px] font-medium">entry</div>
                <div className="font-mono text-[12px] text-muted-foreground">
                  {preview.definition.entry}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium">参数</span>
                  <Badge tone="gray">无</Badge>
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
