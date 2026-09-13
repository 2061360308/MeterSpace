-- 异步创建的「认领」时间戳（docs/UI-PERFORMANCE.md U9）。
--
-- 创建实例要串行走 VPC / 安全组 / 镜像 / ECS 创建，是秒级操作，放在请求里
-- 会让按钮转圈很久（前端原先被迫用 60s AbortController 兜底）。
--
-- 改为：请求只落一行 PROVISIONING（ecs_instance_id 为空）并立即返回，
-- 真正的云资源创建由 /api/maintenance tick 里的 resumeProvisioning 完成。
--
-- 该列用于**原子认领**，避免并发的两个 maintenance 请求同时给同一行建资源：
--   UPDATE ... SET provision_claimed_at = now()
--   WHERE id = ? AND (provision_claimed_at IS NULL OR provision_claimed_at < now() - 2min)
-- 只有 returning 非空的调用者才继续执行。
ALTER TABLE "instances" ADD COLUMN IF NOT EXISTS "provision_claimed_at" timestamp with time zone;

-- 认领扫描按 status + ecs_instance_id 过滤
CREATE INDEX IF NOT EXISTS "idx_instances_provisioning"
  ON "instances" ("status", "ecs_instance_id");
