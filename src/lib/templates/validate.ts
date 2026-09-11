/**
 * 模板元数据校验（§2 元数据 JSON Schema）。
 *
 * 静态部分用 zod 直接写；`params` 的**取值**校验需要按模板定义动态生成
 * zod schema（见 `buildParamValuesSchema`），因为每个模板的 params 不同。
 */

import { z } from "zod";
import {
  MAX_ENTRY_TIMEOUT,
  DEFAULT_ENTRY_TIMEOUT,
  PATH_CHARSET_RE,
  MAX_PATH_DEPTH,
  resolveEntryKind,
  type Param,
  type Template,
} from "./types";

const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const PARAM_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export const CATEGORIES = [
  "container",
  "web",
  "database",
  "dev-env",
  "ai",
  "toolchain",
  "blank",
] as const;

export const PARAM_TYPES = [
  "string",
  "text",
  "number",
  "boolean",
  "select",
] as const;

/** `params` 子 schema —— 单个 Param 的静态形状。 */
export const paramSchema = z
  .object({
    key: z.string().regex(PARAM_KEY_RE, "key 只能含字母/数字/下划线，且不以数字开头"),
    label: z.string().min(1).max(32),
    type: z.enum(PARAM_TYPES),
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
    required: z.boolean().optional(),
    placeholder: z.string().max(200).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    options: z
      .array(z.object({ value: z.string(), label: z.string() }))
      .optional(),
  })
  .superRefine((p, ctx) => {
    if (p.type === "select") {
      if (!p.options || p.options.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["options"],
          message: `select 类型必须提供 options（key=${p.key}）`,
        });
      }
    }
    if (p.type === "number") {
      if (p.min !== undefined && p.max !== undefined && p.min > p.max) {
        ctx.addIssue({
          code: "custom",
          path: ["min"],
          message: `min 不能大于 max（key=${p.key}）`,
        });
      }
    }
  });

const portDeclSchema = z.object({
  port: z.number().int().min(1).max(65535),
  label: z.string().max(32).optional(),
  protocol: z.enum(["http", "tcp"]).optional(),
  private: z.boolean().optional(),
});

const activitySchema = z.object({
  ports: z.array(portDeclSchema).max(20).optional(),
  idleMinutes: z.number().int().min(1).max(1440).optional(),
  sampleIntervalSec: z.number().int().min(5).max(300).optional(),
});

/** 载荷内文件路径校验（与 zip.ts 的落盘校验同一套规则）。 */
export function validatePayloadPath(p: string): string | null {
  if (!p || p.length > 200) return "路径为空或过长";
  if (p.startsWith("/")) return "禁止绝对路径";
  if (/^[a-zA-Z]:/.test(p)) return "禁止盘符路径";
  if (p.includes("\\")) return "路径分隔符请用 /";
  if (!PATH_CHARSET_RE.test(p)) return `路径含非法字符（仅允许 A-Za-z0-9._/-）: ${p}`;
  const segs = p.split("/");
  if (segs.some((s) => s === "" || s === "." || s === "..")) {
    return `路径含空段或 .. : ${p}`;
  }
  if (segs.length > MAX_PATH_DEPTH) return `路径层级超过 ${MAX_PATH_DEPTH}: ${p}`;
  return null;
}

/** 模板元数据完整校验。返回解析后的 Template。 */
export const templateDefinitionSchema = z
  .object({
    id: z.string().regex(ID_RE, "id 需匹配 ^[a-z0-9][a-z0-9-]{1,63}$"),
    name: z.string().min(1).max(32),
    description: z.string().max(120).optional(),
    category: z.enum(CATEGORIES).optional(),
    icon: z.string().max(40).optional(),
    tags: z.array(z.string().min(1).max(20)).max(8).optional(),
    params: z.array(paramSchema).max(30).optional(),
    entry: z.string().min(1).max(200),
    activity: activitySchema.optional(),
    timeout: z
      .number()
      .int()
      .min(30)
      .max(MAX_ENTRY_TIMEOUT, `timeout 上限 ${MAX_ENTRY_TIMEOUT} 秒`)
      .optional(),
  })
  .superRefine((t, ctx) => {
    // entry 扩展名必须可识别
    try {
      resolveEntryKind(t.entry);
    } catch {
      ctx.addIssue({
        code: "custom",
        path: ["entry"],
        message: `entry 需为 .sh / devcontainer.json / .yml / .yaml，当前: ${t.entry}`,
      });
    }

    const err = validatePayloadPath(t.entry);
    if (err) {
      ctx.addIssue({ code: "custom", path: ["entry"], message: err });
    }

    // params.key 不得重复
    if (t.params) {
      const seen = new Set<string>();
      t.params.forEach((p, i) => {
        if (seen.has(p.key)) {
          ctx.addIssue({
            code: "custom",
            path: ["params", i, "key"],
            message: `params.key 重复: ${p.key}`,
          });
        }
        seen.add(p.key);
      });
    }

    // activity.ports.port 不得重复
    if (t.activity?.ports) {
      const seen = new Set<number>();
      t.activity.ports.forEach((p, i) => {
        if (seen.has(p.port)) {
          ctx.addIssue({
            code: "custom",
            path: ["activity", "ports", i, "port"],
            message: `端口声明重复: ${p.port}`,
          });
        }
        seen.add(p.port);
      });
    }
  });

/** 解析模板元数据；失败时抛出带可读信息的 Error。 */
export function parseTemplateDefinition(input: unknown): Template {
  const r = templateDefinitionSchema.safeParse(input);
  if (!r.success) {
    const msg = r.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`模板元数据校验失败 —— ${msg}`);
  }
  return r.data as Template;
}

/** 模板允许的入口超时（带默认值）。 */
export function resolveEntryTimeout(t: Template): number {
  return t.timeout ?? DEFAULT_ENTRY_TIMEOUT;
}

/**
 * 动态生成「参数取值」的 zod schema。
 *
 * 规则（§9.1 ②）：
 *   1. 模板未声明但用户传了的 key → 忽略（不报错，避免前端夹带脏数据）
 *   2. required 且无 default 且未传 → 400
 *   3. 有 default 且未传 → 补 default
 *   4. number 越界 / select 值不在 options → 400
 *
 * 返回值是「已补齐默认值」的最终取值表，key 全部为 string（渲染用）。
 */
export function buildParamValues(
  params: Param[] | undefined,
  input: Record<string, unknown> | undefined,
): Record<string, string> {
  const defs = params ?? [];
  const given = input ?? {};
  const out: Record<string, string> = {};
  const errors: string[] = [];

  for (const p of defs) {
    const hasInput = Object.prototype.hasOwnProperty.call(given, p.key);
    let raw: unknown = hasInput ? given[p.key] : undefined;

    if (!hasInput) {
      if (p.default !== undefined) {
        raw = p.default;
      } else if (p.required) {
        errors.push(`缺少必填参数: ${p.label} (${p.key})`);
        continue;
      } else {
        // 非必填且无默认 —— 用空串占位，保证 {{key}} 有东西可替换
        out[p.key] = "";
        continue;
      }
    }

    switch (p.type) {
      case "number": {
        const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
        if (!Number.isFinite(n)) {
          errors.push(`参数 ${p.label} 必须是数字`);
          break;
        }
        if (p.min !== undefined && n < p.min) {
          errors.push(`参数 ${p.label} 不能小于 ${p.min}`);
          break;
        }
        if (p.max !== undefined && n > p.max) {
          errors.push(`参数 ${p.label} 不能大于 ${p.max}`);
          break;
        }
        out[p.key] = String(n);
        break;
      }
      case "boolean": {
        const v = raw === true || raw === "true" || raw === 1 || raw === "1";
        out[p.key] = v ? "true" : "false";
        break;
      }
      case "select": {
        const s = String(raw ?? "");
        const allowed = (p.options ?? []).map((o) => o.value);
        if (!allowed.includes(s)) {
          errors.push(`参数 ${p.label} 取值非法（可选: ${allowed.join("/")}）`);
          break;
        }
        out[p.key] = s;
        break;
      }
      case "string":
      case "text":
      default: {
        out[p.key] = String(raw ?? "");
        break;
      }
    }
  }

  if (errors.length > 0) {
    const err = new Error(`参数校验失败 —— ${errors.join("; ")}`) as Error & {
      status?: number;
    };
    err.status = 400;
    throw err;
  }

  return out;
}
