"use client";

import { useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImageIcon, Puzzle, FileCode } from "lucide-react";
import { type StepProps } from "./types";

export function StepEnvironment({ state, setState }: StepProps) {
  useEffect(() => {
    if (state.myImages.length > 0) return;

    Promise.all([
      fetch("/api/my-resources/images").then((r) => r.json()),
      fetch("/api/my-resources/features").then((r) => r.json()),
      fetch("/api/my-resources/scripts").then((r) => r.json()),
    ])
      .then(([imagesData, featuresData, scriptsData]) => {
        setState((s) => ({
          ...s,
          myImages: imagesData.images ?? [],
          myFeatures: featuresData.features ?? [],
          myScripts: scriptsData.scripts ?? [],
        }));
      })
      .catch(() => {});
  }, [state.myImages.length, setState]);

  const toggleFeature = (featureId: string, checked: boolean) => {
    setState((s) => {
      const selectedFeatureIds = checked
        ? [...s.selectedFeatureIds, featureId]
        : s.selectedFeatureIds.filter((id) => id !== featureId);
      return { ...s, selectedFeatureIds };
    });
  };

  const toggleScript = (scriptId: string, checked: boolean) => {
    setState((s) => {
      const selectedScriptIds = checked
        ? [...s.selectedScriptIds, scriptId]
        : s.selectedScriptIds.filter((id) => id !== scriptId);
      return { ...s, selectedScriptIds };
    });
  };

  const isLoading = state.myImages.length === 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Spinner className="h-4 w-4" />
          <span>加载我的资源...</span>
        </div>
      </div>
    );
  }

  const selectedImage = state.myImages.find((img) => img.id === state.selectedImageId);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4" />
          <Label className="text-base font-medium">运行镜像</Label>
        </div>
        {state.myImages.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-center">
            <p className="text-sm text-muted-foreground">
              还没有镜像，请先在{" "}
              <a href="/my-resources/images" className="text-primary underline">
                我的镜像
              </a>{" "}
              中添加
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            {state.myImages.map((image) => (
              <label
                key={image.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                  state.selectedImageId === image.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <input
                  type="radio"
                  name="image"
                  className="mt-1"
                  checked={state.selectedImageId === image.id}
                  onChange={() => setState((s) => ({ ...s, selectedImageId: image.id }))}
                />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{image.name}</span>
                    <Badge tone={image.source === "marketplace" ? "blue" : "gray"} className="text-xs">
                      {image.source === "marketplace" ? "市场" : "自定义"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {image.imageUri}
                  </p>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Puzzle className="h-4 w-4" />
          <Label className="text-base font-medium">Features</Label>
          <span className="text-xs text-muted-foreground">
            ({state.selectedFeatureIds.length} 已选)
          </span>
        </div>
        {state.myFeatures.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-center">
            <p className="text-sm text-muted-foreground">
              还没有 Features，可以在{" "}
              <a href="/marketplace/features" className="text-primary underline">
                市场
              </a>{" "}
              中安装
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            {state.myFeatures.map((feature) => (
              <div
                key={feature.id}
                className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                  state.selectedFeatureIds.includes(feature.id)
                    ? "border-primary bg-primary/5"
                    : "border-border"
                }`}
              >
                <Checkbox
                  id={`feature-${feature.id}`}
                  checked={state.selectedFeatureIds.includes(feature.id)}
                  onCheckedChange={(checked) => toggleFeature(feature.id, checked === true)}
                  className="mt-0.5"
                />
                <div className="flex-1 space-y-1">
                  <Label htmlFor={`feature-${feature.id}`} className="font-medium cursor-pointer">
                    {feature.name}
                  </Label>
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {feature.featureUri}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <FileCode className="h-4 w-4" />
          <Label className="text-base font-medium">自定义脚本</Label>
          <span className="text-xs text-muted-foreground">
            ({state.selectedScriptIds.length} 已选)
          </span>
        </div>
        {state.myScripts.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-center">
            <p className="text-sm text-muted-foreground">
              还没有脚本，可以在{" "}
              <a href="/my-resources/scripts" className="text-primary underline">
                我的脚本
              </a>{" "}
              中添加
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            {state.myScripts
              .filter((s) => s.enabled)
              .map((script) => (
                <div
                  key={script.id}
                  className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                    state.selectedScriptIds.includes(script.id)
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  }`}
                >
                  <Checkbox
                    id={`script-${script.id}`}
                    checked={state.selectedScriptIds.includes(script.id)}
                    onCheckedChange={(checked) => toggleScript(script.id, checked === true)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 space-y-1">
                    <Label htmlFor={`script-${script.id}`} className="font-medium cursor-pointer">
                      {script.name}
                    </Label>
                    {script.description && (
                      <p className="text-xs text-muted-foreground">{script.description}</p>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {selectedImage && (
        <Card className="bg-muted/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">当前配置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">镜像:</span>{" "}
              <span className="font-mono">{selectedImage.imageUri}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Features:</span>{" "}
              {state.selectedFeatureIds.length} 个
            </p>
            <p>
              <span className="text-muted-foreground">脚本:</span>{" "}
              {state.selectedScriptIds.length} 个
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
