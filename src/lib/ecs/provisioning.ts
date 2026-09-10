import {
  describeImages,
  describeVpcs,
  createVpc,
  describeVSwitches,
  createVSwitch,
  describeSecurityGroups,
  createSecurityGroup,
  authorizeIngress,
  describeZones,
} from "@/lib/aliyun/ecs";
import type { AliCredentials } from "@/lib/aliyun/client";

export interface RegionResources {
  imageId: string;
  vpcId: string;
  vSwitchId: string;
  securityGroupId: string;
}

interface CacheEntry {
  expiresAt: number;
  value: RegionResources;
}

// In-memory cache (serverless best-effort). Key: {accessKeyId}:{region}
const cache = new Map<string, CacheEntry>();
const TTL = 10 * 60 * 1000; // 10 minutes

function key(creds: AliCredentials, region: string): string {
  return `${creds.accessKeyId}:${region}`;
}

async function findDebian(creds: AliCredentials, region: string) {
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

/**
 * Ensure per-region network resources exist (lazily create + cache).
 * Returns the IDs needed for RunInstances.
 */
export async function ensureRegionResources(
  creds: AliCredentials,
  region: string,
): Promise<RegionResources> {
  const k = key(creds, region);
  const hit = cache.get(k);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const imageId = await findDebian(creds, region);

  // VPC
  let vpcId = (await describeVpcs(creds, region)).find((v) => v.status === "Available")?.vpcId;
  if (!vpcId) {
    vpcId = await createVpc(creds, region);
  }

  // VSwitch (pick a zone)
  let vSwitch = (await describeVSwitches(creds, region, vpcId)).find(
    (v) => v.status === "Available",
  );
  if (!vSwitch) {
    const zones = await describeZones(creds, region);
    const zoneId = zones[0]?.zoneId;
    if (!zoneId) throw new Error(`No zone available in ${region}`);
    const id = await createVSwitch(creds, region, vpcId, zoneId);
    vSwitch = { vSwitchId: id };
  }

  // Security group (+ ingress 22, 8080)
  let sg = (await describeSecurityGroups(creds, region, vpcId)).find(
    (s) => s.vpcId === vpcId,
  );
  if (!sg) {
    const id = await createSecurityGroup(creds, region, vpcId);
    await authorizeIngress(creds, region, id, "22/22");
    await authorizeIngress(creds, region, id, "8080/8080");
    sg = { securityGroupId: id };
  }

  const value: RegionResources = {
    imageId,
    vpcId,
    vSwitchId: vSwitch.vSwitchId,
    securityGroupId: sg.securityGroupId,
  };
  cache.set(k, { expiresAt: Date.now() + TTL, value });
  return value;
}

function instanceSgName(instanceId: string): string {
  return `workspace-cloud-${instanceId.slice(0, 8)}`;
}

/**
 * Ensure a dedicated, closed-by-default security group for a single instance.
 * No ingress rules are pre-authorized: access is granted per-visitor IP via the
 * access registration flow (authorizeSecurityGroup) so the 8080 whitelist is real.
 */
export async function ensureInstanceSecurityGroup(
  creds: AliCredentials,
  region: string,
  vpcId: string,
  instanceId: string,
): Promise<string> {
  const name = instanceSgName(instanceId);
  const existing = await describeSecurityGroups(creds, region, vpcId);
  const found = existing.find((s) => s.securityGroupName === name);
  if (found?.securityGroupId) return found.securityGroupId;

  return createSecurityGroup(creds, region, vpcId, name, `workspace-cloud per-instance sg ${instanceId}`);
}
