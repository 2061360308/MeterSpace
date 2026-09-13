/**
 * POST /api/recipes/upload —— 上传 zip → 解析 + 校验 → 返回 preview（**不入库**）。
 *
 * 调用方：
 *   - /recipes/upload 页面：选文件 → POST → preview → 用户浏览编辑 → POST /api/recipes 确认
 *
 * 与 /api/launch-templates/upload 的区别：这里的 zip 含 `{{param_key}}` 占位符 + params 定义。
 */
import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireUserId } from "@/lib/session";
import { extractPayload, validatePayloadFiles } from "@/lib/templates/zip";
import { parseTemplateDefinition } from "@/lib/templates/validate";
import type { PayloadFile } from "@/lib/templates/types";

export async function POST(req: NextRequest) {
  try {
    await requireUserId();

    const form = await req.formData();
    const zipFile = form.get("zip");
    if (!(zipFile instanceof File)) {
      const err = new Error("缺少 zip 文件（字段名 zip）") as Error & {
        status?: number;
      };
      err.status = 400;
      throw err;
    }

    const buf = await zipFile.arrayBuffer();
    const files: PayloadFile[] = await extractPayload(buf);
    validatePayloadFiles(files);

    let rawDefinition: unknown = undefined;
    const defField = form.get("definition");
    if (typeof defField === "string" && defField.trim() !== "") {
      try {
        rawDefinition = JSON.parse(defField);
      } catch {
        const err = new Error("definition 不是合法 JSON") as Error & {
          status?: number;
        };
        err.status = 400;
        throw err;
      }
    } else {
      const inline = files.find((f) => f.path === "template.json");
      if (inline) {
        try {
          rawDefinition = JSON.parse(inline.content);
        } catch {
          const err = new Error("包内 template.json 不是合法 JSON") as Error & {
            status?: number;
          };
          err.status = 400;
          throw err;
        }
      }
    }

    if (rawDefinition === undefined) {
      const err = new Error(
        "缺少配方元数据：请提供 definition 字段，或在 zip 内放 template.json",
      ) as Error & { status?: number };
      err.status = 400;
      throw err;
    }

    const definition = parseTemplateDefinition(rawDefinition);

    if (!files.some((f) => f.path === definition.entry)) {
      const err = new Error(
        `载荷中缺少 entry 指向的文件: ${definition.entry}`,
      ) as Error & { status?: number };
      err.status = 400;
      throw err;
    }

    // 由于 /recipes/upload 不入库，把 payload 中 template.json 元数据剥离，免得预览列表把它当代码文件
    const cleanFiles = files.filter((f) => f.path !== "template.json");
    const totalSize = cleanFiles.reduce((acc, f) => acc + f.size, 0);

    return ok({
      definition,
      files: cleanFiles.map((f) => ({
        path: f.path,
        content: f.content,
        mode: f.mode,
        size: f.size,
      })),
      fileCount: cleanFiles.length,
      totalSize,
    });
  } catch (e) {
    return fail(e);
  }
}
