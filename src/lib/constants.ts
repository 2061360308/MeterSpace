export const PROVIDERS = [
  { id: "aliyun", label: "阿里云" },
  { id: "tencent", label: "腾讯云" },
  { id: "aws", label: "AWS" },
];

/** 哨兵值：allowedPorts 中 0 表示开通该实例所有端口。 */
export const ALL_PORTS = 0;

export const REGIONS = [
  { id: "cn-hangzhou", label: "杭州 (cn-hangzhou)" },
  { id: "cn-shanghai", label: "上海 (cn-shanghai)" },
  { id: "cn-beijing", label: "北京 (cn-beijing)" },
  { id: "cn-shenzhen", label: "深圳 (cn-shenzhen)" },
  { id: "cn-guangzhou", label: "广州 (cn-guangzhou)" },
  { id: "cn-hongkong", label: "香港 (cn-hongkong)" },
];

export const REGIONS_BY_PROVIDER: Record<string, { id: string; label: string }[]> = {
  aliyun: [
    { id: "cn-hangzhou", label: "杭州 (cn-hangzhou)" },
    { id: "cn-shanghai", label: "上海 (cn-shanghai)" },
    { id: "cn-beijing", label: "北京 (cn-beijing)" },
    { id: "cn-shenzhen", label: "深圳 (cn-shenzhen)" },
    { id: "cn-guangzhou", label: "广州 (cn-guangzhou)" },
    { id: "cn-hongkong", label: "香港 (cn-hongkong)" },
  ],
  tencent: [
    { id: "ap-guangzhou", label: "广州 (ap-guangzhou)" },
    { id: "ap-shanghai", label: "上海 (ap-shanghai)" },
    { id: "ap-beijing", label: "北京 (ap-beijing)" },
    { id: "ap-shenzhen", label: "深圳 (ap-shenzhen)" },
    { id: "ap-hongkong", label: "香港 (ap-hongkong)" },
  ],
  aws: [
    { id: "us-east-1", label: "弗吉尼亚 (us-east-1)" },
    { id: "us-west-2", label: "俄勒冈 (us-west-2)" },
    { id: "ap-northeast-1", label: "东京 (ap-northeast-1)" },
    { id: "ap-southeast-1", label: "新加坡 (ap-southeast-1)" },
    { id: "eu-west-1", label: "爱尔兰 (eu-west-1)" },
  ],
};

export const INSTANCE_TYPES = [
  { id: "ecs.c6.large", cpu: 2, mem: 4, note: "2核4G" },
  { id: "ecs.g6.xlarge", cpu: 4, mem: 8, note: "4核8G" },
  { id: "ecs.g7.xlarge", cpu: 4, mem: 16, note: "4核16G" },
  { id: "ecs.c7.xlarge", cpu: 4, mem: 8, note: "4核8G" },
  { id: "ecs.g7.2xlarge", cpu: 8, mem: 32, note: "8核32G" },
  { id: "ecs.c7.2xlarge", cpu: 8, mem: 16, note: "8核16G" },
];

export const DISK_CATEGORIES = [
  { id: "cloud_essd", label: "ESSD PL0" },
  { id: "cloud_essd_entry", label: "ESSD Entry" },
  { id: "cloud_ssd", label: "SSD 云盘" },
  { id: "cloud_efficiency", label: "高效云盘" },
];

export const SPOT_STRATEGIES = [
  { id: "NoSpot", label: "不使用抢占" },
  { id: "SpotAsPriceGo", label: "抢占式（自动出价）" },
  { id: "SpotWithPriceLimit", label: "抢占式（固定上限）" },
];

export const DEFAULT_IMAGE_URI =
  "registry.cn-hangzhou.aliyuncs.com/workspace-cloud/code-server-base:latest";

/** 规格族分类（对齐阿里云：架构 → 分类 → 规格族）。 */
export interface FamilyCategory {
  id: string;
  label: string;
  families: string[]; // 规格族名字片段，用于匹配 instanceTypeFamily
}

export const FAMILY_CATEGORIES: FamilyCategory[] = [
  { id: "all", label: "全部分类", families: [] },
  {
    id: "general",
    label: "通用型",
    families: ["g", "c"],
  },
  {
    id: "compute",
    label: "计算型",
    families: ["c6", "c7", "c8", "c9"],
  },
  {
    id: "memory",
    label: "内存型",
    families: ["r", "re"],
  },
  {
    id: "bigdata",
    label: "大数据型",
    families: ["d"],
  },
  {
    id: "localssd",
    label: "本地SSD型",
    families: ["i"],
  },
  {
    id: "shared",
    label: "共享型",
    families: ["t"],
  },
  {
    id: "economy",
    label: "经济型",
    families: ["e"],
  },
  {
    id: "hetero",
    label: "异构计算",
    families: ["gn", "ga", "ebmgn"],
  },
];

/** 简单按规格族前缀推断架构分类（X86 / Arm）。 */
export function classifyArchitecture(family?: string): "x86" | "arm" {
  if (!family) return "x86";
  const f = family.toLowerCase();
  if (f.startsWith("g8y") || f.startsWith("c8y") || f.startsWith("r8y") || f.startsWith("ecs.g8y") || f.includes("yitian") || f.includes("ampere") || f.startsWith("ecs.am")) {
    return "arm";
  }
  return "x86";
}

/** 规格族标签（用于表格「规格族」列的中文名） */
export function familyLabel(family?: string): string {
  if (!family) return "—";
  const f = family.toLowerCase();
  // 精确匹配 ecs 前缀的规格族
  if (/^ecs\.e\d/.test(f)) return "经济型";
  if (/^ecs\.t\d/.test(f)) return "突发性能型";
  if (/^ecs\.gn|^ecs\.ga|^ecs\.ebmgn/.test(f)) return "GPU型";
  if (/^ecs\.g\d|^ecs\.gt\d/.test(f)) return "通用型";
  if (/^ecs\.c\d/.test(f)) return "计算型";
  if (/^ecs\.r\d/.test(f)) return "内存型";
  if (/^ecs\.i\d/.test(f)) return "本地SSD型";
  if (/^ecs\.d\d/.test(f)) return "大数据型";
  if (/^ecs\.bm/.test(f)) return "裸金属型";
  // 兜底：按首字母推断
  if (f.startsWith("ecs.e")) return "经济型";
  if (f.startsWith("ecs.t")) return "突发性能型";
  if (f.startsWith("ecs.g")) return "通用型";
  if (f.startsWith("ecs.c")) return "计算型";
  if (f.startsWith("ecs.r")) return "内存型";
  return "通用型";
}
