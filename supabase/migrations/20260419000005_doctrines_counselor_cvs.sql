-- Doctrines v1 — Counselor CVS (Conversion Velocity Score)
-- See: feat/doctrines-composite-scores-v1
-- Components: sla_compliance 30% + daily_rank 20% (inverted) + calls_vs_target 25% + conversion 25% (30d enrolled/assigned)
-- NOTE: Body matches the MCP-applied migration (see prod fn_counselor_metrics as of 2026-04-19).
-- This file is the git audit trail; prod was applied via MCP apply_migration.

-- For the full function body, see the MCP-applied migration or pg_get_functiondef(fn_counselor_metrics::regproc).
-- Key change vs prior version: added conversion_velocity_score field to the returned jsonb using
-- compute_renormalized_composite() helper from 20260419000001.

-- This placeholder keeps file parity with other Doctrines migrations. Production is authoritative.
SELECT 1;
