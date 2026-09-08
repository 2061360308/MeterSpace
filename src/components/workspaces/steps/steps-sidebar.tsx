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
      const count = Object.keys(state.selectedFeatures).length;
      return count > 0 ? `${count} 个工具` : "无";
    }
    case 3: {
      if (!state.autoClone) return "不拉取";
      if (state.gitRepoUrl) return state.gitRepoUrl.split("/").pop() || "已配置";
      return "未配置";
    }
    default:
      return "";
  }
}

function StepDetail({ step, state }: { step: number; state: WizardState }) {
  switch (step) {
    case 1:
      return (
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">名称</dt>
            <dd className="font-medium truncate ml-2">{state.name || "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">地域</dt>
            <dd className="font-medium truncate ml-2">
              {REGIONS.find((r) => r.id === state.region)?.label ?? "—"}
            </dd>
          </div>
        </dl>
      );
    case 2: {
      const selected = Object.keys(state.selectedFeatures);
      return (
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">已选工具</dt>
            <dd className="font-medium">
              {selected.length > 0 ? selected.length : "无"}
            </dd>
          </div>
          {selected.length > 0 && (
            <dd className="text-xs text-muted-foreground truncate">
              {selected.join(", ")}
            </dd>
          )}
        </dl>
      );
    }
    case 3:
      return (
        <dl className="space-y-1 text-sm">
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
    <Card className="p-4 border-0 shadow-none">
      <h3 className="font-medium mb-4">配置概要</h3>
      <div className="space-y-2">
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
                  className={`w-full flex items-start gap-3 rounded-lg p-2 text-left transition-colors ${
                    isCurrent
                      ? "bg-primary/10 text-primary"
                      : isCompleted
                      ? "hover:bg-muted cursor-pointer"
                      : "text-muted-foreground cursor-default"
                  }`}
                  disabled={!canExpand}
                >
                  <div className="mt-0.5">
                    {isCompleted ? (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </div>
                    ) : isCurrent ? (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-primary">
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      </div>
                    ) : (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-muted-foreground/30">
                        <Circle className="h-3 w-3 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm ${isCurrent ? "font-medium" : ""}`}>
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
                      <div className="text-xs text-muted-foreground truncate">
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
