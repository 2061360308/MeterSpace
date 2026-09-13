import { cn } from "cn"

/**
 * 页面标题区。
 *
 * 中文排版要点（Vercel 原规范未覆盖，此处补齐）：
 * - 标题字距收敛到 -0.01em：Geist 在 24px 用 -0.96px，汉字会粘连
 * - 标题与描述之间留 6px，描述行高 1.7，比拉丁版的 1.56 更松
 * - 标题与下方内容留 20px，形成 Vercel 式的「大留白 + 紧凑内容」对比
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-4 pb-5",
        className
      )}
    >
      <div className="min-w-0 space-y-1.5">
        <h1 className="text-[20px] font-semibold leading-7 tracking-[-0.01em] text-foreground">
          {title}
        </h1>
        {description && (
          <p className="max-w-prose text-[13px] leading-6 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  )
}

/**
 * 分区标题（卡片内部或页面内的小节）。
 */
export function SectionHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0 space-y-1">
        <h2 className="text-[15px] font-semibold leading-6 tracking-[-0.01em]">
          {title}
        </h2>
        {description && (
          <p className="max-w-prose text-[13px] leading-6 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
