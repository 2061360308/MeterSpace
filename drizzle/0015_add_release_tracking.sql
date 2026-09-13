-- 异步停止流程的状态位（docs/UI-PERFORMANCE.md U1）。
--
-- 背景：stopInstance / stopWorkspace 原先在请求内同步等待 stop-hook 最多 120s
-- （24 × 5s），Vercel 免费版必然 504。改为：请求内只置 RELEASING 并投递 stop-hook，
-- 由后续 /api/maintenance tick 收尾。
--
-- 收尾需要两个信息：
--   stop_invoke_id       —— 云侧 runCommand 的 invokeId，用于后续轮询命令结果
--   release_requested_at —— 释放发起时刻，作为「hook 总时限」的判定基准
--                           （不可复用 updated_at：其它巡检路径也会写 updated_at）
ALTER TABLE "instances" ADD COLUMN IF NOT EXISTS "stop_invoke_id" text;
ALTER TABLE "instances" ADD COLUMN IF NOT EXISTS "release_requested_at" timestamp with time zone;

-- 收尾扫描按 status + release_requested_at 过滤
CREATE INDEX IF NOT EXISTS "idx_instances_releasing" ON "instances" ("status", "release_requested_at");
