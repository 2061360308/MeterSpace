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

  // Security group：仅放行 SSH。业务端口走「每实例独立安全组 + 访客 IP 白名单」路径
  // （见 ensureInstanceSecurityGroup / /api/access），不再预开 8080 —— 模板端口是任意的
  // （见 docs/FINAL-PLAN.md §6.2），hardcode 8080 会让所有非 8080 模板不可达。
  let sg = (await describeSecurityGroups(creds, region, vpcId)).find(
    (s) => s.vpcId === vpcId,
  );
  if (!sg) {
    const id = await createSecurityGroup(creds, region, vpcId);
    await authorizeIngress(creds, region, id, "22/22", "0.0.0.0/0", "ssh");
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
 * access registration flow (authorizeIngress) so the per-port whitelist is real.
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

/**
 * 为一个访客 IP 放行实例声明的所有业务端口（E3 / §11.3）。
 *
 * 模板端口是任意的，所以这里必须按 `ports` 逐个授权，而不是写死某个端口。
 * 端口区间用阿里云的 `from/to` 语法：单端口 → "8080/8080"。
 * 任一端口授权失败（如重复规则 Conflict）都不应阻断其余端口，故逐个 try。
 */
export async function authorizeVisitor(
  creds: AliCredentials,
  region: string,
  securityGroupId: string,
  visitorIp: string,
  ports: number[],
  description = "workspace-access",
): Promise<{ authorized: number[]; failed: number[] }> {
  const cidr = visitorIp.includes("/") ? visitorIp : `${visitorIp}/32`;
  const authorized: number[] = [];
  const failed: number[] = [];

  for (const port of ports) {
    const range = `${port}/${port}`;
    try {
      await authorizeIngress(creds, region, securityGroupId, range, cidr, description);
      authorized.push(port);
    } catch (e) {
      // 重复规则（IpProtocolAlreadyExists）不算失败：说明该访客此前已放行
      const msg = (e as Error).message ?? "";
      if (/already|exists|Duplicate/i.test(msg)) {
        authorized.push(port);
      } else {
        console.warn(
          `[provisioning] authorize ${port} for ${cidr} failed:`,
          msg,
        );
        failed.push(port);
      }
    }
  }

  return { authorized, failed };
}
