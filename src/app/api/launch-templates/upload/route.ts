/**
 * POST /api/launch-templates/upload —— 上传 zip → 校验 → 返回 preview（**不入库**）。
 *
 * 与 /api/recipes/upload 的关键差异：
 *   - 启动模板 payload **不能含 `{{param_key}}` 占位符**；
 *     含占位符 = 应当作为配方上传，预览返回 hasPlaceholders=true 让前端拦截。
 *   - 不接受 template.json 元数据 params 字段。
 */
import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireUserId } from "@/lib/session";
import { extractPayload, validatePayloadFiles } from "@/lib/templates/zip";
import { parseTemplateDefinition } from "@/lib/templates/validate";
import type { PayloadFile } from "@/lib/templates/types";

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

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
          // 启动模板允许无 template.json
          rawDefinition = undefined;
        }
      }
    }

    if (rawDefinition === undefined) {
      const err = new Error(
        "缺少元数据：启动模板 zip 内请附 template.json，或在表单内提供 definition 字段",
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

    if ((definition.params ?? []).length > 0) {
      const err = new Error(
        "启动模板不能包含参数定义；如需 params，请改去 /recipes/upload 上传配方",
      ) as Error & { status?: number };
      err.status = 400;
      throw err;
    }

    // 扫描 payload 占位符
    const placeholderKeys = new Set<string>();
    for (const f of files) {
      const matches = f.content.matchAll(PLACEHOLDER_RE);
      for (const m of matches) placeholderKeys.add(m[1]);
    }
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
      hasPlaceholders: placeholderKeys.size > 0,
      placeholderKeys: [...placeholderKeys],
    });
  } catch (e) {
    return fail(e);
  }
}
