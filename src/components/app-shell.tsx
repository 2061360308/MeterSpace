"use client"

import { usePathname } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

const routes: Record<string, string> = {
  "/": "概览",
  "/workspaces": "工作区",
  "/workspaces/new": "新建工作区",
  "/settings": "设置",
  "/dashboard": "Dashboard",
  "/cloud-instances": "云实例",
}

const PROVIDER_LABELS: Record<string, string> = {
  aliyun: "阿里云",
  tencent: "腾讯云",
  aws: "AWS",
}

function getBreadcrumbs(pathname: string) {
  const segments = pathname.split("/").filter(Boolean)
  const crumbs: { label: string; href: string }[] = []

  let path = ""
  for (const segment of segments) {
    path += `/${segment}`
    const label = routes[path]
    if (label) {
      crumbs.push({ label, href: path })
    } else if (path.match(/^\/workspaces\/[^/]+$/)) {
      crumbs.push({ label: `工作区详情`, href: path })
    } else if (path.match(/^\/cloud-instances\/[^/]+$/)) {
      crumbs.push({ label: `实例详情`, href: path })
    }
  }

  return crumbs
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const crumbs = getBreadcrumbs(pathname)
  const current = crumbs.pop()

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/">
                    Workspace Cloud
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {crumbs.map((crumb) => (
                  <BreadcrumbItem key={crumb.href} className="hidden md:block">
                    <BreadcrumbSeparator />
                    <BreadcrumbLink href={crumb.href}>
                      {crumb.label}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                ))}
                {current && (
                  <BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbPage>{current.label}</BreadcrumbPage>
                  </BreadcrumbItem>
                )}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex flex-1 flex-col overflow-auto">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
