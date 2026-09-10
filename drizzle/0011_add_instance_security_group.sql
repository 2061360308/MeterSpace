-- Add per-instance security group for access whitelist
ALTER TABLE instances ADD COLUMN security_group_id TEXT;