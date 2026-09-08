"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Download, ExternalLink } from "lucide-react"

const marketplaceFeatures = [
  {
    id: "node",
    name: "Node.js",
    description: "安装 Node.js 运行时，支持版本选择",
    uri: "ghcr.io/devcontainers/features/node:1",
    version: "1",
    category: "Runtime",
    downloads: 5200,
  },
  {
    id: "python",
    name: "Python",
    description: "安装 Python 运行时，支持版本选择",
    uri: "ghcr.io/devcontainers/features/python:1",
    version: "1",
    category: "Runtime",
    downloads: 4800,
  },
  {
    id: "go",
    name: "Go",
    description: "安装 Go 运行时，支持版本选择",
    uri: "ghcr.io/devcontainers/features/go:1",
    version: "1",
    category: "Runtime",
    downloads: 3200,
  },
  {
    id: "rust",
    name: "Rust",
    description: "安装 Rust 运行时和 cargo",
    uri: "ghcr.io/devcontainers/features/rust:1",
    version: "1",
    category: "Runtime",
    downloads: 2100,
  },
  {
    id: "docker-in-docker",
    name: "Docker (DinD)",
    description: "在容器中运行 Docker",
    uri: "ghcr.io/devcontainers/features/docker-in-docker:2",
    version: "2",
    category: "Tool",
    downloads: 8900,
  },
  {
    id: "docker-outside-of-docker",
    name: "Docker (DooD)",
    description: "从容器访问主机 Docker",
    uri: "ghcr.io/devcontainers/features/docker-outside-of-docker:1",
    version: "1",
    category: "Tool",
    downloads: 7600,
  },
  {
    id: "git",
    name: "Git",
    description: "安装 Git 和相关工具",
    uri: "ghcr.io/devcontainers/features/git:1",
    version: "1",
    category: "Tool",
    downloads: 9200,
  },
  {
    id: "github-cli",
    name: "GitHub CLI",
    description: "安装 GitHub CLI 工具",
    uri: "ghcr.io/devcontainers/features/github-cli:1",
    version: "1",
    category: "Tool",
    downloads: 4500,
  },
  {
    id: "ssh",
    name: "SSH",
    description: "配置 SSH 密钥和连接",
    uri: "ghcr.io/devcontainers/features/sshd:1",
    version: "1",
    category: "Network",
    downloads: 3800,
  },
  {
    id: "aws-cli",
    name: "AWS CLI",
    description: "安装 AWS CLI 工具",
    uri: "ghcr.io/devcontainers/features/aws-cli:1",
    version: "1",
    category: "Cloud",
    downloads: 2900,
  },
]

export default function MarketplaceFeaturesPage() {
  const [search, setSearch] = useState("")

  const filteredFeatures = marketplaceFeatures.filter(
    (feat) =>
      feat.name.toLowerCase().includes(search.toLowerCase()) ||
      feat.description.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索 Features..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredFeatures.map((feature) => (
              <Card key={feature.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{feature.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {feature.description}
                      </CardDescription>
                    </div>
                    <Badge tone="blue">{feature.category}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-sm text-muted-foreground font-mono truncate">
                      {feature.uri}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        v{feature.version} · {feature.downloads.toLocaleString()} 次下载
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline">
                          <ExternalLink className="h-4 w-4 mr-1" />
                          详情
                        </Button>
                        <Button size="sm">
                          <Download className="h-4 w-4 mr-1" />
                          安装
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
  )
}