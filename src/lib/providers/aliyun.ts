import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { decrypt } from "@/lib/crypto";
import * as ecs from "@/lib/aliyun/ecs";
import * as oss from "@/lib/aliyun/oss";
import * as bss from "@/lib/aliyun/bss";
import * as acr from "@/lib/aliyun/acr";
import type { AliCredentials } from "@/lib/aliyun/client";
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

export class AliyunProvider implements CloudProvider {
  readonly name = "aliyun";
  readonly label = "阿里云";

  private async getCreds(): Promise<AliCredentials> {
    const userId = await this.getFirstUserId();
    return this.getUserCreds(userId);
  }

  private async getUserCreds(userId: string): Promise<AliCredentials> {
    const row = await db.query.settings.findFirst({
      where: eq(settings.userId, userId),
    });
    if (!row) throw new Error("Aliyun credentials not configured");
    return {
      accessKeyId: decrypt(row.aliAccessKeyId),
      accessKeySecret: decrypt(row.aliAccessSecret),
    };
  }

  private async getFirstUserId(): Promise<string> {
    const row = await db.query.settings.findFirst({
      columns: { userId: true },
    });
    if (!row) throw new Error("No Aliyun credentials configured");
    return row.userId;
  }

  async getRegions(): Promise<CloudRegion[]> {
    const creds = await this.getCreds();
    const rawRegions = await ecs.describeRegions(creds);
    const seen = new Set<string>();
    return rawRegions
      .filter((r) => {
        if (seen.has(r.regionId)) return false;
        seen.add(r.regionId);
        return true;
      })
      .map((r) => ({ id: r.regionId, label: `${r.localName} (${r.regionId})` }));
  }

  async hasCredentials(userId: string): Promise<boolean> {
    const row = await db.query.settings.findFirst({
      where: eq(settings.userId, userId),
      columns: { aliAccessKeyId: true },
    });
    return !!row?.aliAccessKeyId;
  }

  async getCredentials(userId: string): Promise<CloudCredentials> {
    const creds = await this.getUserCreds(userId);
    return { accessKeyId: creds.accessKeyId, accessKeySecret: creds.accessKeySecret };
  }

  async getZones(region: string): Promise<CloudZone[]> {
    const creds = await this.getCreds();
    const zones = await ecs.describeZones(creds, region);
    return zones.map((z) => ({ id: z.zoneId, label: z.localName }));
  }

  async getInstanceTypes(region: string): Promise<CloudInstanceType[]> {
    const creds = await this.getCreds();
    const types = await ecs.describeInstanceTypes(creds, region);
    return types.map((t) => ({
      id: t.instanceTypeId,
      cpu: t.cpuCoreCount,
      memory: t.memorySize,
      family: t.instanceTypeFamily,
      architecture: t.cpuArchitecture,
      gpuAmount: t.gpuAmount,
      gpuSpec: t.gpuSpec,
    }));
  }

  async getAvailability(region: string): Promise<CloudInstanceAvailability[]> {
    const creds = await this.getCreds();
    const avail = await ecs.describeAllAvailability(creds, region);
    return avail.map((a) => ({
      instanceTypeId: a.instanceTypeId,
      status: a.status,
      availableZones: a.availableZones,
      totalZones: a.totalZones,
      zones: a.zones.map((z) => ({ zoneId: z.zoneId, status: z.statusCategory })),
    }));
  }

  async getDiskCategories(region: string): Promise<CloudDiskCategory[]> {
    const creds = await this.getCreds();
    const cats = await ecs.describeDiskCategories(creds, region);
    return cats.map((c) => ({
      category: c.category,
      label: c.label,
      status: c.status,
      min: c.min,
      max: c.max,
    }));
  }

  async createInstance(params: CreateInstanceParams): Promise<string> {
    const creds = await this.getCreds();
    const result = await ecs.runInstances(creds, {
      region: params.region,
      imageId: params.imageId,
      instanceType: params.instanceType,
      securityGroupId: params.securityGroupId,
      vSwitchId: params.vSwitchId,
      ramRoleName: params.ramRoleName,
      diskCategory: params.diskCategory,
      diskSize: params.diskSize,
      bandwidth: params.bandwidth,
      spotStrategy: params.spotStrategy,
      spotDuration: params.spotDuration,
      spotPriceLimit: params.spotPriceLimit,
      autoReleaseTime: params.autoReleaseTime,
      userData: params.userData,
      tags: params.tags,
    });
    return result.instanceId;
  }

  async getInstance(instanceId: string): Promise<CloudInstance | null> {
    const creds = await this.getCreds();
    const region = await this.getRegionForInstance(instanceId);
    const inst = await ecs.describeInstances(creds, region, instanceId);
    if (!inst) return null;
    return {
      id: inst.instanceId,
      status: inst.status,
      publicIp: inst.publicIpAddress ?? inst.eipAddress?.ipAddress,
      instanceType: inst.instanceType,
      autoReleaseTime: inst.autoReleaseTime,
      spotStrategy: inst.spotStrategy,
    };
  }

  private async getRegionForInstance(_id: string): Promise<string> {
    void _id;
    const row = await db.query.settings.findFirst({
      columns: { defaultRegion: true },
    });
    return row?.defaultRegion ?? "cn-hangzhou";
  }

  async deleteInstance(instanceId: string): Promise<void> {
    const creds = await this.getCreds();
    const region = await this.getRegionForInstance(instanceId);
    await ecs.deleteInstance(creds, region, instanceId);
  }

  async setAutoReleaseTime(instanceId: string, time: string): Promise<void> {
    const creds = await this.getCreds();
    const region = await this.getRegionForInstance(instanceId);
    await ecs.modifyInstanceAutoReleaseTime(creds, region, instanceId, time);
  }

  async getImages(region: string): Promise<CloudImage[]> {
    const creds = await this.getCreds();
    const images = await ecs.describeImages(creds, region);
    return images.map((i) => ({
      id: i.imageId,
      name: i.imageName,
      platform: i.platform,
      osName: i.osName,
      creationTime: i.creationTime,
    }));
  }

  async findImage(region: string, osPattern: string, version: string): Promise<string> {
    const creds = await this.getCreds();
    const images = await ecs.describeImages(creds, region);
    const candidates = images.filter(
      (i) =>
        (i.osName ?? "").toLowerCase().includes(osPattern.toLowerCase()) &&
        ((i.osName ?? "").includes(version) || (i.imageName ?? "").includes(version)),
    );
    candidates.sort((a, b) =>
      (b.creationTime ?? "").localeCompare(a.creationTime ?? ""),
    );
    const pick = candidates[0];
    if (!pick) throw new Error(`No ${osPattern} ${version} image found in ${region}`);
    return pick.imageId;
  }

  async getVpcs(region: string): Promise<CloudVpc[]> {
    const creds = await this.getCreds();
    const vpcs = await ecs.describeVpcs(creds, region);
    return vpcs.map((v) => ({
      id: v.vpcId,
      name: v.vpcName,
      isDefault: v.isDefault,
      status: v.status,
    }));
  }

  async createVpc(region: string, cidrBlock = "172.16.0.0/16"): Promise<string> {
    const creds = await this.getCreds();
    return ecs.createVpc(creds, region, cidrBlock);
  }

  async getVSwitches(region: string, vpcId?: string): Promise<CloudVSwitch[]> {
    const creds = await this.getCreds();
    const vsws = await ecs.describeVSwitches(creds, region, vpcId);
    return vsws.map((v) => ({
      id: v.vSwitchId,
      vpcId: v.vpcId,
      zoneId: v.zoneId,
      status: v.status,
      isDefault: v.isDefault,
    }));
  }

  async createVSwitch(region: string, vpcId: string, zoneId: string, cidrBlock = "172.16.0.0/24"): Promise<string> {
    const creds = await this.getCreds();
    return ecs.createVSwitch(creds, region, vpcId, zoneId, cidrBlock);
  }

  async getSecurityGroups(region: string, vpcId?: string): Promise<CloudSecurityGroup[]> {
    const creds = await this.getCreds();
    const sgs = await ecs.describeSecurityGroups(creds, region, vpcId);
    return sgs.map((s) => ({
      id: s.securityGroupId,
      name: s.securityGroupName,
      vpcId: s.vpcId,
    }));
  }

  async createSecurityGroup(region: string, vpcId: string): Promise<string> {
    const creds = await this.getCreds();
    return ecs.createSecurityGroup(creds, region, vpcId);
  }

  async authorizeSecurityGroup(securityGroupId: string, port: string, cidr = "0.0.0.0/0", description = "code-server"): Promise<void> {
    const creds = await this.getCreds();
    const region = await this.getRegionForInstance(securityGroupId);
    await ecs.authorizeIngress(creds, region, securityGroupId, port, cidr, description);
  }

  async describePrice(params: DescribePriceParams): Promise<CloudPriceDetail[]> {
    const creds = await this.getCreds();
    const details = await ecs.describePrice(creds, {
      region: params.region,
      imageId: params.imageId,
      instanceType: params.instanceType,
      spotStrategy: params.spotStrategy,
      spotDuration: params.spotDuration,
      spotPriceLimit: params.spotPriceLimit,
      diskCategory: params.diskCategory,
      diskSize: params.diskSize,
      bandwidth: params.bandwidth,
    });
    return details.map((d) => ({
      resource: d.resource,
      originalPrice: d.originalPrice,
      tradePrice: d.tradePrice,
      discountPrice: d.discountPrice,
    }));
  }

  async getSpotAdvice(region: string, instanceType: string, spotDuration: number): Promise<CloudSpotAdvice> {
    const creds = await this.getCreds();
    const advice = await ecs.describeSpotAdvice(creds, region, instanceType, spotDuration);
    return {
      available: advice.available,
      releaseRate: advice.releaseRate,
      historicalDiscount: advice.historicalDiscount,
      spotPrice: advice.spotPrice,
    };
  }

  async getSpotPriceHistory(region: string, instanceType: string, spotDuration = 0, days = 30): Promise<CloudSpotPricePoint[]> {
    const creds = await this.getCreds();
    void days;
    const history = await ecs.describeSpotPriceHistory(creds, region, instanceType, spotDuration);
    return history.map((h) => ({ timestamp: h.timestamp, price: h.spotPrice }));
  }

  async getBalance(): Promise<CloudAccountBalance> {
    const creds = await this.getCreds();
    const balance = await bss.queryAccountBalance(creds);
    return {
      availableAmount: balance.availableAmount,
      availableCashAmount: balance.availableCashAmount,
      creditAmount: balance.creditAmount,
      currency: balance.currency,
    };
  }

  async ensureStorage(region: string, name: string): Promise<void> {
    const creds = await this.getCreds();
    await oss.ensureBucket(creds, region, name);
  }

  async storageExists(region: string, name: string): Promise<boolean> {
    const creds = await this.getCreds();
    return oss.bucketExists(creds, region, name);
  }

  async listStorageObjects(region: string, bucket: string, prefix: string): Promise<CloudStorageObject[]> {
    const creds = await this.getCreds();
    const objects = await oss.listObjects(creds, region, bucket, prefix);
    return objects.map((o) => ({ name: o.name, size: o.size }));
  }

  async getStoragePrefixSize(region: string, bucket: string, prefix: string): Promise<number> {
    const creds = await this.getCreds();
    return oss.prefixSize(creds, region, bucket, prefix);
  }

  async deleteStorageObject(region: string, bucket: string, name: string): Promise<void> {
    const creds = await this.getCreds();
    await oss.deleteObject(creds, region, bucket, name);
  }

  async deleteStoragePrefix(region: string, bucket: string, prefix: string): Promise<void> {
    const creds = await this.getCreds();
    await oss.deletePrefix(creds, region, bucket, prefix);
  }

  async listRegistryInstances(region: string): Promise<CloudContainerRegistry[]> {
    const creds = await this.getCreds();
    const instances = await acr.listInstances(creds, region);
    return instances.map((i) => ({
      id: i.instanceId,
      name: i.instanceName,
      region: i.regionId,
      status: i.status,
    }));
  }

  async listRepositories(region: string, instanceId: string): Promise<CloudRepository[]> {
    const creds = await this.getCreds();
    const repos = await acr.listRepositories(creds, region, instanceId);
    return repos.map((r) => ({
      id: r.repoId,
      name: r.repoName,
      namespace: r.repoNamespace,
      summary: r.summary,
      createTime: r.createTime,
    }));
  }

  async listImageTags(region: string, instanceId: string, repoId: string): Promise<CloudImageTag[]> {
    const creds = await this.getCreds();
    const tags = await acr.listImageTags(creds, region, instanceId, repoId);
    return tags.map((t) => ({
      tag: t.tag,
      digest: t.digest,
      updateTime: t.updateTime,
    }));
  }

  async runCommand(instanceId: string, content: string): Promise<CloudCommandResult> {
    const creds = await this.getCreds();
    const region = await this.getRegionForInstance(instanceId);
    const result = await ecs.runCommand(creds, region, instanceId, content);
    return { invokeId: result.invokeId };
  }

  async getCommandResult(invokeId: string): Promise<CloudInvocationResult> {
    const creds = await this.getCreds();
    const region = await this.getRegionForInstance(invokeId);
    const result = await ecs.describeInvocationResults(creds, region, invokeId);
    return {
      status: result.status,
      output: result.output,
      exitCode: result.exitCode,
    };
  }
}
