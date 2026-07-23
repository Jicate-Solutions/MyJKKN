-- ============================================================================
-- Premium Stay Phase 2 — Audit Log table + trigger on hostel_allocations
-- ============================================================================
-- Created: 2026-05-19
-- Spec: .claude/scratch/premium-stay-spec-2026-05-16.html
-- Consumer: lib/services/campus-living/hostel-premium-audit-service.ts
--
-- Why a dedicated table?
--   The generic `audit_logs` table (migration 20250930000008) does not exist
--   in production (probed 2026-05-19 via Management API on ref
--   `kvizhngldtiuufknvehv`). The Phase 1 dashboard's Activity Log tab is a
--   "wires up in Phase 2" placeholder reading from `audit_logs.module =
--   campus_living_premium`. Since that table is absent, Phase 2 ships a
--   dedicated, focused table mirroring the proven admission_counselors_audit_log
--   pattern (migration 20260427_admission_counselors_audit_log).
--
-- What the trigger captures:
--   - tier_change         — hostel_allocations.tier_id changed (re-tier)
--   - override            — hostel_allocations.override_reason changed
--                           (chief warden override path, gated by RLS in
--                           20260516131807_update_hostel_allocations_rls_for_chief_warden_override)
--   - room_change         — block_id, room_id, or bed_id changed
--   - status_change       — status went between active/vacated/etc.
--   - fee_status_change   — fee_status changed
--
-- Idempotent / non-destructive: every CREATE has IF NOT EXISTS or
-- OR REPLACE; trigger is DROP-then-CREATE.
-- ============================================================================

BEGIN;

-- =============================================================================
-- 1. Audit log table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.hostel_premium_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What happened. Free-form enum; future events can be added without an
  -- ALTER. Keeping a CHECK list keeps writers honest in Phase 2.
  event_type text NOT NULL CHECK (event_type IN (
    'tier_change',
    'override',
    'room_change',
    'status_change',
    'fee_status_change',
    'opt_in',          -- reserved for learner-facing path (Agent α)
    'opt_out',         -- reserved for learner-facing path (Agent α)
    'invite_sent',     -- reserved for roommate-invite path (Phase 2+)
    'invite_resolved'  -- reserved for roommate-invite path (Phase 2+)
  )),

  -- Who did it. NULL when service_role / migration / no auth ctx.
  -- No FK to profiles — audit logs must survive profile deletes.
  actor_user_id uuid,
  actor_name text,
  actor_email text,

  -- The allocation row this event is about. Denormalized so that even after
  -- a hard-delete (rare) the audit row stays interpretable.
  allocation_id uuid,
  learner_id uuid,
  learner_name text,
  institution_id uuid,
  block_id uuid,
  room_id uuid,
  bed_id uuid,

  -- Tier context: before / after. tier_key is denormalized for fast filtering
  -- without joining hostel_tier_policy in the audit-log viewer.
  old_tier_id uuid,
  new_tier_id uuid,
  old_tier_key text,
  new_tier_key text,

  -- The override reason (when present). Mirrors hostel_allocations.override_reason
  -- so the audit row is self-contained.
  override_reason text,

  -- Snapshot of the whole row before / after (jsonb). Lets future viewers
  -- diff any field without a schema change.
  old_value jsonb,
  new_value jsonb,

  -- Pre-generated, English-friendly description used by the audit-log viewer.
  description text NOT NULL,

  -- Free-form context (request_id, source page, etc.).
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,

  created_at timestamptz NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 2. Indexes (favouring the audit-log viewer's filter set: learner, tier,
--    event_type, date range)
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_premium_audit_log_created_at
  ON public.hostel_premium_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_premium_audit_log_event_type
  ON public.hostel_premium_audit_log (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_premium_audit_log_learner
  ON public.hostel_premium_audit_log (learner_id, created_at DESC)
  WHERE learner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_premium_audit_log_allocation
  ON public.hostel_premium_audit_log (allocation_id, created_at DESC)
  WHERE allocation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_premium_audit_log_institution
  ON public.hostel_premium_audit_log (institution_id, created_at DESC)
  WHERE institution_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_premium_audit_log_new_tier_key
  ON public.hostel_premium_audit_log (new_tier_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_premium_audit_log_actor
  ON public.hostel_premium_audit_log (actor_user_id, created_at DESC)
  WHERE actor_user_id IS NOT NULL;

-- =============================================================================
-- 3. RLS — read-only for super_admin / admin / chief_warden via the
--    premium.view_dashboard permission. No INSERT/UPDATE/DELETE policy —
--    only the SECURITY DEFINER trigger writes; service_role bypasses RLS.
-- =============================================================================
ALTER TABLE public.hostel_premium_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hostel_premium_audit_log_select
  ON public.hostel_premium_audit_log;
CREATE POLICY hostel_premium_audit_log_select
  ON public.hostel_premium_audit_log
  FOR SELECT
  TO authenticated
  USING (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('campus_living.premium.view_dashboard')
    OR user_has_permission('campus_living.premium.override_pick')
  );

COMMENT ON POLICY hostel_premium_audit_log_select ON public.hostel_premium_audit_log IS
  'Premium Stay Phase 2: read access for super_admin/admin and for users granted campus_living.premium.view_dashboard or campus_living.premium.override_pick. Writers are restricted to the SECURITY DEFINER trigger only.';

-- =============================================================================
-- 4. Helper: resolve actor identity (mirrors _admission_counselors_audit_actor)
-- =============================================================================
CREATE OR REPLACE FUNCTION public._hostel_premium_audit_actor()
RETURNS TABLE(uid uuid, name text, email text)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid uuid;
  v_name text;
  v_email text;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'System'::text, NULL::text;
    RETURN;
  END IF;

  SELECT COALESCE(p.full_name, p.email, 'Unknown user'),
         p.email
    INTO v_name, v_email
    FROM public.profiles p
    WHERE p.id = v_uid;

  RETURN QUERY SELECT v_uid, COALESCE(v_name, 'Unknown user'), v_email;
END;
$$;

-- =============================================================================
-- 5. Trigger function: AFTER UPDATE on hostel_allocations
--    Emits one audit row per distinct event class detected in the diff.
--    AFTER INSERT also captured (covers opt-in path; tier_key=premium/+).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.log_hostel_premium_allocation_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor_uid uuid;
  v_actor_name text;
  v_actor_email text;
  v_learner_name text;
  v_old_tier_key text;
  v_new_tier_key text;
  v_event_type text;
  v_description text;
  v_did_emit boolean := false;
BEGIN
  SELECT uid, name, email
    INTO v_actor_uid, v_actor_name, v_actor_email
    FROM public._hostel_premium_audit_actor();

  -- Resolve tier keys (old / new) for denormalization.
  IF (TG_OP = 'UPDATE') THEN
    SELECT tier_key INTO v_old_tier_key
      FROM public.hostel_tier_policy WHERE id = OLD.tier_id;
  END IF;
  SELECT tier_key INTO v_new_tier_key
    FROM public.hostel_tier_policy WHERE id = NEW.tier_id;

  -- Resolve learner name (denorm).
  SELECT COALESCE(p.full_name, p.email, NEW.learner_id::text)
    INTO v_learner_name
    FROM public.profiles p
    WHERE p.id = NEW.learner_id;

  IF (TG_OP = 'INSERT') THEN
    -- Only audit premium / premium_plus opt-ins. Standard allocations are
    -- routine and would flood the audit table.
    IF v_new_tier_key IN ('premium', 'premium_plus') THEN
      v_event_type := 'opt_in';
      v_description := COALESCE(v_learner_name, 'A learner')
                       || ' was allocated on tier '
                       || COALESCE(v_new_tier_key, 'unknown')
                       || COALESCE(' by ' || v_actor_name, '');

      INSERT INTO public.hostel_premium_audit_log (
        event_type, actor_user_id, actor_name, actor_email,
        allocation_id, learner_id, learner_name, institution_id,
        block_id, room_id, bed_id,
        new_tier_id, new_tier_key,
        new_value, description
      ) VALUES (
        v_event_type, v_actor_uid, v_actor_name, v_actor_email,
        NEW.id, NEW.learner_id, v_learner_name, NEW.institution_id,
        NEW.block_id, NEW.room_id, NEW.bed_id,
        NEW.tier_id, v_new_tier_key,
        to_jsonb(NEW), v_description
      );
    END IF;

    RETURN NEW;
  END IF;

  -- ── UPDATE: emit one row per distinct event class ───────────────────────

  -- 1. tier_change (also fires for promote-from-standard cases)
  IF OLD.tier_id IS DISTINCT FROM NEW.tier_id THEN
    v_event_type := 'tier_change';
    v_description := COALESCE(v_learner_name, 'A learner')
                     || ' moved from tier '
                     || COALESCE(v_old_tier_key, 'unknown')
                     || ' to ' || COALESCE(v_new_tier_key, 'unknown')
                     || COALESCE(' by ' || v_actor_name, '');

    INSERT INTO public.hostel_premium_audit_log (
      event_type, actor_user_id, actor_name, actor_email,
      allocation_id, learner_id, learner_name, institution_id,
      block_id, room_id, bed_id,
      old_tier_id, new_tier_id, old_tier_key, new_tier_key,
      override_reason,
      old_value, new_value, description
    ) VALUES (
      v_event_type, v_actor_uid, v_actor_name, v_actor_email,
      NEW.id, NEW.learner_id, v_learner_name, NEW.institution_id,
      NEW.block_id, NEW.room_id, NEW.bed_id,
      OLD.tier_id, NEW.tier_id, v_old_tier_key, v_new_tier_key,
      NEW.override_reason,
      to_jsonb(OLD), to_jsonb(NEW), v_description
    );
    v_did_emit := true;
  END IF;

  -- 2. override — fires whenever override_reason becomes non-empty OR changes
  --    (chief warden override path captured by the new RLS policy in
  --    20260516131807).
  IF (
    OLD.override_reason IS DISTINCT FROM NEW.override_reason
    AND NEW.override_reason IS NOT NULL
    AND length(trim(NEW.override_reason)) > 0
  ) THEN
    v_event_type := 'override';
    v_description := 'Chief warden override by '
                     || COALESCE(v_actor_name, 'unknown actor')
                     || ' on ' || COALESCE(v_learner_name, 'a learner')
                     || ' — reason: ' || NEW.override_reason;

    INSERT INTO public.hostel_premium_audit_log (
      event_type, actor_user_id, actor_name, actor_email,
      allocation_id, learner_id, learner_name, institution_id,
      block_id, room_id, bed_id,
      old_tier_id, new_tier_id, old_tier_key, new_tier_key,
      override_reason,
      old_value, new_value, description
    ) VALUES (
      v_event_type, v_actor_uid, v_actor_name, v_actor_email,
      NEW.id, NEW.learner_id, v_learner_name, NEW.institution_id,
      NEW.block_id, NEW.room_id, NEW.bed_id,
      OLD.tier_id, NEW.tier_id, v_old_tier_key, v_new_tier_key,
      NEW.override_reason,
      to_jsonb(OLD), to_jsonb(NEW), v_description
    );
    v_did_emit := true;
  END IF;

  -- 3. room_change (block/room/bed)
  IF (
    OLD.block_id IS DISTINCT FROM NEW.block_id
    OR OLD.room_id IS DISTINCT FROM NEW.room_id
    OR OLD.bed_id IS DISTINCT FROM NEW.bed_id
  ) THEN
    v_event_type := 'room_change';
    v_description := COALESCE(v_learner_name, 'A learner')
                     || ' moved to a different bed/room'
                     || COALESCE(' by ' || v_actor_name, '');

    INSERT INTO public.hostel_premium_audit_log (
      event_type, actor_user_id, actor_name, actor_email,
      allocation_id, learner_id, learner_name, institution_id,
      block_id, room_id, bed_id,
      old_tier_id, new_tier_id, old_tier_key, new_tier_key,
      override_reason,
      old_value, new_value, description
    ) VALUES (
      v_event_type, v_actor_uid, v_actor_name, v_actor_email,
      NEW.id, NEW.learner_id, v_learner_name, NEW.institution_id,
      NEW.block_id, NEW.room_id, NEW.bed_id,
      OLD.tier_id, NEW.tier_id, v_old_tier_key, v_new_tier_key,
      NEW.override_reason,
      to_jsonb(OLD), to_jsonb(NEW), v_description
    );
    v_did_emit := true;
  END IF;

  -- 4. status_change
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    v_event_type := 'status_change';
    v_description := COALESCE(v_learner_name, 'A learner')
                     || ' allocation status changed from '
                     || COALESCE(OLD.status::text, 'null')
                     || ' to ' || COALESCE(NEW.status::text, 'null')
                     || COALESCE(' by ' || v_actor_name, '');

    INSERT INTO public.hostel_premium_audit_log (
      event_type, actor_user_id, actor_name, actor_email,
      allocation_id, learner_id, learner_name, institution_id,
      block_id, room_id, bed_id,
      old_tier_id, new_tier_id, old_tier_key, new_tier_key,
      override_reason,
      old_value, new_value, description
    ) VALUES (
      v_event_type, v_actor_uid, v_actor_name, v_actor_email,
      NEW.id, NEW.learner_id, v_learner_name, NEW.institution_id,
      NEW.block_id, NEW.room_id, NEW.bed_id,
      OLD.tier_id, NEW.tier_id, v_old_tier_key, v_new_tier_key,
      NEW.override_reason,
      to_jsonb(OLD), to_jsonb(NEW), v_description
    );
    v_did_emit := true;
  END IF;

  -- 5. fee_status_change
  IF OLD.fee_status IS DISTINCT FROM NEW.fee_status THEN
    v_event_type := 'fee_status_change';
    v_description := COALESCE(v_learner_name, 'A learner')
                     || ' fee status changed from '
                     || COALESCE(OLD.fee_status::text, 'null')
                     || ' to ' || COALESCE(NEW.fee_status::text, 'null')
                     || COALESCE(' by ' || v_actor_name, '');

    INSERT INTO public.hostel_premium_audit_log (
      event_type, actor_user_id, actor_name, actor_email,
      allocation_id, learner_id, learner_name, institution_id,
      block_id, room_id, bed_id,
      old_tier_id, new_tier_id, old_tier_key, new_tier_key,
      override_reason,
      old_value, new_value, description
    ) VALUES (
      v_event_type, v_actor_uid, v_actor_name, v_actor_email,
      NEW.id, NEW.learner_id, v_learner_name, NEW.institution_id,
      NEW.block_id, NEW.room_id, NEW.bed_id,
      OLD.tier_id, NEW.tier_id, v_old_tier_key, v_new_tier_key,
      NEW.override_reason,
      to_jsonb(OLD), to_jsonb(NEW), v_description
    );
    v_did_emit := true;
  END IF;

  -- v_did_emit is informational only — keeps the function from being
  -- accidentally trimmed by a future "if nothing changed, skip"; we
  -- explicitly want a no-row outcome when an UPDATE touches only fields
  -- outside the audited set (e.g. emergency contact phone).
  RETURN NEW;
END;
$$;

-- =============================================================================
-- 6. Trigger: AFTER INSERT/UPDATE on hostel_allocations
-- =============================================================================
DROP TRIGGER IF EXISTS trg_hostel_premium_audit ON public.hostel_allocations;
CREATE TRIGGER trg_hostel_premium_audit
  AFTER INSERT OR UPDATE ON public.hostel_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.log_hostel_premium_allocation_change();

COMMIT;

-- =============================================================================
-- VERIFICATION (Pattern B: SELECT-only — avoids NOT NULL pitfalls in INSERT
-- smoke tests; see feedback_smoke_test_must_include_all_not_null_columns)
-- =============================================================================
DO $$
DECLARE
  v_table_oid oid;
  v_trigger_count int;
  v_policy_count int;
BEGIN
  SELECT oid INTO v_table_oid
    FROM pg_class WHERE relname = 'hostel_premium_audit_log'
                    AND relnamespace = 'public'::regnamespace;
  IF v_table_oid IS NULL THEN
    RAISE EXCEPTION 'hostel_premium_audit_log table did not get created';
  END IF;

  SELECT count(*) INTO v_trigger_count
    FROM pg_trigger
    WHERE tgrelid = 'public.hostel_allocations'::regclass
      AND tgname = 'trg_hostel_premium_audit';
  IF v_trigger_count <> 1 THEN
    RAISE EXCEPTION 'trg_hostel_premium_audit trigger not installed (count=%)', v_trigger_count;
  END IF;

  SELECT count(*) INTO v_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'hostel_premium_audit_log'
      AND policyname = 'hostel_premium_audit_log_select';
  IF v_policy_count <> 1 THEN
    RAISE EXCEPTION 'hostel_premium_audit_log_select policy not installed (count=%)', v_policy_count;
  END IF;

  RAISE NOTICE 'hostel_premium_audit_log verification OK (table+trigger+RLS policy all present)';
END $$;
