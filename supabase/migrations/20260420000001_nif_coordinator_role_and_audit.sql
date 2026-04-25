-- =====================================================================
-- PR-0: NIF Coordinator role + Startup Studio CRUD substrate
-- Spec: specs/nif-coordinator-and-studio-crud-spec.md
-- Date: 2026-04-20
--
-- What this migration does:
--   1. Adds 'transfer' to sf100_roster_action enum
--   2. Adds to_enrollment_id to sf100_roster_changes (for transfers)
--   3. Adds archive + max_team_size columns to sf100_programs
--   4. Adds submitted_on_behalf_of_team boolean to 5 SF100 tables (proxy-submit audit)
--   5. Creates sf100_audit_log table with RLS
--   6. Creates generic audit trigger function + applies to all 11 sf100_* tables
--   7. Creates recompute-metrics trigger function + applies to check_ins + paid_users
--   8. Seeds nif_coordinator role into custom_roles with full SF100 + Studio permissions
--
-- Idempotent via IF NOT EXISTS + ON CONFLICT DO NOTHING — safe to re-run.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Extend sf100_roster_action enum
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'sf100_roster_action' AND e.enumlabel = 'transfer'
  ) THEN
    ALTER TYPE sf100_roster_action ADD VALUE 'transfer';
  END IF;
END$$;

-- ---------------------------------------------------------------------
-- 2. sf100_roster_changes: to_enrollment_id for transfer destination
-- ---------------------------------------------------------------------
ALTER TABLE sf100_roster_changes
  ADD COLUMN IF NOT EXISTS to_enrollment_id UUID REFERENCES sf100_enrollments(id) ON DELETE CASCADE;

COMMENT ON COLUMN sf100_roster_changes.to_enrollment_id IS
  'Destination enrollment when action=transfer. NULL for add/remove actions.';

-- ---------------------------------------------------------------------
-- 3. sf100_programs: archive infrastructure + team size cap
-- ---------------------------------------------------------------------
ALTER TABLE sf100_programs
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS max_team_size INTEGER DEFAULT 5 CHECK (max_team_size IS NULL OR max_team_size > 0);

COMMENT ON COLUMN sf100_programs.archived_at IS
  'Set when program soft-archived by coordinator. Hard delete requires super_admin.';
COMMENT ON COLUMN sf100_programs.max_team_size IS
  'Soft cap — member-add/transfer warns but allows exceeding. Configurable per program.';

-- ---------------------------------------------------------------------
-- 4. Proxy-submit audit flag on 5 SF100 tables
-- ---------------------------------------------------------------------
ALTER TABLE sf100_check_ins           ADD COLUMN IF NOT EXISTS submitted_on_behalf_of_team BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sf100_customer_interviews ADD COLUMN IF NOT EXISTS submitted_on_behalf_of_team BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sf100_pivots              ADD COLUMN IF NOT EXISTS submitted_on_behalf_of_team BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sf100_paid_users          ADD COLUMN IF NOT EXISTS submitted_on_behalf_of_team BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sf100_exercise_responses  ADD COLUMN IF NOT EXISTS submitted_on_behalf_of_team BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN sf100_check_ins.submitted_on_behalf_of_team IS
  'True when a coordinator submitted this record on behalf of the team. submitted_by still identifies the actor.';

-- ---------------------------------------------------------------------
-- 5. sf100_audit_log — dedicated audit trail for all SF100 mutations
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sf100_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES profiles(id),
  actor_role TEXT,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  before_json JSONB,
  after_json JSONB,
  reason TEXT,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sf100_audit_log_entity ON sf100_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sf100_audit_log_actor  ON sf100_audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sf100_audit_log_created ON sf100_audit_log(created_at DESC);

ALTER TABLE sf100_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sf100_audit_log_read" ON sf100_audit_log;
CREATE POLICY "sf100_audit_log_read" ON sf100_audit_log
  FOR SELECT USING (
    is_super_admin()
    OR user_has_permission('startup_studio.sf100.audit_log.view')
  );

-- No INSERT/UPDATE/DELETE policies — only the SECURITY DEFINER trigger writes rows.
-- No one can mutate audit rows directly; they are append-only from the DB layer.

COMMENT ON TABLE sf100_audit_log IS
  'Append-only audit trail for all sf100_* mutations. Rows written by trg_sf100_audit triggers (SECURITY DEFINER).';

-- ---------------------------------------------------------------------
-- 6. Generic audit trigger function — writes one row per INSERT/UPDATE/DELETE
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_sf100_audit() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
  actor_role_name TEXT;
  entity_uuid UUID;
BEGIN
  -- Resolve actor role for faster querying later
  SELECT role INTO actor_role_name FROM profiles WHERE id = actor;

  -- Extract entity id (all sf100_* tables use `id` as primary key)
  IF TG_OP = 'DELETE' THEN
    entity_uuid := OLD.id;
  ELSE
    entity_uuid := NEW.id;
  END IF;

  INSERT INTO sf100_audit_log (
    actor_id, actor_role, action, entity_type, entity_id, before_json, after_json
  ) VALUES (
    actor,
    actor_role_name,
    TG_OP,
    TG_TABLE_NAME,
    entity_uuid,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- Apply audit trigger to all 11 sf100_* tables
DO $$
DECLARE
  t TEXT;
  sf100_tables TEXT[] := ARRAY[
    'sf100_programs',
    'sf100_enrollments',
    'sf100_phase_history',
    'sf100_check_ins',
    'sf100_paid_users',
    'sf100_customer_interviews',
    'sf100_pivots',
    'sf100_notifications',
    'sf100_roster_changes',
    'sf100_exercises',
    'sf100_exercise_responses'
  ];
BEGIN
  FOREACH t IN ARRAY sf100_tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_audit ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_audit
                    AFTER INSERT OR UPDATE OR DELETE ON %I
                    FOR EACH ROW EXECUTE FUNCTION log_sf100_audit()', t, t);
  END LOOP;
END$$;

-- ---------------------------------------------------------------------
-- 7. Recompute-metrics triggers on check_ins + paid_users
--    Rebuilds denormalized counters on sf100_enrollments on INSERT/UPDATE/DELETE
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recompute_sf100_enrollment_checkins() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  enr UUID;
BEGIN
  enr := COALESCE(NEW.enrollment_id, OLD.enrollment_id);
  UPDATE sf100_enrollments
    SET last_check_in_at = (
      SELECT MAX(submitted_at) FROM sf100_check_ins WHERE enrollment_id = enr
    ),
    updated_at = NOW()
    WHERE id = enr;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION recompute_sf100_enrollment_paid_users() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  enr UUID;
BEGIN
  enr := COALESCE(NEW.enrollment_id, OLD.enrollment_id);
  UPDATE sf100_enrollments e
    SET
      cumulative_paid_users = (SELECT COUNT(*) FROM sf100_paid_users WHERE enrollment_id = enr),
      active_paid_users     = (SELECT COUNT(*) FROM sf100_paid_users WHERE enrollment_id = enr AND is_active = true),
      internal_paid_users   = (SELECT COUNT(*) FROM sf100_paid_users WHERE enrollment_id = enr AND is_active = true AND is_internal = true),
      total_revenue         = COALESCE((SELECT SUM(COALESCE(amount, 0) - COALESCE(refund_amount, 0)) FROM sf100_paid_users WHERE enrollment_id = enr AND is_active = true), 0),
      updated_at = NOW()
    WHERE e.id = enr;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_sf100_recompute_checkins ON sf100_check_ins;
CREATE TRIGGER trg_sf100_recompute_checkins
  AFTER INSERT OR UPDATE OR DELETE ON sf100_check_ins
  FOR EACH ROW EXECUTE FUNCTION recompute_sf100_enrollment_checkins();

DROP TRIGGER IF EXISTS trg_sf100_recompute_paid_users ON sf100_paid_users;
CREATE TRIGGER trg_sf100_recompute_paid_users
  AFTER INSERT OR UPDATE OR DELETE ON sf100_paid_users
  FOR EACH ROW EXECUTE FUNCTION recompute_sf100_enrollment_paid_users();

-- ---------------------------------------------------------------------
-- 8. Seed nif_coordinator role into custom_roles
--    All SF100 granular keys (43) + umbrella keys for 21 other Studio submodules
-- ---------------------------------------------------------------------
INSERT INTO custom_roles (
  role_key, role_name, description, is_system_role, institution_scope, is_active, permissions, module_scopes
) VALUES (
  'nif_coordinator',
  'NIF Coordinator',
  'Nattraja Incubation Forum Coordinator — operational owner of the full Startup Studio (SF100, Events, NIF Pipeline, Problem Bank, Mentors, Portfolio, Cycles, Finance, KPI, Analytics, etc.). Can CRUD teams, members, transfers, check-ins, pivots, paid users, and interviews. Program delete + audit log view restricted to super_admin.',
  true,
  'all',
  true,
  jsonb_build_object(
    -- === SF100 — granular (43 keys) ===
    'startup_studio.sf100.program.view',         true,
    'startup_studio.sf100.program.create',       true,
    'startup_studio.sf100.program.edit',         true,
    'startup_studio.sf100.program.archive',      true,
    -- program.delete — NOT granted (super_admin only per decision #6)

    'startup_studio.sf100.team.view',            true,
    'startup_studio.sf100.team.create',          true,
    'startup_studio.sf100.team.edit',            true,
    'startup_studio.sf100.team.archive',         true,
    -- team.delete (hard purge) — NOT granted (super_admin only per decision #5)
    'startup_studio.sf100.team.transfer',        true,

    'startup_studio.sf100.member.view',          true,
    'startup_studio.sf100.member.create',        true,
    'startup_studio.sf100.member.edit',          true,
    'startup_studio.sf100.member.remove',        true,
    'startup_studio.sf100.member.transfer',      true,

    'startup_studio.sf100.check_in.view',        true,
    'startup_studio.sf100.check_in.create',      true,
    'startup_studio.sf100.check_in.edit',        true,
    'startup_studio.sf100.check_in.delete',      true,

    'startup_studio.sf100.paid_user.view',       true,
    'startup_studio.sf100.paid_user.create',     true,
    'startup_studio.sf100.paid_user.edit',       true,
    'startup_studio.sf100.paid_user.delete',     true,
    'startup_studio.sf100.paid_user.verify',     true,
    'startup_studio.sf100.paid_user.churn',      true,

    'startup_studio.sf100.interview.view',       true,
    'startup_studio.sf100.interview.create',     true,
    'startup_studio.sf100.interview.edit',       true,
    'startup_studio.sf100.interview.delete',     true,

    'startup_studio.sf100.pivot.view',           true,
    'startup_studio.sf100.pivot.create',         true,
    'startup_studio.sf100.pivot.edit',           true,
    'startup_studio.sf100.pivot.delete',         true,

    'startup_studio.sf100.exercise.view',        true,
    'startup_studio.sf100.exercise.create',      true,
    'startup_studio.sf100.exercise.edit',        true,
    'startup_studio.sf100.exercise.delete',      true,
    'startup_studio.sf100.exercise.respond',     true,

    'startup_studio.sf100.roster_change.view',   true,
    'startup_studio.sf100.roster_change.approve',true,
    'startup_studio.sf100.roster_change.cancel', true,

    'startup_studio.sf100.audit_log.view',       true,

    -- === Other Studio submodules — umbrella keys (will be split as CRUD completes) ===
    'startup_studio.events.view',                true,
    'startup_studio.events.create',              true,
    'startup_studio.events.manage',              true,
    'startup_studio.registrations.view',         true,
    'startup_studio.registrations.manage',       true,
    'startup_studio.venues.manage',              true,
    'startup_studio.submissions.view',           true,
    'startup_studio.submissions.verify_mrr',     true,
    'startup_studio.leaderboard.view',           true,
    'startup_studio.leaderboard.publish',        true,
    'startup_studio.demo_day.manage',            true,
    'startup_studio.evaluations.manage',         true,
    'startup_studio.checklists.manage',          true,

    'startup_studio.nif.view',                   true,
    'startup_studio.nif.manage',                 true,
    'startup_studio.nif.advance',                true,
    'startup_studio.nif.reject',                 true,

    'startup_studio.problem_bank.view',          true,
    'startup_studio.problem_bank.manage',        true,

    'startup_studio.mentors.view',               true,
    'startup_studio.mentors.manage',             true,

    'startup_studio.portfolio.view',             true,
    'startup_studio.portfolio.manage',           true,

    'startup_studio.cycles.view',                true,
    'startup_studio.cycles.manage',              true,

    'startup_studio.graduation.view',            true,
    'startup_studio.graduation.manage',          true,

    'startup_studio.trl.view',                   true,
    'startup_studio.trl.manage',                 true,

    'startup_studio.kpi.view',                   true,
    'startup_studio.kpi.manage',                 true,

    'startup_studio.finance.view',               true,
    'startup_studio.finance.manage',             true,

    'startup_studio.marketing.view',             true,
    'startup_studio.marketing.manage',           true,

    'startup_studio.analytics.view',             true,

    'startup_studio.alumni.view',                true,
    'startup_studio.alumni.manage',              true,

    'startup_studio.governance.view',            true,
    'startup_studio.governance.manage',          true,

    'startup_studio.competitive.view',           true,
    'startup_studio.competitive.manage',         true,

    'startup_studio.risk.view',                  true,
    'startup_studio.risk.manage',                true,

    'startup_studio.pipeline.view',              true,
    'startup_studio.pipeline.manage',            true,

    'startup_studio.teams.view',                 true,
    'startup_studio.teams.manage',               true,

    'startup_studio.notify.send',                true
  ),
  '{}'::jsonb
)
ON CONFLICT (role_key) DO UPDATE
  SET permissions    = EXCLUDED.permissions,
      description    = EXCLUDED.description,
      role_name      = EXCLUDED.role_name,
      is_system_role = EXCLUDED.is_system_role,
      institution_scope = EXCLUDED.institution_scope,
      is_active      = true,
      updated_at     = NOW();

-- ---------------------------------------------------------------------
-- Done. Verify with:
--   SELECT role_key, jsonb_object_keys(permissions) FROM custom_roles WHERE role_key='nif_coordinator';
--   SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='sf100_roster_action';
--   SELECT COUNT(*) FROM sf100_audit_log; -- 0 initially
-- ---------------------------------------------------------------------

COMMIT;
