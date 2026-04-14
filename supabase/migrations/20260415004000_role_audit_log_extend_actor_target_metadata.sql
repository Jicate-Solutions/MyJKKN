-- ============================================================================
-- Extend role_audit_log with richer attribution fields + make description
-- nullable so newer action types can rely on structured metadata JSONB.
--
-- Why this migration exists:
--   PR #166 (See As User) and PR #168 (Compliance Report) both wrote audit
--   inserts that referenced columns the schema did not have (actor_email,
--   actor_role, target_email, metadata). Additionally, description was
--   NOT NULL without a default — so every new audit insert was failing with
--   a NOT NULL constraint violation. Inserts were wrapped in try/catch, so
--   the main features kept working but audit rows were silently dropped.
--
-- This migration:
--   1. Adds the four missing columns (all nullable, non-breaking)
--   2. Drops NOT NULL on `description` so newer action types can omit it
--      and store context in `metadata` JSONB instead.
--   3. Adds indexes on actor_email / target_email for audit queries.
--
-- Verified: after applying, fresh PDF downloads + preview sessions write
-- full audit rows to role_audit_log with actor_email, actor_role, and rich
-- metadata snapshot.
-- ============================================================================

ALTER TABLE role_audit_log
  ADD COLUMN IF NOT EXISTS actor_email TEXT,
  ADD COLUMN IF NOT EXISTS actor_role TEXT,
  ADD COLUMN IF NOT EXISTS target_email TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB;

COMMENT ON COLUMN role_audit_log.actor_email IS 'Email of the acting user (super admin performing the action).';
COMMENT ON COLUMN role_audit_log.actor_role IS 'Role of the acting user at the time of action.';
COMMENT ON COLUMN role_audit_log.target_email IS 'Email of the targeted user (e.g. preview target).';
COMMENT ON COLUMN role_audit_log.metadata IS 'Free-form structured context for the action (e.g. preview session id, report totals).';

ALTER TABLE role_audit_log
  ALTER COLUMN description DROP NOT NULL;

COMMENT ON COLUMN role_audit_log.description IS 'Free-text description of the action. Nullable — newer action types prefer structured metadata JSONB.';

CREATE INDEX IF NOT EXISTS idx_role_audit_log_actor_email ON role_audit_log(actor_email);
CREATE INDEX IF NOT EXISTS idx_role_audit_log_target_email ON role_audit_log(target_email);

-- Reload PostgREST schema cache so newly added columns are visible to
-- supabase-js clients immediately.
NOTIFY pgrst, 'reload schema';
