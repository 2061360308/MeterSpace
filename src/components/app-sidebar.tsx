"use client"

import * as React from "react"
import {
  BookOpen,
  Bot,
  Cloud,
  Code,
  LayoutDashboard,
  Settings2,
  SquareTerminal,
  Terminal,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
} from "@/components/ui/sidebar"

const navGroups = [
  {
    label: "工作区",
    items: [
      {
        title: "概览",
        url: "/",
        icon: LayoutDashboard,
        isActive: true,
      },
      {
        title: "工作区",
        url: "/workspaces",
        icon: SquareTerminal,
      },
      {
        title: "弹性规格",
        url: "/cloud-instances",
        icon: Cloud,
        alwaysOpen: true,
        items: [
          { title: "阿里云", url: "/cloud-instances?provider=aliyun" },
          { title: "腾讯云", url: "/cloud-instances?provider=tencent" },
          { title: "AWS", url: "/cloud-instances?provider=aws" },
        ],
      },
    ],
  },
  {
    label: "资源管理",
    items: [
      {
        title: "镜像",
        url: "/my-resources/images",
        icon: BookOpen,
      },
      {
        title: "开发环境",
        url: "/my-resources/features",
        icon: Code,
      },
      {
        title: "脚本",
        url: "/my-resources/scripts",
        icon: Terminal,
      },
    ],
  },
  {
    label: "其他",
    items: [
      {
        title: "Playground",
        url: "#",
        icon: Bot,
        items: [
          { title: "History", url: "#" },
          { title: "Starred", url: "#" },
          { title: "Settings", url: "#" },
        ],
      },
      {
        title: "设置",
        url: "/settings",
        icon: Settings2,
        items: [
          { title: "通用", url: "/settings" },
          { title: "密钥管理", url: "/settings/keys" },
          { title: "环境变量", url: "/settings/env" },
          { title: "持久化目录", url: "/settings/storage" },
        ],
      },
    ],
  },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground text-sm font-bold">
                M
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">MeterSpace</span>
                <span className="truncate text-xs text-sidebar-muted-foreground">Workspace Cloud</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain groups={navGroups} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={{ name: "shadcn", email: "m@example.com", avatar: "" }} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}