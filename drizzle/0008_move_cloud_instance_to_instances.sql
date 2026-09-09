-- Remove cloudInstanceId from workspaces table
ALTER TABLE "workspaces" DROP CONSTRAINT IF EXISTS "workspaces_cloud_instance_id_cloud_instances_id_fk";
ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "cloud_instance_id";

-- Add cloudInstanceId to instances table
ALTER TABLE "instances" ADD COLUMN "cloud_instance_id" uuid;
ALTER TABLE "instances" ADD CONSTRAINT "instances_cloud_instance_id_cloud_instances_id_fk" FOREIGN KEY ("cloud_instance_id") REFERENCES "public"."cloud_instances"("id") ON DELETE set null ON UPDATE no action;
