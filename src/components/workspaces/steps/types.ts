import { type PricePanelData } from "@/components/workspaces/price-panel";

export interface UserImage {
  id: string;
  name: string;
  description: string | null;
  imageUri: string;
  architecture: string | null;
  source: string | null;
}

export interface UserFeature {
  id: string;
  name: string;
  description: string | null;
  featureUri: string;
  options: Record<string, unknown>;
  source: string | null;
}

export interface UserScript {
  id: string;
  name: string;
  description: string | null;
  script: string;
  sortOrder: number | null;
  enabled: boolean | null;
}

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
  imageUri: string;
  autoClone: boolean;
  gitRepoUrl: string;
  gitBranch: string;
  repos: { fullName: string; defaultBranch: string }[];
  gitAuthed: boolean;
  myImages: UserImage[];
  myFeatures: UserFeature[];
  myScripts: UserScript[];
  selectedImageId: string;
  selectedFeatureIds: string[];
  selectedScriptIds: string[];
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
  { id: 3, title: "环境配置", description: "选择镜像、工具与脚本" },
  { id: 4, title: "网络加速", description: "出口代理与直连白名单" },
  { id: 5, title: "确认创建", description: "检查配置并创建" },
] as const;
