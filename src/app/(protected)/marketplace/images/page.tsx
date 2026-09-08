"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Download, ExternalLink, Check } from "lucide-react"

interface MarketplaceImage {
  id: string
  name: string
  description: string
  imageUri: string
  architecture: string
  category: string
  icon?: string
  tags: string[]
}

export default function MarketplaceImagesPage() {
  const [search, setSearch] = useState("")
  const [images, setImages] = useState<MarketplaceImage[]>([])
  const [loading, setLoading] = useState(true)
  const [installed, setInstalled] = useState<Set<string>>(new Set())

  const fetchImages = useCallback(async () => {
    try {
      const res = await fetch("/api/marketplace")
      const data = await res.json()
      setImages(data.images ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchImages() }, [fetchImages])

  const filteredImages = images.filter(
    (img) =>
      img.name.toLowerCase().includes(search.toLowerCase()) ||
      img.description.toLowerCase().includes(search.toLowerCase()) ||
      img.category.toLowerCase().includes(search.toLowerCase())
  )

  const handleInstall = async (image: MarketplaceImage) => {
    try {
      await fetch("/api/my-resources/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: image.name,
          description: image.description,
          imageUri: image.imageUri,
          architecture: image.architecture,
          source: "marketplace",
          marketplaceId: image.id,
        }),
      })
      setInstalled((prev) => new Set(prev).add(image.id))
    } catch {
      // ignore
    }
  }

  if (loading) {
    return <div className="flex-1 overflow-auto p-6"><div className="text-muted-foreground">加载中...</div></div>
  }

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
                      <CardDescription className="mt-1">{image.description}</CardDescription>
                    </div>
                    <Badge tone="blue">{image.category}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-sm text-muted-foreground font-mono truncate">{image.imageUri}</div>
                    {image.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {image.tags.map((tag) => (
                          <Badge key={tag} tone="gray" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="outline">
                        <ExternalLink className="h-4 w-4 mr-1" />
                        详情
                      </Button>
                      {installed.has(image.id) ? (
                        <Button size="sm" variant="outline" disabled>
                          <Check className="h-4 w-4 mr-1" />
                          已安装
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => handleInstall(image)}>
                          <Download className="h-4 w-4 mr-1" />
                          安装
                        </Button>
                      )}
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
