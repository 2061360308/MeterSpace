import type {
  CloudProvider,
  CloudRegion,
  CloudCredentials,
  CloudZone,
  CloudInstanceType,
  CloudInstanceAvailability,
  CloudDiskCategory,
  CloudInstance,
  CloudImage,
  CloudVpc,
  CloudVSwitch,
  CloudSecurityGroup,
  CloudPriceDetail,
  CloudSpotAdvice,
  CloudSpotPricePoint,
  CloudAccountBalance,
  CloudStorageObject,
  CloudContainerRegistry,
  CloudRepository,
  CloudImageTag,
  CloudCommandResult,
  CloudInvocationResult,
  CreateInstanceParams,
  DescribePriceParams,
} from "./types";

const TENCENT_REGIONS: CloudRegion[] = [
  { id: "ap-guangzhou", label: "广州 (ap-guangzhou)" },
  { id: "ap-shanghai", label: "上海 (ap-shanghai)" },
  { id: "ap-beijing", label: "北京 (ap-beijing)" },
  { id: "ap-shenzhen", label: "深圳 (ap-shenzhen)" },
  { id: "ap-hongkong", label: "香港 (ap-hongkong)" },
  { id: "ap-tokyo", label: "东京 (ap-tokyo)" },
  { id: "ap-singapore", label: "新加坡 (ap-singapore)" },
];

function notImplemented(): never {
  throw new Error("Tencent Cloud provider not implemented");
}

export class TencentProvider implements CloudProvider {
  readonly name = "tencent";
  readonly label = "腾讯云";

  async getRegions(): Promise<CloudRegion[]> {
    return TENCENT_REGIONS;
  }

  async hasCredentials(_userId: string): Promise<boolean> {
    void _userId;
    return false;
  }

  async getCredentials(_userId: string): Promise<CloudCredentials> {
    void _userId;
    notImplemented();
  }

  async getZones(_region: string): Promise<CloudZone[]> {
    void _region;
    notImplemented();
  }

  async getInstanceTypes(_region: string): Promise<CloudInstanceType[]> {
    void _region;
    notImplemented();
  }

  async getAvailability(_region: string): Promise<CloudInstanceAvailability[]> {
    void _region;
    notImplemented();
  }

  async getDiskCategories(_region: string): Promise<CloudDiskCategory[]> {
    void _region;
    notImplemented();
  }

  async createInstance(_params: CreateInstanceParams): Promise<string> {
    void _params;
    notImplemented();
  }

  async getInstance(_instanceId: string, _region: string): Promise<CloudInstance | null> {
    void _instanceId;
    void _region;
    notImplemented();
  }

  async deleteInstance(_instanceId: string, _region: string): Promise<void> {
    void _instanceId;
    void _region;
    notImplemented();
  }

  async setAutoReleaseTime(_instanceId: string, _region: string, _time: string): Promise<void> {
    void _instanceId;
    void _region;
    void _time;
    notImplemented();
  }

  async getImages(_region: string): Promise<CloudImage[]> {
    void _region;
    notImplemented();
  }

  async findImage(_region: string, _osPattern: string, _version: string): Promise<string> {
    void _region;
    void _osPattern;
    void _version;
    notImplemented();
  }

  async getVpcs(_region: string): Promise<CloudVpc[]> {
    void _region;
    notImplemented();
  }

  async createVpc(_region: string, _cidrBlock?: string): Promise<string> {
    void _region;
    void _cidrBlock;
    notImplemented();
  }

  async getVSwitches(_region: string, _vpcId?: string): Promise<CloudVSwitch[]> {
    void _region;
    void _vpcId;
    notImplemented();
  }

  async createVSwitch(_region: string, _vpcId: string, _zoneId: string, _cidrBlock?: string): Promise<string> {
    void _region;
    void _vpcId;
    void _zoneId;
    void _cidrBlock;
    notImplemented();
  }

  async getSecurityGroups(_region: string, _vpcId?: string): Promise<CloudSecurityGroup[]> {
    void _region;
    void _vpcId;
    notImplemented();
  }

  async createSecurityGroup(_region: string, _vpcId: string): Promise<string> {
    void _region;
    void _vpcId;
    notImplemented();
  }

  async authorizeSecurityGroup(_securityGroupId: string, _region: string, _port: string, _cidr?: string, _description?: string): Promise<void> {
    void _securityGroupId;
    void _region;
    void _port;
    void _cidr;
    void _description;
    notImplemented();
  }

  async describePrice(_params: DescribePriceParams): Promise<CloudPriceDetail[]> {
    void _params;
    notImplemented();
  }

  async getSpotAdvice(_region: string, _instanceType: string, _spotDuration: number): Promise<CloudSpotAdvice> {
    void _region;
    void _instanceType;
    void _spotDuration;
    notImplemented();
  }

  async getSpotPriceHistory(_region: string, _instanceType: string, _spotDuration?: number, _days?: number): Promise<CloudSpotPricePoint[]> {
    void _region;
    void _instanceType;
    void _spotDuration;
    void _days;
    notImplemented();
  }

  async getBalance(): Promise<CloudAccountBalance> {
    notImplemented();
  }

  async ensureStorage(_region: string, _name: string): Promise<void> {
    void _region;
    void _name;
    notImplemented();
  }

  async storageExists(_region: string, _name: string): Promise<boolean> {
    void _region;
    void _name;
    notImplemented();
  }

  async listStorageObjects(_region: string, _bucket: string, _prefix: string): Promise<CloudStorageObject[]> {
    void _region;
    void _bucket;
    void _prefix;
    notImplemented();
  }

  async getStoragePrefixSize(_region: string, _bucket: string, _prefix: string): Promise<number> {
    void _region;
    void _bucket;
    void _prefix;
    notImplemented();
  }

  async deleteStorageObject(_region: string, _bucket: string, _name: string): Promise<void> {
    void _region;
    void _bucket;
    void _name;
    notImplemented();
  }

  async deleteStoragePrefix(_region: string, _bucket: string, _prefix: string): Promise<void> {
    void _region;
    void _bucket;
    void _prefix;
    notImplemented();
  }

  async listRegistryInstances(_region: string): Promise<CloudContainerRegistry[]> {
    void _region;
    notImplemented();
  }

  async listRepositories(_region: string, _instanceId: string): Promise<CloudRepository[]> {
    void _region;
    void _instanceId;
    notImplemented();
  }

  async listImageTags(_region: string, _instanceId: string, _repoId: string): Promise<CloudImageTag[]> {
    void _region;
    void _instanceId;
    void _repoId;
    notImplemented();
  }

  async runCommand(_instanceId: string, _region: string, _content: string): Promise<CloudCommandResult> {
    void _instanceId;
    void _region;
    void _content;
    notImplemented();
  }

  async getCommandResult(_invokeId: string, _region: string): Promise<CloudInvocationResult> {
    void _invokeId;
    void _region;
    notImplemented();
  }

  async getInstanceCloudStatus(_ecsInstanceId: string, _region: string): Promise<string | null> {
    void _ecsInstanceId;
    void _region;
    notImplemented();
  }

  async getInstancePublicIp(_ecsInstanceId: string, _region: string): Promise<string | null> {
    void _ecsInstanceId;
    void _region;
    notImplemented();
  }
}
