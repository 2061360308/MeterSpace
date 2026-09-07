import { clsx } from "@/lib/utils";

export function Badge({
  tone = "gray",
  children,
  className,
}: {
  tone?: "green" | "gray" | "blue" | "red" | "yellow";
  children: React.ReactNode;
  className?: string;
}) {
  const tones: Record<string, string> = {
    green: "bg-green-100 text-green-700",
    gray: "bg-gray-100 text-gray-600",
    blue: "bg-blue-100 text-blue-700",
    red: "bg-red-100 text-red-700",
    yellow: "bg-yellow-100 text-yellow-700",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
