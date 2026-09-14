import { and, eq, gt } from "drizzle-orm";
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
import { db } from "@/lib/db";
import { regionResources } from "@/lib/db/schema";
import { AGENT_CONTROL_PORT } from "@/lib/constants";

export interface RegionResources {
  imageId: string;
  vpcId: string;
  vSwitchId: string;
  securityGroupId: string;
  /**
   * `describeSecurityGroups` 的原始结果——仅在**真的打过云**时才有值。
   * 供 `ensureInstanceSecurityGroup` 复用，省掉一次重复的 DescribeSecurityGroups。
   * 从 DB / 内存缓存命中时为空，那边会自行补一次查询。
   */
  securityGroups?: SecurityGroupRef[];
}

export interface SecurityGroupRef {
  securityGroupId: string;
  securityGroupName?: string;
  vpcId?: string;
}

interface CacheEntry {
  expiresAt: number;
  value: RegionResources;
}

/** DB 行的有效期。超期会重新查一次云并刷新，避免云侧资源被手删后长期用脏值。 */
export const REGION_RESOURCE_TTL_MS = 6 * 60 * 60 * 1000; // 6 小时

/** L1：进程内缓存（serverless best-effort，冷启动即失效）。Key: {accessKeyId}:{region} */
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
 * 主动作废某个地域的缓存（DB 行 + 进程内）。
 *
 * 用在 RunInstances 报「VPC / VSwitch / 安全组 / 镜像不存在」时——通常是用户在云控制台
 * 手删了资源，此时必须让下一次重新探测，否则会被脏缓存一直卡住。
 */
export async function invalidateRegionResources(
  userId: string,
  region: string,
  provider = "aliyun",
): Promise<void> {
  cache.clear();
  await db
    .delete(regionResources)
    .where(
      and(
        eq(regionResources.provider, provider),
        eq(regionResources.userId, userId),
        eq(regionResources.region, region),
      ),
    );
}

/** L2：DB 读取。命中条件：行存在且 refreshedAt 在 TTL 内。 */
async function readFromDb(
  userId: string,
  region: string,
  provider: string,
): Promise<RegionResources | null> {
  const row = await db.query.regionResources.findFirst({
    where: and(
      eq(regionResources.provider, provider),
      eq(regionResources.userId, userId),
      eq(regionResources.region, region),
      gt(regionResources.refreshedAt, new Date(Date.now() - REGION_RESOURCE_TTL_MS)),
    ),
  });
  if (!row) return null;
  return {
    imageId: row.imageId,
    vpcId: row.vpcId,
    vSwitchId: row.vSwitchId,
    securityGroupId: row.securityGroupId,
  };
}

async function writeToDb(
  userId: string,
  region: string,
  provider: string,
  value: RegionResources,
): Promise<void> {
  await db
    .insert(regionResources)
    .values({
      provider,
      userId,
      region,
      imageId: value.imageId,
      vpcId: value.vpcId,
      vSwitchId: value.vSwitchId,
      securityGroupId: value.securityGroupId,
      refreshedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        regionResources.provider,
        regionResources.userId,
        regionResources.region,
      ],
      set: {
        imageId: value.imageId,
        vpcId: value.vpcId,
        vSwitchId: value.vSwitchId,
        securityGroupId: value.securityGroupId,
        refreshedAt: new Date(),
      },
    });
}

/** 真正打云：探测（必要时创建）并落库。冷路径，最多 4 次查询 + 若干次创建。 */
async function probeRegionResources(
  creds: AliCredentials,
  region: string,
): Promise<RegionResources> {
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
  const sgList = await describeSecurityGroups(creds, region, vpcId);
  let sg = sgList.find((s) => s.vpcId === vpcId);
  if (!sg) {
    const id = await createSecurityGroup(creds, region, vpcId);
    await authorizeIngress(creds, region, id, "22/22", "0.0.0.0/0", "ssh");
    sg = { securityGroupId: id, vpcId };
    sgList.push(sg);
  }

  return {
    imageId,
    vpcId,
    vSwitchId: vSwitch.vSwitchId,
    securityGroupId: sg.securityGroupId,
    // 带上原始结果，让随后的 ensureInstanceSecurityGroup 不必再查一次
    securityGroups: sgList,
  };
}

/**
 * Ensure per-region network resources exist (lazily create + cache).
 * Returns the IDs needed for RunInstances.
 *
 * 三级查找：进程内 Map（L1，10min）→ DB（L2，6h）→ 打云（L3）。
 * 只有 L3 会消耗云 API；正常创建实例时应该只有 L1/L2 命中。
 */
export async function ensureRegionResources(
  creds: AliCredentials,
  region: string,
  opts: { userId?: string; provider?: string } = {},
): Promise<RegionResources> {
  const k = key(creds, region);
  const hit = cache.get(k);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const provider = opts.provider ?? "aliyun";
  const userId = opts.userId;

  // L2：DB
  if (userId) {
    const fromDb = await readFromDb(userId, region, provider);
    if (fromDb) {
      cache.set(k, { expiresAt: Date.now() + TTL, value: fromDb });
      return fromDb;
    }
  }

  // L3：打云
  const value = await probeRegionResources(creds, region);
  if (userId) {
    try {
      await writeToDb(userId, region, provider, value);
    } catch (e) {
      // 落库失败不该阻断创建——下次冷启动再打一次云即可
      console.warn(
        "[provisioning] persist regionResources failed:",
        (e as Error).message,
      );
    }
  }
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
 *
 * `prefetched` 传入 `ensureRegionResources` 已经拉到的安全组列表时，
 * 可以省掉一次 DescribeSecurityGroups（原实现每次建实例都重复查一次）。
 */
export async function ensureInstanceSecurityGroup(
  creds: AliCredentials,
  region: string,
  vpcId: string,
  instanceId: string,
  prefetched?: SecurityGroupRef[],
): Promise<string> {
  const name = instanceSgName(instanceId);

  const find = (list: SecurityGroupRef[]) =>
    list.find((s) => s.securityGroupName === name)?.securityGroupId;

  if (prefetched) {
    const found = find(prefetched);
    if (found) return found;
  }

  const existing = await describeSecurityGroups(creds, region, vpcId);
  const found = find(existing) ?? (prefetched ? find(prefetched) : undefined);
  if (found) return found;

  const sgId = await createSecurityGroup(creds, region, vpcId, name, `workspace-cloud per-instance sg ${instanceId}`);

  // 开放 agent 控制端口（pre-stop 指令通道，docs/AGENT-PRESTOP.md §6）。
  // 仅在「新建 SG」分支放行：prefetched/existing 命中的 SG 规则已在
  // （per-instance 名称唯一，重试命中已创建 SG 时规则已带）。
  await authorizeIngress(
    creds,
    region,
    sgId,
    `${AGENT_CONTROL_PORT}/${AGENT_CONTROL_PORT}`,
    "0.0.0.0/0",
    "agent-control",
  );

  return sgId;
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
