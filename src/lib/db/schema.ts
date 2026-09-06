import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  decimal,
  bigint,
  jsonb,
  primaryKey,
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
  defaultReleaseHours: integer("default_release_hours").default(4),
  defaultIdleMinutes: integer("default_idle_minutes").default(30),
  defaultSpotStrategy: text("default_spot_strategy").default("NoSpot"),
  defaultSpotDuration: integer("default_spot_duration").default(1),
  acrInstanceId: text("acr_instance_id"),
  ossBucket: text("oss_bucket"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  region: text("region").notNull(),
  instanceType: text("instance_type").notNull(),
  diskCategory: text("disk_category").default("cloud_essd"),
  diskSize: integer("disk_size").default(40),
  bandwidth: integer("bandwidth").default(10),
  publicIp: boolean("public_ip").default(true),
  spotStrategy: text("spot_strategy").default("NoSpot"),
  spotDuration: integer("spot_duration").default(1),
  spotPriceLimit: decimal("spot_price_limit", { precision: 8, scale: 4 }),
  imageUri: text("image_uri").notNull(),
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

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Settings = typeof settings.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type WorkspaceState = typeof workspaceStates.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type GitToken = typeof gitTokens.$inferSelect;

export { primaryKey };
