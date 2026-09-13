-- 实例规格缓存补齐展示字段（docs/UI-PERFORMANCE.md U4）。
--
-- 背景：`instance_cache` 原先只存 cpu/memory/gpuCount（够算价格），
-- 导致 /api/ecs/types 无法用它服务规格表格（表格还要显示架构与规格族），
-- 只能退回进程内 Map + 实时打云 —— 在 serverless 下等于没有缓存。
--
-- 这里把它明确为「实例规格元数据缓存」，补齐 UI 需要的字段，
-- 使 /api/ecs/types 与 /api/ecs/[provider]/instances 可以统一从 DB 读。
ALTER TABLE "instance_cache" ADD COLUMN IF NOT EXISTS "instance_type_family" text;
ALTER TABLE "instance_cache" ADD COLUMN IF NOT EXISTS "cpu_architecture" text;
ALTER TABLE "instance_cache" ADD COLUMN IF NOT EXISTS "gpu_spec" text;
