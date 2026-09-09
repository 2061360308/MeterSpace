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
  RUNNING: { label: "运行中", tone: "green" },
  TERMINATING: { label: "释放中", tone: "yellow" },
  FAILED: { label: "失败", tone: "red" },
};

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

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? "s" : ""} ago`;
  if (diffDay < 30) return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
  if (diffMonth < 12) return `${diffMonth} month${diffMonth > 1 ? "s" : ""} ago`;
  return `${diffYear} year${diffYear > 1 ? "s" : ""} ago`;
}
