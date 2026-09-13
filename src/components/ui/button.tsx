import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

/**
 * Button —— Vercel 视觉语言。
 *
 * - 圆角 6px（`rounded-md`，--radius - 2px），比卡片的 8px 略紧，形成层级
 * - 字重固定 500（Vercel 的三字重体系里，交互元素一律 500）
 * - 字距归零：中文不适用负字距
 * - `outline` 用**阴影做边**而非 border，与卡片一致；hover 转为极淡灰底
 * - 焦点环用 --ring（#0072f5），是 Vercel 的 Focus Blue
 */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap",
    "rounded-md text-[13px] font-medium leading-none",
    "transition-colors duration-150 outline-none",
    "focus-visible:ring-2 focus-visible:ring-ring/40",
    "disabled:pointer-events-none disabled:opacity-45",
    "aria-invalid:ring-destructive/25",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        // 主 CTA：深底白字（Vercel 的 #171717）
        default: "bg-primary text-primary-foreground hover:bg-primary/85",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/30",
        // 次级：白底 + 阴影边（不用 border，避免 hover 抖动）
        outline:
          "bg-background text-foreground shadow-border hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost: "text-foreground hover:bg-accent hover:text-accent-foreground",
        link: "text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground",
      },
      size: {
        default: "h-8 px-3",
        xs: "h-6 gap-1 rounded-sm px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1.5 rounded-md px-2.5 text-[13px]",
        lg: "h-10 rounded-md px-4 text-sm",
        icon: "size-8",
        "icon-xs": "size-6 rounded-sm [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
