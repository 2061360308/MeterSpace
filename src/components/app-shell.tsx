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
  "/settings": "通用",
  "/settings/env": "环境变量",
  "/settings/keys": "API 密钥",
  "/account": "Account",
  "/dashboard": "Dashboard",
  "/cloud-instances": "弹性规格",
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
    } else if (path === "/cloud-instances/new") {
      crumbs.push({ label: `创建弹性规格`, href: path })
    }
  }

  return crumbs
}

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode
  user?: { name?: string | null; email?: string | null; avatar?: string }
}) {
  const pathname = usePathname()
  const crumbs = getBreadcrumbs(pathname)
  const current = crumbs.pop()

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex min-w-0 items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb className="min-w-0">
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:flex">
                  <BreadcrumbLink href="/">
                    Workspace Cloud
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {crumbs.map((crumb) => (
                  <BreadcrumbItem key={crumb.href} className="hidden md:flex">
                    <BreadcrumbSeparator />
                    <BreadcrumbLink href={crumb.href}>
                      {crumb.label}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                ))}
                {current && (
                  <BreadcrumbItem className="md:flex">
                    <BreadcrumbSeparator />
                    <BreadcrumbPage>{current.label}</BreadcrumbPage>
                  </BreadcrumbItem>
                )}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex flex-1 flex-col overflow-auto p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
