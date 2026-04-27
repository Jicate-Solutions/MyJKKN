-- ================================================================================
-- Migration: admission_counselors_audit_log
-- Date: 2026-04-27
-- Author: Agent D (role-reverter-hunt)
--
-- Bug context (the "role reverter" mystery, 2026-04-23 → 2026-04-27)
-- ----------------------------------------------------------------------
-- Agent A's 20260423 migration set the 8 counselor users into the correct
-- state (profiles.role='counselor' via user_roles primary promotion + 3 missing
-- admission_counselors rows inserted). Three days later, the state had regressed:
--   * jeevavarshinis.dp@jkkn.ac.in: profiles.role='student' (Boobalan flipped via
--     /users/role-management at 2026-04-24 05:01 — visible in role_audit_log)
--   * 4 admission_counselors rows: is_active=false (charuhasinir, sowmyad,
--     sowndaryar, srinithis) — flipped between 04-24 and 04-27
--   * 3 admission_counselors rows: hard-deleted (arivuindhraa, charulathar,
--     test.faculty) — gone between 04-24 and 04-27
--
-- Forensic investigation (Agent D) found:
--   1. Only ONE PostgREST DELETE pattern hits this table:
--      app/(routes)/admission/counselors/_components/counselor-list.tsx:344-347
--      via the "Remove" button (handleRemove) — a UI affordance any user with
--      admission counselor management permission can click.
--   2. The same component (line 307-310, handleToggleActive) is the only
--      UI-side UPDATE path that flips is_active. No code path EVER deletes
--      via SQL/triggers/cron — pg_stat_statements confirms 20 calls of the
--      exact UI DELETE pattern.
--   3. profiles.role flip is captured by role_audit_log (we know who did it).
--      admission_counselors changes are NOT — there's no audit trail for
--      Remove/Toggle clicks, so we cannot identify which user reverted Agent A's
--      INSERTs and toggle-flipped the 4 rows.
--
-- This migration: install an audit trigger so any future regression names
-- the actor (auth.uid()) in admission_counselors_audit_log. Forensic only —
-- the UI affordance itself stays (legitimate use case: real counselor
-- offboarding) but every action becomes traceable.
--
-- Non-destructive: only CREATE TABLE, CREATE INDEX, CREATE FUNCTION, CREATE
-- TRIGGER. Zero DROP/ALTER on existing objects. No data backfill — the log
-- starts empty and accumulates from now.
--
-- Idempotent: every CREATE has IF NOT EXISTS / OR REPLACE / DROP-IF-EXISTS-then-CREATE.
-- ================================================================================

BEGIN;

-- =============================================================================
-- 1. Audit log table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.admission_counselors_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What happened
  action_type TEXT NOT NULL CHECK (action_type IN (
    'counselor_inserted',
    'counselor_updated',
    'counselor_deleted',
    'counselor_activated',
    'counselor_deactivated'
  )),

  -- Who did it (NULL if action came from service_role / migration / no auth ctx)
  -- No FK to profiles — audit logs must survive profile deletes.
  actor_user_id UUID,
  actor_name TEXT,
  actor_email TEXT,

  -- Which counselor row was affected. Denormalized email so we can identify
  -- the row even after a hard-delete removes it.
  counselor_id UUID,
  counselor_email TEXT,
  counselor_user_id UUID,

  -- Snapshot of before/after
  old_value JSONB,
  new_value JSONB,

  -- Human-readable description, pre-generated
  description TEXT NOT NULL,

  -- Free-form context (e.g. which UI/route triggered, request_id later)
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =============================================================================
-- 2. Indexes
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_admission_counselors_audit_log_created_at
  ON public.admission_counselors_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admission_counselors_audit_log_action_type
  ON public.admission_counselors_audit_log (action_type);

CREATE INDEX IF NOT EXISTS idx_admission_counselors_audit_log_actor
  ON public.admission_counselors_audit_log (actor_user_id)
  WHERE actor_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admission_counselors_audit_log_counselor
  ON public.admission_counselors_audit_log (counselor_id)
  WHERE counselor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admission_counselors_audit_log_email
  ON public.admission_counselors_audit_log (counselor_email);

-- =============================================================================
-- 3. RLS: super admin or admission permissions audit only
-- =============================================================================
ALTER TABLE public.admission_counselors_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admission_counselors_audit_log_select" ON public.admission_counselors_audit_log;
CREATE POLICY "admission_counselors_audit_log_select"
  ON public.admission_counselors_audit_log
  FOR SELECT
  TO authenticated
  USING (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('users.permissions_audit.view')
    OR user_has_permission('admission.counselors.view')
  );

-- No INSERT/UPDATE/DELETE policies — only the trigger writes (SECURITY DEFINER).
-- service_role bypasses RLS for cross-checking from API routes.

-- =============================================================================
-- 4. Helper: resolve actor identity (mirrors _role_audit_actor_name pattern)
-- =============================================================================
CREATE OR REPLACE FUNCTION public._admission_counselors_audit_actor()
RETURNS TABLE(uid UUID, name TEXT, email TEXT) AS $$
DECLARE
  v_uid UUID;
  v_name TEXT;
  v_email TEXT;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, 'System'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  SELECT COALESCE(p.full_name, p.email, 'Unknown user'),
         p.email
    INTO v_name, v_email
    FROM public.profiles p
    WHERE p.id = v_uid;

  RETURN QUERY SELECT v_uid, COALESCE(v_name, 'Unknown user'), v_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, pg_catalog;

-- =============================================================================
-- 5. Trigger function: log every INSERT/UPDATE/DELETE
-- =============================================================================
CREATE OR REPLACE FUNCTION public.log_admission_counselor_change()
RETURNS TRIGGER AS $$
DECLARE
  v_actor_uid UUID;
  v_actor_name TEXT;
  v_actor_email TEXT;
  v_action_type TEXT;
  v_description TEXT;
  v_old JSONB;
  v_new JSONB;
  v_counselor_id UUID;
  v_counselor_email TEXT;
  v_counselor_user_id UUID;
BEGIN
  SELECT uid, name, email
    INTO v_actor_uid, v_actor_name, v_actor_email
    FROM public._admission_counselors_audit_actor();

  IF (TG_OP = 'INSERT') THEN
    v_action_type := 'counselor_inserted';
    v_description := COALESCE(v_actor_name, 'System') ||
                     ' added counselor "' || COALESCE(NEW.email, NEW.id::text) || '"';
    v_new := to_jsonb(NEW);
    v_old := NULL;
    v_counselor_id := NEW.id;
    v_counselor_email := NEW.email;
    v_counselor_user_id := NEW.user_id;

  ELSIF (TG_OP = 'UPDATE') THEN
    -- Distinguish toggle vs other updates so the timeline reads naturally
    IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
      IF NEW.is_active THEN
        v_action_type := 'counselor_activated';
        v_description := COALESCE(v_actor_name, 'System') ||
                         ' activated counselor "' || COALESCE(NEW.email, NEW.id::text) || '"';
      ELSE
        v_action_type := 'counselor_deactivated';
        v_description := COALESCE(v_actor_name, 'System') ||
                         ' deactivated counselor "' || COALESCE(NEW.email, NEW.id::text) || '"';
      END IF;
    ELSE
      v_action_type := 'counselor_updated';
      v_description := COALESCE(v_actor_name, 'System') ||
                       ' updated counselor "' || COALESCE(NEW.email, NEW.id::text) || '"';
    END IF;
    v_new := to_jsonb(NEW);
    v_old := to_jsonb(OLD);
    v_counselor_id := NEW.id;
    v_counselor_email := NEW.email;
    v_counselor_user_id := NEW.user_id;

  ELSIF (TG_OP = 'DELETE') THEN
    v_action_type := 'counselor_deleted';
    v_description := COALESCE(v_actor_name, 'System') ||
                     ' deleted counselor "' || COALESCE(OLD.email, OLD.id::text) || '"';
    v_new := NULL;
    v_old := to_jsonb(OLD);
    v_counselor_id := OLD.id;
    v_counselor_email := OLD.email;
    v_counselor_user_id := OLD.user_id;
  END IF;

  INSERT INTO public.admission_counselors_audit_log (
    action_type,
    actor_user_id,
    actor_name,
    actor_email,
    counselor_id,
    counselor_email,
    counselor_user_id,
    old_value,
    new_value,
    description
  ) VALUES (
    v_action_type,
    v_actor_uid,
    v_actor_name,
    v_actor_email,
    v_counselor_id,
    v_counselor_email,
    v_counselor_user_id,
    v_old,
    v_new,
    v_description
  );

  -- Triggers must return appropriate row for AFTER triggers
  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog;

-- =============================================================================
-- 6. Trigger: AFTER INSERT/UPDATE/DELETE on admission_counselors
-- =============================================================================
DROP TRIGGER IF EXISTS trg_admission_counselors_audit ON public.admission_counselors;
CREATE TRIGGER trg_admission_counselors_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.admission_counselors
  FOR EACH ROW
  EXECUTE FUNCTION public.log_admission_counselor_change();

COMMIT;

-- ================================================================================
-- VERIFICATION (run manually)
-- ================================================================================
-- 1. Confirm trigger is installed:
--    SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'public.admission_counselors'::regclass
--      AND tgname = 'trg_admission_counselors_audit';
--    -- Expected: 1 row.
--
-- 2. Test it (in a dev environment — not prod):
--    UPDATE admission_counselors SET is_active = is_active WHERE id = '<some_id>';
--    SELECT description, action_type, actor_name, created_at
--      FROM admission_counselors_audit_log
--      ORDER BY created_at DESC LIMIT 1;
--
-- 3. From now on, any toggle/remove from /admission/counselors UI leaves a row
--    naming the actor — so if state regresses again, we can see WHO did it.
-- ================================================================================
