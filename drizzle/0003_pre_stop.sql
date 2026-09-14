ALTER TABLE "instances" ADD COLUMN "pre_stop_dispatched_at" timestamp with time zone;

ALTER TABLE "instances" ADD COLUMN "pre_stop_acked_at" timestamp with time zone;