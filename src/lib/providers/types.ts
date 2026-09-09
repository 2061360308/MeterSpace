export interface CloudRegion {
  id: string;
  label: string;
}

export interface CloudCredentials {
  accessKeyId: string;
  accessKeySecret: string;
}

export interface CloudZone {
  id: string;
  label?: string;
}

export interface CloudInstanceType {
  id: string;
  cpu: number;
  memory: number;
  family?: string;
  architecture?: string;
  gpuAmount?: number;
  gpuSpec?: string;
}

export interface CloudInstanceAvailability {
  instanceTypeId: string;
  status: "Available" | "SoldOut" | "Unavailable";
  availableZones: number;
  totalZones: number;
  zones: { zoneId: string; status: "WithStock" | "ClosedWithStock" | "WithoutStock" | "ClosedWithoutStock" }[];
}

export interface CloudDiskCategory {
  category: string;
  label: string;
  status: "Available" | "SoldOut";
  min?: number;
  max?: number;
}

export interface CloudInstance {
  id: string;
  status: string;
  publicIp?: string;
  instanceType: string;
  autoReleaseTime?: string;
  spotStrategy?: string;
}

export interface CloudImage {
  id: string;
  name: string;
  platform: string;
  osName: string;
  creationTime?: string;
}

export interface CloudVpc {
  id: string;
  name?: string;
  isDefault?: boolean;
  status?: string;
}

export interface CloudVSwitch {
  id: string;
  vpcId?: string;
  zoneId?: string;
  status?: string;
  isDefault?: boolean;
}

export interface CloudSecurityGroup {
  id: string;
  name?: string;
  vpcId?: string;
}

export interface CloudPriceDetail {
  resource: string;
  originalPrice: number;
  tradePrice: number;
  discountPrice?: number;
}

export interface CloudSpotAdvice {
  available: boolean;
  releaseRate: number;
  historicalDiscount: number;
  spotPrice?: number;
}

export interface CloudSpotPricePoint {
  timestamp: string;
  price: number;
}

export interface CloudAccountBalance {
  availableAmount: number;
  availableCashAmount: number;
  creditAmount: number;
  currency: string;
}

export interface CloudStorageObject {
  name: string;
  size: number;
}

export interface CloudContainerRegistry {
  id: string;
  name: string;
  region: string;
  status: string;
}

export interface CloudRepository {
  id: string;
  name: string;
  namespace: string;
  summary?: string;
  createTime?: number;
}

export interface CloudImageTag {
  tag: string;
  digest?: string;
  updateTime?: number;
}

export interface CloudCommandResult {
  invokeId: string;
}

export interface CloudInvocationResult {
  status: "Finished" | "Running" | "Failed" | "Stopped";
  output: string;
  exitCode: number | null;
}

export interface CreateInstanceParams {
  region: string;
  imageId: string;
  instanceType: string;
  securityGroupId: string;
  vSwitchId: string;
  ramRoleName?: string;
  diskCategory: string;
  diskSize: number;
  bandwidth: number;
  spotStrategy: string;
  spotDuration: number;
  spotPriceLimit?: number | null;
  autoReleaseTime: string;
  userData: string;
  tags: Record<string, string>;
}

export interface DescribePriceParams {
  region: string;
  imageId: string;
  instanceType: string;
  spotStrategy: string;
  spotDuration: number;
  spotPriceLimit?: number | null;
  diskCategory: string;
  diskSize: number;
  bandwidth: number;
}

export interface CloudProvider {
  readonly name: string;
  readonly label: string;

  getRegions(): Promise<CloudRegion[]>;
  hasCredentials(userId: string): Promise<boolean>;
  getCredentials(userId: string): Promise<CloudCredentials>;

  getZones(region: string): Promise<CloudZone[]>;
  getInstanceTypes(region: string): Promise<CloudInstanceType[]>;
  getAvailability(region: string): Promise<CloudInstanceAvailability[]>;
  getDiskCategories(region: string): Promise<CloudDiskCategory[]>;

  createInstance(params: CreateInstanceParams): Promise<string>;
  getInstance(instanceId: string): Promise<CloudInstance | null>;
  deleteInstance(instanceId: string): Promise<void>;
  setAutoReleaseTime(instanceId: string, time: string): Promise<void>;

  getImages(region: string): Promise<CloudImage[]>;
  findImage(region: string, osPattern: string, version: string): Promise<string>;

  getVpcs(region: string): Promise<CloudVpc[]>;
  createVpc(region: string, cidrBlock?: string): Promise<string>;
  getVSwitches(region: string, vpcId?: string): Promise<CloudVSwitch[]>;
  createVSwitch(region: string, vpcId: string, zoneId: string, cidrBlock?: string): Promise<string>;
  getSecurityGroups(region: string, vpcId?: string): Promise<CloudSecurityGroup[]>;
  createSecurityGroup(region: string, vpcId: string): Promise<string>;
  authorizeSecurityGroup(securityGroupId: string, port: string, cidr?: string, description?: string): Promise<void>;

  describePrice(params: DescribePriceParams): Promise<CloudPriceDetail[]>;
  getSpotAdvice(region: string, instanceType: string, spotDuration: number): Promise<CloudSpotAdvice>;
  getSpotPriceHistory(region: string, instanceType: string, spotDuration?: number, days?: number): Promise<CloudSpotPricePoint[]>;

  getBalance(): Promise<CloudAccountBalance>;

  ensureStorage(region: string, name: string): Promise<void>;
  storageExists(region: string, name: string): Promise<boolean>;
  listStorageObjects(region: string, bucket: string, prefix: string): Promise<CloudStorageObject[]>;
  getStoragePrefixSize(region: string, bucket: string, prefix: string): Promise<number>;
  deleteStorageObject(region: string, bucket: string, name: string): Promise<void>;
  deleteStoragePrefix(region: string, bucket: string, prefix: string): Promise<void>;

  listRegistryInstances(region: string): Promise<CloudContainerRegistry[]>;
  listRepositories(region: string, instanceId: string): Promise<CloudRepository[]>;
  listImageTags(region: string, instanceId: string, repoId: string): Promise<CloudImageTag[]>;

  runCommand(instanceId: string, content: string): Promise<CloudCommandResult>;
  getCommandResult(invokeId: string): Promise<CloudInvocationResult>;

  getInstanceCloudStatus(ecsInstanceId: string, region: string): Promise<string | null>;
}
