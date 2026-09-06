import { createRpcClient, ecsEndpoint, API_VERSIONS } from "./client";
import type { AliCredentials } from "./client";

/** Normalized Aliyun API error. */
export class AliyunError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AliyunError";
    this.code = code;
  }
}

function normalizeError(e: unknown): never {
  if (e instanceof AliyunError) throw e;
  const err = e as { code?: string; message?: string; name?: string };
  const code = err?.code ?? err?.name ?? "AliyunApiError";
  const message =
    err?.message ?? "Aliyun API request failed";
  throw new AliyunError(code, message);
}

async function request<T>(
  creds: AliCredentials,
  region: string,
  action: string,
  params: Record<string, unknown>,
): Promise<T> {
  try {
    const client = createRpcClient({
      ...creds,
      endpoint: ecsEndpoint(region),
      apiVersion: API_VERSIONS.ecs,
    });
    return await client.request<T>(action, params, { method: "POST" });
  } catch (e) {
    return normalizeError(e);
  }
}

export interface Region {
  regionId: string;
  localName: string;
  regionEndpoint: string;
}

export async function describeRegions(
  creds: AliCredentials,
): Promise<Region[]> {
  const res = await request<{
    Regions?: { Region?: Region[] };
  }>(creds, "cn-hangzhou", "DescribeRegions", {});
  return res.Regions?.Region ?? [];
}

export interface InstanceType {
  instanceTypeId: string;
  cpuCoreCount: number;
  memorySize: number;
  instanceFamilyLevel?: string;
}

export async function describeInstanceTypes(
  creds: AliCredentials,
  region: string,
): Promise<InstanceType[]> {
  const out: InstanceType[] = [];
  let pageNumber = 1;
  // DescribeInstanceTypes is paginated; page through up to 10 pages.
  for (let i = 0; i < 10; i++) {
    const res = await request<{
      InstanceTypes?: { InstanceType?: InstanceType[] };
      NextToken?: string;
      TotalCount?: number;
    }>(creds, region, "DescribeInstanceTypes", {
      RegionId: region,
      NextToken: undefined as unknown as string,
      PageNumber: pageNumber,
      PageSize: 100,
    });
    out.push(...(res.InstanceTypes?.InstanceType ?? []));
    if (!res.NextToken) break;
    pageNumber += 1;
  }
  return out;
}

export interface AvailableResource {
  instanceType: string;
  status: string;
}

/** Query which instance types are purchasable in a region (default zone). */
export async function describeAvailableResource(
  creds: AliCredentials,
  region: string,
  instanceType?: string,
): Promise<AvailableResource[]> {
  const res = await request<{
    AvailableZones?: {
      AvailableZone?: {
        AvailableResources?: {
          AvailableResource?: AvailableResource[];
        };
      }[];
    };
  }>(creds, region, "DescribeAvailableResource", {
    RegionId: region,
    DestinationResource: "InstanceType",
    InstanceChargeType: "PostPaid",
    ...(instanceType ? { InstanceType: instanceType } : {}),
  });
  const out: AvailableResource[] = [];
  for (const zone of res.AvailableZones?.AvailableZone ?? []) {
    for (const r of zone.AvailableResources?.AvailableResource ?? []) {
      out.push(r);
    }
  }
  return out;
}

export interface RunInstancesInput {
  region: string;
  imageId: string;
  instanceType: string;
  securityGroupId: string;
  vSwitchId: string;
  ramRoleName: string;
  diskCategory: string;
  diskSize: number;
  bandwidth: number;
  spotStrategy: string;
  spotDuration: number;
  spotPriceLimit?: number | null;
  autoReleaseTime: string;
  userData: string; // already base64 encoded
  tags: Record<string, string>;
}

export interface RunInstancesResult {
  instanceId: string;
}

export async function runInstances(
  creds: AliCredentials,
  input: RunInstancesInput,
): Promise<RunInstancesResult> {
  const params: Record<string, unknown> = {
    RegionId: input.region,
    ImageId: input.imageId,
    InstanceType: input.instanceType,
    SecurityGroupId: input.securityGroupId,
    VSwitchId: input.vSwitchId,
    RamRoleName: input.ramRoleName,
    InstanceChargeType: "PostPaid",
    InternetChargeType: "PayByTraffic",
    InternetMaxBandwidthOut: input.bandwidth,
    "SystemDisk.Category": input.diskCategory,
    "SystemDisk.Size": input.diskSize,
    AutoReleaseTime: input.autoReleaseTime,
    UserData: input.userData,
    Amount: 1,
  };
  if (input.spotStrategy !== "NoSpot") {
    params.SpotStrategy = input.spotStrategy;
    params.SpotDuration = input.spotDuration;
    if (input.spotStrategy === "SpotWithPriceLimit" && input.spotPriceLimit) {
      params.SpotPriceLimit = input.spotPriceLimit;
    }
  }
  Object.entries(input.tags).forEach(([k, v], i) => {
    params[`Tag.${i + 1}.Key`] = k;
    params[`Tag.${i + 1}.Value`] = v;
  });

  const res = await request<{
    InstanceIdSets?: { InstanceIdSet?: string[] };
  }>(creds, input.region, "RunInstances", params);
  const id = res.InstanceIdSets?.InstanceIdSet?.[0];
  if (!id) throw new AliyunError("NoInstanceId", "RunInstances returned no instance id");
  return { instanceId: id };
}

export interface Zone {
  zoneId: string;
  localName?: string;
  availableInstanceTypes?: {
    InstanceTypes?: string[];
  };
}

export async function describeZones(
  creds: AliCredentials,
  region: string,
): Promise<Zone[]> {
  const res = await request<{ Zones?: { Zone?: Zone[] } }>(
    creds,
    region,
    "DescribeZones",
    { RegionId: region },
  );
  return res.Zones?.Zone ?? [];
}

export interface Vpc {
  vpcId: string;
  vpcName?: string;
  isDefault?: boolean;
  status?: string;
}

export async function describeVpcs(
  creds: AliCredentials,
  region: string,
): Promise<Vpc[]> {
  const res = await request<{ Vpcs?: { Vpc?: Vpc[] } }>(
    creds,
    region,
    "DescribeVpcs",
    { RegionId: region, PageSize: 50 },
  );
  return res.Vpcs?.Vpc ?? [];
}

export async function createVpc(
  creds: AliCredentials,
  region: string,
  cidrBlock = "172.16.0.0/16",
): Promise<string> {
  const res = await request<{ VpcId?: string }>(creds, region, "CreateVpc", {
    RegionId: region,
    CidrBlock: cidrBlock,
    VpcName: "workspace-cloud-vpc",
  });
  if (!res.VpcId) throw new AliyunError("NoVpcId", "CreateVpc returned no id");
  return res.VpcId;
}

export interface VSwitch {
  vSwitchId: string;
  vpcId?: string;
  zoneId?: string;
  status?: string;
  isDefault?: boolean;
}

export async function describeVSwitches(
  creds: AliCredentials,
  region: string,
  vpcId?: string,
): Promise<VSwitch[]> {
  const res = await request<{ VSwitches?: { VSwitch?: VSwitch[] } }>(
    creds,
    region,
    "DescribeVSwitches",
    { RegionId: region, PageSize: 50, ...(vpcId ? { VpcId: vpcId } : {}) },
  );
  return res.VSwitches?.VSwitch ?? [];
}

export async function createVSwitch(
  creds: AliCredentials,
  region: string,
  vpcId: string,
  zoneId: string,
  cidrBlock = "172.16.0.0/24",
): Promise<string> {
  const res = await request<{ VSwitchId?: string }>(
    creds,
    region,
    "CreateVSwitch",
    {
      RegionId: region,
      VpcId: vpcId,
      ZoneId: zoneId,
      CidrBlock: cidrBlock,
      VSwitchName: "workspace-cloud-vswitch",
    },
  );
  if (!res.VSwitchId) {
    throw new AliyunError("NoVSwitchId", "CreateVSwitch returned no id");
  }
  return res.VSwitchId;
}

export interface SecurityGroup {
  securityGroupId: string;
  securityGroupName?: string;
  vpcId?: string;
}

export async function describeSecurityGroups(
  creds: AliCredentials,
  region: string,
  vpcId?: string,
): Promise<SecurityGroup[]> {
  const res = await request<{
    SecurityGroups?: { SecurityGroup?: SecurityGroup[] };
  }>(creds, region, "DescribeSecurityGroups", {
    RegionId: region,
    PageSize: 50,
    ...(vpcId ? { VpcId: vpcId } : {}),
  });
  return res.SecurityGroups?.SecurityGroup ?? [];
}

export async function createSecurityGroup(
  creds: AliCredentials,
  region: string,
  vpcId: string,
): Promise<string> {
  const res = await request<{ SecurityGroupId?: string }>(
    creds,
    region,
    "CreateSecurityGroup",
    {
      RegionId: region,
      VpcId: vpcId,
      SecurityGroupName: "workspace-cloud-sg",
      Description: "workspace-cloud auto security group",
    },
  );
  if (!res.SecurityGroupId) {
    throw new AliyunError("NoSgId", "CreateSecurityGroup returned no id");
  }
  return res.SecurityGroupId;
}

export async function authorizeIngress(
  creds: AliCredentials,
  region: string,
  securityGroupId: string,
  port: string,
  cidr = "0.0.0.0/0",
  description = "code-server",
): Promise<void> {
  await request(creds, region, "AuthorizeSecurityGroup", {
    RegionId: region,
    SecurityGroupId: securityGroupId,
    IpProtocol: "tcp",
    PortRange: port,
    SourceCidrIp: cidr,
    Description: description,
  });
}

export interface Instance {
  instanceId: string;
  status: string;
  publicIpAddress?: string;
  eipAddress?: { ipAddress?: string };
  autoReleaseTime?: string;
  instanceType: string;
  spotStrategy?: string;
}

export async function describeInstances(
  creds: AliCredentials,
  region: string,
  instanceId: string,
): Promise<Instance | null> {
  const res = await request<{
    Instances?: { Instance?: Instance[] };
  }>(creds, region, "DescribeInstances", {
    RegionId: region,
    InstanceIds: JSON.stringify([instanceId]),
  });
  return res.Instances?.Instance?.[0] ?? null;
}

export async function deleteInstance(
  creds: AliCredentials,
  region: string,
  instanceId: string,
): Promise<void> {
  await request(creds, region, "DeleteInstance", {
    RegionId: region,
    InstanceId: instanceId,
    Force: true,
  });
}

export async function modifyInstanceAutoReleaseTime(
  creds: AliCredentials,
  region: string,
  instanceId: string,
  autoReleaseTime: string,
): Promise<void> {
  await request(creds, region, "ModifyInstanceAutoReleaseTime", {
    RegionId: region,
    InstanceId: instanceId,
    AutoReleaseTime: autoReleaseTime,
  });
}

export interface ImageInfo {
  imageId: string;
  imageName: string;
  platform: string;
  osName: string;
  creationTime?: string;
}

export async function describeImages(
  creds: AliCredentials,
  region: string,
): Promise<ImageInfo[]> {
  const res = await request<{
    Images?: { Image?: ImageInfo[] };
  }>(creds, region, "DescribeImages", {
    RegionId: region,
    ImageOwnerAlias: "system",
    OSType: "linux",
    Platform: "Ubuntu",
    Architecture: "x86_64",
    PageSize: 100,
  });
  return res.Images?.Image ?? [];
}

/** Find the latest Ubuntu 22.04 public image for a region (D4). */
export async function findUbuntu2204Image(
  creds: AliCredentials,
  region: string,
): Promise<string> {
  const images = await describeImages(creds, region);
  const candidates = images.filter(
    (i) => i.osName?.includes("22.04") || i.imageName?.includes("22.04"),
  );
  candidates.sort((a, b) =>
    (b.creationTime ?? "").localeCompare(a.creationTime ?? ""),
  );
  const pick = candidates[0];
  if (!pick) {
    throw new AliyunError(
      "ImageNotFound",
      `No Ubuntu 22.04 image found in ${region}`,
    );
  }
  return pick.imageId;
}

export interface DescribePriceInput {
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

export interface PriceDetailInfo {
  resourceType: string;
  originalPrice: number;
  tradePrice: number;
  discountPrice?: number;
}

export async function describePrice(
  creds: AliCredentials,
  input: DescribePriceInput,
): Promise<PriceDetailInfo[]> {
  const params: Record<string, unknown> = {
    RegionId: input.region,
    ResourceType: "instance",
    InstanceType: input.instanceType,
    ImageId: input.imageId,
    "SystemDisk.Category": input.diskCategory,
    "SystemDisk.Size": input.diskSize,
    InternetMaxBandwidthOut: input.bandwidth,
    InternetChargeType: "PayByTraffic",
    PriceUnit: "Hour",
    Period: 1,
    SpotStrategy: input.spotStrategy,
  };
  if (input.spotStrategy !== "NoSpot") {
    params.SpotDuration = input.spotDuration;
    if (input.spotStrategy === "SpotWithPriceLimit" && input.spotPriceLimit) {
      params.SpotPriceLimit = input.spotPriceLimit;
    }
  }
  const res = await request<{
    PriceInfo?: { Price?: { DetailInfos?: { DetailInfo?: PriceDetailInfo[] } } };
  }>(creds, input.region, "DescribePrice", params);
  return res.PriceInfo?.Price?.DetailInfos?.DetailInfo ?? [];
}

export interface SpotAdvice {
  available: boolean;
  releaseRate: number;
  historicalDiscount: number;
  spotPrice?: number;
}

export async function describeSpotAdvice(
  creds: AliCredentials,
  region: string,
  instanceType: string,
  spotDuration: number,
): Promise<SpotAdvice> {
  const res = await request<{
    AvailableSpotZones?: {
      AvailableSpotZone?: {
        AvailableSpotResources?: {
          AvailableSpotResource?: {
            InstanceType: string;
            InterruptRateDesc?: string;
            AverageSpotDiscount?: number;
            SpotPrice?: number;
          }[];
        };
      }[];
    };
  }>(creds, region, "DescribeSpotAdvice", {
    RegionId: region,
    InstanceTypes: JSON.stringify([instanceType]),
    SpotDuration: spotDuration,
    ZoneId: "random",
  });
  const resource =
    res.AvailableSpotZones?.AvailableSpotZone?.[0]?.AvailableSpotResources
      ?.AvailableSpotResource?.[0];
  const rateMatch = resource?.InterruptRateDesc?.match(/([\d.]+)%/);
  return {
    available: Boolean(resource),
    releaseRate: rateMatch ? Number(rateMatch[1]) / 100 : 0,
    historicalDiscount: (resource?.AverageSpotDiscount ?? 100) / 100,
    spotPrice: resource?.SpotPrice,
  };
}

export async function describeSpotPriceHistory(
  creds: AliCredentials,
  region: string,
  instanceType: string,
): Promise<{ timestamp: string; spotPrice: number }[]> {
  const res = await request<{
    SpotPrices?: {
      SpotPriceType?: { Timestamp?: string; SpotPrice?: number }[];
    };
  }>(creds, region, "DescribeSpotPriceHistory", {
    RegionId: region,
    InstanceType: instanceType,
    NetworkType: "vpc",
    StartTime: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
    EndTime: new Date().toISOString(),
    SpotDuration: 0,
  });
  return (
    res.SpotPrices?.SpotPriceType?.map((p) => ({
      timestamp: p.Timestamp ?? "",
      spotPrice: p.SpotPrice ?? 0,
    })) ?? []
  );
}

export interface RunCommandResult {
  invokeId: string;
}

export async function runCommand(
  creds: AliCredentials,
  region: string,
  instanceId: string,
  commandContent: string,
): Promise<RunCommandResult> {
  const res = await request<{ InvokeId?: string }>(
    creds,
    region,
    "RunCommand",
    {
      RegionId: region,
      InstanceId: JSON.stringify([instanceId]),
      Type: "RunShellScript",
      CommandContent: Buffer.from(commandContent).toString("base64"),
      Timeout: 120,
    },
  );
  if (!res.InvokeId) {
    throw new AliyunError("NoInvokeId", "RunCommand returned no invoke id");
  }
  return { invokeId: res.InvokeId };
}

export type InvocationStatus = "Finished" | "Running" | "Failed" | "Stopped";

export interface InvocationResult {
  status: InvocationStatus;
  output: string;
  exitCode: number | null;
}

export async function describeInvocationResults(
  creds: AliCredentials,
  region: string,
  invokeId: string,
): Promise<InvocationResult> {
  const res = await request<{
    Invocation?: {
      InvocationResults?: {
        InvocationResult?: {
          InvocationStatus?: InvocationStatus;
          Output?: string;
          ExitCode?: number;
        }[];
      };
    };
  }>(creds, region, "DescribeInvocationResults", {
    RegionId: region,
    InvokeId: invokeId,
  });
  const r = res.Invocation?.InvocationResults?.InvocationResult?.[0];
  return {
    status: r?.InvocationStatus ?? "Running",
    output: r?.Output ?? "",
    exitCode: r?.ExitCode ?? null,
  };
}
