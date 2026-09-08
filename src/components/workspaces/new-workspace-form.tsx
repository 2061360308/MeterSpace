"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DEFAULT_IMAGE_URI } from "@/lib/constants";
import { StepsSidebar } from "./steps/steps-sidebar";
import { StepBasic } from "./steps/step-basic";
import { StepFeatures } from "./steps/step-features";
import { StepGit } from "./steps/step-git";
import { STEP_CONFIG, type WizardState } from "./steps/types";

const INITIAL_STATE: WizardState = {
  currentStep: 1,
  completedSteps: new Set(),
  name: "",
  provider: "aliyun",
  region: "",
  imageUri: DEFAULT_IMAGE_URI,
  featureDefs: [],
  selectedFeatures: {},
  autoClone: true,
  gitRepoUrl: "",
  gitBranch: "main",
  repos: [],
  gitAuthed: false,
  priceData: { loading: false },
  loading: false,
  error: "",
};

export function NewWorkspaceForm() {
  const router = useRouter();
  const [state, setState] = useState<WizardState>(INITIAL_STATE);

  const goPrev = () =>
    setState((s) => ({ ...s, currentStep: Math.max(1, s.currentStep - 1) }));

  const goNext = () => {
    const { currentStep } = state;
    if (validateStep(currentStep)) return;
    setState((s) => ({
      ...s,
      currentStep: Math.min(STEP_CONFIG.length, currentStep + 1),
      completedSteps: new Set(s.completedSteps).add(currentStep),
    }));
  };

  const validateStep = (step: number): string | null => {
    switch (step) {
      case 1:
        if (!state.name.trim()) return "请填写实例名称";
        if (!state.region) return "请选择地域";
        return null;
      case 2:
        return null;
      case 3:
        if (state.autoClone && !state.gitRepoUrl) return "请选择一个代码仓库";
        return null;
      default:
        return null;
    }
  };

  const stepError = validateStep(state.currentStep);

  async function onSubmit() {
    if (stepError) return;
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const features = Object.entries(state.selectedFeatures).map(
        ([id, version]) => ({ id, version })
      );
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: state.name,
          provider: state.provider,
          region: state.region,
          publicIp: true,
          imageUri: state.imageUri,
          features,
          gitProvider: state.gitRepoUrl ? "github" : null,
          gitRepoUrl: state.gitRepoUrl || null,
          gitBranch: state.gitBranch,
          autoClone: state.autoClone,
          releaseHours: null,
          idleMinutes: null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "创建失败");
      router.push(`/workspaces/${data.workspaceId}`);
      router.refresh();
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: (e as Error).message,
      }));
    }
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)]">
      {/* 左侧内容区域 - 独立滚动 */}
      <div className="flex-1 overflow-y-auto">
        {state.currentStep === 1 && <div className="p-6"><StepBasic state={state} setState={setState} /></div>}
        {state.currentStep === 2 && <div className="p-6"><StepFeatures state={state} setState={setState} /></div>}
        {state.currentStep === 3 && <div className="p-6"><StepGit state={state} setState={setState} /></div>}
      </div>

      {/* 右侧配置概要 - 固定宽度 */}
      <div className="w-[320px] border-l flex flex-col bg-background">
        {/* 配置概要内容 - 独立滚动 */}
        <div className="flex-1 overflow-y-auto p-4">
          <StepsSidebar state={state} />
        </div>

        {/* 底部导航按钮 - 固定在右侧底部 */}
        <div className="border-t p-4 space-y-3">
          <div className="text-xs text-muted-foreground text-center">
            第 {state.currentStep} / {STEP_CONFIG.length} 步
          </div>
          {(state.error || stepError) && (
            <p className="text-xs text-destructive text-center">
              {state.error || stepError}
            </p>
          )}
          <div className="flex gap-2">
            {state.currentStep > 1 && (
              <Button
                variant="outline"
                onClick={goPrev}
                disabled={state.loading}
                className="flex-1"
              >
                上一步
              </Button>
            )}
            {state.currentStep === STEP_CONFIG.length ? (
              <Button
                onClick={onSubmit}
                disabled={state.loading}
                className="flex-1 bg-orange-500 hover:bg-orange-600"
              >
                {state.loading ? "创建中..." : "创建工作区"}
              </Button>
            ) : (
              <Button
                onClick={goNext}
                disabled={state.loading}
                className="flex-1 bg-orange-500 hover:bg-orange-600"
              >
                下一步
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
