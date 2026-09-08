import * as React from "react"
import { cn } from "cn"

function ButtonGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "inline-flex rounded-md shadow-xs [&>[data-slot=button]]:rounded-none [&>[data-slot=button]]:first:rounded-l-md [&>[data-slot=button]]:last:rounded-r-md [&>[data-slot=button]]:focus-within:z-10 [&>[data-slot=button]:not(:first-child)]:-ml-px",
        className
      )}
      {...props}
    />
  )
}

export { ButtonGroup }
