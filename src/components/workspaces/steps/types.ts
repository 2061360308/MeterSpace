import { type PricePanelData } from "@/components/workspaces/price-panel";

export interface WizardState {
  currentStep: number;
  completedSteps: Set<number>;
  name: string;
  provider: string;
  region: string;
  imageUri: string;
  featureDefs: FeatureDef[];
  selectedFeatures: Record<string, string>;
  autoClone: boolean;
  gitRepoUrl: string;
  gitBranch: string;
  repos: { fullName: string; defaultBranch: string }[];
  gitAuthed: boolean;
  priceData: PricePanelData;
  loading: boolean;
  error: string;
}

export interface FeatureDef {
  id: string;
  name: string;
  description: string;
  companion: string;
  versions: { version: string; label: string }[];
}

export interface StepProps {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
}

export const STEP_CONFIG = [
  { id: 1, title: "基本信息", description: "实例名称与地域" },
  { id: 2, title: "开发工具", description: "选择预装工具" },
  { id: 3, title: "代码仓库", description: "配置代码拉取" },
] as const;
