-- Rename boot_token to access_token for persistent agent authentication
ALTER TABLE instances RENAME COLUMN boot_token TO access_token;
