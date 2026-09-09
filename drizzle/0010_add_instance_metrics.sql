-- Add resource monitoring fields to instances table
ALTER TABLE instances ADD COLUMN cpu_percent REAL;
ALTER TABLE instances ADD COLUMN memory_mb INTEGER;
ALTER TABLE instances ADD COLUMN memory_total_mb INTEGER;
ALTER TABLE instances ADD COLUMN disk_mb INTEGER;
ALTER TABLE instances ADD COLUMN disk_total_mb INTEGER;
ALTER TABLE instances ADD COLUMN access_summary JSONB;
