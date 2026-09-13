/**
 * Wizard 第 3 步：选启动模板。
 *
 * v3：仅展示当前用户的 launch_templates（不含参数），无 ParamField 渲染。
 * 标题：「启动模板」；空态引导「去新建」。
 */

"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LayoutTemplate } from "lucide-react";
import {
  fetchLaunchTemplates,
  entryKindLabel,
  CATEGORY_LABEL,
  ORIGIN_LABEL,
  type LaunchTemplateSummary,
} from "@/lib/launch-templates/client";
import { type StepProps } from "./types";

export function StepEnvironment({ state, setState }: StepProps) {
  useEffect(() => {
    if (state.templatesLoaded) return;

    fetchLaunchTemplates()
      .then((items) => {
        setState((s) => ({
          ...s,
          templates: items as unknown as WizardState["templates"],
          templatesLoaded: true,
        }));
      })
      .catch(() => {
        setState((s) => ({ ...s, templatesLoaded: true }));
      });
  }, [state.templatesLoaded, setState]);

  const selectTemplate = (id: string) => {
    setState((s) => ({
      ...s,
      selectedTemplateId: id,
      // launch_templates 无 params；只是兼容结构
      templateParams: {},
    }));
  };

  if (!state.templatesLoaded) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-24" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[62px] w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const selectedTemplate = state.templates.find(
    (t) => t.id === state.selectedTemplateId,
  );

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <LayoutTemplate className="size-4" />
          <Label className="text-[13px] font-medium leading-6">启动模板</Label>
          <span className="text-[12px] leading-5 text-muted-foreground">
            （不可在系统内修改；要在 IDE 改就下载 → 改 → 重新上传）
          </span>
        </div>
        {state.templates.length === 0 ? (
          <div className="rounded-lg bg-muted px-4 py-6 text-center">
            <p className="text-[13px] leading-6 text-muted-foreground">
              还没有启动模板。前往{" "}
              <Link href="/launch-templates/new" className="underline">
                新建
              </Link>
              ，上传 zip 或从配方派生。
            </p>
          </div>
        ) : (
          <RadioGroup
            value={state.selectedTemplateId}
            onValueChange={selectTemplate}
            className="grid gap-2"
          >
            {state.templates.map((tpl) => {
              const active = state.selectedTemplateId === tpl.id;
              const lt = tpl as unknown as LaunchTemplateSummary;
              return (
                <Label
                  key={tpl.id}
                  htmlFor={`tpl-${tpl.id}`}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg bg-card p-3 font-normal shadow-border transition-colors ${
                    active ? "bg-accent" : "hover:bg-accent/50"
                  }`}
                >
                  <RadioGroupItem id={`tpl-${tpl.id}`} value={tpl.id} className="mt-0.5" />
                  <span className="flex-1 space-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-medium leading-6">
                        {tpl.name}
                      </span>
                      <Badge tone="gray">{entryKindLabel(tpl.entry)}</Badge>
                      {lt.category && (
                        <Badge tone="gray">
                          {CATEGORY_LABEL[lt.category] ?? lt.category}
                        </Badge>
                      )}
                      <Badge tone="gray">{ORIGIN_LABEL[lt.originKind]}</Badge>
                      <span className="text-[12px] leading-5 text-muted-foreground">
                        {tpl.fileCount} 个文件
                      </span>
                    </span>
                    {tpl.description && (
                      <span className="block truncate text-[12px] leading-5 text-muted-foreground">
                        {tpl.description}
                      </span>
                    )}
                  </span>
                </Label>
              );
            })}
          </RadioGroup>
        )}
      </div>

      {selectedTemplate && (
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle>当前配置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-[13px] leading-6">
            <p>
              <span className="text-muted-foreground">启动模板：</span>
              {selectedTemplate.name}
            </p>
            <p>
              <span className="text-muted-foreground">入口：</span>
              <span className="font-mono text-[12px]">
                {selectedTemplate.entry}
              </span>
            </p>
            <p>
              <span className="text-muted-foreground">文件数：</span>
              {selectedTemplate.fileCount} 个
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// 类型别名（state.templates 现在是 LaunchTemplateSummary[]，但保持 shape 与旧 TemplateSummary 一致）
type WizardState = import("./types").WizardState;
