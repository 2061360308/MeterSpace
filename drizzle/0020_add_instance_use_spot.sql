-- 抢占式实例：把「本次启动是否勾选抢占」持久化到 instances 行。
--
-- 背景：instances 的云资源创建是异步的（createInstance 只插一行 PROVISIONING，
-- 真正建 ECS 在 resumeProvisioning），所以 UI 上的选择必须落库，
-- 否则异步阶段拿不到用户的意图（原实现在 lifecycle 里硬编码 NoSpot，
-- 导致「勾了抢占却按量付费」）。
--
-- 保障时长（SpotDuration）不落库——它是全局偏好，读 settings.default_spot_duration。
ALTER TABLE "instances" ADD COLUMN IF NOT EXISTS "use_spot" boolean NOT NULL DEFAULT false;
