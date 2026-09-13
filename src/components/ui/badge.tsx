import { clsx } from "@/lib/utils";

export type BadgeTone = "green" | "gray" | "blue" | "red" | "yellow";

/**
 * 状态药丸。
 *
 * Vercel 的做法：不做描边，用「极淡同色底 + 同色深字」，圆角全圆（9999px），
 * 12px/500。相比饱和色块，它把视觉重量让给内容本身。
 */
const TONES: Record<BadgeTone, string> = {
  gray: "bg-muted text-muted-foreground",
  blue: "bg-[#ebf5ff] text-[#0068d6]",
  green: "bg-[#eafaf1] text-[#0d7a43]",
  yellow: "bg-[#fff8e6] text-[#9a6700]",
  red: "bg-[#fef0ef] text-[#c53030]",
};

/** 深色模式下软底色需要压暗，否则刺眼 */
const DARK_TONES: Record<BadgeTone, string> = {
  gray: "dark:bg-[#1a1a1a] dark:text-[#a1a1a1]",
  blue: "dark:bg-[#0d1f33] dark:text-[#6cb6ff]",
  green: "dark:bg-[#0d2018] dark:text-[#4cc38a]",
  yellow: "dark:bg-[#241d0d] dark:text-[#e2b53e]",
  red: "dark:bg-[#2a1414] dark:text-[#ff6369]",
};

export function Badge({
  tone = "gray",
  children,
  className,
  dot = false,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
  /** 左侧小圆点，用于强调「实时状态」 */
  dot?: boolean;
}) {
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5",
        "text-xs font-medium leading-5 whitespace-nowrap",
        TONES[tone],
        DARK_TONES[tone],
        className,
      )}
    >
      {dot && (
        <span
          aria-hidden
          className="size-1.5 rounded-full bg-current opacity-70"
        />
      )}
      {children}
    </span>
  );
}
