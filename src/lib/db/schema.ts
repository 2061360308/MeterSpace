import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  bigint,
  jsonb,
  real,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const settings = pgTable("settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  aliAccessKeyId: text("ali_access_key_id").notNull(),
  aliAccessSecret: text("ali_access_secret").notNull(),
  // 注：default_region / default_spec / default_disk_category 三列
  // 已从代码层移除（无任何消费方），DB 列保留未 DROP。见 docs/DB-MIGRATION.md
  defaultDiskSize: integer("default_disk_size").default(40),
  defaultBandwidth: integer("default_bandwidth").default(10),
  defaultReleaseHours: real("default_release_hours").default(0.5),
  defaultIdleMinutes: integer("default_idle_minutes").default(30),
  /**
   * 抢占式实例的保障时长（小时）。阿里云只接受 0 / 1：
   *   0 = 无保障（随时可能被回收，最便宜）
   *   1 = 保障 1 小时
   * 仅在该实例**启用了抢占**时才生效（见 instances.use_spot）。
   */
  defaultSpotDuration: integer("default_spot_duration").default(1),
  // 注：default_spot_strategy 已从代码层移除——是否抢占由每次启动时的开关决定，
  // 不再有全局默认策略。DB 列保留未 DROP，见 docs/DB-MIGRATION.md
  acrInstanceId: text("acr_instance_id"),
  ossBucket: text("oss_bucket"),
  enabledRegions: jsonb("enabled_regions").$type<string[]>().default(["cn-hangzhou"]),
  logRetentionDays: integer("log_retention_days").default(7),
  githubMirror: text("github_mirror"),
  dockerMirror: text("docker_mirror"),
  proxyMode: text("proxy_mode").default("disabled"),
  proxyClashSubscription: text("proxy_clash_subscription"),
  proxyClashYaml: text("proxy_clash_yaml"),
  proxyUpstreamUrl: text("proxy_upstream_url"),
  proxyUpstreamUsername: text("proxy_upstream_username"),
  proxyUpstreamSecret: text("proxy_upstream_secret"),
  proxyProbeUrls: jsonb("proxy_probe_urls").$type<string[]>().default([]),
  proxyBypass: jsonb("proxy_bypass").$type<string[]>().default([]),
  clashBinUrl: text("clash_bin_url"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const cloudInstances = pgTable("cloud_instances", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  provider: text("provider").notNull().default("aliyun"),
  region: text("region").notNull(),
  instanceType: text("instance_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  provider: text("provider").notNull().default("aliyun"),
  region: text("region").notNull(),
  imageUri: text("image_uri"),
  defaultDiskSize: integer("default_disk_size").default(40),
  defaultBandwidth: integer("default_bandwidth").default(10),
  publicIp: boolean("public_ip").default(true),
  features: jsonb("features").$type<
    { id: string; name: string; version: string; installScript: string }[]
  >().default([]),
  gitProvider: text("git_provider"),
  gitRepoUrl: text("git_repo_url"),
  gitBranch: text("git_branch").default("main"),
  gitTokenEnc: text("git_token_enc"),
  autoClone: boolean("auto_clone").default(true),
  releaseHours: integer("release_hours"),
  idleMinutes: integer("idle_minutes"),
  ossWorkspacePath: text("oss_workspace_path"),
  // === 模板实例化（见 docs/FINAL-PLAN.md §8.1） ===
  templateId: text("template_id"),
  templateVersion: text("template_version"),
  templateParams: jsonb("template_params").$type<Record<string, unknown>>().default({}),
  entry: text("entry"),
  activityConfig: jsonb("activity_config").$type<{
    ports?: { port: number; label?: string; protocol?: "http" | "tcp"; private?: boolean }[];
    idleMinutes?: number;
    sampleIntervalSec?: number;
  }>(),
  entryTimeout: integer("entry_timeout").default(1800),
  proxyMode: text("proxy_mode").default("inherit"),
  proxyClashSubscription: text("proxy_clash_subscription"),
  proxyClashYaml: text("proxy_clash_yaml"),
  proxyUpstreamUrl: text("proxy_upstream_url"),
  proxyUpstreamUsername: text("proxy_upstream_username"),
  proxyUpstreamSecret: text("proxy_upstream_secret"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const workspaceStates = pgTable("workspace_states", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  status: text("status").default("STOPPED"),
  instanceId: text("instance_id"),
  publicIp: text("public_ip"),
  port: integer("port"),
  accessToken: text("access_token"),
  healthCallback: boolean("health_callback").default(false),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  idleTriggered: boolean("idle_triggered").default(false),
  ossUsageBytes: bigint("oss_usage_bytes", { mode: "number" }),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const instances = pgTable("instances", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  cloudInstanceId: uuid("cloud_instance_id")
    .references(() => cloudInstances.id, { onDelete: "set null" }),
  diskSize: integer("disk_size").notNull().default(40),
  bandwidth: integer("bandwidth").notNull().default(10),
  /**
   * 本次启动是否使用抢占式实例。
   *
   * 必须落库：云资源创建是异步的（createInstance 只插 PROVISIONING 行，
   * 真正建 ECS 在 `resumeProvisioning`），不存下来异步阶段就不知道用户的意图。
   * 保障时长不落库——那是全局偏好，读 `settings.default_spot_duration`。
   */
  useSpot: boolean("use_spot").notNull().default(false),
  status: text("status").notNull().default("PROVISIONING"),
  ecsInstanceId: text("ecs_instance_id"),
  publicIp: text("public_ip"),
  port: integer("port"),
  securityGroupId: text("security_group_id"),
  accessToken: text("access_token"),
  bootPhase: text("boot_phase"),
  bootStartedAt: timestamp("boot_started_at", { withTimezone: true }),
  bootCompletedAt: timestamp("boot_completed_at", { withTimezone: true }),
  bootError: text("boot_error"),
  currentEntry: text("current_entry"),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  idleTriggered: boolean("idle_triggered").default(false),
  cpuPercent: real("cpu_percent"),
  memoryMb: integer("memory_mb"),
  memoryTotalMb: integer("memory_total_mb"),
  diskMb: integer("disk_mb"),
  diskTotalMb: integer("disk_total_mb"),
  accessSummary: jsonb("access_summary"),
  ossUsageBytes: bigint("oss_usage_bytes", { mode: "number" }),
  stoppedAt: timestamp("stopped_at", { withTimezone: true }),
  stopReason: text("stop_reason"),
  logsExpireAt: timestamp("logs_expire_at", { withTimezone: true }),
  /** 异步停止：待收尾的 stop-hook 调用 id（见 docs/UI-PERFORMANCE.md U1） */
  stopInvokeId: text("stop_invoke_id"),
  /** 异步停止：释放发起时刻，作为 hook 总时限的判定基准 */
  releaseRequestedAt: timestamp("release_requested_at", { withTimezone: true }),
  /** 异步创建：云资源创建的原子认领时间戳（见 docs/UI-PERFORMANCE.md U9） */
  provisionClaimedAt: timestamp("provision_claimed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_instances_workspace").on(table.workspaceId),
  index("idx_instances_status").on(table.status),
  index("idx_instances_heartbeat").on(table.lastHeartbeatAt),
  index("idx_instances_idle").on(table.status, table.lastActiveAt),
  index("idx_instances_releasing").on(table.status, table.releaseRequestedAt),
]);

export const instanceLogs = pgTable("instance_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  instanceId: uuid("instance_id")
    .notNull()
    .references(() => instances.id, { onDelete: "cascade" }),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  level: text("level").notNull(),
  phase: text("phase"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_instance_logs_instance").on(table.instanceId, table.timestamp),
]);

export const instanceScripts = pgTable("instance_scripts", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  script: text("script").notNull(),
  sortOrder: integer("sort_order").default(0),
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// === 配方（v3，2026-09-12 拆表）===
/**
 * 配方：含 params 与占位符 payload。
 * user_id 为 NULL 表示平台内置（与 marketplace 一起在运行时由 service 合并）。
 */
export const recipes = pgTable("recipes", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  definition: jsonb("definition").$type<Record<string, unknown>>().notNull(),
  payload: jsonb("payload")
    .$type<{ path: string; content: string; mode: string; size: number }[]>()
    .default([]),
  version: text("version").default("1"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_recipes_user").on(table.userId),
]);

// === 启动模板（v3）===
/**
 * 启动模板：无 params、payload 已渲染；永远 source=user。
 * origin_recipe_id 只是字符串审计字段，不建 FK（删除 recipe 不级联）。
 * origin_kind: 'recipe' | 'upload' | 'migration'
 */
export const launchTemplates = pgTable("launch_templates", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  definition: jsonb("definition").$type<Record<string, unknown>>().notNull(),
  payload: jsonb("payload")
    .$type<{ path: string; content: string; mode: string; size: number }[]>()
    .default([]),
  version: text("version").default("1"),
  originRecipeId: text("origin_recipe_id"),
  originKind: text("origin_kind").notNull().default("upload"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_launch_templates_user").on(table.userId),
]);

/** 工作区载荷：逐文件存，用户可编辑。 */
export const workspacePayloads = pgTable("workspace_payloads", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  content: text("content").notNull().default(""),
  mode: text("mode").notNull().default("0644"),
  size: integer("size").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex("uq_workspace_payloads_path").on(table.workspaceId, table.path),
  index("idx_workspace_payloads_ws").on(table.workspaceId),
]);

export const instanceAccessCodes = pgTable("instance_access_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  instanceId: uuid("instance_id")
    .notNull()
    .references(() => instances.id, { onDelete: "cascade" }),
  code: text("code").notNull().unique(),
  isPersonal: boolean("is_personal").default(false),
  allowedPorts: integer("allowed_ports").array().default([8080]),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  maxUses: integer("max_uses"),
  useCount: integer("use_count").default(0),
  label: text("label"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_access_codes_instance").on(table.instanceId),
  index("idx_access_codes_code").on(table.code),
]);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const gitTokens = pgTable(
  "git_tokens",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // github / cnb
    tokenEnc: text("token_enc").notNull(),
    username: text("username"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.provider] }) }),
);

export const envVariables = pgTable("env_variables", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: text("value").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const storageVolumes = pgTable("storage_volumes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  mountPath: text("mount_path").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const instanceCache = pgTable(
  "instance_cache",
  {
    provider: text("provider").notNull().default("aliyun"),
    region: text("region").notNull(),
    instanceType: text("instance_type").notNull(),
    cpuCoreCount: integer("cpu_core_count").notNull(),
    memorySize: real("memory_size").notNull(),
    gpuCount: integer("gpu_count").notNull().default(0),
    /** 以下三项供 UI 展示（规格表格需要架构 / 规格族 / GPU 型号） */
    instanceTypeFamily: text("instance_type_family"),
    cpuArchitecture: text("cpu_architecture"),
    gpuSpec: text("gpu_spec"),
    refreshedAt: timestamp("refreshed_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.provider, t.region, t.instanceType] }) }),
);

export const priceCache = pgTable(
  "price_cache",
  {
    provider: text("provider").notNull().default("aliyun"),
    region: text("region").notNull(),
    instanceType: text("instance_type").notNull(),
    onDemandPrice: real("on_demand_price"),
    historicalDiscount: real("historical_discount"),
    releaseRate: real("release_rate"),
    refreshedAt: timestamp("refreshed_at", { withTimezone: true }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.provider, t.region, t.instanceType] }) }),
);

/**
 * describePrice 分项明细的 DB 缓存。
 *
 * 按「一次报价请求的完整参数」做键，避免用户每改一次磁盘/带宽就实时打云。
 * 注意与 `priceCache` 的区别：后者存抢占式**估算**（用于性价比排序），
 * 本表存的是逐资源**明细**（用于费用展示），两者形状不同。
 */
export const priceQuoteCache = pgTable(
  "price_quote_cache",
  {
    provider: text("provider").notNull().default("aliyun"),
    region: text("region").notNull(),
    instanceType: text("instance_type").notNull(),
    diskCategory: text("disk_category").notNull().default("cloud_essd"),
    diskSize: integer("disk_size").notNull(),
    bandwidth: integer("bandwidth").notNull(),
    spotStrategy: text("spot_strategy").notNull().default("NoSpot"),
    spotDuration: integer("spot_duration").notNull().default(1),
    details: jsonb("details").notNull(),
    refreshedAt: timestamp("refreshed_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    pk: primaryKey({
      columns: [
        t.provider,
        t.region,
        t.instanceType,
        t.diskCategory,
        t.diskSize,
        t.bandwidth,
        t.spotStrategy,
        t.spotDuration,
      ],
    }),
  }),
);

/**
 * 每个「用户 × 云厂商 × 地域」的基础网络资源（VPC / VSwitch / 镜像 / 共享安全组）。
 *
 * 背景：这些 ID 原本只缓存在 `lib/ecs/provisioning.ts` 的**进程内 Map** 里，
 * 而 serverless 冷启动即失效 —— 每次冷启动都要重打 4 次云 API（DescribeImages /
 * DescribeVpcs / DescribeVSwitches / DescribeSecurityGroups）才凑得齐 RunInstances 的参数。
 * 落库后冷启动只是一次 DB 读。
 *
 * 失效策略：`refreshedAt` 超过 TTL（见 `REGION_RESOURCE_TTL_MS`）会重建；
 * 另外 RunInstances 报「资源不存在」时由 `invalidateRegionResources()` 主动删除，
 * 避免用户在云控制台手删 VPC 后被脏缓存卡住。
 */
export const regionResources = pgTable(
  "region_resources",
  {
    provider: text("provider").notNull().default("aliyun"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    region: text("region").notNull(),
    imageId: text("image_id").notNull(),
    vpcId: text("vpc_id").notNull(),
    vSwitchId: text("v_switch_id").notNull(),
    securityGroupId: text("security_group_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    refreshedAt: timestamp("refreshed_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.provider, t.userId, t.region] }) }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Settings = typeof settings.$inferSelect;
export type CloudInstance = typeof cloudInstances.$inferSelect;
export type NewCloudInstance = typeof cloudInstances.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type WorkspaceState = typeof workspaceStates.$inferSelect;
export type Instance = typeof instances.$inferSelect;
export type NewInstance = typeof instances.$inferInsert;
export type InstanceLog = typeof instanceLogs.$inferSelect;
export type NewInstanceLog = typeof instanceLogs.$inferInsert;
export type InstanceScript = typeof instanceScripts.$inferSelect;
export type NewInstanceScript = typeof instanceScripts.$inferInsert;
export type InstanceAccessCode = typeof instanceAccessCodes.$inferSelect;
export type NewInstanceAccessCode = typeof instanceAccessCodes.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type GitToken = typeof gitTokens.$inferSelect;
export type InstanceCache = typeof instanceCache.$inferSelect;
export type PriceCache = typeof priceCache.$inferSelect;
export type PriceQuoteCache = typeof priceQuoteCache.$inferSelect;
export type EnvVariable = typeof envVariables.$inferSelect;
export type NewEnvVariable = typeof envVariables.$inferInsert;
export type StorageVolume = typeof storageVolumes.$inferSelect;
export type NewStorageVolume = typeof storageVolumes.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type Recipe = typeof recipes.$inferSelect;
export type NewRecipe = typeof recipes.$inferInsert;
export type LaunchTemplate = typeof launchTemplates.$inferSelect;
export type NewLaunchTemplate = typeof launchTemplates.$inferInsert;
export type WorkspacePayload = typeof workspacePayloads.$inferSelect;
export type NewWorkspacePayload = typeof workspacePayloads.$inferInsert;
export type RegionResource = typeof regionResources.$inferSelect;
export type NewRegionResource = typeof regionResources.$inferInsert;

export { primaryKey };
