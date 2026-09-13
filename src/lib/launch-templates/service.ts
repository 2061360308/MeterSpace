/**
 * 启动模板服务（v3）。
 *
 * - 仅列/查/删用户自建的 launch_templates；不接受内置/市场。
 * - `instantiate()` 与原 `/api/templates/[id]/instantiate` 行为对齐：
 *   渲染 payload → 创建 workspace + workspace_payloads + auditLog + OSS bucket。
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  launchTemplates,
  workspaces,
  workspacePayloads,
  auditLogs,
} from "@/lib/db/schema";
import { parseTemplateDefinition, buildParamValues } from "@/lib/templates/validate";
import { renderFile } from "@/lib/templates/render";
import { getProvider } from "@/lib/providers";
import { ossBucketForRegion } from "@/lib/workspaces/service";
import { getUserSettings } from "@/lib/aliyun/auth";
import { getGitTokenEnc } from "@/lib/git/service";
import { encrypt } from "@/lib/crypto";
import {
  DEFAULT_IDLE_MINUTES,
  DEFAULT_ENTRY_TIMEOUT,
  type ActivityConfig,
  type PayloadFile,
  type Template,
} from "@/lib/templates/types";

export interface ResolvedLaunchTemplate {
  definition: Template;
  payload: PayloadFile[];
  version: string;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  originRecipeId: string | null;
  originKind: string;
}

interface LaunchTemplateRow {
  id: string;
  userId: string;
  name: string;
  definition: unknown;
  payload: unknown;
  version: string | null;
  originRecipeId: string | null;
  originKind: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

function rowToResolved(row: LaunchTemplateRow): ResolvedLaunchTemplate | null {
  let def: Template;
  try {
    def = parseTemplateDefinition(row.definition);
  } catch (e) {
    console.warn(`[launch_templates] 跳过非法定义 id=${row.id}:`, e);
    return null;
  }
  // 防御：launch_templates 的 params 必须为空；若发现脏数据，按 0 处理。
  def = { ...def, params: [] };
  const payload = Array.isArray(row.payload) ? (row.payload as PayloadFile[]) : [];
  return {
    definition: def,
    payload,
    version: row.version ?? "1",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    originRecipeId: row.originRecipeId,
    originKind: row.originKind,
  };
}

export async function listLaunchTemplates(
  userId: string,
): Promise<ResolvedLaunchTemplate[]> {
  const rows = await db.select().from(launchTemplates).where(eq(launchTemplates.userId, userId));
  const list: ResolvedLaunchTemplate[] = [];
  for (const row of rows as LaunchTemplateRow[]) {
    const r = rowToResolved(row);
    if (r) list.push(r);
  }
  list.sort((a, b) =>
    a.definition.name.localeCompare(b.definition.name, "zh-Hans-CN"),
  );
  return list;
}

export async function getLaunchTemplate(
  userId: string,
  id: string,
): Promise<ResolvedLaunchTemplate | null> {
  const row = await db.query.launchTemplates.findFirst({
    where: and(eq(launchTemplates.id, id), eq(launchTemplates.userId, userId)),
  });
  if (!row) return null;
  return rowToResolved(row as LaunchTemplateRow);
}

/** 新建 launch_template 行；params 强制为 []；originKind 默认 'upload'。 */
export async function createLaunchTemplate(
  userId: string,
  definition: Template,
  payload: PayloadFile[],
  origin: { recipeId?: string | null; kind?: "recipe" | "upload" } = {},
): Promise<ResolvedLaunchTemplate> {
  const defNoParams: Template = { ...definition, params: [] };
  const [created] = await db
    .insert(launchTemplates)
    .values({
      id: defNoParams.id,
      userId,
      name: defNoParams.name,
      definition: defNoParams as unknown as Record<string, unknown>,
      payload,
      version: "1",
      originRecipeId: origin.recipeId ?? null,
      originKind: origin.kind ?? "upload",
    })
    .returning();
  return rowToResolved(created as LaunchTemplateRow)!;
}

export async function deleteLaunchTemplate(
  userId: string,
  id: string,
): Promise<boolean> {
  const res = await db
    .delete(launchTemplates)
    .where(and(eq(launchTemplates.id, id), eq(launchTemplates.userId, userId)))
    .returning({ id: launchTemplates.id });
  return res.length > 0;
}

// ============================================================================
//  从 recipe → launch_templates（由 /api/recipes/[id]/use 调用）
// ============================================================================

/**
 * 把 recipe 的 payload 渲染（替换 {{key}}）后，作为 launch_templates 落库。
 * 成功后返回新建行的 ResolvedLaunchTemplate。
 *
 * 注意：launch_templates.params 强制 []；recipe 的 params 定义不复制。
 */
export async function createLaunchFromRecipe(
  userId: string,
  recipe: ResolvedRecipe,
  vars: Record<string, string>,
  /** 允许调用方覆盖 name / id（不传 = 用 recipe 原 id） */
  override: { id?: string; name?: string } = {},
): Promise<ResolvedLaunchTemplate> {
  const definition = { ...recipe.definition, params: [] };
  if (override.id) (definition as { id: string }).id = override.id;
  if (override.name) definition.name = override.name;

  const rendered: PayloadFile[] = recipe.payload.map((f) => ({
    path: f.path,
    content: renderFile(definition.entry, f.path, f.content, vars),
    mode: f.mode,
    size: Buffer.byteLength(
      renderFile(definition.entry, f.path, f.content, vars),
      "utf8",
    ),
  }));

  return createLaunchTemplate(userId, definition, rendered, {
    recipeId: recipe.definition.id,
    kind: "recipe",
  });
}

import type { ResolvedRecipe } from "@/lib/recipes/service";

// ============================================================================
//  instantiate：把 launch_templates 渲染成 workspace
// ============================================================================

export interface InstantiateLaunchBody {
  name: string;
  region: string;
  provider?: string;
  // params 字段保留供向后兼容；launch_templates.params 永远为 []，后端忽略。
  params?: Record<string, unknown>;
  diskSize?: number;
  bandwidth?: number;
  publicIp?: boolean;
  releaseHours?: number | null;
  gitProvider?: string | null;
  gitRepoUrl?: string | null;
  gitBranch?: string;
  autoClone?: boolean;
  proxyMode?: "inherit" | "disabled" | "clash" | "upstream";
  proxyClashSubscription?: string;
  proxyClashYaml?: string;
  proxyUpstreamUrl?: string;
  proxyUpstreamUsername?: string;
  proxyUpstreamSecret?: string;
}

export async function instantiateWorkspaceFromLaunch(
  userId: string,
  launchId: string,
  body: InstantiateLaunchBody,
): Promise<{
  workspaceId: string;
  needsUpload: boolean;
  entry: string;
  ports: { port: number; label: string; protocol: "http" | "tcp" }[];
  files: string[];
}> {
  const tpl = await getLaunchTemplate(userId, launchId);
  if (!tpl) {
    const err = new Error("启动模板不存在") as Error & { status?: number };
    err.status = 404;
    throw err;
  }
  const { definition, payload } = tpl;

  // launch_templates 无 params，但为兼容旧调用方的 params 字段，调用 buildParamValues 安全处理
  const vars = buildParamValues(definition.params ?? [], body.params ?? {});

  const activity: ActivityConfig = {
    ports: definition.activity?.ports ?? [],
    idleMinutes: definition.activity?.idleMinutes ?? DEFAULT_IDLE_MINUTES,
    sampleIntervalSec: definition.activity?.sampleIntervalSec,
  };
  const entryTimeout = definition.timeout ?? DEFAULT_ENTRY_TIMEOUT;

  let gitTokenEnc: string | null = null;
  if (body.gitProvider && body.gitRepoUrl) {
    gitTokenEnc = await getGitTokenEnc(userId, body.gitProvider);
  }

  let proxyUpstreamSecretEnc: string | null = null;
  if (body.proxyUpstreamSecret) {
    proxyUpstreamSecretEnc = encrypt(body.proxyUpstreamSecret);
  }

  const provider = getProvider(body.provider ?? "aliyun");
  if (!provider) {
    throw new Error(`Unknown provider: ${body.provider}`);
  }

  // 用户级默认值 → 工作区快照（实例之后再从工作区继承）。
  //
  // 磁盘/带宽/释放时长/空闲阈值都必须在这里定型：实例只读自己那行的
  // disk_size / bandwidth，之后再无机会回查 settings。写 null 等于把
  // 设置页的值丢弃，最后只能落到硬编码兜底。
  const s = await getUserSettings(userId);

  const [workspace] = await db
    .insert(workspaces)
    .values({
      userId,
      name: body.name,
      provider: body.provider ?? "aliyun",
      region: body.region,
      imageUri: null,
      defaultDiskSize: body.diskSize ?? s.defaultDiskSize,
      defaultBandwidth: body.bandwidth ?? s.defaultBandwidth,
      publicIp: body.publicIp ?? true,
      features: [],
      gitProvider: body.gitProvider ?? null,
      gitRepoUrl: body.gitRepoUrl ?? null,
      gitBranch: body.gitBranch ?? "main",
      gitTokenEnc,
      autoClone: body.autoClone ?? true,
      templateId: definition.id,
      templateVersion: tpl.version,
      templateParams: vars,
      entry: definition.entry,
      activityConfig: activity,
      entryTimeout,
      // 模板声明的 idleMinutes 优先（那是模板作者对该负载的判断），
      // 其次用户级默认值；DEFAULT_IDLE_MINUTES 只作为最后兜底。
      idleMinutes: activity.idleMinutes ?? s.defaultIdleMinutes,
      releaseHours: body.releaseHours ?? s.defaultReleaseHours,
      ossWorkspacePath: null,
      proxyMode: body.proxyMode ?? "inherit",
      proxyClashSubscription: body.proxyClashSubscription || null,
      proxyClashYaml: body.proxyClashYaml || null,
      proxyUpstreamUrl: body.proxyUpstreamUrl || null,
      proxyUpstreamUsername: body.proxyUpstreamUsername || null,
      proxyUpstreamSecret: proxyUpstreamSecretEnc,
    })
    .returning();

  await db
    .update(workspaces)
    .set({ ossWorkspacePath: `ws-${workspace.id}/workspace` })
    .where(eq(workspaces.id, workspace.id));

  await provider.ensureStorage(
    body.region,
    ossBucketForRegion(body.region),
  );

  if (payload.length > 0) {
    const rows = payload.map((f) => {
      // launch_templates 的 payload 已渲染——直接落库（renderFile 对无 {{key}} 的内容是恒等映射）。
      const rendered = renderFile(definition.entry, f.path, f.content, vars);
      return {
        workspaceId: workspace.id,
        path: f.path,
        content: rendered,
        mode: f.mode,
        size: Buffer.byteLength(rendered, "utf8"),
      };
    });
    await db.insert(workspacePayloads).values(rows);
  }

  await db.insert(auditLogs).values({
    userId,
    workspaceId: workspace.id,
    action: "CREATE",
    details: {
      name: body.name,
      region: body.region,
      source: "launch_template",
      templateId: definition.id,
    },
  });

  const ports = (activity.ports ?? [])
    .filter((p) => !p.private)
    .map((p) => ({
      port: p.port,
      label: p.label ?? `端口 ${p.port}`,
      protocol: p.protocol ?? "http",
    }));

  return {
    workspaceId: workspace.id,
    needsUpload: false,
    entry: definition.entry,
    ports,
    files: payload.map((f) => f.path),
  };
}
