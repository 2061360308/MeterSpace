-- describePrice 明细结果的 DB 缓存（docs/UI-PERFORMANCE.md U4）。
--
-- 为什么不能复用 price_cache：那张表存的是**抢占式估算**（onDemandPrice /
-- historicalDiscount / releaseRate，用于选规格时的性价比计算），而
-- /api/ecs/price 返回的是 describePrice 的**分项明细**
-- （resource / originalPrice / tradePrice 数组）。两者形状不同，无法互相替代。
--
-- 这张表按「一次报价请求的完整参数」做键，命中即秒回，避免用户每改一次
-- 磁盘/带宽就实时打一次阿里云。
CREATE TABLE IF NOT EXISTS "price_quote_cache" (
  "provider" text NOT NULL DEFAULT 'aliyun',
  "region" text NOT NULL,
  "instance_type" text NOT NULL,
  "disk_category" text NOT NULL DEFAULT 'cloud_essd',
  "disk_size" integer NOT NULL,
  "bandwidth" integer NOT NULL,
  "spot_strategy" text NOT NULL DEFAULT 'NoSpot',
  "spot_duration" integer NOT NULL DEFAULT 1,
  "details" jsonb NOT NULL,
  "refreshed_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "price_quote_cache_pk" PRIMARY KEY (
    "provider", "region", "instance_type", "disk_category",
    "disk_size", "bandwidth", "spot_strategy", "spot_duration"
  )
);
