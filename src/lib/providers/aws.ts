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

const AWS_REGIONS: CloudRegion[] = [
  { id: "us-east-1", label: "弗吉尼亚 (us-east-1)" },
  { id: "us-west-2", label: "俄勒冈 (us-west-2)" },
  { id: "ap-northeast-1", label: "东京 (ap-northeast-1)" },
  { id: "ap-southeast-1", label: "新加坡 (ap-southeast-1)" },
  { id: "eu-west-1", label: "爱尔兰 (eu-west-1)" },
  { id: "ap-east-1", label: "香港 (ap-east-1)" },
  { id: "cn-north-1", label: "北京 (cn-north-1)" },
  { id: "cn-northwest-1", label: "宁夏 (cn-northwest-1)" },
];

function notImplemented(): never {
  throw new Error("AWS provider not implemented");
}

export class AWSProvider implements CloudProvider {
  readonly name = "aws";
  readonly label = "AWS";

  async getRegions(): Promise<CloudRegion[]> {
    return AWS_REGIONS;
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

  async getInstance(_instanceId: string): Promise<CloudInstance | null> {
    void _instanceId;
    notImplemented();
  }

  async deleteInstance(_instanceId: string): Promise<void> {
    void _instanceId;
    notImplemented();
  }

  async setAutoReleaseTime(_instanceId: string, _time: string): Promise<void> {
    void _instanceId;
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

  async authorizeSecurityGroup(_securityGroupId: string, _port: string, _cidr?: string, _description?: string): Promise<void> {
    void _securityGroupId;
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

  async runCommand(_instanceId: string, _content: string): Promise<CloudCommandResult> {
    void _instanceId;
    void _content;
    notImplemented();
  }

  async getCommandResult(_invokeId: string): Promise<CloudInvocationResult> {
    void _invokeId;
    notImplemented();
  }
}
