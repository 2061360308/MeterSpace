"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Download, ExternalLink } from "lucide-react"

const marketplaceImages = [
  {
    id: "node-22",
    name: "Node.js 22",
    description: "官方 Node.js 22 镜像，适用于 JavaScript/TypeScript 开发",
    uri: "docker.io/library/node:22",
    architecture: "amd64",
    category: "Runtime",
    downloads: 1250,
  },
  {
    id: "node-22-slim",
    name: "Node.js 22 Slim",
    description: "精简版 Node.js 22 镜像，体积更小",
    uri: "docker.io/library/node:22-slim",
    architecture: "amd64",
    category: "Runtime",
    downloads: 890,
  },
  {
    id: "python-3.12",
    name: "Python 3.12",
    description: "官方 Python 3.12 镜像，适用于 Python 开发",
    uri: "docker.io/library/python:3.12",
    architecture: "amd64",
    category: "Runtime",
    downloads: 1100,
  },
  {
    id: "golang-1.22",
    name: "Go 1.22",
    description: "官方 Go 1.22 镜像，适用于 Go 开发",
    uri: "docker.io/library/golang:1.22",
    architecture: "amd64",
    category: "Runtime",
    downloads: 750,
  },
  {
    id: "rust-latest",
    name: "Rust Latest",
    description: "官方 Rust 最新版本镜像",
    uri: "docker.io/library/rust:latest",
    architecture: "amd64",
    category: "Runtime",
    downloads: 420,
  },
  {
    id: "ubuntu-22.04",
    name: "Ubuntu 22.04",
    description: "官方 Ubuntu 22.04 基础镜像",
    uri: "docker.io/library/ubuntu:22.04",
    architecture: "amd64",
    category: "Base",
    downloads: 2100,
  },
  {
    id: "debian-bookworm",
    name: "Debian Bookworm",
    description: "官方 Debian 12 (Bookworm) 镜像",
    uri: "docker.io/library/debian:bookworm",
    architecture: "amd64",
    category: "Base",
    downloads: 1800,
  },
  {
    id: "alpine-latest",
    name: "Alpine Linux",
    description: "轻量级 Alpine Linux 镜像，适合生产环境",
    uri: "docker.io/library/alpine:latest",
    architecture: "amd64",
    category: "Base",
    downloads: 3200,
  },
]

export default function MarketplaceImagesPage() {
  const [search, setSearch] = useState("")

  const filteredImages = marketplaceImages.filter(
    (img) =>
      img.name.toLowerCase().includes(search.toLowerCase()) ||
      img.description.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索镜像..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredImages.map((image) => (
              <Card key={image.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{image.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {image.description}
                      </CardDescription>
                    </div>
                    <Badge tone="blue">{image.category}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-sm text-muted-foreground font-mono truncate">
                      {image.uri}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        {image.downloads.toLocaleString()} 次下载
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