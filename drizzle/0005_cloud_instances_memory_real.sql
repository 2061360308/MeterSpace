-- 0005: cloud_instances.memory_size 从 integer 改为 real
--
-- 与 0001（workspaces.release_hours）成因完全相同：
--   instance_cache.memory_size 是 real，cloud_instances.memory_size 是 integer。
--   两者同名不同源，类型不对齐 → 一旦把缓存里的值搬进本体行就静默丢精度。
--
-- 具体触发路径（/api/cloud-instances 的 GET 兜底补齐）：
--   存量行的 cpu_core_count / memory_size 为 null 时，从 instance_cache
--   按 (provider, region, instance_type) 回填。阿里云内存普遍带小数：
--     ecs.t6-c1m1.large   → 1.5 GiB
--     ecs.t6-c1m2.xlarge  → 2.5 GiB
--   写进 integer 列会被 postgres 静默四舍五入到 2 / 3 GiB，
--   列表显示的内存与实际规格不符，且筛选按这个错值比较 —— 无法察觉的欺骗。
--
-- 语义上内存本就允许小数（GiB 是连续量），上游改为 real 与 instance_cache 对齐，
-- 而不是在写入时取整丢失精度。UI 侧不再补 ".0" 时另用 Number.isInteger 判断。
--
-- integer → real 是**放宽**约束，对既有整数数据是无损的隐式转换。

ALTER TABLE "cloud_instances"
  ALTER COLUMN "memory_size" TYPE real
  USING "memory_size"::real;
