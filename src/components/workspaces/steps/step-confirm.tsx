"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Server, MapPin, GitBranch, LayoutTemplate, Network } from "lucide-react";
import { entryKindLabel } from "@/lib/launch-templates/client";
import { type StepProps } from "./types";

export function StepConfirm({ state }: StepProps) {
  const selectedTemplate = state.templates.find(
    (t) => t.id === state.selectedTemplateId
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5 rounded-lg bg-[#eafaf1] px-4 py-3 text-[13px] font-medium leading-6 text-[#0d7a43] dark:bg-[#0d2018] dark:text-[#4cc38a]">
        <Check className="size-4 shrink-0" />
        配置完成，请检查以下信息
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="size-4" />
            基本信息
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-[13px] leading-6">
          <div className="flex justify-between">
            <span className="text-muted-foreground">实例名称</span>
            <span className="font-medium">{state.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">云服务商</span>
            <Badge tone="gray">{state.provider}</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">地域</span>
            <span className="font-medium flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {state.region}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">弹性规格</span>
            <span className="font-medium">
              {state.cloudInstances.find((i) => i.id === state.cloudInstanceId)?.name ?? "未选择"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">实例类型</span>
            <span className="font-medium font-mono text-xs">
              {state.cloudInstances.find((i) => i.id === state.cloudInstanceId)?.instanceType ?? "-"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">磁盘大小</span>
            <span className="font-medium">{state.diskSize} GB</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">带宽峰值</span>
            <span className="font-medium">{state.bandwidth} Mbps</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <GitBranch className="size-4" />
            代码仓库
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-[13px] leading-6">
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
            <p className="italic text-muted-foreground">等待选择仓库</p>
          ) : (
            <p className="italic text-muted-foreground">不拉取代码</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <LayoutTemplate className="size-4" />
            启动模板
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {selectedTemplate ? (
            <>
              <div>
                <span className="text-muted-foreground">启动模板</span>
                <div className="mt-1 flex items-center gap-2">
                  <p className="font-medium">{selectedTemplate.name}</p>
                  <Badge tone="gray" className="text-xs">
                    {entryKindLabel(selectedTemplate.entry)}
                  </Badge>
                </div>
                {selectedTemplate.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {selectedTemplate.description}
                  </p>
                )}
              </div>

              <div className="flex justify-between text-[13px] leading-6">
                <span className="text-muted-foreground">入口文件</span>
                <span className="font-medium font-mono text-xs">
                  {selectedTemplate.entry}
                </span>
              </div>

              <div className="flex justify-between text-[13px] leading-6">
                <span className="text-muted-foreground">文件数</span>
                <span className="font-medium">{selectedTemplate.fileCount} 个</span>
              </div>
            </>
          ) : (
            <p className="italic text-muted-foreground">未选择</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Network className="size-4" />
            网络加速
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-[13px] leading-6">
          <div className="flex justify-between">
            <span className="text-muted-foreground">模式</span>
            <Badge tone={state.proxyMode === "inherit" ? "gray" : state.proxyMode === "disabled" ? "red" : "blue"}>
              {state.proxyMode === "inherit"
                ? "跟随全局设置"
                : state.proxyMode === "disabled"
                  ? "直连"
                  : state.proxyMode === "clash"
                    ? "Clash (mihomo)"
                    : "上游代理"}
            </Badge>
          </div>
          {state.proxyMode === "clash" && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Clash 来源</span>
              <span className="font-medium font-mono text-xs">
                {state.proxyClashSubscription
                  ? "订阅"
                  : state.proxyClashYaml
                    ? "粘贴 YAML"
                    : "（未配置，将使用全局）"}
              </span>
            </div>
          )}
          {state.proxyMode === "upstream" && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">上游地址</span>
              <span className="font-medium font-mono text-xs">
                {state.proxyUpstreamUrl || "（未配置，将使用全局）"}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
