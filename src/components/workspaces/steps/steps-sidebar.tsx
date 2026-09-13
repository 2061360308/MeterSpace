"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { REGIONS } from "@/lib/constants";
import { Check, Circle, ChevronDown, ChevronRight } from "lucide-react";
import { type WizardState, STEP_CONFIG } from "./types";

interface StepsSidebarProps {
  state: WizardState;
}

function getStepSummary(step: number, state: WizardState): string {
  switch (step) {
    case 1: {
      const region = REGIONS.find((r) => r.id === state.region);
      return state.name && region ? `${state.name} · ${region.label}` : state.name || region?.label || "未设置";
    }
    case 2: {
      if (!state.autoClone) return "不拉取";
      if (state.gitRepoUrl) return state.gitRepoUrl.split("/").pop() || "已配置";
      return "未配置";
    }
    case 3: {
      const tpl = state.templates.find((t) => t.id === state.selectedTemplateId);
      if (!tpl) return "未配置";
      const paramCount = (tpl.params ?? []).length;
      return paramCount > 0 ? `${tpl.name} · ${paramCount} 项参数` : tpl.name;
    }
    case 4: {
      const label =
        state.proxyMode === "inherit"
          ? "跟随全局设置"
          : state.proxyMode === "disabled"
            ? "直连"
            : state.proxyMode === "clash"
              ? "Clash (mihomo)"
              : "上游代理";
      return label;
    }
    default:
      return "";
  }
}

function StepDetail({ step, state }: { step: number; state: WizardState }) {
  switch (step) {
    case 1:
      return (
        <dl className="space-y-1.5 text-[12px] leading-5">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">名称</dt>
            <dd className="font-medium truncate ml-2">{state.name || "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">服务商</dt>
            <dd className="font-medium truncate ml-2">{state.provider}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">地域</dt>
            <dd className="font-medium truncate ml-2">
              {REGIONS.find((r) => r.id === state.region)?.label ?? "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">弹性规格</dt>
            <dd className="font-medium truncate ml-2">
              {state.cloudInstances.find((i) => i.id === state.cloudInstanceId)?.name ?? "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">磁盘</dt>
            <dd className="font-medium">{state.diskSize} GB</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">带宽</dt>
            <dd className="font-medium">{state.bandwidth} Mbps</dd>
          </div>
        </dl>
      );
    case 2:
      return (
        <dl className="space-y-1.5 text-[12px] leading-5">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">自动拉取</dt>
            <dd className="font-medium">{state.autoClone ? "是" : "否"}</dd>
          </div>
          {state.autoClone && (
            <>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">仓库</dt>
                <dd className="font-medium truncate ml-2">
                  {state.gitRepoUrl.split("/").pop() || "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">分支</dt>
                <dd className="font-medium">{state.gitBranch}</dd>
              </div>
            </>
          )}
        </dl>
      );
    case 3: {
      const tpl = state.templates.find((t) => t.id === state.selectedTemplateId);
      return (
        <dl className="space-y-1.5 text-[12px] leading-5">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">模板</dt>
            <dd className="font-medium truncate ml-2">{tpl?.name || "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">入口</dt>
            <dd className="font-medium truncate ml-2">{tpl?.entry || "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">文件数</dt>
            <dd className="font-medium">{tpl?.fileCount ?? 0}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">参数</dt>
            <dd className="font-medium">{(tpl?.params ?? []).length} 项</dd>
          </div>
        </dl>
      );
    }
    case 4:
      return (
        <dl className="space-y-1.5 text-[12px] leading-5">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">代理模式</dt>
            <dd className="font-medium truncate ml-2">
              {state.proxyMode === "inherit"
                ? "跟随全局设置"
                : state.proxyMode === "disabled"
                  ? "直连"
                  : state.proxyMode === "clash"
                    ? "Clash (mihomo)"
                    : "上游代理"}
            </dd>
          </div>
          {state.proxyMode === "clash" && (
            <>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">订阅地址</dt>
                <dd className="font-medium truncate ml-2">
                  {state.proxyClashSubscription || "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">粘贴 YAML</dt>
                <dd className="font-medium truncate ml-2">
                  {state.proxyClashYaml ? "已填写" : "—"}
                </dd>
              </div>
            </>
          )}
          {state.proxyMode === "upstream" && (
            <>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">上游地址</dt>
                <dd className="font-medium truncate ml-2">
                  {state.proxyUpstreamUrl || "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">用户名</dt>
                <dd className="font-medium truncate ml-2">
                  {state.proxyUpstreamUsername || "—"}
                </dd>
              </div>
            </>
          )}
        </dl>
      );
    case 5:
      return (
        <p className="text-[12px] leading-5 text-muted-foreground">
          确认所有配置无误后，点击创建工作区。
        </p>
      );
    default:
      return null;
  }
}

export function StepsSidebar({ state }: StepsSidebarProps) {
  const [openSteps, setOpenSteps] = useState<Set<number>>(
    new Set([state.currentStep])
  );

  useEffect(() => {
    setOpenSteps((prev) => new Set([...prev, state.currentStep]));
  }, [state.currentStep]);

  const toggleStep = (stepId: number) => {
    setOpenSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  return (
    <Card className="px-4">
      <h3 className="text-[13px] font-medium leading-6">配置概要</h3>
      <div className="space-y-1">
        {STEP_CONFIG.map((step) => {
          const isCurrent = state.currentStep === step.id;
          const isCompleted = state.completedSteps.has(step.id);
          const isOpen = openSteps.has(step.id);
          const summary = getStepSummary(step.id, state);
          const canExpand = isCompleted || isCurrent;

          return (
            <Collapsible
              key={step.id}
              open={isOpen}
              onOpenChange={() => canExpand && toggleStep(step.id)}
            >
              <CollapsibleTrigger asChild>
                <button
                  className={`flex w-full items-start gap-3 rounded-md p-2 text-left transition-colors ${
                    isCurrent
                      ? "bg-accent text-accent-foreground shadow-border"
                      : isCompleted
                      ? "cursor-pointer hover:bg-accent/60"
                      : "cursor-default text-muted-foreground"
                  }`}
                  disabled={!canExpand}
                >
                  <div className="mt-0.5">
                    {isCompleted ? (
                      <div className="flex size-5 items-center justify-center rounded-full bg-foreground text-background">
                        <Check className="size-3" />
                      </div>
                    ) : isCurrent ? (
                      <div className="flex size-5 items-center justify-center rounded-full border-2 border-foreground">
                        <div className="size-2 rounded-full bg-foreground" />
                      </div>
                    ) : (
                      <div className="flex size-5 items-center justify-center rounded-full border-2 border-border">
                        <Circle className="size-3 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`text-[13px] leading-6 ${isCurrent ? "font-medium" : ""}`}>
                        {step.id}. {step.title}
                      </span>
                      {canExpand && (
                        <span className="text-muted-foreground">
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </span>
                      )}
                    </div>
                    {(isCompleted || isCurrent) && !isOpen && (
                      <div className="truncate text-[12px] leading-5 text-muted-foreground">
                        {summary}
                      </div>
                    )}
                  </div>
                </button>
              </CollapsibleTrigger>
              {(isCompleted || isCurrent) && (
                <CollapsibleContent>
                  <div className="pl-8 pr-2 pb-2">
                    <StepDetail step={step.id} state={state} />
                  </div>
                </CollapsibleContent>
              )}
            </Collapsible>
          );
        })}
      </div>
    </Card>
  );
}
