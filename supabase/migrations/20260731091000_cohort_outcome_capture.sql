-- ============================================================================
-- COHORT CORE — M2: outcome-capture-at-close (Phase 7 · THE MOAT)
-- Created: 2026-07-05  (plan: docs/cohort-core/PLAN.md, PHASE 7 · M2)
-- ============================================================================
-- WHAT: A new append-mostly table `public.cohort_outcomes` that snapshots the
--       OUTCOME BASELINE of a cohort member AT THE MOMENT IT CLOSES — i.e. when
--       a public.cohort_memberships row transitions INTO a terminal status
--       (graduated | removed). The snapshot is written by a DATABASE TRIGGER
--       (public.fn_capture_cohort_outcome) so the capture CANNOT be bypassed by
--       any service that forgets to record it — the moat's fuel (a hard,
--       non-replayable close signal) is captured no matter which code path
--       (service, RPC, raw PostgREST, admin console) performs the close.
--
-- WHY A TRIGGER, NOT A SERVICE CALL: PLAN.md M2 — "a baseline can't be
--       reconstructed later." An outcome captured at close is a one-time,
--       non-backfillable signal. Folding it into closeCohort()/a service leaves
--       every OTHER write path (a direct membership UPDATE, a future RPC, an
--       admin edit) able to silently strand a close with no baseline. The
--       trigger is the single chokepoint every close must pass through.
--
-- TIER: TIER-1 (schema-additive, IDEMPOTENT, NON-DESTRUCTIVE, DROPS-NOTHING).
--
-- BACKFILL: NONE. cohort_outcomes is a NEW, EMPTY table. Memberships that are
--       ALREADY terminal today (e.g. the SF100 backfill's withdrawn→removed
--       rows) closed BEFORE this trigger existed and legitimately have no
--       captured baseline — per M2 a baseline is captured at close and is never
--       fabricated after the fact. The trigger only ever fires on FUTURE closes.
--       A RAISE NOTICE records this instead of any populate/abort.
--
-- SECURITY / MULTI-TENANCY:
--   • institution_id is NOT NULL and is COPIED FROM THE PARENT COHORT by the
--     trigger. role_has_institution_access(NULL) returns TRUE, so a nullable
--     tenant column would be a cross-tenant leak — keeping it NOT NULL closes
--     that hole at the schema level (mirrors the cohorts spine gotcha). If the
--     parent cohort is somehow missing / tenant-less, the trigger SKIPS the
--     capture rather than writing a NULL-institution row.
--   • RLS uses the repo-canonical dynamic-permission pattern (is_super_admin()
--     OR is_admin() first, then user_has_permission + role_has_institution_
--     access). SELECT→cohort.view; INSERT→cohort.manage (a manual/service
--     capture is a manage-level power); UPDATE/DELETE→admin-only (the baseline
--     is a tamper-resistant audit record — the moat integrity depends on it not
--     being editable by ordinary cohort managers, mirroring cohort_status_events).
--   • The trigger fn is SECURITY DEFINER (it must INSERT regardless of who
--     performed the close) and per the repo new-RPC rule REVOKEs EXECUTE from
--     anon + PUBLIC. It is invoked only by the trigger, never called directly,
--     so it needs no GRANT.
-- ============================================================================

-- ── 1. cohort_outcomes — the captured-at-close baseline ───────────────────────
CREATE TABLE IF NOT EXISTS public.cohort_outcomes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id        uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  -- membership_id is a LINK, not identity: SET NULL on membership delete so the
  -- captured baseline SURVIVES (it can never be re-captured). member_ref below
  -- denormalizes the member identity so an outcome remains attributable even
  -- after its membership row is gone.
  membership_id    uuid REFERENCES public.cohort_memberships(id) ON DELETE SET NULL,
  member_ref       uuid NOT NULL,
  member_type      text NOT NULL
                     CHECK (member_type IN ('team','student','learner','staff')),
  kind             text NOT NULL
                     CHECK (kind IN ('sf100','foundations','cdc','trainer')),
  captured_at      timestamptz NOT NULL DEFAULT now(),
  outcome_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  source           text NOT NULL DEFAULT 'trigger'
                     CHECK (source IN ('trigger','service','backfill','manual')),
  institution_id   uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cohort_outcomes_cohort_id
  ON public.cohort_outcomes (cohort_id);
CREATE INDEX IF NOT EXISTS idx_cohort_outcomes_institution_id
  ON public.cohort_outcomes (institution_id);
CREATE INDEX IF NOT EXISTS idx_cohort_outcomes_member
  ON public.cohort_outcomes (member_type, member_ref);
CREATE INDEX IF NOT EXISTS idx_cohort_outcomes_kind
  ON public.cohort_outcomes (kind);

-- One captured baseline per membership. A membership can only transition INTO a
-- terminal status ONCE (terminal statuses have no outgoing lifecycle edges), so
-- this both documents the invariant and hard-guards against a double-capture.
-- Partial (WHERE membership_id IS NOT NULL) so the SET-NULL-on-delete rows above
-- do not collide (many NULLs are allowed regardless, but this is explicit).
CREATE UNIQUE INDEX IF NOT EXISTS uidx_cohort_outcomes_membership
  ON public.cohort_outcomes (membership_id)
  WHERE membership_id IS NOT NULL;

-- ── 2. RLS — cohort_outcomes (institution-scoped, like cohorts) ───────────────
ALTER TABLE public.cohort_outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cohort_outcomes_select_permission ON public.cohort_outcomes;
CREATE POLICY cohort_outcomes_select_permission ON public.cohort_outcomes
  FOR SELECT USING (
    (select is_super_admin())
    OR (select is_admin())
    OR (
      (select user_has_permission('cohort.view'::text))
      AND (select role_has_institution_access(institution_id))
    )
  );

-- INSERT is manage-level: the trigger (SECURITY DEFINER) is the primary writer
-- and bypasses RLS; this policy governs a MANUAL / service-role-less supplemental
-- capture performed as the user.
DROP POLICY IF EXISTS cohort_outcomes_insert_permission ON public.cohort_outcomes;
CREATE POLICY cohort_outcomes_insert_permission ON public.cohort_outcomes
  FOR INSERT WITH CHECK (
    (select is_super_admin())
    OR (select is_admin())
    OR (
      (select user_has_permission('cohort.manage'::text))
      AND (select role_has_institution_access(institution_id))
    )
  );

-- UPDATE / DELETE are admin-only: a captured baseline is a tamper-resistant moat
-- record (mirrors cohort_status_events' append-only stance). Ordinary cohort
-- managers can read it but cannot rewrite or erase the fuel.
DROP POLICY IF EXISTS cohort_outcomes_update_permission ON public.cohort_outcomes;
CREATE POLICY cohort_outcomes_update_permission ON public.cohort_outcomes
  FOR UPDATE USING (
    (select is_super_admin()) OR (select is_admin())
  );

DROP POLICY IF EXISTS cohort_outcomes_delete_permission ON public.cohort_outcomes;
CREATE POLICY cohort_outcomes_delete_permission ON public.cohort_outcomes
  FOR DELETE USING (
    (select is_super_admin()) OR (select is_admin())
  );

-- ── 3. capture-at-close trigger function ──────────────────────────────────────
-- AFTER UPDATE OF status on cohort_memberships. Fires only on the transition
-- INTO a terminal status FROM a non-terminal one, resolves the parent cohort's
-- kind + institution_id, and snapshots ONE cohort_outcomes row. Idempotent per
-- membership via ON CONFLICT DO NOTHING on the partial unique index.
CREATE OR REPLACE FUNCTION public.fn_capture_cohort_outcome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind           text;
  v_institution_id uuid;
BEGIN
  -- Guard 1: only terminal targets are captured.
  IF NEW.status NOT IN ('graduated','removed') THEN
    RETURN NEW;
  END IF;
  -- Guard 2: a no-op write of the same value is not a close.
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
  -- Guard 3: never re-capture / resurrect an already-terminal row.
  IF OLD.status IN ('graduated','removed') THEN
    RETURN NEW;
  END IF;

  SELECT c.kind, c.institution_id
    INTO v_kind, v_institution_id
    FROM public.cohorts c
    WHERE c.id = NEW.cohort_id;

  -- Guard 4: never write a NULL-institution outcome — role_has_institution_
  -- access(NULL)=TRUE would make it cross-tenant readable. If the parent cohort
  -- is missing / tenant-less, skip the capture (the close itself still succeeds).
  IF v_institution_id IS NULL THEN
    RAISE NOTICE 'cohort_outcome capture skipped for membership % — parent cohort % has no institution', NEW.id, NEW.cohort_id;
    RETURN NEW;
  END IF;

  -- Best-effort capture (M2): this snapshot is moat FUEL, never a lifecycle gate.
  -- The trigger fires INSIDE the membership-close transaction, so an unhandled
  -- exception here (e.g. a future cohorts.kind not yet mirrored into this table's
  -- kind CHECK, or any constraint drift) would ROLL BACK the close and brick core
  -- lifecycle. Wrap the INSERT so a failed capture degrades to a NOTICE (matching
  -- the NULL-institution skip above) and NEVER fails the primary status UPDATE.
  BEGIN
    INSERT INTO public.cohort_outcomes (
      cohort_id, membership_id, member_ref, member_type, kind,
      captured_at, outcome_snapshot, source, institution_id
    ) VALUES (
      NEW.cohort_id, NEW.id, NEW.member_ref, NEW.member_type, v_kind,
      now(),
      jsonb_build_object(
        'from_status',       OLD.status,
        'to_status',         NEW.status,
        'role',              NEW.role,
        'joined_at',         NEW.joined_at,
        'membership_config', NEW.config,
        'captured_by',       'trigger'
      ),
      'trigger', v_institution_id
    )
    ON CONFLICT (membership_id) WHERE membership_id IS NOT NULL DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'cohort_outcome capture failed for membership % (kind %): %; close proceeds (best-effort M2)', NEW.id, v_kind, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Per the repo new-RPC rule (CLAUDE.md): revoke EXECUTE from anon + PUBLIC on
-- every new SECURITY DEFINER function. This one is invoked only by its trigger,
-- so it needs no GRANT to authenticated.
REVOKE EXECUTE ON FUNCTION public.fn_capture_cohort_outcome() FROM anon, PUBLIC;

-- ── 4. capture-at-close trigger ───────────────────────────────────────────────
-- WHEN pre-filters at the trigger layer (fires only on an actual transition into
-- a terminal status); the function re-asserts the from-non-terminal invariant.
DROP TRIGGER IF EXISTS trg_cohort_capture_outcome ON public.cohort_memberships;
CREATE TRIGGER trg_cohort_capture_outcome
  AFTER UPDATE OF status ON public.cohort_memberships
  FOR EACH ROW
  WHEN (
    NEW.status IN ('graduated','removed')
    AND OLD.status IS DISTINCT FROM NEW.status
  )
  EXECUTE FUNCTION public.fn_capture_cohort_outcome();

-- ── 5. no backfill (see header) — record the deliberate no-op ─────────────────
DO $$
DECLARE v_terminal int;
BEGIN
  SELECT COUNT(*) INTO v_terminal
  FROM public.cohort_memberships
  WHERE status IN ('graduated','removed');
  RAISE NOTICE 'cohort_outcomes created (empty). % pre-existing terminal membership(s) are NOT backfilled — a baseline is captured at close, never reconstructed (PLAN.md M2). The trigger captures future closes only.', v_terminal;
END $$;

-- Reload PostgREST schema cache so the new table/relationship is queryable.
NOTIFY pgrst, 'reload schema';
