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
    regions?: { region?: Region[] };
  }>(creds, "cn-hangzhou", "DescribeRegions", {});
  return res.regions?.region ?? [];
}

export interface InstanceType {
  instanceTypeId: string;
  cpuCoreCount: number;
  memorySize: number;
  instanceFamilyLevel?: string;
  instanceTypeFamily?: string;
  cpuArchitecture?: string;
  gpuAmount?: number;
  gpuSpec?: string;
  localStorage?: string;
  internetMaxBandwidthOut?: number;
}

export async function describeInstanceTypes(
  creds: AliCredentials,
  region: string,
): Promise<InstanceType[]> {
  const out: InstanceType[] = [];
  let nextToken: string | undefined;
  for (let i = 0; i < 20; i++) {
    const res = await request<{
      instanceTypes?: { instanceType?: InstanceType[] };
      nextToken?: string;
    }>(creds, region, "DescribeInstanceTypes", {
      RegionId: region,
      MaxResults: 100,
      ...(nextToken ? { NextToken: nextToken } : {}),
    });
    out.push(...(res.instanceTypes?.instanceType ?? []));
    if (!res.nextToken) break;
    nextToken = res.nextToken;
  }
  return out;
}

export interface InstanceAvailability {
  instanceTypeId: string;
  status: "Available" | "SoldOut" | "Unavailable";
  availableZones: number;
  totalZones: number;
  statusCategory?: "WithStock" | "ClosedWithStock" | "WithoutStock" | "ClosedWithoutStock";
  zones: { zoneId: string; statusCategory: "WithStock" | "ClosedWithStock" | "WithoutStock" | "ClosedWithoutStock" }[];
}

export interface DiskCategory {
  category: string;
  label: string;
  status: "Available" | "SoldOut";
  min?: number;
  max?: number;
}

const DISK_LABELS: Record<string, string> = {
  cloud: "普通云盘",
  cloud_efficiency: "高效云盘",
  cloud_ssd: "SSD 云盘",
  ephemeral_ssd: "本地 SSD 盘",
  cloud_essd: "ESSD 云盘",
  cloud_auto: "ESSD AutoPL 云盘",
  cloud_essd_entry: "ESSD Entry 云盘",
  elastic_ephemeral_disk_standard: "标准临时云盘",
  elastic_ephemeral_disk_premium: "高配临时云盘",
};

/** Query availability for all instance types across all zones in a region.
 *  Uses DestinationResource=Zone to get all zones and their supported instance types in one call. */
export async function describeAllAvailability(
  creds: AliCredentials,
  region: string,
): Promise<InstanceAvailability[]> {
  const res = await request<{
    availableZones?: {
      availableZone?: {
        zoneId?: string;
        status?: string;
        statusCategory?: string;
        availableResources?: {
          availableResource?: {
            type?: string;
            supportedResources?: {
              supportedResource?: {
                status?: string;
                value?: string;
                statusCategory?: string;
              }[];
            };
          }[];
        };
      }[];
    };
  }>(creds, region, "DescribeAvailableResource", {
    RegionId: region,
    DestinationResource: "InstanceType",
    IoOptimized: "optimized",
    InstanceChargeType: "PostPaid",
  });

  const zones = res.availableZones?.availableZone ?? [];
  const totalZones = zones.length;

  const instanceMap = new Map<string, {
    availableZones: number;
    zones: { zoneId: string; statusCategory: "WithStock" | "ClosedWithStock" | "WithoutStock" | "ClosedWithoutStock" }[];
    statusCategory?: "WithStock" | "ClosedWithStock" | "WithoutStock" | "ClosedWithoutStock";
  }>();

  for (const zone of zones) {
    const zoneId = zone.zoneId ?? "";
    const resources = zone.availableResources?.availableResource ?? [];

    for (const resource of resources) {
      if (resource.type !== "InstanceType") continue;
      const supportedResources = resource.supportedResources?.supportedResource ?? [];

      for (const sr of supportedResources) {
        const instanceType = sr.value ?? "";
        if (!instanceType) continue;
        const srStatusCategory = (sr.statusCategory ?? "WithStock") as "WithStock" | "ClosedWithStock" | "WithoutStock" | "ClosedWithoutStock";

        const existing = instanceMap.get(instanceType) ?? {
          availableZones: 0,
          zones: [],
          statusCategory: srStatusCategory,
        };

        existing.zones.push({ zoneId, statusCategory: srStatusCategory });
        if (srStatusCategory === "WithStock" || srStatusCategory === "ClosedWithStock") {
          existing.availableZones++;
        }

        instanceMap.set(instanceType, existing);
      }
    }
  }

  const result: InstanceAvailability[] = [];
  for (const [instanceTypeId, data] of instanceMap) {
    const status = data.availableZones > 0 ? "Available" : "SoldOut";
    result.push({
      instanceTypeId,
      status,
      availableZones: data.availableZones,
      totalZones,
      statusCategory: data.statusCategory,
      zones: data.zones,
    });
  }

  return result;
}

/** Query available disk categories (works for both system and data disk). */
export async function describeDiskCategories(
  creds: AliCredentials,
  region: string,
): Promise<DiskCategory[]> {
  const res = await request<{
    availableZones?: {
      availableZone?: {
        availableResources?: {
          availableResource?: {
            type?: string;
            supportedResources?: {
              supportedResource?: {
                status?: string;
                value?: string;
                min?: number;
                max?: number;
              }[];
            };
          }[];
        };
      }[];
    };
  }>(creds, region, "DescribeAvailableResource", {
    RegionId: region,
    DestinationResource: "DataDisk",
    ResourceType: "disk",
  });

  const categories: DiskCategory[] = [];

  for (const zone of res.availableZones?.availableZone ?? []) {
    for (const resource of zone.availableResources?.availableResource ?? []) {
      if (resource.type !== "DataDisk") continue;
      for (const sr of resource.supportedResources?.supportedResource ?? []) {
        const cat = sr.value ?? "";
        if (!cat || categories.some((c) => c.category === cat)) continue;
        categories.push({
          category: cat,
          label: DISK_LABELS[cat] ?? cat,
          status: (sr.status as "Available" | "SoldOut") ?? "Available",
          min: sr.min,
          max: sr.max,
        });
      }
    }
  }

  return categories;
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
    instanceIdSets?: { instanceIdSet?: string[] };
  }>(creds, input.region, "RunInstances", params);
  const id = res.instanceIdSets?.instanceIdSet?.[0];
  if (!id) throw new AliyunError("NoInstanceId", "RunInstances returned no instance id");
  return { instanceId: id };
}

export interface Zone {
  zoneId: string;
  localName?: string;
  availableInstanceTypes?: {
    instanceTypes?: string[];
  };
}

export async function describeZones(
  creds: AliCredentials,
  region: string,
): Promise<Zone[]> {
  const res = await request<{ zones?: { zone?: Zone[] } }>(
    creds,
    region,
    "DescribeZones",
    { RegionId: region },
  );
  return res.zones?.zone ?? [];
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
  const res = await request<{ vpcs?: { vpc?: Vpc[] } }>(
    creds,
    region,
    "DescribeVpcs",
    { RegionId: region, PageSize: 50 },
  );
  return res.vpcs?.vpc ?? [];
}

export async function createVpc(
  creds: AliCredentials,
  region: string,
  cidrBlock = "172.16.0.0/16",
): Promise<string> {
  const res = await request<{ vpcId?: string }>(creds, region, "CreateVpc", {
    RegionId: region,
    CidrBlock: cidrBlock,
    VpcName: "workspace-cloud-vpc",
  });
  if (!res.vpcId) throw new AliyunError("NoVpcId", "CreateVpc returned no id");
  return res.vpcId;
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
  const res = await request<{ vSwitches?: { vSwitch?: VSwitch[] } }>(
    creds,
    region,
    "DescribeVSwitches",
    { RegionId: region, PageSize: 50, ...(vpcId ? { VpcId: vpcId } : {}) },
  );
  return res.vSwitches?.vSwitch ?? [];
}

export async function createVSwitch(
  creds: AliCredentials,
  region: string,
  vpcId: string,
  zoneId: string,
  cidrBlock = "172.16.0.0/24",
): Promise<string> {
  const res = await request<{ vSwitchId?: string }>(
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
  if (!res.vSwitchId) {
    throw new AliyunError("NoVSwitchId", "CreateVSwitch returned no id");
  }
  return res.vSwitchId;
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
    securityGroups?: { securityGroup?: SecurityGroup[] };
  }>(creds, region, "DescribeSecurityGroups", {
    RegionId: region,
    PageSize: 50,
    ...(vpcId ? { VpcId: vpcId } : {}),
  });
  return res.securityGroups?.securityGroup ?? [];
}

export async function createSecurityGroup(
  creds: AliCredentials,
  region: string,
  vpcId: string,
): Promise<string> {
  const res = await request<{ securityGroupId?: string }>(
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
  if (!res.securityGroupId) {
    throw new AliyunError("NoSgId", "CreateSecurityGroup returned no id");
  }
  return res.securityGroupId;
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
    instances?: { instance?: Instance[] };
  }>(creds, region, "DescribeInstances", {
    RegionId: region,
    InstanceIds: JSON.stringify([instanceId]),
  });
  return res.instances?.instance?.[0] ?? null;
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
    images?: { image?: ImageInfo[] };
  }>(creds, region, "DescribeImages", {
    RegionId: region,
    ImageOwnerAlias: "system",
    OSType: "linux",
    Architecture: "x86_64",
    PageSize: 100,
  });
  return res.images?.image ?? [];
}

/** Find the latest Debian 12 public image for a region. */
export async function findDebianImage(
  creds: AliCredentials,
  region: string,
): Promise<string> {
  const images = await describeImages(creds, region);
  const candidates = images.filter(
    (i) =>
      (i.osName ?? "").toLowerCase().includes("debian") &&
      ((i.osName ?? "").includes("12") || (i.imageName ?? "").includes("12")),
  );
  candidates.sort((a, b) =>
    (b.creationTime ?? "").localeCompare(a.creationTime ?? ""),
  );
  const pick = candidates[0];
  if (!pick) {
    throw new Error(`No Debian 12 image found in ${region}`);
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
  resource: string;
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
    priceInfo?: { price?: { detailInfos?: { detailInfo?: PriceDetailInfo[] } } };
  }>(creds, input.region, "DescribePrice", params);
  return res.priceInfo?.price?.detailInfos?.detailInfo ?? [];
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
  // DescribeSpotAdvice needs a concrete zone id (not "random").
  const zonesRes = await request<{ zones?: { zone?: { zoneId?: string }[] } }>(
    creds,
    region,
    "DescribeZones",
    { RegionId: region },
  );
  const zoneId = zonesRes.zones?.zone?.[0]?.zoneId;

  const res = await request<{
    availableSpotZones?: {
      availableSpotZone?: {
        availableSpotResources?: {
          availableSpotResource?: {
            instanceType: string;
            interruptRateDesc?: string;
            averageSpotDiscount?: number;
            spotPrice?: number;
          }[];
        };
      }[];
    };
  }>(creds, region, "DescribeSpotAdvice", {
    RegionId: region,
    InstanceTypes: JSON.stringify([instanceType]),
    SpotDuration: spotDuration,
    ...(zoneId ? { ZoneId: zoneId } : {}),
  });

  // Collect all resources across zones and find the exact instance type.
  const all = (
    res.availableSpotZones?.availableSpotZone ?? []
  ).flatMap(
    (z) => z.availableSpotResources?.availableSpotResource ?? [],
  );
  const resource = all.find(
    (r) => r.instanceType?.toLowerCase() === instanceType.toLowerCase(),
  );

  const rateMatch = resource?.interruptRateDesc?.match(/([\d.]+)%/);
  // AverageSpotDiscount is a percentage (e.g. 4 => 4% discount => pay 4% of original).
  const discountPct = resource?.averageSpotDiscount ?? 100;
  return {
    available: Boolean(resource),
    releaseRate: rateMatch ? Number(rateMatch[1]) / 100 : 0,
    // historicalDiscount = 折后价占原价的比例（4 => 0.04）
    historicalDiscount: discountPct / 100,
    spotPrice: resource?.spotPrice,
  };
}

export function toAliyunTimestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}Z`
  );
}

export async function describeSpotPriceHistory(
  creds: AliCredentials,
  region: string,
  instanceType: string,
  spotDuration: number = 0,
): Promise<{ timestamp: string; spotPrice: number }[]> {
  const res = await request<{
    spotPrices?: {
      spotPriceType?: { timestamp?: string; spotPrice?: number }[];
    };
  }>(creds, region, "DescribeSpotPriceHistory", {
    RegionId: region,
    InstanceType: instanceType,
    NetworkType: "vpc",
    StartTime: toAliyunTimestamp(new Date(Date.now() - 30 * 24 * 3600 * 1000)),
    EndTime: toAliyunTimestamp(new Date()),
    SpotDuration: spotDuration,
  });
  return (
    res.spotPrices?.spotPriceType?.map((p) => ({
      timestamp: p.timestamp ?? "",
      spotPrice: p.spotPrice ?? 0,
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
  const res = await request<{ invokeId?: string }>(
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
  if (!res.invokeId) {
    throw new AliyunError("NoInvokeId", "RunCommand returned no invoke id");
  }
  return { invokeId: res.invokeId };
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
    invocation?: {
      invocationResults?: {
        invocationResult?: {
          invocationStatus?: InvocationStatus;
          output?: string;
          exitCode?: number;
        }[];
      };
    };
  }>(creds, region, "DescribeInvocationResults", {
    RegionId: region,
    InvokeId: invokeId,
  });
  const r = res.invocation?.invocationResults?.invocationResult?.[0];
  return {
    status: r?.invocationStatus ?? "Running",
    output: r?.output ?? "",
    exitCode: r?.exitCode ?? null,
  };
}
