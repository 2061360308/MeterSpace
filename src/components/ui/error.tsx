import { cn } from "cn"
import { AlertTriangle } from "lucide-react"

/**
 * 行内错误提示。
 *
 * Vercel 的做法：错误不用满屏红块，而是「极淡红底 + 同色文字 + 图标」的小卡片，
 * 与页面其它内容保持同样的留白节奏。中文行高放宽，避免两行文字挤在一起。
 */
export function APIError({
  message,
  onRetry,
  className,
}: {
  message: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2.5 rounded-lg bg-[#fef0ef] px-4 py-3",
        "text-[13px] leading-6 text-[#c53030]",
        "dark:bg-[#2a1414] dark:text-[#ff6369]",
        className
      )}
    >
      <AlertTriangle className="mt-1 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{message}</div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 font-medium underline underline-offset-4 hover:no-underline"
        >
          重试
        </button>
      )}
    </div>
  )
}

/** 空状态下的中性提示条（非错误）。 */
export function InfoNote({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-lg bg-muted px-4 py-3 text-[13px] leading-6 text-muted-foreground",
        className
      )}
    >
      {children}
    </div>
  )
}
