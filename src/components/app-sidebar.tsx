"use client"

import * as React from "react"
import {
  BookOpen,
  Bot,
  Frame,
  LayoutDashboard,
  Map,
  PieChart,
  Settings2,
  SquareTerminal,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { NavUser } from "@/components/nav-user"
import { RegionSwitcher } from "@/components/region-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"

// This is sample data.
const data = {
  user: {
    name: "shadcn",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
  navMain: [
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
      items: [
        {
          title: "工作区",
          url: "/workspaces",
        },
        {
          title: "弹性空间",
          url: "/cloud-instances",
        },
      ],
    },
    {
      title: "Playground",
      url: "#",
      icon: Bot,
      items: [
        {
          title: "History",
          url: "#",
        },
        {
          title: "Starred",
          url: "#",
        },
        {
          title: "Settings",
          url: "#",
        },
      ],
    },
    {
      title: "镜像",
      url: "#",
      icon: BookOpen,
      items: [
        {
          title: "我的镜像",
          url: "#",
        },
        {
          title: "镜像市场",
          url: "#",
        },
        {
          title: "构建记录",
          url: "#",
        },
      ],
    },
    {
      title: "设置",
      url: "/settings",
      icon: Settings2,
      items: [
        {
          title: "通用",
          url: "/settings",
        },
        {
          title: "密钥管理",
          url: "/settings/keys",
        },
        {
          title: "计费",
          url: "/settings/billing",
        },
      ],
    },
  ],
  projects: [
    {
      name: "开发环境",
      url: "#",
      icon: Frame,
    },
    {
      name: "测试环境",
      url: "#",
      icon: PieChart,
    },
    {
      name: "生产环境",
      url: "#",
      icon: Map,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <RegionSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavProjects projects={data.projects} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
