"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Trash2, Edit } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface UserFeature {
  id: string
  name: string
  description: string
  featureUri: string
  options: Record<string, unknown>
  source: "marketplace" | "custom"
}

export default function MyFeaturesPage() {
  const [search, setSearch] = useState("")
  const [features, setFeatures] = useState<UserFeature[]>([
    {
      id: "1",
      name: "Node.js",
      description: "从市场安装的 Node.js Feature",
      featureUri: "ghcr.io/devcontainers/features/node:1",
      options: { version: "22" },
      source: "marketplace",
    },
    {
      id: "2",
      name: "Docker",
      description: "Docker in Docker Feature",
      featureUri: "ghcr.io/devcontainers/features/docker-in-docker:2",
      options: {},
      source: "marketplace",
    },
  ])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newFeature, setNewFeature] = useState({
    name: "",
    description: "",
    featureUri: "",
  })

  const filteredFeatures = features.filter(
    (feat) =>
      feat.name.toLowerCase().includes(search.toLowerCase()) ||
      feat.description.toLowerCase().includes(search.toLowerCase())
  )

  const handleAddFeature = () => {
    if (!newFeature.name || !newFeature.featureUri) return

    const feature: UserFeature = {
      id: Date.now().toString(),
      name: newFeature.name,
      description: newFeature.description,
      featureUri: newFeature.featureUri,
      options: {},
      source: "custom",
    }

    setFeatures([...features, feature])
    setNewFeature({ name: "", description: "", featureUri: "" })
    setDialogOpen(false)
  }

  const handleDeleteFeature = (id: string) => {
    setFeatures(features.filter((feat) => feat.id !== id))
  }

  return (
    <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索 Features..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <ButtonGroup>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon-sm">
                    <Plus />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>添加自定义 Feature</DialogTitle>
                    <DialogDescription>
                      输入 Feature URI 来添加自定义 Feature
                    </DialogDescription>
                  </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">名称</Label>
                    <Input
                      id="name"
                      placeholder="例如：My Custom Feature"
                      value={newFeature.name}
                      onChange={(e) =>
                        setNewFeature({ ...newFeature, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">描述</Label>
                    <Textarea
                      id="description"
                      placeholder="Feature 描述..."
                      value={newFeature.description}
                      onChange={(e) =>
                        setNewFeature({
                          ...newFeature,
                          description: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="uri">Feature URI</Label>
                    <Input
                      id="uri"
                      placeholder="例如：ghcr.io/devcontainers/features/node:1"
                      value={newFeature.featureUri}
                      onChange={(e) =>
                        setNewFeature({
                          ...newFeature,
                          featureUri: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    取消
                  </Button>
                  <Button onClick={handleAddFeature}>添加</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button asChild variant="outline" size="sm">
              <Link href="/marketplace/features">
                浏览市场
              </Link>
            </Button>
          </ButtonGroup>
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
                    <Badge tone={feature.source === "marketplace" ? "blue" : "gray"}>
                      {feature.source === "marketplace" ? "市场" : "自定义"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-sm text-muted-foreground font-mono truncate">
                      {feature.featureUri}
                    </div>
                    {Object.keys(feature.options).length > 0 && (
                      <div className="text-sm text-muted-foreground">
                        选项: {JSON.stringify(feature.options)}
                      </div>
                    )}
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="outline">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteFeature(feature.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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