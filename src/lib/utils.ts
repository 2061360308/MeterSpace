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
