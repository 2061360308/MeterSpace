-- Heartbeat liveness tracking on instances.
-- The agent pushes heartbeats; the backend only records arrival time here.
-- Frontend-triggered laziness (see docs/FINAL-PLAN.md chapter 10) reads this to reap lost agents.
ALTER TABLE "instances" ADD COLUMN IF NOT EXISTS "last_heartbeat_at" timestamp with time zone;
