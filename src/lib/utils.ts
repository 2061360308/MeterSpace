export { cn } from "cn";

export function clsx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return `¥${amount.toFixed(2)}`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)}${units[i]}`;
}

export const STATUS_META: Record<
  string,
  { label: string; tone: "green" | "gray" | "blue" | "red" | "yellow" }
> = {
  STOPPED: { label: "已停止", tone: "gray" },
  PROVISIONING: { label: "准备中", tone: "blue" },
  BOOTING: { label: "启动中", tone: "blue" },
  RUNNING: { label: "运行中", tone: "green" },
  RELEASING: { label: "释放中", tone: "yellow" },
  TERMINATING: { label: "释放中", tone: "yellow" },
  FAILED: { label: "失败", tone: "red" },
};

/**
 * 「进行中」状态集合 —— 决定是否需要轮询 / 是否禁用操作按钮。
 *
 * 注意：`RELEASING` 是异步停止流程引入的状态（见 docs/UI-PERFORMANCE.md U1）。
 * 任何"实例是否还没稳定"的判断都必须包含它，否则停止中的实例会被当成已停止，
 * 用户可以对着一个正在释放的实例再点一次启动。
 */
export const TRANSIENT_STATUSES = [
  "PROVISIONING",
  "BOOTING",
  "RELEASING",
  "TERMINATING",
] as const;

/** 状态是否处于「进行中」（需要轮询 + 禁用写操作）。 */
export function isTransientStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return (TRANSIENT_STATUSES as readonly string[]).includes(status);
}

/** 取状态展示元信息，未知状态降级为 STOPPED 之外的中性展示。 */
export function statusMeta(status: string | null | undefined) {
  if (!status) return STATUS_META.STOPPED;
  return STATUS_META[status] ?? { label: status, tone: "gray" as const };
}

export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return "";
  
  const now = new Date();
  const past = new Date(date);
  const diffMs = now.getTime() - past.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  // 中文环境用中文相对时间，避免中英混排
  if (diffSec < 60) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  if (diffHour < 24) return `${diffHour} 小时前`;
  if (diffDay < 30) return `${diffDay} 天前`;
  if (diffMonth < 12) return `${diffMonth} 个月前`;
  return `${diffYear} 年前`;
}

/** 把秒数格式化为 mm:ss，用于启动耗时等场景。 */
export function formatDuration(startIso: string, nowMs: number = Date.now()): string {
  const start = new Date(startIso).getTime();
  if (Number.isNaN(start)) return "—";
  const diff = Math.max(0, Math.floor((nowMs - start) / 1000));
  const minutes = Math.floor(diff / 60);
  const seconds = diff % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
