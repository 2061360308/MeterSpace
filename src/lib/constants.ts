export const REGIONS = [
  { id: "cn-hangzhou", label: "杭州 (cn-hangzhou)" },
  { id: "cn-shanghai", label: "上海 (cn-shanghai)" },
  { id: "cn-beijing", label: "北京 (cn-beijing)" },
  { id: "cn-shenzhen", label: "深圳 (cn-shenzhen)" },
  { id: "cn-guangzhou", label: "广州 (cn-guangzhou)" },
  { id: "cn-hongkong", label: "香港 (cn-hongkong)" },
];

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
