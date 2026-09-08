"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Server, MapPin, GitBranch, ImageIcon, Puzzle, FileCode } from "lucide-react";
import { type StepProps } from "./types";

export function StepConfirm({ state }: StepProps) {
  const selectedImage = state.myImages.find((img) => img.id === state.selectedImageId);
  const selectedFeatures = state.myFeatures.filter((f) =>
    state.selectedFeatureIds.includes(f.id)
  );
  const selectedScripts = state.myScripts.filter((s) =>
    state.selectedScriptIds.includes(s.id)
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 p-4">
        <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
          <Check className="h-5 w-5" />
          <span className="font-medium">配置完成，请检查以下信息</span>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="h-4 w-4" />
            基本信息
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">实例名称</span>
            <span className="font-medium">{state.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">地域</span>
            <span className="font-medium flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {state.region}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">云服务商</span>
            <Badge tone="gray">{state.provider}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            代码仓库
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {state.autoClone && state.gitRepoUrl ? (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">仓库</span>
                <span className="font-medium font-mono text-xs">{state.gitRepoUrl}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">分支</span>
                <span className="font-medium">{state.gitBranch}</span>
              </div>
            </>
          ) : state.autoClone ? (
            <p className="text-muted-foreground italic">等待选择仓库</p>
          ) : (
            <p className="text-muted-foreground italic">不拉取代码</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            运行环境
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <span className="text-muted-foreground">镜像</span>
            {selectedImage ? (
              <div className="mt-1">
                <p className="font-medium">{selectedImage.name}</p>
                <p className="text-xs font-mono text-muted-foreground">
                  {selectedImage.imageUri}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground italic">未选择</p>
            )}
          </div>

          <div>
            <span className="text-muted-foreground flex items-center gap-1">
              <Puzzle className="h-3 w-3" />
              Features ({selectedFeatures.length})
            </span>
            {selectedFeatures.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {selectedFeatures.map((f) => (
                  <Badge key={f.id} tone="blue" className="text-xs">
                    {f.name}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground italic text-xs">无</p>
            )}
          </div>

          <div>
            <span className="text-muted-foreground flex items-center gap-1">
              <FileCode className="h-3 w-3" />
              自定义脚本 ({selectedScripts.length})
            </span>
            {selectedScripts.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {selectedScripts.map((s) => (
                  <Badge key={s.id} tone="gray" className="text-xs">
                    {s.name}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground italic text-xs">无</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
