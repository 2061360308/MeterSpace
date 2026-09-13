"use client"

import { useEffect, useState } from "react"
import { ChevronRight, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"

interface NavItem {
  title: string
  url: string
  icon?: LucideIcon
  isActive?: boolean
  alwaysOpen?: boolean
  items?: {
    title: string
    url: string
  }[]
}

interface NavGroup {
  label: string
  items: NavItem[]
}

/**
 * 当前路径是否命中导航项。
 *
 * 规则：`/` 只精确匹配；其余按前缀匹配，且要求命中段边界
 * （`/settings` 命中 `/settings/env`，但 `/work` 不会命中 `/workspaces`）。
 * 带 query 的链接（如 `/cloud-instances?provider=aliyun`）额外比较 query，
 * 避免同路径的多个子项同时高亮。
 */
function isItemActive(
  href: string,
  pathname: string,
  search: URLSearchParams,
): boolean {
  const [path, query] = href.split("?")
  if (path === "#") return false

  const pathMatches =
    path === "/"
      ? pathname === "/"
      : pathname === path || pathname.startsWith(`${path}/`)
  if (!pathMatches) return false

  if (!query) return true

  const target = new URLSearchParams(query)
  for (const [key, value] of target.entries()) {
    if (search.get(key) !== value) return false
  }
  return true
}

/**
 * 读取当前 URL 的 query。
 *
 * 不用 `useSearchParams()`：它会把整棵子树拖进 Suspense 边界，
 * 在 layout 里调用可能让静态渲染直接报错。高亮只是装饰，客户端读即可。
 */
function useClientSearch(pathname: string): URLSearchParams {
  const [search, setSearch] = useState(() => new URLSearchParams())
  useEffect(() => {
    setSearch(new URLSearchParams(window.location.search))
  }, [pathname])
  return search
}

export function NavMain({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname()
  const search = useClientSearch(pathname)

  return (
    <>
      {groups.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => {
                const active = isItemActive(item.url, pathname, search)
                const hasChildren = Boolean(item.items?.length)

                if (!hasChildren) {
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        tooltip={item.title}
                        isActive={active}
                      >
                        <Link href={item.url}>
                          {item.icon && <item.icon />}
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                }

                // 子项中存在命中项时，父项也算激活（折叠态也能看出位置）
                const childActive =
                  active ||
                  (item.items ?? []).some((sub) =>
                    isItemActive(sub.url, pathname, search),
                  )

                if (item.alwaysOpen) {
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        tooltip={item.title}
                        isActive={active}
                      >
                        <Link href={item.url}>
                          {item.icon && <item.icon />}
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                      <SidebarMenuSub>
                        {item.items!.map((subItem) => (
                          <SidebarMenuSubItem key={subItem.title}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={isItemActive(
                                subItem.url,
                                pathname,
                                search,
                              )}
                            >
                              <Link href={subItem.url}>
                                <span>{subItem.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </SidebarMenuItem>
                  )
                }

                return (
                  <Collapsible
                    key={item.title}
                    asChild
                    defaultOpen={childActive}
                    className="group/collapsible"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          tooltip={item.title}
                          isActive={childActive}
                        >
                          {item.icon && <item.icon />}
                          <span>{item.title}</span>
                          <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {item.items!.map((subItem) => (
                            <SidebarMenuSubItem key={subItem.title}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={isItemActive(
                                  subItem.url,
                                  pathname,
                                  search,
                                )}
                              >
                                <Link href={subItem.url}>
                                  <span>{subItem.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  )
}
