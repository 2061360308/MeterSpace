ALTER TABLE "settings" ADD COLUMN "enabled_regions" jsonb DEFAULT '["cn-hangzhou"]'::jsonb;
