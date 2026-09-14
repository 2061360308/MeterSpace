-- 0002: 自动释放周期从「小时(real)」改为「分钟(integer)」，并落库云侧 AutoReleaseTime
--
-- 背景（docs/AGENT-LIFECYCLE.md §7.1）：
--   * release_hours 原为 real（支持 0.5 小时），现语义改为「自动续期周期（分钟）」，
--     单位缩小、语义精确，改为 integer 便于边界检验。
--   * 旧值按 小时×60 换算并 clamp 到 [35, 7200]（分钟）。
--   * 换算出的 NULL 保持 NULL：workspaces 未设置值时由上层按
--     settings.default_auto_renewal_minutes 取值，instances 的 auto_release_at
--     由运行期续期逻辑填充（NULL 即「需要续期」，见 §7.5 W3）。

ALTER TABLE "settings"
  RENAME COLUMN "default_release_hours" TO "default_auto_renewal_minutes";

ALTER TABLE "settings"
  ALTER COLUMN "default_auto_renewal_minutes"
  TYPE integer
  USING GREATEST(LEAST(ROUND("default_auto_renewal_minutes" * 60)::integer, 7200), 35);

ALTER TABLE "settings"
  ALTER COLUMN "default_auto_renewal_minutes" SET DEFAULT 35;

ALTER TABLE "workspaces"
  RENAME COLUMN "release_hours" TO "auto_renewal_minutes";

ALTER TABLE "workspaces"
  ALTER COLUMN "auto_renewal_minutes"
  TYPE integer
  USING GREATEST(LEAST(ROUND("auto_renewal_minutes" * 60)::integer, 7200), 35);

-- 入口超时默认 1800s → 600s（docs/AGENT-LIFECYCLE.md §3 W1）。
-- SET DEFAULT 只影响未来插入的默认值，存量行保持不变。
ALTER TABLE "workspaces"
  ALTER COLUMN "entry_timeout" SET DEFAULT 600;

ALTER TABLE "instances"
  ADD COLUMN "auto_release_at" timestamp with time zone;