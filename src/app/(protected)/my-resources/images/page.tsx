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

interface UserImage {
  id: string
  name: string
  description: string
  imageUri: string
  architecture: string
  source: "marketplace" | "custom"
}

export default function MyImagesPage() {
  const [search, setSearch] = useState("")
  const [images, setImages] = useState<UserImage[]>([
    {
      id: "1",
      name: "Node.js 22",
      description: "从市场安装的 Node.js 镜像",
      imageUri: "docker.io/library/node:22",
      architecture: "amd64",
      source: "marketplace",
    },
    {
      id: "2",
      name: "自定义 Node.js",
      description: "基于 Node.js 22 的自定义镜像",
      imageUri: "my-registry.com/node-custom:latest",
      architecture: "amd64",
      source: "custom",
    },
  ])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newImage, setNewImage] = useState({
    name: "",
    description: "",
    imageUri: "",
  })

  const filteredImages = images.filter(
    (img) =>
      img.name.toLowerCase().includes(search.toLowerCase()) ||
      img.description.toLowerCase().includes(search.toLowerCase())
  )

  const handleAddImage = () => {
    if (!newImage.name || !newImage.imageUri) return

    const image: UserImage = {
      id: Date.now().toString(),
      name: newImage.name,
      description: newImage.description,
      imageUri: newImage.imageUri,
      architecture: "amd64",
      source: "custom",
    }

    setImages([...images, image])
    setNewImage({ name: "", description: "", imageUri: "" })
    setDialogOpen(false)
  }

  const handleDeleteImage = (id: string) => {
    setImages(images.filter((img) => img.id !== id))
  }

  return (
    <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索镜像..."
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
                    <DialogTitle>添加自定义镜像</DialogTitle>
                    <DialogDescription>
                      输入镜像 URI 来添加自定义镜像
                    </DialogDescription>
                  </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">名称</Label>
                    <Input
                      id="name"
                      placeholder="例如：My Custom Node"
                      value={newImage.name}
                      onChange={(e) =>
                        setNewImage({ ...newImage, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">描述</Label>
                    <Textarea
                      id="description"
                      placeholder="镜像描述..."
                      value={newImage.description}
                      onChange={(e) =>
                        setNewImage({
                          ...newImage,
                          description: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="uri">镜像 URI</Label>
                    <Input
                      id="uri"
                      placeholder="例如：docker.io/library/node:22"
                      value={newImage.imageUri}
                      onChange={(e) =>
                        setNewImage({ ...newImage, imageUri: e.target.value })
                      }
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    取消
                  </Button>
                  <Button onClick={handleAddImage}>添加</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button asChild variant="outline" size="sm">
              <Link href="/marketplace/images">
                浏览市场
              </Link>
            </Button>
          </ButtonGroup>
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
                    <Badge tone={image.source === "marketplace" ? "blue" : "gray"}>
                      {image.source === "marketplace" ? "市场" : "自定义"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-sm text-muted-foreground font-mono truncate">
                      {image.imageUri}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        {image.architecture}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteImage(image.id)}
                        >
                          <Trash2 className="h-4 w-4" />
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