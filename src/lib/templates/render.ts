/**
 * 参数渲染（§4 参数渲染）。
 *
 * 渲染发生在**后端**（instantiate 时），agent 拿到的已是成品文件。
 * 规则：
 *   - 语法 `{{key}}`，key 取自 params
 *   - 未定义的 key 保留原样
 *   - `.json` / `.yml` / `.yaml` 的值做 JSON 字符串转义（去掉首尾引号）
 *   - 其他文本原样替换（shell 引号由用户自己在载荷里写）
 */

import { resolveEntryKind } from "./types";

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/** 只有 entry 指向的文件参与渲染（§4.1）。 */
export function shouldRender(entry: string, filePath: string): boolean {
  return entry === filePath;
}

/** 该文件是否需要做 JSON 转义（§4.3）。 */
export function needsJsonEscape(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return (
    lower.endsWith(".json") ||
    lower.endsWith(".yml") ||
    lower.endsWith(".yaml")
  );
}

/**
 * JSON 字符串转义：`JSON.stringify(v)` 去掉首尾引号。
 * 这样 `"{{repo}}"` 在 JSON 里能安全承载含引号/反斜杠的值。
 */
export function jsonEscape(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

/**
 * 渲染单个文件内容。
 *
 * @param entry     模板 entry，决定是否渲染以及是否转义
 * @param filePath  当前文件路径
 * @param content   原始内容
 * @param vars      参数取值表（string -> string）
 * @returns 渲染后的内容；未定义的 key 保留 `{{key}}` 原样
 */
export function renderFile(
  entry: string,
  filePath: string,
  content: string,
  vars: Record<string, string>,
): string {
  if (!shouldRender(entry, filePath)) return content;

  const escape = needsJsonEscape(filePath);

  return content.replace(PLACEHOLDER_RE, (whole, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) {
      return whole; // 未定义 → 原样保留
    }
    const v = vars[key];
    return escape ? jsonEscape(v) : v;
  });
}

/**
 * 渲染 entry 文件时用的 entry 类型标签（日志/报错用）。
 * 保留这个辅助函数，避免调用方重复 try/catch。
 */
export function entryKindOf(entry: string): string {
  try {
    return resolveEntryKind(entry);
  } catch {
    return "unknown";
  }
}
