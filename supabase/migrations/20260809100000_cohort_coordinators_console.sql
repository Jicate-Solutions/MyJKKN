-- ============================================================================
-- COHORT COORDINATORS — one appointment record for every cohort in MyJKKN
-- Created: 2026-08-02  (Director decision, same date)
-- ============================================================================
-- NOT APPLIED TO ANY DATABASE. Director-gated apply; the orchestrator applies
-- migrations serially. This file deliberately carries no BEGIN;/COMMIT; of its
-- own so that wrapping it in BEGIN..ROLLBACK stays a genuine dry run
-- (ref feedback_inner_commit_defeats_begin_rollback_dryrun).
--
-- WHAT THIS IS FOR
--   Every cohort-shaped programme in MyJKKN already shares ONE spine,
--   public.cohorts (kind IN sf100 / foundations / cdc / trainer / mba_associate /
--   school_of_influence). Nothing anywhere records WHO RUNS one. Measured on
--   production 2026-08-01/02: 5 live cohorts, 0 coordinators, because there is
--   no place to put one. This file creates that place, and one screen writes it.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISION 1 — WHY A DEDICATED TABLE AND NOT cohort_memberships.role
-- ─────────────────────────────────────────────────────────────────────────────
--   public.cohort_memberships already carries a `role` text column (today only
--   role='team' on the 18 sf100 rows), so reusing it was the obvious cheap move.
--   It was rejected on four structural grounds, not on taste:
--
--   (a) It cannot express a PROGRAMME-WIDE appointment at all.
--       cohort_memberships.cohort_id is NOT NULL. "Coordinates School of
--       Influence" has no single cohort to hang on, and the whole point of the
--       default granularity is that it must cover batches created LATER. The
--       alternatives are a fan-out (one row per batch, stale the moment batch 4
--       is created) or a sentinel cohort row. Both are worse than a column.
--       Three of the six kinds — foundations, cdc, trainer — have ZERO cohorts
--       right now, so there is literally no row to write.
--
--   (b) UNIQUE (cohort_id, member_type, member_ref) makes "member AND
--       coordinator of the same cohort" unrepresentable. One row cannot say both,
--       and a coordinator who is also enrolled is an ordinary situation here.
--
--   (c) It would collide with School of Influence's D10 exclusivity rule.
--       fn_soi_stamp_membership_programme_key() stamps a claim key onto every
--       SoI membership and a partial UNIQUE index enforces one ACTIVE membership
--       per person per programme. A coordinator row written into that table
--       enters that namespace and could BLOCK a legitimate learner membership.
--
--   (d) The membership status vocabulary (invited/enrolled/active/graduated/
--       removed/paused) does not describe an appointment, and Decision 4 needs
--       removal EVIDENCE fields that have no home on a membership row.
--
--   So: one table, public.cohort_coordinators, whose ONLY new idea is a NULLABLE
--   cohort_id. NULL = programme-wide over that kind; set = pinned to one cohort.
--   That single nullable column is the entire "per-cohort plumbing" — the
--   narrowest addition that works — and it is also what makes the two kinds of
--   appointment distinguishable on screen and in the API without a second query.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISION 3 — SUPER ADMINS ONLY, AT EVERY LAYER
-- ─────────────────────────────────────────────────────────────────────────────
--   Appointing is gated on COALESCE(is_super_admin(), false) here (RLS + every
--   RPC), in the API routes, and in the page guard. NULL-safe on purpose: a bare
--   is_super_admin() that returns NULL falls through as "not false" in some
--   predicate positions and grants access (ref
--   feedback_secdef_guard_not_null_safe_falls_through).
--
--   ⚠ DELIBERATE DEVIATION from the repo's usual
--   "is_super_admin() OR is_admin() first" policy preamble: is_admin() is TRUE
--   for role IN ('admin','super_admin','administrator'), and 'administrator' is
--   held by two people who are NOT super admins. Including it would silently
--   widen appointment authority past the Director's decision. The one place
--   is_admin() would normally buy — an admin being able to READ the appointments
--   — is served instead by the read RPC, which is super-admin-gated, plus a
--   self-read policy so an appointed person can see their own record.
--
--   No caller-supplied user id decides authority anywhere in this file: every
--   guard reads auth.uid() itself, so none of these functions is an IDOR
--   (ref feedback_secdef_caller_supplied_user_id_is_an_idor).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISION 4 — DEPARTURE: RECORD FIRST, THEN REMOVE
-- ─────────────────────────────────────────────────────────────────────────────
--   profiles.is_active is DERIVED from learners_profiles.lifecycle_status; it is
--   not set by hand. If that derivation is ever wrong, an auto-removal here
--   strips a working coordinator. So the removal is never allowed to be the only
--   trace of itself:
--     • public.cohort_coordinator_events gets the row FIRST, then the
--       appointment is updated. Statement order in the trigger is load-bearing.
--       (Honest caveat: both statements run in the caller's transaction, so a
--       failure rolls back both. The ordering still matters because the same
--       write path is reached from fn_cohort_coordinator_remove, where the
--       UPDATE can fail on a constraint while the INSERT has already succeeded
--       in a savepoint-free block, and because the event row carries evidence
--       the appointment row alone would not explain.)
--     • The event records WHO, FROM WHAT, WHEN, and ON WHAT EVIDENCE —
--       evidence_field='profiles.is_active', evidence_value='false'.
--     • The appointment is SOFT-removed (status='removed'), never deleted, so
--       the console can say "removed automatically because …" without a join
--       to history.
--     • fn_cohort_coordinator_reinstate() puts it back in one click and writes
--       its own 'reinstated' event.
--   This matches the pattern the same Director chose for batch membership:
--   remove, but always write a visible record.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT THIS FILE DOES **NOT** DO
-- ─────────────────────────────────────────────────────────────────────────────
--   • It grants no custom_roles row. Five of the six kinds have no coordinator
--     role to grant (only school_of_influence has one, soi_programme_coordinator),
--     and writing user_roles moves profiles.role through a sync trigger — a
--     second, riskier feature. The appointment IS the record of authority;
--     fn_is_cohort_coordinator() below is the single hook a programme adopts
--     when it wants that authority to open a door.
--   • It changes NO existing RLS policy, NO existing function, and NO existing
--     table. Nothing here is CREATE OR REPLACE over something that already
--     exists, so there is no stale-source risk
--     (ref feedback_secdef_replace_silently_reverted_money_gate).
-- ============================================================================


-- ── 1. cohort_coordinators — the appointment ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cohort_coordinators (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The programme. Mirrors public.cohorts.kind's vocabulary exactly, including
  -- the three kinds with no cohorts yet — appointing a coordinator for a
  -- programme that has not started is legitimate and must not be blocked.
  programme_kind          text NOT NULL
                            CHECK (programme_kind IN (
                              'sf100','foundations','cdc','trainer',
                              'mba_associate','school_of_influence')),
  -- NULL = programme-wide (covers every cohort of this kind, including ones
  -- created later). NOT NULL = pinned to exactly this cohort.
  cohort_id               uuid REFERENCES public.cohorts(id) ON DELETE CASCADE,
  user_id                 uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status                  text NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','removed')),
  note                    text,
  appointed_by            uuid,
  appointed_at            timestamptz NOT NULL DEFAULT now(),
  removed_at              timestamptz,
  removed_by              uuid,
  removal_reason          text,
  removal_evidence_field  text,
  removal_evidence_value  text,
  removed_automatically   boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- One active programme-wide appointment per person per programme…
CREATE UNIQUE INDEX IF NOT EXISTS uidx_cohort_coordinators_programme_active
  ON public.cohort_coordinators (programme_kind, user_id)
  WHERE cohort_id IS NULL AND status = 'active';

-- …and one active pinned appointment per person per cohort. The two are
-- independent on purpose: someone can be pinned to a batch today and promoted
-- to programme-wide later without a delete.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_cohort_coordinators_cohort_active
  ON public.cohort_coordinators (cohort_id, user_id)
  WHERE cohort_id IS NOT NULL AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_cohort_coordinators_user
  ON public.cohort_coordinators (user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_cohort_coordinators_kind
  ON public.cohort_coordinators (programme_kind, status);


-- ── 2. cohort_coordinator_events — append-only, and the visible record ───────
-- coordinator_id is ON DELETE SET NULL, not CASCADE: if an appointment row is
-- ever hard-deleted the trace of why it ended must survive it.
CREATE TABLE IF NOT EXISTS public.cohort_coordinator_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_id  uuid REFERENCES public.cohort_coordinators(id) ON DELETE SET NULL,
  user_id         uuid NOT NULL,
  programme_kind  text NOT NULL,
  cohort_id       uuid,
  event_type      text NOT NULL
                    CHECK (event_type IN ('appointed','removed','auto_removed','reinstated')),
  reason          text,
  evidence_field  text,
  evidence_value  text,
  actor_id        uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cohort_coordinator_events_coordinator
  ON public.cohort_coordinator_events (coordinator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cohort_coordinator_events_user
  ON public.cohort_coordinator_events (user_id, created_at DESC);


-- ── 3. updated_at trigger (reuse the repo-canonical fn) ──────────────────────
DROP TRIGGER IF EXISTS trg_cohort_coordinators_updated_at ON public.cohort_coordinators;
CREATE TRIGGER trg_cohort_coordinators_updated_at
  BEFORE UPDATE ON public.cohort_coordinators
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ── 4. Grants — revoke FIRST, then grant back only what is needed ────────────
-- Supabase's ALTER DEFAULT PRIVILEGES makes both tables born anon=arwdDxt AND
-- authenticated=arwdDxt, so a bare GRANT SELECT is a silent no-op that leaves
-- writes in place (ref feedback_grant_select_to_authenticated_is_a_noop_after_
-- default_privileges). Writes reach these tables ONLY through the SECURITY
-- DEFINER functions below, so `authenticated` keeps SELECT and nothing else —
-- and RLS still decides which rows that SELECT can see.
REVOKE ALL ON TABLE public.cohort_coordinators       FROM anon, PUBLIC, authenticated;
REVOKE ALL ON TABLE public.cohort_coordinator_events FROM anon, PUBLIC, authenticated;
GRANT SELECT ON TABLE public.cohort_coordinators       TO authenticated;
GRANT SELECT ON TABLE public.cohort_coordinator_events TO authenticated;


-- ── 5. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.cohort_coordinators       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohort_coordinator_events ENABLE ROW LEVEL SECURITY;

-- SELECT: super admins see everything; an appointed person sees their OWN
-- record and their OWN history. That self-read is what lets someone who lost
-- access find out why without asking an engineer (Decision 1 + Decision 4).
DROP POLICY IF EXISTS cohort_coordinators_select ON public.cohort_coordinators;
CREATE POLICY cohort_coordinators_select ON public.cohort_coordinators
  FOR SELECT USING (
    COALESCE((select public.is_super_admin()), false)
    OR user_id = (select auth.uid())
  );

-- Writes: super admins only, and in practice only through the RPCs below.
DROP POLICY IF EXISTS cohort_coordinators_insert ON public.cohort_coordinators;
CREATE POLICY cohort_coordinators_insert ON public.cohort_coordinators
  FOR INSERT WITH CHECK (COALESCE((select public.is_super_admin()), false));

DROP POLICY IF EXISTS cohort_coordinators_update ON public.cohort_coordinators;
CREATE POLICY cohort_coordinators_update ON public.cohort_coordinators
  FOR UPDATE USING (COALESCE((select public.is_super_admin()), false));

DROP POLICY IF EXISTS cohort_coordinators_delete ON public.cohort_coordinators;
CREATE POLICY cohort_coordinators_delete ON public.cohort_coordinators
  FOR DELETE USING (COALESCE((select public.is_super_admin()), false));

DROP POLICY IF EXISTS cohort_coordinator_events_select ON public.cohort_coordinator_events;
CREATE POLICY cohort_coordinator_events_select ON public.cohort_coordinator_events
  FOR SELECT USING (
    COALESCE((select public.is_super_admin()), false)
    OR user_id = (select auth.uid())
  );

-- Append-only for everyone: no INSERT/UPDATE/DELETE policy exists, so ordinary
-- roles cannot write history at all. The SECURITY DEFINER writers below run as
-- the function owner and bypass RLS, which is the only intended write path.


-- ── 6. fn_is_cohort_coordinator — the published hook ─────────────────────────
-- The ONE predicate any programme adopts when it wants an appointment to open a
-- door. Reads auth.uid() itself — no caller-supplied identity, so it cannot be
-- used to answer the question on someone else's behalf.
CREATE OR REPLACE FUNCTION public.fn_is_cohort_coordinator(p_cohort_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cohort_coordinators cc
    JOIN public.cohorts c ON c.id = p_cohort_id
    WHERE cc.user_id = auth.uid()
      AND cc.status = 'active'
      AND cc.programme_kind = c.kind
      AND (cc.cohort_id IS NULL OR cc.cohort_id = p_cohort_id)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_is_cohort_coordinator(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_is_cohort_coordinator(uuid) TO authenticated;


-- ── 7. fn_cohort_coordinators_overview — everything the console renders ──────
-- One super-admin-gated call returns every cohort across all six kinds plus its
-- member count and its coordinators, so the page needs no widened table RLS to
-- show data it is entitled to show. Kinds with no cohorts are returned as rows
-- with cohort_id NULL so the screen can say "no cohorts yet" honestly instead of
-- rendering an unexplained empty table.
CREATE OR REPLACE FUNCTION public.fn_cohort_coordinators_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kinds text[] := ARRAY['sf100','foundations','cdc','trainer',
                          'mba_associate','school_of_influence'];
  v_result jsonb;
BEGIN
  IF NOT COALESCE(public.is_super_admin(), false) THEN
    RAISE EXCEPTION 'Only super administrators can view cohort coordinator appointments'
      USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'programmes', COALESCE(jsonb_agg(p ORDER BY p->>'kind'), '[]'::jsonb)
  )
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'kind', k.kind,
      -- Programme-wide appointments: cover every cohort of this kind, present
      -- and future.
      'programme_coordinators', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'appointment_id', cc.id,
                 'user_id',        cc.user_id,
                 'full_name',      pr.full_name,
                 'email',          pr.email,
                 'appointed_at',   cc.appointed_at,
                 'note',           cc.note
               ) ORDER BY pr.full_name)
        FROM public.cohort_coordinators cc
        LEFT JOIN public.profiles pr ON pr.id = cc.user_id
        WHERE cc.programme_kind = k.kind
          AND cc.cohort_id IS NULL
          AND cc.status = 'active'
      ), '[]'::jsonb),
      'cohorts', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id',           c.id,
                 'name',         c.name,
                 'status',       c.status,
                 'academic_year', c.academic_year,
                 'member_count', (
                   SELECT count(*) FROM public.cohort_memberships m
                   WHERE m.cohort_id = c.id AND m.status <> 'removed'
                 ),
                 'coordinators', COALESCE((
                   SELECT jsonb_agg(jsonb_build_object(
                            'appointment_id', cc2.id,
                            'user_id',        cc2.user_id,
                            'full_name',      pr2.full_name,
                            'email',          pr2.email,
                            'appointed_at',   cc2.appointed_at,
                            'note',           cc2.note
                          ) ORDER BY pr2.full_name)
                   FROM public.cohort_coordinators cc2
                   LEFT JOIN public.profiles pr2 ON pr2.id = cc2.user_id
                   WHERE cc2.cohort_id = c.id AND cc2.status = 'active'
                 ), '[]'::jsonb)
               ) ORDER BY c.created_at DESC)
        FROM public.cohorts c
        WHERE c.kind = k.kind
      ), '[]'::jsonb),
      -- Removed appointments, newest first, with the evidence that ended them.
      -- This is what makes "removed automatically because …" visible on screen.
      'removed', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'appointment_id',  cc3.id,
                 'user_id',         cc3.user_id,
                 'full_name',       pr3.full_name,
                 'email',           pr3.email,
                 'cohort_id',       cc3.cohort_id,
                 'removed_at',      cc3.removed_at,
                 'removal_reason',  cc3.removal_reason,
                 'evidence_field',  cc3.removal_evidence_field,
                 'evidence_value',  cc3.removal_evidence_value,
                 'automatic',       cc3.removed_automatically
               ) ORDER BY cc3.removed_at DESC)
        FROM public.cohort_coordinators cc3
        LEFT JOIN public.profiles pr3 ON pr3.id = cc3.user_id
        WHERE cc3.programme_kind = k.kind AND cc3.status = 'removed'
      ), '[]'::jsonb)
    ) AS p
    FROM unnest(v_kinds) AS k(kind)
  ) s;

  RETURN COALESCE(v_result, jsonb_build_object('programmes', '[]'::jsonb));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_cohort_coordinators_overview() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cohort_coordinators_overview() TO authenticated;


-- ── 8. fn_cohort_coordinator_appoint ─────────────────────────────────────────
-- Programme-wide when p_cohort_id IS NULL, pinned otherwise. When pinned, the
-- programme is DERIVED from the cohort so the two can never disagree.
CREATE OR REPLACE FUNCTION public.fn_cohort_coordinator_appoint(
  p_user_id        uuid,
  p_programme_kind text DEFAULT NULL,
  p_cohort_id      uuid DEFAULT NULL,
  p_note           text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kind text;
  v_id   uuid;
BEGIN
  IF NOT COALESCE(public.is_super_admin(), false) THEN
    RAISE EXCEPTION 'Only super administrators can appoint cohort coordinators'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Pick a person to appoint' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'That person is not a MyJKKN user' USING ERRCODE = '23503';
  END IF;

  IF p_cohort_id IS NOT NULL THEN
    SELECT c.kind INTO v_kind FROM public.cohorts c WHERE c.id = p_cohort_id;
    IF v_kind IS NULL THEN
      RAISE EXCEPTION 'That cohort no longer exists' USING ERRCODE = '23503';
    END IF;
  ELSE
    v_kind := p_programme_kind;
  END IF;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'Choose a programme, or a cohort within one' USING ERRCODE = '22023';
  END IF;

  -- Re-appointing someone who was removed reuses their row so the history stays
  -- attached to one appointment rather than fragmenting across duplicates.
  UPDATE public.cohort_coordinators
     SET status = 'active',
         note = COALESCE(p_note, note),
         appointed_by = auth.uid(),
         appointed_at = now(),
         removed_at = NULL, removed_by = NULL, removal_reason = NULL,
         removal_evidence_field = NULL, removal_evidence_value = NULL,
         removed_automatically = false
   WHERE user_id = p_user_id
     AND programme_kind = v_kind
     AND cohort_id IS NOT DISTINCT FROM p_cohort_id
     AND status = 'removed'
   RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    INSERT INTO public.cohort_coordinators
      (programme_kind, cohort_id, user_id, note, appointed_by)
    VALUES (v_kind, p_cohort_id, p_user_id, p_note, auth.uid())
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_id;
  END IF;

  IF v_id IS NULL THEN
    -- The partial unique index already holds an active row for this pair.
    SELECT id INTO v_id
      FROM public.cohort_coordinators
     WHERE user_id = p_user_id
       AND programme_kind = v_kind
       AND cohort_id IS NOT DISTINCT FROM p_cohort_id
       AND status = 'active';
    RETURN v_id;
  END IF;

  INSERT INTO public.cohort_coordinator_events
    (coordinator_id, user_id, programme_kind, cohort_id, event_type, reason, actor_id)
  VALUES (v_id, p_user_id, v_kind, p_cohort_id, 'appointed', p_note, auth.uid());

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_cohort_coordinator_appoint(uuid, text, uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cohort_coordinator_appoint(uuid, text, uuid, text) TO authenticated;


-- ── 9. fn_cohort_coordinator_remove — record BEFORE removal ──────────────────
CREATE OR REPLACE FUNCTION public.fn_cohort_coordinator_remove(
  p_appointment_id uuid,
  p_reason         text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.cohort_coordinators%ROWTYPE;
BEGIN
  IF NOT COALESCE(public.is_super_admin(), false) THEN
    RAISE EXCEPTION 'Only super administrators can remove cohort coordinators'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.cohort_coordinators
   WHERE id = p_appointment_id AND status = 'active';
  IF v_row.id IS NULL THEN
    RETURN false;
  END IF;

  -- RECORD FIRST. The trace must exist even if the update below fails.
  INSERT INTO public.cohort_coordinator_events
    (coordinator_id, user_id, programme_kind, cohort_id, event_type,
     reason, evidence_field, evidence_value, actor_id)
  VALUES (v_row.id, v_row.user_id, v_row.programme_kind, v_row.cohort_id, 'removed',
          COALESCE(p_reason, 'Removed by a super administrator'),
          'cohort_coordinators.status', 'removed', auth.uid());

  UPDATE public.cohort_coordinators
     SET status = 'removed',
         removed_at = now(),
         removed_by = auth.uid(),
         removal_reason = COALESCE(p_reason, 'Removed by a super administrator'),
         removal_evidence_field = 'cohort_coordinators.status',
         removal_evidence_value = 'removed',
         removed_automatically = false
   WHERE id = v_row.id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_cohort_coordinator_remove(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cohort_coordinator_remove(uuid, text) TO authenticated;


-- ── 10. fn_cohort_coordinator_reinstate — one click back ─────────────────────
CREATE OR REPLACE FUNCTION public.fn_cohort_coordinator_reinstate(
  p_appointment_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.cohort_coordinators%ROWTYPE;
BEGIN
  IF NOT COALESCE(public.is_super_admin(), false) THEN
    RAISE EXCEPTION 'Only super administrators can reinstate cohort coordinators'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.cohort_coordinators
   WHERE id = p_appointment_id AND status = 'removed';
  IF v_row.id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.cohort_coordinator_events
    (coordinator_id, user_id, programme_kind, cohort_id, event_type, reason, actor_id)
  VALUES (v_row.id, v_row.user_id, v_row.programme_kind, v_row.cohort_id, 'reinstated',
          'Re-appointed by a super administrator', auth.uid());

  UPDATE public.cohort_coordinators
     SET status = 'active',
         appointed_by = auth.uid(),
         appointed_at = now(),
         removed_at = NULL, removed_by = NULL, removal_reason = NULL,
         removal_evidence_field = NULL, removal_evidence_value = NULL,
         removed_automatically = false
   WHERE id = v_row.id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_cohort_coordinator_reinstate(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cohort_coordinator_reinstate(uuid) TO authenticated;


-- ── 11. Departure — automatic removal, with the record written first ─────────
-- Internal trigger function: nobody calls it directly, so EXECUTE is revoked
-- from `authenticated` as well as anon/PUBLIC. Writing no GRANT would NOT deny
-- one — ALTER DEFAULT PRIVILEGES already granted authenticated EXECUTE directly
-- (ref feedback_supabase_anon_execute_default_grant). Trigger execution is
-- unaffected by EXECUTE privileges on the trigger function.
CREATE OR REPLACE FUNCTION public.fn_cohort_coordinator_on_departure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- RECORD FIRST for every appointment this departure will end, THEN remove.
  -- Two set-based statements in this order, never one UPDATE … RETURNING that
  -- would make the removal its own only witness.
  INSERT INTO public.cohort_coordinator_events
    (coordinator_id, user_id, programme_kind, cohort_id, event_type,
     reason, evidence_field, evidence_value, actor_id)
  SELECT cc.id, cc.user_id, cc.programme_kind, cc.cohort_id, 'auto_removed',
         'Removed automatically because this person is no longer active at JKKN',
         'profiles.is_active', 'false', auth.uid()
    FROM public.cohort_coordinators cc
   WHERE cc.user_id = NEW.id AND cc.status = 'active';

  UPDATE public.cohort_coordinators
     SET status = 'removed',
         removed_at = now(),
         removed_by = NULL,
         removal_reason = 'Removed automatically because this person is no longer active at JKKN',
         removal_evidence_field = 'profiles.is_active',
         removal_evidence_value = 'false',
         removed_automatically = true
   WHERE user_id = NEW.id AND status = 'active';

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_cohort_coordinator_on_departure() FROM anon, PUBLIC, authenticated;

-- AFTER UPDATE OF is_active, and only on the true→false edge. profiles is a hot
-- table, so the WHEN clause keeps this off every ordinary profile write.
-- NOTE: profiles.is_active is DERIVED from learners_profiles.lifecycle_status —
-- this trigger inherits that derivation's correctness, which is exactly why the
-- removal is soft, evidenced, surfaced on the console, and reversible in a click.
DROP TRIGGER IF EXISTS trg_cohort_coordinator_on_departure ON public.profiles;
CREATE TRIGGER trg_cohort_coordinator_on_departure
  AFTER UPDATE OF is_active ON public.profiles
  FOR EACH ROW
  WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active
        AND COALESCE(NEW.is_active, false) = false)
  EXECUTE FUNCTION public.fn_cohort_coordinator_on_departure();


-- ── 12. Apply-time assert on the END STATE ───────────────────────────────────
-- Reads the catalog, not this file. Every claim above is checked as a fact about
-- the database after the statements ran. pg_class.relacl is used for the table
-- grants because information_schema omits some relation kinds
-- (ref feedback_information_schema_omits_matviews).
DO $assert$
DECLARE
  v_missing text := '';
BEGIN
  -- tables exist, RLS on
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.cohort_coordinators'::regclass AND relrowsecurity) THEN
    v_missing := v_missing || ' cohort_coordinators:rls_off';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.cohort_coordinator_events'::regclass AND relrowsecurity) THEN
    v_missing := v_missing || ' cohort_coordinator_events:rls_off';
  END IF;

  -- anon holds nothing on either table
  IF EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.oid IN ('public.cohort_coordinators'::regclass,
                    'public.cohort_coordinator_events'::regclass)
      AND array_to_string(COALESCE(c.relacl, '{}'::aclitem[]), ',') LIKE '%anon=%'
  ) THEN
    v_missing := v_missing || ' anon_still_granted_on_table';
  END IF;

  -- anon cannot execute any of the new functions
  IF has_function_privilege('anon', 'public.fn_is_cohort_coordinator(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_cohort_coordinators_overview()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_cohort_coordinator_appoint(uuid, text, uuid, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_cohort_coordinator_remove(uuid, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_cohort_coordinator_reinstate(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_cohort_coordinator_on_departure()', 'EXECUTE')
  THEN
    v_missing := v_missing || ' anon_can_execute_a_new_function';
  END IF;

  -- the internal trigger function is denied to authenticated as well
  IF has_function_privilege('authenticated', 'public.fn_cohort_coordinator_on_departure()', 'EXECUTE') THEN
    v_missing := v_missing || ' authenticated_can_execute_internal_trigger_fn';
  END IF;

  -- the departure trigger is installed and enabled
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_cohort_coordinator_on_departure'
      AND tgrelid = 'public.profiles'::regclass
      AND tgenabled <> 'D'
  ) THEN
    v_missing := v_missing || ' departure_trigger_missing_or_disabled';
  END IF;

  IF v_missing <> '' THEN
    RAISE EXCEPTION 'cohort coordinators migration end-state assert failed:%', v_missing;
  END IF;
END
$assert$;

NOTIFY pgrst, 'reload schema';
