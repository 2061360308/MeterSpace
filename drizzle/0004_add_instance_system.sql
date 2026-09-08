-- Phase 1: Instance System Schema Changes

-- 1. Modify workspaces table
-- Remove diskCategory column (hardcoded to cloud_essd)
ALTER TABLE workspaces DROP COLUMN IF EXISTS disk_category;

-- Rename diskSize/bandwidth to defaultDiskSize/defaultBandwidth
ALTER TABLE workspaces RENAME COLUMN disk_size TO default_disk_size;
ALTER TABLE workspaces RENAME COLUMN bandwidth TO default_bandwidth;

-- 2. Modify settings table - add new columns
ALTER TABLE settings ADD COLUMN IF NOT EXISTS log_retention_days integer DEFAULT 7;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS github_mirror text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS docker_mirror text;

-- 3. Create instances table
CREATE TABLE IF NOT EXISTS instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  disk_size integer NOT NULL DEFAULT 40,
  bandwidth integer NOT NULL DEFAULT 10,
  status text NOT NULL DEFAULT 'PROVISIONING',
  ecs_instance_id text,
  public_ip text,
  port integer,
  boot_token text,
  boot_phase text,
  boot_started_at timestamp with time zone,
  boot_completed_at timestamp with time zone,
  boot_error text,
  last_active_at timestamp with time zone,
  idle_triggered boolean DEFAULT FALSE,
  oss_usage_bytes bigint,
  stopped_at timestamp with time zone,
  stop_reason text,
  logs_expire_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instances_workspace ON instances(workspace_id);
CREATE INDEX IF NOT EXISTS idx_instances_status ON instances(status);

-- 4. Create instance_logs table
CREATE TABLE IF NOT EXISTS instance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  timestamp timestamp with time zone NOT NULL,
  level text NOT NULL,
  phase text,
  message text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instance_logs_instance ON instance_logs(instance_id, timestamp);

-- 5. Create instance_scripts table
CREATE TABLE IF NOT EXISTS instance_scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  script text NOT NULL,
  sort_order integer DEFAULT 0,
  enabled boolean DEFAULT TRUE,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 6. Create instance_access_codes table
CREATE TABLE IF NOT EXISTS instance_access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  is_personal boolean DEFAULT FALSE,
  allowed_ports integer[] DEFAULT '{8080}',
  expires_at timestamp with time zone,
  max_uses integer,
  use_count integer DEFAULT 0,
  label text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_codes_instance ON instance_access_codes(instance_id);
CREATE INDEX IF NOT EXISTS idx_access_codes_code ON instance_access_codes(code);
