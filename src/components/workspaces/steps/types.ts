import { type InstanceTypeInfo } from "@/components/workspaces/instance-selector";
import { type DiskSelection } from "@/components/workspaces/disk-selector";
import { type NetworkSelection } from "@/components/workspaces/network-selector";
import { type PricePanelData } from "@/components/workspaces/price-panel";
import { type InstanceAvailability, type DiskCategory } from "@/lib/aliyun/ecs";

export interface WizardState {
  currentStep: number;
  completedSteps: Set<number>;
  name: string;
  region: string;
  useSpot: boolean;
  spotDuration: number;
  spotPriceLimit: number | null;
  instanceType: string;
  instanceTypes: InstanceTypeInfo[];
  instanceTypesLoading: boolean;
  instanceAvailability: Record<string, InstanceAvailability>;
  availabilityLoading: boolean;
  zone: string;
  zones: { zoneId: string; localName: string }[];
  zonesLoading: boolean;
  systemDiskCategories: DiskCategory[];
  systemDiskCategory: string;
  disk: DiskSelection;
  network: NetworkSelection;
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
  { id: 2, title: "实例配置", description: "选择实例规格" },
  { id: 3, title: "存储与网络", description: "磁盘、带宽与可用区" },
  { id: 4, title: "开发工具", description: "选择预装工具" },
  { id: 5, title: "代码仓库", description: "配置代码拉取" },
] as const;
