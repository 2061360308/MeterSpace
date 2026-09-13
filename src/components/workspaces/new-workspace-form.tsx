"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
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
  autoClone: true,
  gitRepoUrl: "",
  gitBranch: "main",
  repos: [],
  gitAuthed: false,
  templates: [],
  templatesLoaded: false,
  selectedTemplateId: "",
  templateParams: {},
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
  // 支持 ?launchTemplate=<id> 预选：来自 /launch-templates 的「创建工作区」
  const [state, setState] = useState<WizardState>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const preId = params.get("launchTemplate") ?? "";
      return { ...INITIAL_STATE, selectedTemplateId: preId };
    }
    return INITIAL_STATE;
  });

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
        if (!state.selectedTemplateId) return "请选择模板";
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
      const res = await fetch(
        `/api/launch-templates/${state.selectedTemplateId}/instantiate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: state.name,
            provider: state.provider,
            region: state.region,
            // launch_templates.params 永远为 []；这里保留字段以向后兼容。
            params: state.templateParams,
            diskSize: state.diskSize,
            bandwidth: state.bandwidth,
            publicIp: true,
            gitProvider: state.gitRepoUrl ? "github" : null,
            gitRepoUrl: state.gitRepoUrl || null,
            gitBranch: state.gitBranch,
            autoClone: state.autoClone,
            releaseHours: null,
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
        },
      );
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
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto">
        {state.currentStep === 1 && <div className="p-6"><StepBasic state={state} setState={setState} /></div>}
        {state.currentStep === 2 && <div className="p-6"><StepGit state={state} setState={setState} /></div>}
        {state.currentStep === 3 && <div className="p-6"><StepEnvironment state={state} setState={setState} /></div>}
        {state.currentStep === 4 && <div className="p-6"><StepNetwork state={state} setState={setState} /></div>}
        {state.currentStep === 5 && <div className="p-6"><StepConfirm state={state} setState={setState} /></div>}
      </div>

      <div className="flex w-[320px] shrink-0 flex-col border-l border-border bg-background">
        <div className="flex-1 overflow-y-auto p-4">
          <StepsSidebar state={state} />
        </div>

        <div className="space-y-3 border-t border-border p-4">
          <div className="tnum text-center text-[12px] leading-5 text-muted-foreground">
            第 {state.currentStep} / {STEP_CONFIG.length} 步
          </div>
          {(state.error || stepError) && (
            <p className="text-center text-[12px] leading-5 text-destructive">
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
              <Button onClick={onSubmit} disabled={state.loading} className="flex-1">
                {state.loading && <Spinner data-icon="inline-start" />}
                {state.loading ? "创建中…" : "创建工作区"}
              </Button>
            ) : (
              <Button onClick={goNext} disabled={state.loading} className="flex-1">
                下一步
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
