-- ============================================================================
-- Programme-coordinator appointments actually GRANT ACCESS
-- Created: 2026-08-08
-- FILE ONLY / NOT APPLIED — Director-gated. Rehearsed in BEGIN..ROLLBACK
-- against production (ref kvizhngldtiuufknvehv); see the PR body for the result.
-- ============================================================================
--
-- WHAT WAS ALREADY THERE, AND WHY THIS FILE IS SMALL
--   public.cohort_coordinators, public.cohort_coordinator_events, the four
--   appoint/remove/reinstate/overview RPCs, fn_is_cohort_coordinator() and the
--   live trg_cohort_coordinator_on_departure trigger ALL already exist on
--   production. Verified 2026-08-08: 0 appointment rows, 0 event rows, and
--   — the actual defect — ZERO callers of fn_is_cohort_coordinator anywhere in
--   the database or the application. The subsystem could record an appointment
--   and nothing anywhere consulted it, so an appointment granted nothing.
--   Nothing here re-creates any of those objects. Every function body below
--   starts from its live pg_get_functiondef() text (dumped 2026-08-08) with only
--   the marked changes applied, so an unrelated branch of the original logic
--   cannot be lost by a rewrite.
--
--   NO RPC SIGNATURE CHANGES. The School-of-Influence coordinator UI is being
--   written against these exact signatures in a parallel lane; only internals
--   move. Every function stays SECURITY DEFINER with a pinned search_path, and
--   the closing GRANTS section re-asserts `REVOKE … FROM anon, PUBLIC` on every
--   function this file touches (CREATE OR REPLACE preserves existing ACLs, so
--   the revoke is an assertion, not a repair — anon already holds nothing).
--
-- THE DECISIONS THIS IMPLEMENTS
--   D1  Widen the authorizer. Appointing and removing a coordinator was
--       hard-gated on is_super_admin(), which in practice meant 14 people for a
--       job that belongs to whoever runs the programme. It now also admits
--       admins, the COO, and the programme's own owner.
--   D5  One-hop appointment. An active coordinator MAY appoint others; a person
--       who was appointed BY a coordinator may not appoint anyone. Implemented
--       with an additive column, cohort_coordinators.may_appoint_others, set
--       false exactly when the appointer was acting ONLY as a coordinator. The
--       chain depth is therefore capped at 1 by data, not by walking a parent
--       chain at read time — there is no parent pointer on the table, and adding
--       one would mean a recursive check on every authorization.
--   D6  Nobody marks their own homework. A coordinator may apply to their own
--       programme, but the accept/reject RPCs refuse when the application being
--       decided belongs to the caller. Super admins are NOT exempt.
--   D9  The appointment branch carries NO institution filter. A coordinator sees
--       every applicant to THEIR programme from any college, and nothing outside
--       it. programme_kind IS the boundary — adding role_has_institution_access
--       here would hide exactly the cross-college applications the coordinator
--       exists to decide.
--   D10 The old permission keys keep working. Every appointment branch is added
--       BESIDE the existing cohort.manage / cohort.school_of_influence.manage
--       branch, never in place of it, so no role loses access on apply.
--   D11 Auto-end at programme end (function only, no cron wired here).
--   D13 A manual removal must carry a reason. Automatic removals supply their
--       own and keep working.
--
-- WHAT AN APPOINTMENT NOW OPENS (School of Influence)
--   fn_soi_can_review_applications, fn_soi_can_manage_batch and
--   fn_soi_has_programme_access each gain one appointment branch. Those three
--   are the gates behind the review queue, the batch screens and module entry,
--   so an appointment alone — with no role grant and no permission key — is
--   enough to run a programme end to end.
-- ============================================================================

-- ─── §0 GUARD ───────────────────────────────────────────────────────────────
-- This repository's migration ledger has diverged from the database. Refuse
-- loudly rather than half-apply against an environment missing the subsystem.
DO $guard$
BEGIN
  IF to_regclass('public.cohort_coordinators') IS NULL
     OR to_regclass('public.cohort_coordinator_events') IS NULL
     OR to_regclass('public.cohorts') IS NULL THEN
    RAISE EXCEPTION 'REFUSING TO APPLY: the cohort coordinator subsystem is not present in this database';
  END IF;

  -- is_admin is declared is_admin(user_id uuid DEFAULT auth.uid()), so the
  -- no-argument form callers use does NOT name an existing procedure — probe the
  -- real one-argument signature or this guard fires on a healthy database.
  IF to_regprocedure('public.is_super_admin()') IS NULL
     OR to_regprocedure('public.is_admin(uuid)') IS NULL
     OR to_regprocedure('public.user_has_permission(text)') IS NULL
     OR to_regprocedure('public.role_has_institution_access(uuid)') IS NULL THEN
    RAISE EXCEPTION 'REFUSING TO APPLY: a permission helper this file depends on is missing';
  END IF;
END
$guard$;


-- ─── §1 D5 — the one-hop marker ─────────────────────────────────────────────
-- Additive and nullable. NULL means "written before this column existed", which
-- for the zero rows on production today is moot, and every reader COALESCEs it
-- to true so an older row behaves exactly as it did.
ALTER TABLE public.cohort_coordinators
  ADD COLUMN IF NOT EXISTS may_appoint_others boolean DEFAULT true;

COMMENT ON COLUMN public.cohort_coordinators.may_appoint_others IS
  'D5: false when this appointment was made by someone acting only as a coordinator. Caps the appointment chain at one hop — a coordinator may appoint, but the people they appoint may not.';


-- ─── §2 The authorizers ─────────────────────────────────────────────────────

-- Who has standing over a programme in their OWN right, independent of any
-- appointment. Split out from fn_can_appoint_cohort_coordinator so appoint()
-- can ask the same question a second way — "was this appointer privileged, or
-- only a coordinator?" — without restating the rule.
CREATE OR REPLACE FUNCTION public.fn_is_cohort_programme_authority(
  p_programme_kind text DEFAULT NULL,
  p_cohort_id      uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_kind text;
BEGIN
  -- A named cohort decides the programme; its kind wins over anything passed in.
  IF p_cohort_id IS NOT NULL THEN
    SELECT c.kind INTO v_kind FROM public.cohorts c WHERE c.id = p_cohort_id;
  END IF;
  v_kind := COALESCE(v_kind, p_programme_kind);

  -- COALESCEd because these helpers return NULL for a caller with no profile
  -- row, and `NULL OR x` falls through to x rather than short-circuiting.
  IF COALESCE(public.is_super_admin(), false)
     OR COALESCE(public.is_admin(), false) THEN
    RETURN true;
  END IF;

  -- The COO, by VALUE not by key existence: joined through user_roles so a role
  -- that merely exists in the catalogue grants nothing to anyone not holding it.
  IF EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = (SELECT auth.uid())
      AND cr.role_key = 'coo'
      AND cr.is_active = true
  ) THEN
    RETURN true;
  END IF;

  IF v_kind IS NULL THEN
    RETURN false;
  END IF;

  -- The programme owner. Read literally: owning any live cohort of this kind is
  -- what makes someone the programme's owner, so they may appoint into a sister
  -- batch of the same programme. Archived cohorts confer nothing.
  RETURN EXISTS (
    SELECT 1
    FROM public.cohorts c
    WHERE c.kind = v_kind
      AND c.archived_at IS NULL
      AND c.owner_id = (SELECT auth.uid())
  );
END;
$fn$;

-- D1 + D5. The full appoint/remove gate: an authority in their own right, OR an
-- active coordinator of this programme who is themselves allowed to appoint.
CREATE OR REPLACE FUNCTION public.fn_can_appoint_cohort_coordinator(
  p_programme_kind text DEFAULT NULL,
  p_cohort_id      uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_kind text;
BEGIN
  IF COALESCE(public.fn_is_cohort_programme_authority(p_programme_kind, p_cohort_id), false) THEN
    RETURN true;
  END IF;

  IF p_cohort_id IS NOT NULL THEN
    SELECT c.kind INTO v_kind FROM public.cohorts c WHERE c.id = p_cohort_id;
  END IF;
  v_kind := COALESCE(v_kind, p_programme_kind);

  IF v_kind IS NULL THEN
    RETURN false;
  END IF;

  -- D5. A programme-wide appointment (cohort_id IS NULL) reaches every batch of
  -- its programme; a batch-scoped one reaches only its own batch. No institution
  -- predicate — D9: the programme is the boundary.
  RETURN EXISTS (
    SELECT 1
    FROM public.cohort_coordinators cc
    WHERE cc.user_id = (SELECT auth.uid())
      AND cc.status = 'active'
      AND cc.programme_kind = v_kind
      AND (cc.cohort_id IS NULL OR cc.cohort_id = p_cohort_id)
      AND COALESCE(cc.may_appoint_others, true)
  );
END;
$fn$;


-- ─── §3 appoint — D1 authorizer, D5 marker ──────────────────────────────────
-- Body verbatim from live pg_get_functiondef (2026-08-08). Changed: the
-- is_super_admin() gate becomes fn_can_appoint_cohort_coordinator(), evaluated
-- AFTER the programme is resolved so the check is against the right programme;
-- and may_appoint_others is written on both the reuse and the insert path.
CREATE OR REPLACE FUNCTION public.fn_cohort_coordinator_appoint(
  p_user_id        uuid,
  p_programme_kind text DEFAULT NULL::text,
  p_cohort_id      uuid DEFAULT NULL::uuid,
  p_note           text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_kind        text;
  v_id          uuid;
  v_may_appoint boolean;
BEGIN
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

  -- D1. Checked after the programme is known, because who may appoint depends on
  -- WHICH programme is being appointed into.
  IF NOT COALESCE(public.fn_can_appoint_cohort_coordinator(v_kind, p_cohort_id), false) THEN
    RAISE EXCEPTION 'You cannot appoint a coordinator for this programme. This is done by an administrator, the COO, the programme owner, or a coordinator of this programme.'
      USING ERRCODE = '42501';
  END IF;

  -- D5. True when the appointer holds standing of their own; false when the only
  -- thing that let them through was their own coordinator appointment. That
  -- false is what stops the chain at one hop.
  v_may_appoint := COALESCE(
    public.fn_is_cohort_programme_authority(v_kind, p_cohort_id), false);

  -- Re-appointing someone who was removed reuses their row so the history stays
  -- attached to one appointment rather than fragmenting across duplicates.
  UPDATE public.cohort_coordinators
     SET status = 'active',
         note = COALESCE(p_note, note),
         appointed_by = auth.uid(),
         appointed_at = now(),
         may_appoint_others = v_may_appoint,
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
      (programme_kind, cohort_id, user_id, note, appointed_by, may_appoint_others)
    VALUES (v_kind, p_cohort_id, p_user_id, p_note, auth.uid(), v_may_appoint)
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
$fn$;


-- ─── §4 remove — D1 authorizer, D13 reason required ─────────────────────────
-- Body verbatim from live pg_get_functiondef (2026-08-08). Changed: D13 refuses
-- a blank reason up front; the is_super_admin() gate becomes
-- fn_can_appoint_cohort_coordinator() evaluated against the row being removed
-- (so it has to be read first — an unknown id still returns false rather than
-- raising, exactly as before); and the reason written is the caller's, no longer
-- a COALESCE to boilerplate, because a blank one can no longer get this far.
CREATE OR REPLACE FUNCTION public.fn_cohort_coordinator_remove(
  p_appointment_id uuid,
  p_reason         text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_row    public.cohort_coordinators%ROWTYPE;
  v_reason text;
BEGIN
  -- D13. A manual removal is a decision about a person and has to say why —
  -- fn_cohort_coordinator_on_departure supplies its own reason and never comes
  -- through here, so automatic removals are unaffected.
  v_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Write why this person is no longer the coordinator. It is stored on the appointment and is what anyone reviewing this later will read.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.cohort_coordinators
   WHERE id = p_appointment_id AND status = 'active';
  IF v_row.id IS NULL THEN
    RETURN false;
  END IF;

  -- D1, against the programme this appointment actually belongs to.
  IF NOT COALESCE(public.fn_can_appoint_cohort_coordinator(
                    v_row.programme_kind, v_row.cohort_id), false) THEN
    RAISE EXCEPTION 'You cannot remove a coordinator from this programme. This is done by an administrator, the COO, the programme owner, or a coordinator of this programme.'
      USING ERRCODE = '42501';
  END IF;

  -- RECORD FIRST. The trace must exist even if the update below fails.
  INSERT INTO public.cohort_coordinator_events
    (coordinator_id, user_id, programme_kind, cohort_id, event_type,
     reason, evidence_field, evidence_value, actor_id)
  VALUES (v_row.id, v_row.user_id, v_row.programme_kind, v_row.cohort_id, 'removed',
          v_reason,
          'cohort_coordinators.status', 'removed', auth.uid());

  UPDATE public.cohort_coordinators
     SET status = 'removed',
         removed_at = now(),
         removed_by = auth.uid(),
         removal_reason = v_reason,
         removal_evidence_field = 'cohort_coordinators.status',
         removal_evidence_value = 'removed',
         removed_automatically = false
   WHERE id = v_row.id;

  RETURN true;
END;
$fn$;


-- ─── §5 overview — D1 coherence ─────────────────────────────────────────────
-- Body verbatim from live pg_get_functiondef (2026-08-08) apart from the gate.
-- Widening WHO MAY APPOINT while leaving the only list-reading RPC at
-- super-admin-only would ship a COO who can change appointments they cannot see.
-- Admitted here: super admin, admin, COO — the three cluster-wide authorities.
-- Deliberately NOT coordinators: this RPC returns every programme's
-- appointments at once, and letting a School-of-Influence coordinator read the
-- SF100 bench would breach the programme boundary D9 draws.
CREATE OR REPLACE FUNCTION public.fn_cohort_coordinators_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_kinds text[] := ARRAY['sf100','foundations','cdc','trainer',
                          'mba_associate','school_of_influence'];
  v_result jsonb;
BEGIN
  IF NOT COALESCE(public.fn_is_cohort_programme_authority(NULL, NULL), false) THEN
    RAISE EXCEPTION 'Only administrators and the COO can view every programme''s coordinator appointments'
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
                 'note',           cc.note,
                 'may_appoint_others', COALESCE(cc.may_appoint_others, true)
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
                            'note',           cc2.note,
                            'may_appoint_others', COALESCE(cc2.may_appoint_others, true)
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
$fn$;


-- ─── §6 THE WIRING — an appointment now opens the School of Influence ───────
-- fn_is_cohort_coordinator(cohort) already answers "is the caller an active
-- coordinator of the programme this cohort belongs to?", matching programme_kind
-- and honouring a NULL cohort_id as programme-wide. Nothing consulted it. These
-- three gates now do.

-- Body verbatim from live pg_get_functiondef (2026-08-08); one branch added.
CREATE OR REPLACE FUNCTION public.fn_soi_can_manage_batch(p_cohort_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_inst uuid;
  v_kind text;
BEGIN
  SELECT c.institution_id, c.kind INTO v_inst, v_kind
  FROM public.cohorts c
  WHERE c.id = p_cohort_id;

  -- Unknown cohort, or a cohort of another programme, is never manageable here.
  IF v_inst IS NULL OR v_kind IS DISTINCT FROM 'school_of_influence' THEN
    RETURN false;
  END IF;

  -- Either the shared spine key or the programme-scoped one opens this gate. The
  -- function is already pinned to kind='school_of_influence' above, so admitting
  -- the narrow key here grants nothing beyond this programme.
  --
  -- ADDED: an active appointment to this programme opens it too, with no role
  -- grant and no permission key — D9, so no institution predicate on that
  -- branch. The existing permission branch is untouched (D10).
  RETURN COALESCE(public.is_super_admin(), false)
      OR COALESCE(public.is_admin(), false)
      OR ((COALESCE(public.user_has_permission('cohort.manage'), false)
           OR COALESCE(public.user_has_permission('cohort.school_of_influence.manage'), false))
          AND COALESCE(public.role_has_institution_access(v_inst), false))
      OR COALESCE(public.fn_is_cohort_coordinator(p_cohort_id), false);
END;
$fn$;

-- Body verbatim from live pg_get_functiondef (2026-08-08); one branch added.
CREATE OR REPLACE FUNCTION public.fn_soi_can_review_applications(p_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_has_batch boolean;
  v_permitted boolean;
BEGIN
  IF p_event_id IS NULL THEN
    RETURN false;
  END IF;

  -- "Is this event a School of Influence programme?" is answered the same way
  -- the apply flow answers it: by whether any batch points at it. event_type is
  -- free text and is never trusted for a decision.
  SELECT EXISTS (
    SELECT 1 FROM public.cohorts c
    WHERE c.kind = 'school_of_influence'
      AND c.archived_at IS NULL
      AND NULLIF(btrim(c.config ->> 'source_event_id'), '')::uuid = p_event_id
  ) INTO v_has_batch;

  IF NOT COALESCE(v_has_batch, false) THEN
    RETURN false;
  END IF;

  IF COALESCE(public.is_super_admin(), false) OR COALESCE(public.is_admin(), false) THEN
    RETURN true;
  END IF;

  -- ADDED — the appointment branch. Placed BEFORE the permission check so an
  -- appointed coordinator holding no cohort.* key is not turned away by it.
  -- D9: no institution predicate. A programme-wide appointment matches any batch
  -- of this event; a batch-scoped one matches only its own batch.
  IF EXISTS (
    SELECT 1 FROM public.cohorts c
    WHERE c.kind = 'school_of_influence'
      AND c.archived_at IS NULL
      AND NULLIF(btrim(c.config ->> 'source_event_id'), '')::uuid = p_event_id
      AND COALESCE(public.fn_is_cohort_coordinator(c.id), false)
  ) THEN
    RETURN true;
  END IF;

  -- Either the shared spine key or the programme-scoped one. The guard above has
  -- already established that this event belongs to School of Influence, so the
  -- narrow key cannot reach any other programme's review queue through here.
  IF NOT (COALESCE(public.user_has_permission('cohort.manage'), false)
          OR COALESCE(public.user_has_permission('cohort.school_of_influence.manage'), false)) THEN
    RETURN false;
  END IF;

  -- Institution scope is taken from the BATCHES, not from the applicants: a
  -- coordinator administers a programme, and S4 deliberately admits applicants
  -- from any JKKN institution. Scoping on the applicant instead would hide
  -- cross-college applications from the person meant to decide them.
  SELECT EXISTS (
    SELECT 1 FROM public.cohorts c
    WHERE c.kind = 'school_of_influence'
      AND c.archived_at IS NULL
      AND NULLIF(btrim(c.config ->> 'source_event_id'), '')::uuid = p_event_id
      AND COALESCE(public.role_has_institution_access(c.institution_id), false)
  ) INTO v_permitted;

  RETURN COALESCE(v_permitted, false);
END;
$fn$;

-- Body verbatim from live pg_get_functiondef (2026-08-08); one branch added.
-- This is module ENTRY (lib/services/school-of-influence/access-gate.ts calls it
-- with no argument). Membership let a learner in; an appointment now lets the
-- coordinator in, which they previously could not do without a cohort.* key.
CREATE OR REPLACE FUNCTION public.fn_soi_has_programme_access(
  p_source_event_id uuid DEFAULT NULL::uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE((
    SELECT true
    FROM public.cohort_memberships m
    JOIN public.cohorts c ON c.id = m.cohort_id
    WHERE c.kind       = 'school_of_influence'
      AND m.member_ref = auth.uid()
      AND m.status NOT IN ('graduated', 'removed')
      AND (
        p_source_event_id IS NULL
        OR NULLIF(btrim(c.config ->> 'source_event_id'), '') = p_source_event_id::text
      )
    LIMIT 1
  ), false)
  -- ADDED: an active appointment to School of Influence is programme access.
  OR COALESCE((
    SELECT true
    FROM public.cohorts c
    WHERE c.kind = 'school_of_influence'
      AND c.archived_at IS NULL
      AND (
        p_source_event_id IS NULL
        OR NULLIF(btrim(c.config ->> 'source_event_id'), '') = p_source_event_id::text
      )
      AND public.fn_is_cohort_coordinator(c.id)
    LIMIT 1
  ), false);
$fn$;


-- ─── §7 D6 — nobody decides their own application ───────────────────────────
-- All three bodies verbatim from live pg_get_functiondef (2026-08-08); the only
-- change is the self-review block, placed AFTER the permission gate so a caller
-- with no standing at all still gets the permission message first. Unconditional
-- by design: a super admin who applied is still the applicant.

CREATE OR REPLACE FUNCTION public.fn_soi_prepare_acceptance(
  p_application_id uuid,
  p_batch_cohort_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  c_default_choice_mode constant text := 'staff_assign';
  v_event        uuid;
  v_status       text;
  v_profile      uuid;
  v_name         text;
  v_requested    uuid;
  v_mode         text;
  v_target       uuid;
  v_batch        record;
  v_audiences    text[];
  v_member_type  text;
  v_existing        uuid;
  v_existing_cohort uuid;
  v_existing_batch  text;
  v_alternatives text;
  -- Added 2026-08-01 (defect 1).
  v_batch_institution uuid;
  v_missing           text[];
BEGIN
  SELECT r.event_id, r.status, r.profile_id, r.participant_name,
         NULLIF(btrim(r.custom_data -> 'soi' ->> 'requested_batch_cohort_id'), '')::uuid,
         ARRAY(SELECT jsonb_array_elements_text(
                        COALESCE(r.custom_data -> 'soi' -> 'audiences', '[]'::jsonb)))
    INTO v_event, v_status, v_profile, v_name, v_requested, v_audiences
  FROM public.events_registrations r
  WHERE r.id = p_application_id
    AND r.source = 'soi_apply';

  IF v_event IS NULL THEN
    RAISE EXCEPTION 'That application no longer exists, or it was not made through the School of Influence apply form. Reload the queue.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT COALESCE(public.fn_soi_can_review_applications(v_event), false) THEN
    RAISE EXCEPTION 'You do not have permission to accept applications for this School of Influence programme. Ask a programme coordinator or an administrator — it needs the "cohort.manage" permission for this institution, or an appointment as a coordinator of this programme.'
      USING ERRCODE = '42501';
  END IF;

  -- D6. Nobody marks their own homework, super admins included.
  IF v_profile IS NOT NULL AND v_profile = auth.uid() THEN
    RAISE EXCEPTION 'This is your own application, so you cannot decide it. Ask another coordinator or an administrator to look at it.'
      USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN ('pending', 'waitlisted') THEN
    RAISE EXCEPTION 'This application has already been decided, so it cannot be accepted again. Reload the queue to see its current state.'
      USING ERRCODE = '22023';
  END IF;

  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'This application is not linked to a MyJKKN account, so nobody can be enrolled from it. Ask the applicant to apply again while signed in.'
      USING ERRCODE = '22023';
  END IF;

  -- D2, read at runtime. Under participant_choose the applicant already chose
  -- and the reviewer only confirms; under staff_assign the reviewer names the
  -- batch and any choice stored on the application is ignored.
  v_mode := public.fn_get_policy_text('soi.batch_choice_mode',
                                      c_default_choice_mode, NULL);
  IF v_mode IS DISTINCT FROM 'participant_choose'
     AND v_mode IS DISTINCT FROM 'staff_assign' THEN
    v_mode := c_default_choice_mode;
  END IF;

  IF v_mode = 'participant_choose' THEN
    IF v_requested IS NULL THEN
      -- The mode was switched after this person applied. Say so, rather than
      -- silently letting the reviewer assign a batch the applicant never saw.
      RAISE EXCEPTION 'This applicant did not choose a batch, but this programme is set to let applicants choose their own. Either ask them to re-apply, or switch soi.batch_choice_mode to staff-assign in the programme settings so a coordinator can assign one.'
        USING ERRCODE = '22023';
    END IF;
    IF p_batch_cohort_id IS NOT NULL AND p_batch_cohort_id <> v_requested THEN
      RAISE EXCEPTION 'This programme lets applicants choose their own batch, so a reviewer can only confirm the batch this person asked for. To put them somewhere else, accept them first and then move them between batches — a transfer keeps their full history.'
        USING ERRCODE = '22023';
    END IF;
    v_target := v_requested;
  ELSE
    IF p_batch_cohort_id IS NULL THEN
      RAISE EXCEPTION 'Choose which batch this person joins before accepting them. This programme is set so that a coordinator assigns the batch.'
        USING ERRCODE = '22023';
    END IF;
    v_target := p_batch_cohort_id;
  END IF;

  SELECT * INTO v_batch
  FROM public.fn_soi_review_batches(v_event) b
  WHERE b.cohort_id = v_target;

  -- NOT FOUND, not `v_batch IS NULL`: a record variable tests as NULL only when
  -- EVERY column is null, so the IS NULL form would let an unknown batch through.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That batch is not part of this programme. Reload the queue and pick one of the batches listed.'
      USING ERRCODE = '22023';
  END IF;

  -- ── COHERENCE GATE (added 2026-08-01, defect 1) ───────────────────────────
  -- Everything above authorises REVIEWING. The enrolment this function is
  -- clearing the way for runs under cohort_memberships' RLS as the coordinator,
  -- which needs cohort.create (the INSERT) and cohort.view (the read-back),
  -- scoped to the TARGET batch's institution. Check that here so the refusal is
  -- explicit and arrives before any write, instead of a bare 42501 later.
  --
  -- Checked against the TARGET batch, not the programme, on purpose: the
  -- reviewer gate is an EXISTS over every batch of the programme, so institution
  -- access to one batch admits a coordinator to accept into a batch belonging to
  -- another institution — where the INSERT policy would then refuse them. Same
  -- defect, second doorway.
  --
  -- Skipped entirely for super admin / admin, who are the first disjunct of
  -- every one of those policies. COALESCEd because both helpers return NULL for
  -- a caller with no profile row, and `NULL OR x` falls through to x
  -- (ref feedback_secdef_guard_not_null_safe_falls_through).
  IF NOT (COALESCE(public.is_super_admin(), false)
          OR COALESCE(public.is_admin(), false)) THEN

    SELECT c.institution_id INTO v_batch_institution
    FROM public.cohorts c
    WHERE c.id = v_target;

    v_missing := ARRAY[]::text[];

    IF NOT COALESCE(public.user_has_permission('cohort.create'), false) THEN
      v_missing := v_missing
        || 'the "cohort.create" permission, to give them a place in the batch';
    END IF;

    -- The read-back PostgREST performs on the freshly inserted row. A
    -- coordinator accepting THEIR OWN application reads that row through
    -- cohort_memberships_soi_member_select (own row, once they are a member),
    -- so cohort.view is genuinely not required in that one case and naming it
    -- would be a false refusal. (Unreachable since D6 above, kept so the rule
    -- survives if the self-review block is ever scoped down.)
    IF v_profile IS DISTINCT FROM auth.uid()
       AND NOT COALESCE(public.user_has_permission('cohort.view'), false) THEN
      v_missing := v_missing
        || 'the "cohort.view" permission, to read that place back once it exists';
    END IF;

    IF NOT COALESCE(public.role_has_institution_access(v_batch_institution), false) THEN
      v_missing := v_missing
        || format('access to the institution %s belongs to', v_batch.batch_name);
    END IF;

    IF array_length(v_missing, 1) IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = format(
          'You can review this programme''s applications, but you cannot enrol anyone into %s, so nothing was written and this application is untouched. Still needed: %s. Ask an administrator to add that to your role.',
          v_batch.batch_name,
          array_to_string(v_missing, '; ')
        );
    END IF;
  END IF;

  -- D5 — the batch may have filled between apply and accept. Refuse in words,
  -- and name the batches that still have room. The intake WINDOW is deliberately
  -- not re-checked: the applicant applied while it was open, and a coordinator
  -- must still be able to clear a queue after applications close.
  IF v_batch.is_full THEN
    SELECT string_agg(b2.batch_name, ', ' ORDER BY b2.batch_name) INTO v_alternatives
    FROM public.fn_soi_review_batches(v_event) b2
    WHERE b2.accepting_now AND b2.cohort_id <> v_target;

    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format(
        '%s is full — it holds %s of %s places, and accepting this person would put it over. %s',
        v_batch.batch_name, v_batch.occupancy, v_batch.capacity,
        CASE
          WHEN v_alternatives IS NULL
          THEN 'No other batch has room either. Raise soi.batch_capacity for this batch in the programme settings, or tell the applicant about the next round.'
          ELSE 'These batches still have room: ' || v_alternatives || '.'
        END
      );
  END IF;

  -- D10 — one active place per person per programme. Reported, not raised, so a
  -- half-finished accept can be completed instead of being stuck. The batch they
  -- are ALREADY in is returned too: it may not be the one the reviewer just
  -- picked, and the screen has to be able to say so rather than report the
  -- wrong batch back.
  SELECT m.id, m.cohort_id, c.name
    INTO v_existing, v_existing_cohort, v_existing_batch
  FROM public.cohort_memberships m
  JOIN public.cohorts c ON c.id = m.cohort_id
  WHERE m.member_ref = v_profile
    AND c.kind = 'school_of_influence'
    AND NULLIF(btrim(c.config ->> 'source_event_id'), '')::uuid = v_event
    AND m.status NOT IN ('graduated', 'removed')
  LIMIT 1;

  -- Which member shape the enrolment takes. Read from the audiences S4 recorded
  -- from the applicant's OWN records, never from anything the browser sent.
  -- 'team' is never produced here: it is the one member_type the spine does not
  -- identity-check, and it is how SF100 admitted 23 fabricated humans.
  v_member_type := CASE
                     WHEN 'learner' = ANY (v_audiences) THEN 'learner'
                     WHEN 'staff'   = ANY (v_audiences) THEN 'staff'
                     -- No recorded audience (an application older than the
                     -- field): fall back to what the profile itself says.
                     WHEN EXISTS (SELECT 1 FROM public.profiles p
                                   WHERE p.id = v_profile AND p.learner_id IS NOT NULL)
                       THEN 'learner'
                     ELSE 'staff'
                   END;

  RETURN jsonb_build_object(
    'ok',              true,
    'application_id',  p_application_id,
    'profile_id',      v_profile,
    'applicant_name',  v_name,
    'batch_cohort_id', v_target,
    'batch_name',      v_batch.batch_name,
    'member_type',     v_member_type,
    'batch_choice_mode', v_mode,
    'seats_left',      v_batch.capacity - v_batch.occupancy,
    'already_member',  (v_existing IS NOT NULL),
    'membership_id',   v_existing,
    'existing_batch_cohort_id', v_existing_cohort,
    'existing_batch_name',      v_existing_batch
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_soi_confirm_acceptance(
  p_application_id uuid,
  p_membership_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_event   uuid;
  v_profile uuid;
  v_status  text;
  v_cohort  uuid;
  v_batch   text;
  v_ref     uuid;
BEGIN
  SELECT r.event_id, r.profile_id, r.status
    INTO v_event, v_profile, v_status
  FROM public.events_registrations r
  WHERE r.id = p_application_id AND r.source = 'soi_apply';

  IF v_event IS NULL THEN
    RAISE EXCEPTION 'That application no longer exists. Reload the queue.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT COALESCE(public.fn_soi_can_review_applications(v_event), false) THEN
    RAISE EXCEPTION 'You do not have permission to accept applications for this School of Influence programme. Ask a programme coordinator or an administrator — it needs the "cohort.manage" permission for this institution, or an appointment as a coordinator of this programme.'
      USING ERRCODE = '42501';
  END IF;

  -- D6. Nobody marks their own homework, super admins included. Repeated here
  -- and not left to fn_soi_prepare_acceptance: confirm is a separate RPC and can
  -- be called on its own.
  IF v_profile IS NOT NULL AND v_profile = auth.uid() THEN
    RAISE EXCEPTION 'This is your own application, so you cannot decide it. Ask another coordinator or an administrator to look at it.'
      USING ERRCODE = '42501';
  END IF;

  SELECT m.cohort_id, m.member_ref, c.name INTO v_cohort, v_ref, v_batch
  FROM public.cohort_memberships m
  JOIN public.cohorts c ON c.id = m.cohort_id
  WHERE m.id = p_membership_id
    AND c.kind = 'school_of_influence'
    AND NULLIF(btrim(c.config ->> 'source_event_id'), '')::uuid = v_event
    AND m.status NOT IN ('graduated', 'removed');

  IF v_cohort IS NULL OR v_ref IS DISTINCT FROM v_profile THEN
    RAISE EXCEPTION 'That place does not belong to this applicant in this programme, so the application was left untouched. Reload the queue and try again.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.events_registrations r
     SET status = 'confirmed',
         custom_data = COALESCE(r.custom_data, '{}'::jsonb)
           || jsonb_build_object('soi',
                COALESCE(r.custom_data -> 'soi', '{}'::jsonb)
                || jsonb_build_object('review', jsonb_build_object(
                     'decision',        'accepted',
                     'batch_cohort_id', v_cohort,
                     'batch_name',      v_batch,
                     'membership_id',   p_membership_id,
                     'decided_at',      now(),
                     'decided_by',      auth.uid()
                   ))
              ),
         updated_at = now()
   WHERE r.id = p_application_id;

  RETURN jsonb_build_object(
    'ok',             true,
    'application_id', p_application_id,
    'status',         'confirmed',
    'batch_name',     v_batch,
    'message',        format('%s has been accepted into %s.',
                             COALESCE((SELECT participant_name
                                         FROM public.events_registrations
                                        WHERE id = p_application_id), 'The applicant'),
                             v_batch)
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_soi_reject_application(
  p_application_id uuid,
  p_reason         text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  c_default_reason_req constant boolean := true;
  v_event    uuid;
  v_status   text;
  v_name     text;
  v_required boolean;
  v_reason   text;
  -- ADDED for D6: this function did not previously need to know whose
  -- application it was.
  v_profile  uuid;
BEGIN
  SELECT r.event_id, r.status, r.participant_name, r.profile_id
    INTO v_event, v_status, v_name, v_profile
  FROM public.events_registrations r
  WHERE r.id = p_application_id AND r.source = 'soi_apply';

  IF v_event IS NULL THEN
    RAISE EXCEPTION 'That application no longer exists, or it was not made through the School of Influence apply form. Reload the queue.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT COALESCE(public.fn_soi_can_review_applications(v_event), false) THEN
    RAISE EXCEPTION 'You do not have permission to decide applications for this School of Influence programme. Ask a programme coordinator or an administrator — it needs the "cohort.manage" permission for this institution, or an appointment as a coordinator of this programme.'
      USING ERRCODE = '42501';
  END IF;

  -- D6. Nobody marks their own homework, super admins included.
  IF v_profile IS NOT NULL AND v_profile = auth.uid() THEN
    RAISE EXCEPTION 'This is your own application, so you cannot decide it. Ask another coordinator or an administrator to look at it.'
      USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN ('pending', 'waitlisted') THEN
    RAISE EXCEPTION 'This application has already been decided, so it cannot be rejected now. Reload the queue to see its current state.'
      USING ERRCODE = '22023';
  END IF;

  v_reason   := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_required := COALESCE(public.fn_get_policy_bool('soi.rejection.reason_required',
                                                   c_default_reason_req, NULL),
                         c_default_reason_req);

  IF v_required AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Write the reason for turning this application down. The applicant will be shown exactly what you type here, so it needs to be something they can act on.'
      USING ERRCODE = '22023';
  END IF;

  -- 'disqualified' is the storage token for a decided no (see STATUS VOCABULARY
  -- in this file's header). Nothing shows that word to a human.
  UPDATE public.events_registrations r
     SET status = 'disqualified',
         custom_data = COALESCE(r.custom_data, '{}'::jsonb)
           || jsonb_build_object('soi',
                COALESCE(r.custom_data -> 'soi', '{}'::jsonb)
                || jsonb_build_object('review', jsonb_build_object(
                     'decision',   'rejected',
                     'reason',     v_reason,
                     'decided_at', now(),
                     'decided_by', auth.uid()
                   ))
              ),
         updated_at = now()
   WHERE r.id = p_application_id;

  RETURN jsonb_build_object(
    'ok',             true,
    'application_id', p_application_id,
    'status',         'disqualified',
    'reason',         v_reason,
    'message',        format('%s was not accepted, and the reason you wrote is now on their application.',
                             COALESCE(v_name, 'The applicant'))
  );
END;
$fn$;


-- ─── §8 D11 — an appointment ends when its programme does ───────────────────
-- NO cron and NO vercel entry is created here: the function is exposed and a
-- nightly routine should call it (one line, `SELECT
-- public.fn_cohort_coordinator_close_ended_programmes();`). Wiring a schedule is
-- a separate reviewed change — a paired producer/consumer schedule is exactly
-- what drifts when only one half is edited.
CREATE OR REPLACE FUNCTION public.fn_cohort_coordinator_close_ended_programmes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_ids uuid[];
BEGIN
  -- Maintenance, not a user action. auth.uid() IS NULL is the server-side /
  -- scheduled caller (service_role holds no uid); anon cannot reach this at all
  -- because EXECUTE is revoked from anon below.
  IF NOT (COALESCE(public.is_super_admin(), false)
          OR COALESCE(public.is_admin(), false)
          OR (SELECT auth.uid()) IS NULL) THEN
    RAISE EXCEPTION 'Only an administrator or the nightly routine can close appointments for ended programmes'
      USING ERRCODE = '42501';
  END IF;

  -- An appointment is over when the thing it points at has stopped running:
  -- a batch-scoped one when THAT batch has, a programme-wide one when no cohort
  -- of its kind still has. "Still running" is archived_at IS NULL and a status
  -- that is not completed/archived; for School of Influence a batch also stops
  -- running once its deadline has passed and it is no longer enrolling.
  --
  -- The second EXISTS is the guard that matters: without it, a programme that
  -- has NEVER had a cohort would read as "no cohort still running" and this
  -- would quietly end appointments for a programme that has not begun.
  SELECT array_agg(cc.id) INTO v_ids
  FROM public.cohort_coordinators cc
  WHERE cc.status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.cohorts c2
      WHERE (cc.cohort_id IS NOT NULL AND c2.id = cc.cohort_id)
         OR (cc.cohort_id IS NULL AND c2.kind = cc.programme_kind)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.cohorts c
      WHERE ((cc.cohort_id IS NOT NULL AND c.id = cc.cohort_id)
             OR (cc.cohort_id IS NULL AND c.kind = cc.programme_kind))
        AND c.archived_at IS NULL
        AND c.status NOT IN ('completed', 'archived')
        AND (
          c.kind <> 'school_of_influence'
          OR c.status = 'enrolling'
          OR COALESCE(c.hard_deadline, c.closes_at) IS NULL
          OR COALESCE(c.hard_deadline, c.closes_at) > now()
        )
    );

  IF v_ids IS NULL THEN
    RETURN 0;
  END IF;

  -- RECORD FIRST, mirroring fn_cohort_coordinator_remove and the departure
  -- trigger: two set-based statements in this order, never one UPDATE …
  -- RETURNING that would make the removal its own only witness.
  INSERT INTO public.cohort_coordinator_events
    (coordinator_id, user_id, programme_kind, cohort_id, event_type,
     reason, evidence_field, evidence_value, actor_id)
  SELECT cc.id, cc.user_id, cc.programme_kind, cc.cohort_id, 'auto_removed',
         'Programme ended',
         'cohorts.status',
         'no cohort of this programme is still running',
         auth.uid()
    FROM public.cohort_coordinators cc
   WHERE cc.id = ANY (v_ids);

  UPDATE public.cohort_coordinators
     SET status = 'removed',
         removed_at = now(),
         removed_by = NULL,
         removal_reason = 'Programme ended',
         removal_evidence_field = 'cohorts.status',
         removal_evidence_value = 'no cohort of this programme is still running',
         removed_automatically = true
   WHERE id = ANY (v_ids);

  RETURN array_length(v_ids, 1);
END;
$fn$;


-- ─── §9 GRANTS — anon stays out ─────────────────────────────────────────────
-- CREATE OR REPLACE keeps the existing ACL, so for the eight replaced functions
-- these are assertions (checked live 2026-08-08: anon already held nothing on
-- any of them). For the three new ones they are the actual lock — Supabase's
-- ALTER DEFAULT PRIVILEGES grants EXECUTE on every new function to anon, which
-- is a grant separate from PUBLIC and survives a bare REVOKE FROM PUBLIC.
REVOKE EXECUTE ON FUNCTION public.fn_is_cohort_programme_authority(text, uuid)        FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_can_appoint_cohort_coordinator(text, uuid)       FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_cohort_coordinator_close_ended_programmes()      FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_cohort_coordinator_appoint(uuid, text, uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_cohort_coordinator_remove(uuid, text)            FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_cohort_coordinators_overview()                   FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_soi_can_manage_batch(uuid)                       FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_soi_can_review_applications(uuid)                FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_soi_has_programme_access(uuid)                   FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_soi_prepare_acceptance(uuid, uuid)               FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_soi_confirm_acceptance(uuid, uuid)               FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_soi_reject_application(uuid, text)               FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_is_cohort_programme_authority(text, uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_can_appoint_cohort_coordinator(text, uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cohort_coordinator_close_ended_programmes()       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_cohort_coordinator_appoint(uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cohort_coordinator_remove(uuid, text)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cohort_coordinators_overview()                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_soi_can_manage_batch(uuid)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_soi_can_review_applications(uuid)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_soi_has_programme_access(uuid)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_soi_prepare_acceptance(uuid, uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_soi_confirm_acceptance(uuid, uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_soi_reject_application(uuid, text)                TO authenticated;
