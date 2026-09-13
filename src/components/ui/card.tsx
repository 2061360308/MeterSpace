import * as React from "react"
import { cn } from "cn"

/**
 * Card —— Vercel 视觉语言的核心载体。
 *
 * 三个关键点：
 * 1. **阴影即边框**：不用 `border`，改用 `0 0 0 1px rgb(0 0 0 / 0.08)` 的扩散阴影。
 *    这样边框不参与布局尺寸计算，卡片在 hover 时不产生 1px 抖动。
 * 2. **圆角 8px**（`rounded-lg`，来自 --radius），是 Vercel 的「comfortable」档。
 * 3. **留白内聚**：内容区自身负责 padding，卡片只提供节奏（gap）。中文行高较大，
 *    所以行间距比拉丁版略收，避免卡片被撑得过高。
 *
 * `interactive` 打开 hover 抬升，用于可点击的卡片（列表项、规格选择行）。
 */
function Card({
  className,
  interactive = false,
  ...props
}: React.ComponentProps<"div"> & { interactive?: boolean }) {
  return (
    <div
      data-slot="card"
      data-interactive={interactive || undefined}
      className={cn(
        "flex flex-col gap-4 rounded-lg bg-card py-4 text-card-foreground",
        "shadow-card",
        interactive &&
          "cursor-pointer transition-shadow duration-150 hover:shadow-card-hover",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-5 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-4",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "text-[15px] font-semibold leading-6 tracking-[-0.01em]",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-[13px] leading-6 text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-content" className={cn("px-5", className)} {...props} />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-5 [.border-t]:pt-4", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
