"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Download, ExternalLink, Check } from "lucide-react"

interface MarketplaceFeature {
  id: string
  name: string
  description: string
  featureUri: string
  category: string
  icon?: string
  tags: string[]
  options?: Record<string, unknown>
}

export default function MarketplaceFeaturesPage() {
  const [search, setSearch] = useState("")
  const [features, setFeatures] = useState<MarketplaceFeature[]>([])
  const [loading, setLoading] = useState(true)
  const [installed, setInstalled] = useState<Set<string>>(new Set())

  const fetchFeatures = useCallback(async () => {
    try {
      const res = await fetch("/api/marketplace")
      const data = await res.json()
      setFeatures(data.features ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchFeatures() }, [fetchFeatures])

  const filteredFeatures = features.filter(
    (feat) =>
      feat.name.toLowerCase().includes(search.toLowerCase()) ||
      feat.description.toLowerCase().includes(search.toLowerCase()) ||
      feat.category.toLowerCase().includes(search.toLowerCase())
  )

  const handleInstall = async (feature: MarketplaceFeature) => {
    try {
      await fetch("/api/my-resources/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: feature.name,
          description: feature.description,
          featureUri: feature.featureUri,
          options: feature.options ?? {},
          source: "marketplace",
          marketplaceId: feature.id,
        }),
      })
      setInstalled((prev) => new Set(prev).add(feature.id))
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
                      <CardDescription className="mt-1">{feature.description}</CardDescription>
                    </div>
                    <Badge tone="blue">{feature.category}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-sm text-muted-foreground font-mono truncate">{feature.featureUri}</div>
                    {feature.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {feature.tags.map((tag) => (
                          <Badge key={tag} tone="gray" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="outline">
                        <ExternalLink className="h-4 w-4 mr-1" />
                        详情
                      </Button>
                      {installed.has(feature.id) ? (
                        <Button size="sm" variant="outline" disabled>
                          <Check className="h-4 w-4 mr-1" />
                          已安装
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => handleInstall(feature)}>
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
