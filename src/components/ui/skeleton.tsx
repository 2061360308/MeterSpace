import { cn } from "cn"

/**
 * Skeleton —— 骨架屏。
 *
 * Vercel 用极淡的灰 + 缓慢扫光，而不是 `animate-pulse` 的呼吸（呼吸会让整个页面
 * 一直在「跳动」，中文长文本下尤其晕）。扫光用 transform 实现，不触发重排。
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "relative overflow-hidden rounded-md bg-muted",
        "after:absolute after:inset-0 after:-translate-x-full after:animate-[skeleton-sweep_1.6s_ease-in-out_infinite]",
        "after:bg-gradient-to-r after:from-transparent after:via-black/[0.04] after:to-transparent",
        "dark:after:via-white/[0.06]",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
