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
  defaultRegion: text("default_region").default("cn-hangzhou"),
  defaultSpec: text("default_spec").default("ecs.g6.xlarge"),
  defaultDiskCategory: text("default_disk_category").default("cloud_essd"),
  defaultDiskSize: integer("default_disk_size").default(40),
  defaultBandwidth: integer("default_bandwidth").default(10),
  defaultReleaseHours: real("default_release_hours").default(0.5),
  defaultIdleMinutes: integer("default_idle_minutes").default(30),
  defaultSpotStrategy: text("default_spot_strategy").default("NoSpot"),
  defaultSpotDuration: integer("default_spot_duration").default(1),
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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_instances_workspace").on(table.workspaceId),
  index("idx_instances_status").on(table.status),
  index("idx_instances_heartbeat").on(table.lastHeartbeatAt),
  index("idx_instances_idle").on(table.status, table.lastActiveAt),
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

/** 模板：含自带载荷的只读配方。user_id 为 NULL 表示平台内置。 */
export const templates = pgTable("templates", {
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
  index("idx_templates_user").on(table.userId),
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

export const userImages = pgTable("user_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  imageUri: text("image_uri").notNull(),
  architecture: text("architecture").default("amd64"),
  source: text("source"), // "marketplace" | "custom"
  marketplaceId: text("marketplace_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const userFeatures = pgTable("user_features", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  featureUri: text("feature_uri").notNull(),
  options: jsonb("options").$type<Record<string, unknown>>().default({}),
  source: text("source"),
  marketplaceId: text("marketplace_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const userScripts = pgTable("user_scripts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  script: text("script").notNull(),
  sortOrder: integer("sort_order").default(0),
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

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
export type UserImage = typeof userImages.$inferSelect;
export type NewUserImage = typeof userImages.$inferInsert;
export type UserFeature = typeof userFeatures.$inferSelect;
export type NewUserFeature = typeof userFeatures.$inferInsert;
export type UserScript = typeof userScripts.$inferSelect;
export type NewUserScript = typeof userScripts.$inferInsert;
export type EnvVariable = typeof envVariables.$inferSelect;
export type NewEnvVariable = typeof envVariables.$inferInsert;
export type StorageVolume = typeof storageVolumes.$inferSelect;
export type NewStorageVolume = typeof storageVolumes.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;
export type WorkspacePayload = typeof workspacePayloads.$inferSelect;
export type NewWorkspacePayload = typeof workspacePayloads.$inferInsert;

export { primaryKey };
