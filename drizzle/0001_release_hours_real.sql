-- 0001: workspaces.release_hours 从 integer 改为 real
--
-- 原因：settings.default_release_hours 是 real（schema 默认 0.5），
-- 而工作区快照列是 integer —— 把用户级默认值快照进来时
-- `insert ... release_hours = 0.5` 直接报
--   invalid input syntax for type integer: "0.5"
-- 导致每一次建工作区都 500。
--
-- 语义上 release_hours 本就该允许小数（0.5 = 半小时），
-- 消费方只做时间运算（`hours * 3600 * 1000`）与费用估算，天然兼容小数。
-- 上游改为 real 以与 settings 对齐，而不是在写入时取整丢失精度。
--
-- integer → real 是**放宽**约束，对既有整数数据是无损的隐式转换。

ALTER TABLE "workspaces"
  ALTER COLUMN "release_hours" TYPE real
  USING "release_hours"::real;
