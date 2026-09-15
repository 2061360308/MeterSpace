-- 0006: 云函数跟踪（docs/CLOUD-FUNCTION-WORKERS.md §4）
--
-- 引入云函数轮询器（functions/poller）作为唯一时序执行器，替代 /api/maintenance。
-- 后端零任务状态表（D3）：状态活在 instances 行上，poll 每次触发把云侧进度写回。
--
-- 1) instances 两张快照列：poll 最近一次查到的云侧状态与检查时间。
--    前端纯 DB 读展示云进度（cloud-status 端点退役），不 DROP 任何既有列。
-- 2) settings 一张 jsonb 列：云函数部署登记 [{provider, platform, functionId, region, endpoint}]。
--    settings 是单行列表（非 key-value），登记挂在 admin 的 settings 行。

ALTER TABLE "instances" ADD COLUMN "last_cloud_status" text;

ALTER TABLE "instances" ADD COLUMN "last_cloud_checked_at" timestamp with time zone;

ALTER TABLE "settings" ADD COLUMN "cloud_functions" jsonb DEFAULT '[]'::jsonb;