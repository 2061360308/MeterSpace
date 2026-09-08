import * as React from "react"
import { cn } from "cn"

function ButtonGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      role="group"
      className={cn(
        "inline-flex items-center [&>[data-slot=button]]:rounded-none [&>[data-slot=button]]:first:rounded-s-md [&>[data-slot=button]]:last:rounded-e-md [&>[data-slot=button]]:focus-within:z-10 [&>[data-slot=button]:not(:first-child)]:-ml-px",
        className
      )}
      {...props}
    />
  )
}

export { ButtonGroup }
