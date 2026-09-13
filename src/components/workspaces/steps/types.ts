import { type PricePanelData } from "@/components/workspaces/price-panel";
import type { LaunchTemplateSummary } from "@/lib/launch-templates/client";

export interface CloudInstance {
  id: string;
  name: string;
  provider: string;
  region: string;
  instanceType: string;
}

export interface WizardState {
  currentStep: number;
  completedSteps: Set<number>;
  name: string;
  provider: string;
  region: string;
  cloudInstanceId: string;
  cloudInstances: CloudInstance[];
  diskSize: number;
  bandwidth: number;
  autoClone: boolean;
  gitRepoUrl: string;
  gitBranch: string;
  repos: { fullName: string; defaultBranch: string }[];
  gitAuthed: boolean;
  /** v3：列表内容是 LaunchTemplateSummary[]；shape 与旧 TemplateSummary 兼容。 */
  templates: LaunchTemplateSummary[];
  templatesLoaded: boolean;
  selectedTemplateId: string;
  /** v3：launch_templates 无 params；保留字段以兼容 wizard 状态。 */
  templateParams: Record<string, unknown>;
  proxyMode: "inherit" | "disabled" | "clash" | "upstream";
  proxyClashSubscription: string;
  proxyClashYaml: string;
  proxyUpstreamUrl: string;
  proxyUpstreamUsername: string;
  proxyUpstreamSecret: string;
  priceData: PricePanelData;
  loading: boolean;
  error: string;
}

export interface StepProps {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
}

export const STEP_CONFIG = [
  { id: 1, title: "基本信息", description: "实例名称与地域" },
  { id: 2, title: "代码仓库", description: "配置代码拉取" },
  { id: 3, title: "启动模板", description: "选择已落库的启动模板" },
  { id: 4, title: "网络加速", description: "出口代理与直连白名单" },
  { id: 5, title: "确认创建", description: "检查配置并创建" },
] as const;
