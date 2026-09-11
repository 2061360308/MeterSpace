import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireUserId } from "@/lib/session";
import { extractPayload, validatePayloadFiles } from "@/lib/templates/zip";
import { upsertUserTemplate } from "@/lib/templates/service";
import { parseTemplateDefinition } from "@/lib/templates/validate";
import type { PayloadFile } from "@/lib/templates/types";

/**
 * POST /api/templates/upload —— zip → 后端解包 → 存 DB（§3.4 方式 A）。
 *
 * multipart 字段：
 *   - `zip`        （必填）载荷压缩包
 *   - `definition` （可选）元数据 JSON 字符串；省略时尝试从包内 `template.json` 读
 *   若两者都没有 → 400
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    const form = await req.formData();
    const zipFile = form.get("zip");
    if (!(zipFile instanceof File)) {
      const err = new Error("缺少 zip 文件（字段名 zip）") as Error & { status?: number };
      err.status = 400;
      throw err;
    }

    const buf = await zipFile.arrayBuffer();
    const files: PayloadFile[] = await extractPayload(buf);
    validatePayloadFiles(files);

    // 元数据来源：表单字段优先，其次包内 template.json
    let rawDefinition: unknown = undefined;
    const defField = form.get("definition");
    if (typeof defField === "string" && defField.trim() !== "") {
      try {
        rawDefinition = JSON.parse(defField);
      } catch {
        const err = new Error("definition 不是合法 JSON") as Error & { status?: number };
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
        "缺少模板元数据：请提供 definition 字段，或在 zip 内放 template.json",
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

    const saved = await upsertUserTemplate(userId, definition, files);
    return ok(
      {
        id: saved.definition.id,
        source: saved.source,
        version: saved.version,
        fileCount: files.length,
        files: files.map((f) => ({ path: f.path, mode: f.mode, size: f.size })),
      },
      { status: 201 },
    );
  } catch (e) {
    return fail(e);
  }
}
