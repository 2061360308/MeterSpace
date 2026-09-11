/**
 * zip 解包（§3.3 / §3.4）。
 *
 * 只用 jszip 在**内存**里解，不落临时目录 —— serverless 环境无可写盘，
 * 也就天然规避了 zip slip 的路径逃逸。但仍逐条校验路径，作为纵深防御。
 *
 * 限制：单文件 128KB / 总 2MB / 200 个文件 / 文本模型（拒绝二进制）
 */

import JSZip from "jszip";
import {
  MAX_FILE_SIZE,
  MAX_TOTAL_SIZE,
  MAX_FILE_COUNT,
  type PayloadFile,
} from "./types";
import { validatePayloadPath } from "./validate";

/** 判断内容是否像二进制（含 NUL 字节即视为二进制）。 */
function looksBinary(buf: Uint8Array): boolean {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

/** 由 unix 权限位推出八进制 mode 字符串；默认 0644。 */
function resolveMode(unixPermissions: number | undefined | null): string {
  if (unixPermissions == null) return "0644";
  // jszip 给的可能是 0o100644 这种（含文件类型位），取低 9 位
  const perm = unixPermissions & 0o777;
  if (perm === 0) return "0644";
  return perm.toString(8).padStart(4, "0");
}

/**
 * 解包 zip buffer → 载荷文件数组。
 * 失败时抛 Error，message 面向用户可读。
 */
export async function extractPayload(
  buffer: ArrayBuffer | Uint8Array | Buffer,
): Promise<PayloadFile[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (e) {
    throw new Error(
      `无法解析 zip 文件：${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const files: PayloadFile[] = [];
  let totalSize = 0;

  for (const [name, entry] of Object.entries(zip.files)) {
    // 目录条目跳过
    if (entry.dir) continue;

    // ⚠️ jszip 在 load 时会把 `../evil.sh` **规范化**成 `evil.sh`，
    // 于是 `name` 已经是"安全"的，逃逸信息只剩 unsafeOriginalName。
    // 必须用原始名做校验，否则 zip slip 防护形同虚设。
    const originalName =
      (entry as unknown as { unsafeOriginalName?: string }).unsafeOriginalName ??
      name;
    if (/^\.\.?([/\\]|$)|[/\\]\.\.([/\\]|$)/.test(originalName)) {
      throw new Error(`载荷路径含 .. 逃逸段（zip slip）：${originalName}`);
    }

    // macOS / Windows 打包常见垃圾，直接忽略
    const basename = name.split("/").pop() ?? "";
    if (basename === ".DS_Store" || basename === "Thumbs.db") continue;
    if (name.startsWith("__MACOSX/")) continue;

    // 路径校验（禁绝对路径 / .. / 非法字符 / 超深）
    const pathErr = validatePayloadPath(name);
    if (pathErr) {
      throw new Error(`非法路径：${pathErr}`);
    }

    // symlink 检测：unix 权限位高 4 位 0xa = symlink
    const unixPerm = (entry as unknown as { unixPermissions?: number })
      .unixPermissions;
    if (unixPerm != null && (unixPerm & 0xf000) === 0xa000) {
      throw new Error(`载荷不允许符号链接：${originalName}`);
    }

    if (files.length >= MAX_FILE_COUNT) {
      throw new Error(`文件数量超过上限 ${MAX_FILE_COUNT}`);
    }

    const buf = new Uint8Array(await entry.async("uint8array"));

    if (buf.byteLength > MAX_FILE_SIZE) {
      throw new Error(
        `单文件超过 ${Math.floor(MAX_FILE_SIZE / 1024)}KB：${name} (${Math.ceil(buf.byteLength / 1024)}KB)`,
      );
    }

    totalSize += buf.byteLength;
    if (totalSize > MAX_TOTAL_SIZE) {
      throw new Error(
        `载荷总大小超过 ${Math.floor(MAX_TOTAL_SIZE / 1024 / 1024)}MB`,
      );
    }

    if (looksBinary(buf)) {
      throw new Error(`不支持二进制文件：${name}`);
    }

    files.push({
      path: name,
      content: new TextDecoder("utf-8").decode(buf),
      mode: resolveMode(unixPerm),
      size: buf.byteLength,
    });
  }

  if (files.length === 0) {
    throw new Error("zip 内没有可用文件（可能只含目录或已全部被过滤）");
  }

  // 稳定排序，便于比对与调试
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

/** 校验一个已解析好的载荷数组（逐文件提交路径用）。 */
export function validatePayloadFiles(files: PayloadFile[]): void {
  if (files.length > MAX_FILE_COUNT) {
    throw new Error(`文件数量超过上限 ${MAX_FILE_COUNT}`);
  }
  let total = 0;
  const seen = new Set<string>();
  for (const f of files) {
    const pathErr = validatePayloadPath(f.path);
    if (pathErr) throw new Error(`非法路径：${pathErr}`);
    if (seen.has(f.path)) throw new Error(`载荷内路径重复：${f.path}`);
    seen.add(f.path);

    const bytes = Buffer.byteLength(f.content, "utf8");
    if (bytes > MAX_FILE_SIZE) {
      throw new Error(
        `单文件超过 ${Math.floor(MAX_FILE_SIZE / 1024)}KB：${f.path}`,
      );
    }
    total += bytes;
    if (total > MAX_TOTAL_SIZE) {
      throw new Error(
        `载荷总大小超过 ${Math.floor(MAX_TOTAL_SIZE / 1024 / 1024)}MB`,
      );
    }
  }
}

/** 把载荷数组打包成 zip（导出模板 / 调试用）。 */
export async function packPayload(files: PayloadFile[]): Promise<Buffer> {
  const zip = new JSZip();
  for (const f of files) {
    zip.file(f.path, f.content, {
      unixPermissions: parseInt(f.mode, 8) || 0o644,
      createFolders: true,
    });
  }
  // platform: "UNIX" 才会把 unixPermissions 真正写进 zip（否则解包端拿不到执行位）
  return zip.generateAsync({ type: "nodebuffer", platform: "UNIX" });
}
