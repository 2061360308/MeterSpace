"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StepsSidebar } from "./steps/steps-sidebar";
import { StepBasic } from "./steps/step-basic";
import { StepGit } from "./steps/step-git";
import { StepEnvironment } from "./steps/step-environment";
import { StepNetwork } from "./steps/step-network";
import { StepConfirm } from "./steps/step-confirm";
import { STEP_CONFIG, type WizardState } from "./steps/types";

const INITIAL_STATE: WizardState = {
  currentStep: 1,
  completedSteps: new Set(),
  name: "",
  provider: "aliyun",
  region: "",
  cloudInstanceId: "",
  cloudInstances: [],
  diskSize: 40,
  bandwidth: 10,
  imageUri: "",
  autoClone: true,
  gitRepoUrl: "",
  gitBranch: "main",
  repos: [],
  gitAuthed: false,
  myImages: [],
  myFeatures: [],
  myScripts: [],
  selectedImageId: "",
  selectedFeatureIds: [],
  selectedScriptIds: [],
  proxyMode: "inherit",
  proxyClashSubscription: "",
  proxyClashYaml: "",
  proxyUpstreamUrl: "",
  proxyUpstreamUsername: "",
  proxyUpstreamSecret: "",
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
        if (!state.provider) return "请选择服务商";
        if (!state.region) return "请选择地域";
        return null;
      case 2:
        if (state.autoClone && !state.gitRepoUrl) return "请选择一个代码仓库";
        return null;
      case 3:
        if (!state.selectedImageId) return "请选择运行镜像";
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
      const selectedImage = state.myImages.find((img) => img.id === state.selectedImageId);
      const selectedFeatures = state.myFeatures
        .filter((f) => state.selectedFeatureIds.includes(f.id))
        .map((f) => ({ id: f.id, version: "latest", uri: f.featureUri }));
      const selectedScripts = state.myScripts
        .filter((s) => state.selectedScriptIds.includes(s.id))
        .map((s) => ({ id: s.id, name: s.name, script: s.script }));

      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: state.name,
          provider: state.provider,
          region: state.region,
          cloudInstanceId: state.cloudInstanceId,
          diskSize: state.diskSize,
          bandwidth: state.bandwidth,
          publicIp: true,
          imageUri: selectedImage?.imageUri ?? "",
          features: selectedFeatures,
          scripts: selectedScripts,
          gitProvider: state.gitRepoUrl ? "github" : null,
          gitRepoUrl: state.gitRepoUrl || null,
          gitBranch: state.gitBranch,
          autoClone: state.autoClone,
          releaseHours: null,
          idleMinutes: null,
          proxyMode: state.proxyMode,
          proxyClashSubscription:
            state.proxyMode === "clash" ? state.proxyClashSubscription || null : undefined,
          proxyClashYaml:
            state.proxyMode === "clash" ? state.proxyClashYaml || null : undefined,
          proxyUpstreamUrl:
            state.proxyMode === "upstream" ? state.proxyUpstreamUrl || null : undefined,
          proxyUpstreamUsername:
            state.proxyMode === "upstream" ? state.proxyUpstreamUsername || null : undefined,
          proxyUpstreamSecret:
            state.proxyMode === "upstream" ? state.proxyUpstreamSecret || undefined : undefined,
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
      <div className="flex-1 overflow-y-auto">
        {state.currentStep === 1 && <div className="p-6"><StepBasic state={state} setState={setState} /></div>}
        {state.currentStep === 2 && <div className="p-6"><StepGit state={state} setState={setState} /></div>}
        {state.currentStep === 3 && <div className="p-6"><StepEnvironment state={state} setState={setState} /></div>}
        {state.currentStep === 4 && <div className="p-6"><StepNetwork state={state} setState={setState} /></div>}
        {state.currentStep === 5 && <div className="p-6"><StepConfirm state={state} setState={setState} /></div>}
      </div>

      <div className="w-[320px] border-l flex flex-col bg-background">
        <div className="flex-1 overflow-y-auto p-4">
          <StepsSidebar state={state} />
        </div>

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
