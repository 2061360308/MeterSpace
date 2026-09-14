-- 0004: cloud_instances 落库规格元数据
--
-- 背景：cloud_instances 此前只存 instance_type 字符串，CPU/内存等规格
-- 需运行时查 instance_cache（可能未命中 → 列表显示「—」，见 docs/UI-PERFORMANCE.md）。
-- 现在创建时一并写入 cpu/memory/family/architecture/gpu，列表直接可读。
-- 列均 nullable：存量行不受影响，显示缺省由前端兜底。

ALTER TABLE "cloud_instances" ADD COLUMN "cpu_core_count" integer;
ALTER TABLE "cloud_instances" ADD COLUMN "memory_size" integer;
ALTER TABLE "cloud_instances" ADD COLUMN "instance_type_family" text;
ALTER TABLE "cloud_instances" ADD COLUMN "cpu_architecture" text;
ALTER TABLE "cloud_instances" ADD COLUMN "gpu_count" integer;
ALTER TABLE "cloud_instances" ADD COLUMN "gpu_spec" text;