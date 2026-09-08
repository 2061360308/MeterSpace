CREATE TABLE "instance_cache" (
  "provider"         text    NOT NULL DEFAULT 'aliyun',
  "region"           text    NOT NULL,
  "instance_type"    text    NOT NULL,
  "cpu_core_count"   integer NOT NULL,
  "memory_size"      real    NOT NULL,
  "gpu_count"        integer NOT NULL DEFAULT 0,
  "refreshed_at"     timestamp with time zone DEFAULT now(),
  CONSTRAINT "instance_cache_pkey" PRIMARY KEY ("provider", "region", "instance_type")
);

CREATE TABLE "price_cache" (
  "provider"            text   NOT NULL DEFAULT 'aliyun',
  "region"              text   NOT NULL,
  "instance_type"       text   NOT NULL,
  "on_demand_price"     real,
  "historical_discount" real,
  "release_rate"        real,
  "refreshed_at"        timestamp with time zone,
  CONSTRAINT "price_cache_pkey" PRIMARY KEY ("provider", "region", "instance_type")
);
