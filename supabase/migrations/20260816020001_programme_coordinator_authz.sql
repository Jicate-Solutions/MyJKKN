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
--   are the gates behind module entry, the batch screens and the review queue,
--   so an appointment alone — with no role grant and no permission key — opens
--   the programme, its batches, and the ability to READ and REJECT applications.
--
--   A PROGRAMME-WIDE appointment (cohort_id IS NULL) opens all three. A
--   BATCH-SCOPED one opens module entry and its own batch, but NOT the review
--   queue: that gate is keyed on the EVENT and its queue holds applicants who
--   have no batch yet, so admitting a batch-scoped holder there would hand them
--   every applicant of the whole event — other batches, and other colleges when
--   batches share a source event.
--
--   ⚠️ ACCEPTING IS NOT YET COVERED, and the claim is limited on purpose.
--   fn_soi_prepare_acceptance's coherence gate still requires a non-admin to
--   hold cohort.create + cohort.view + institution access to the target batch,
--   because the enrolment it clears the way for runs under cohort_memberships'
--   RLS as the caller — and THOSE POLICIES are not widened here. Admitting the
--   coordinator in the gate without widening the policies would be strictly
--   worse than the gap: the explicit, named refusal would be replaced by a bare
--   42501 from RLS after the reviewer has already committed to a batch. A
--   keyless appointed coordinator can therefore run the queue but cannot yet
--   enrol anyone. Closing that needs a reviewed change to cohort_memberships'
--   INSERT/SELECT policies and is deliberately a separate PR.
--
--   ⚠️ Also unchanged: fn_cohort_coordinators_overview admits only CLUSTER
--   authorities (super admin, admin, COO). A programme OWNER may now appoint and
--   remove but still cannot read that list, because the list returns every
--   programme's bench at once and scoping it per owned kind changes the JSON
--   shape the UI lane is coding against. Stated here rather than left to be
--   discovered.
-- ============================================================================

-- ─── LIVE BASELINE, pasted so this file can be reviewed from the tree ───────
-- None of the objects below exist anywhere in this repository — the migration
-- ledger has diverged from it — so a reader has no way to check the deltas above
-- against what they modify. Read from production 2026-08-08 and reproduced here
-- verbatim. Every scoping claim in this file rests on these:
--
--   CREATE OR REPLACE FUNCTION public.fn_is_cohort_coordinator(p_cohort_id uuid)
--    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
--    SET search_path TO 'public', 'pg_temp' AS $$
--      SELECT EXISTS (
--        SELECT 1
--        FROM public.cohort_coordinators cc
--        JOIN public.cohorts c ON c.id = p_cohort_id
--        WHERE cc.user_id = auth.uid()
--          AND cc.status = 'active'
--          AND cc.programme_kind = c.kind
--          AND (cc.cohort_id IS NULL OR cc.cohort_id = p_cohort_id)
--      );
--    $$;
--   -- i.e. it matches the cohort's KIND, and a NULL cohort_id is programme-wide.
--   -- It carries no institution predicate, which is what makes D9 true.
--
--   public.cohort_coordinators — RLS ENABLED. Table grants: postgres and
--   service_role hold arwdDxt; `authenticated` holds **r** and nothing else, so
--   no end-user session can INSERT or UPDATE this table by any route. Every
--   write goes through the SECURITY DEFINER RPCs in this file. Policies:
--     select : is_super_admin() OR user_id = auth.uid()
--     insert : WITH CHECK is_super_admin()
--     update : USING is_super_admin()
--     delete : USING is_super_admin()
--   Indexes (the two partial uniques are what appoint()'s ON CONFLICT relies on):
--     uidx_cohort_coordinators_programme_active
--       UNIQUE (programme_kind, user_id) WHERE cohort_id IS NULL AND status='active'
--     uidx_cohort_coordinators_cohort_active
--       UNIQUE (cohort_id, user_id)      WHERE cohort_id IS NOT NULL AND status='active'
--   CHECKs: status IN ('active','removed'); programme_kind IN
--     ('sf100','foundations','cdc','trainer','mba_associate','school_of_influence').
--
--   NOTE for anyone diffing against the repo rather than the database: the live
--   fn_soi_can_review_applications ALREADY admitted both 'cohort.manage' and
--   'cohort.school_of_influence.manage' before this file. The repo's last
--   committed copy (20260808146000_soi_review_accept_queue.sql) shows only the
--   single key and is stale. This file changes neither of them.
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

  -- Called as (NULL, NULL) this function therefore answers a narrower question —
  -- "is the caller a CLUSTER authority?" — because the owner branch below needs a
  -- programme to reason about. Two callers rely on that on purpose: the overview
  -- gate and the self-appointment guard.
  IF v_kind IS NULL THEN
    RETURN false;
  END IF;

  -- The programme owner — SCOPED, because owning one batch is not owning the
  -- programme. Name a cohort and they must own THAT cohort. A programme-wide
  -- appointment reaches every batch in every college with no institution filter
  -- (D9), so making one requires owning every non-archived cohort of the kind.
  -- Unscoped, owning a single batch in one college would escalate to decide
  -- rights over every applicant in every college.
  IF p_cohort_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.cohorts c
      WHERE c.id = p_cohort_id
        AND c.archived_at IS NULL
        AND c.owner_id = (SELECT auth.uid())
    );
  END IF;

  RETURN EXISTS (
           SELECT 1 FROM public.cohorts c
           WHERE c.kind = v_kind AND c.archived_at IS NULL
             AND c.owner_id = (SELECT auth.uid())
         )
     AND NOT EXISTS (
           SELECT 1 FROM public.cohorts c
           WHERE c.kind = v_kind AND c.archived_at IS NULL
             AND c.owner_id IS DISTINCT FROM (SELECT auth.uid())
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

  -- NULL was the only thing rejected here. '' and any unknown string wrote an
  -- active row matching no cohort — junk that grants nothing and that neither
  -- the overview nor the auto-close can ever reach. The list mirrors the table's
  -- own programme_kind CHECK.
  v_kind := NULLIF(btrim(COALESCE(v_kind, '')), '');
  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'Choose a programme, or a cohort within one' USING ERRCODE = '22023';
  END IF;
  IF v_kind <> ALL (ARRAY['sf100','foundations','cdc','trainer',
                          'mba_associate','school_of_influence']) THEN
    RAISE EXCEPTION 'There is no programme called "%". Pick one from the list.', v_kind
      USING ERRCODE = '22023';
  END IF;

  -- No self-appointment except by a cluster authority (the (NULL, NULL) call —
  -- super admin, admin or COO, never an owner and never a coordinator). An owner
  -- or coordinator appointing THEMSELVES is how "I run one batch" becomes "I
  -- decide every applicant in every college": the appointment branches are
  -- deliberately institution-free by D9, so this guard is the only thing between
  -- the two.
  IF p_user_id = (SELECT auth.uid())
     AND NOT COALESCE(public.fn_is_cohort_programme_authority(NULL, NULL), false) THEN
    RAISE EXCEPTION 'You cannot appoint yourself as a coordinator. Ask an administrator or the COO to do it.'
      USING ERRCODE = '42501';
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
    -- The partial unique index already holds an active row for this pair. Lift
    -- may_appoint_others when THIS appointer has standing of their own: without
    -- it, an admin re-appointing someone a coordinator appointed first could
    -- never restore the right, and the RPC would report success having changed
    -- nothing. Never lowers it — a re-appointment is not a demotion.
    UPDATE public.cohort_coordinators
       SET may_appoint_others = COALESCE(may_appoint_others, true) OR v_may_appoint,
           note = COALESCE(p_note, note)
     WHERE user_id = p_user_id
       AND programme_kind = v_kind
       AND cohort_id IS NOT DISTINCT FROM p_cohort_id
       AND status = 'active'
     RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      -- ON CONFLICT DO NOTHING swallows ANY unique violation, so reaching here
      -- means the insert was refused by something OTHER than the active-pair
      -- index. Returning NULL would report a failed authorization write as a
      -- success.
      RAISE EXCEPTION 'That appointment could not be recorded, so nothing was changed. Reload the coordinator list and try again.'
        USING ERRCODE = '22023';
    END IF;

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

  -- FOR UPDATE: this now races fn_cohort_coordinator_close_ended_programmes,
  -- which also takes its rows FOR UPDATE. Without the lock a manual removal and
  -- the nightly auto-close can both write an event for one appointment and leave
  -- it holding two contradictory audit rows.
  SELECT * INTO v_row FROM public.cohort_coordinators
   WHERE id = p_appointment_id AND status = 'active'
   FOR UPDATE;
  IF v_row.id IS NULL THEN
    RETURN false;
  END IF;

  -- D1, against the programme this appointment actually belongs to.
  IF NOT COALESCE(public.fn_can_appoint_cohort_coordinator(
                    v_row.programme_kind, v_row.cohort_id), false) THEN
    RAISE EXCEPTION 'You cannot remove a coordinator from this programme. This is done by an administrator, the COO, the programme owner, or a coordinator of this programme.'
      USING ERRCODE = '42501';
  END IF;

  -- A coordinator may undo an appointment THEY made. Removing a peer — or the one
  -- the programme owner made — is an authority's decision. Without this line a
  -- coordinator could replace the whole bench, and because the overview RPC is
  -- deliberately closed to coordinators, nobody below an administrator would see
  -- it happen.
  IF NOT COALESCE(public.fn_is_cohort_programme_authority(
                    v_row.programme_kind, v_row.cohort_id), false)
     AND v_row.appointed_by IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'You can only remove a coordinator you appointed yourself. Ask an administrator, the COO, or the programme owner to remove this one.'
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
   WHERE id = v_row.id
     AND status = 'active';

  -- Report what actually happened. Returning an unconditional true would tell
  -- the screen an appointment had ended when the row was already gone.
  RETURN FOUND;
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
  -- D9: no institution predicate — the programme is the boundary.
  --
  -- PROGRAMME-WIDE APPOINTMENTS ONLY, deliberately. This function is keyed on
  -- the EVENT, not on a batch: it answers "may this person work the queue for
  -- this programme", and the queue holds applicants who have no batch yet (under
  -- staff_assign nobody has chosen one, so there is no batch to scope them by).
  -- Admitting a batch-scoped appointment here would therefore hand the holder
  -- every applicant of the whole event — including the ones bound for other
  -- batches, in other colleges if those batches share a source event. A
  -- batch-scoped appointment still opens fn_soi_can_manage_batch for its own
  -- batch, which IS batch-keyed and can honour the narrower grant.
  IF EXISTS (
    SELECT 1 FROM public.cohort_coordinators cc
    WHERE cc.user_id = (SELECT auth.uid())
      AND cc.status = 'active'
      AND cc.programme_kind = 'school_of_influence'
      AND cc.cohort_id IS NULL
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
  v_ids    uuid[];
  v_closed integer;
BEGIN
  -- Maintenance, not a user action. EXECUTE is granted to service_role ONLY (see
  -- §9) — deliberately not to `authenticated`, because a uid-is-null test is not
  -- by itself proof of the scheduler: a session whose claims GUC is unset would
  -- satisfy it. The grant is the real gate; this is defence behind it.
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
  -- Rows are locked as they are chosen, so a manual removal cannot land between
  -- this SELECT and the UPDATE below and have its removed_by / reason clobbered
  -- by "Programme ended". FOR UPDATE lives in the subquery because it cannot sit
  -- beside an aggregate.
  SELECT array_agg(t.id) INTO v_ids
  FROM (
    SELECT cc.id
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
            -- A School-of-Influence batch that has closed to new applicants is
            -- MID-PROGRAMME, not over: hard_deadline / closes_at is the INTAKE
            -- window — fn_soi_prepare_acceptance says so in as many words when it
            -- refuses to re-check it — and ending a coordinator's appointment the
            -- day applications close would take them off exactly when the batch
            -- needs running. Only a batch that never got going, still 'draft'
            -- with its window already past, is ended by the deadline.
            c.kind <> 'school_of_influence'
            OR c.status IN ('active', 'enrolling')
            OR COALESCE(c.hard_deadline, c.closes_at) IS NULL
            OR COALESCE(c.hard_deadline, c.closes_at) > now()
          )
      )
    FOR UPDATE
  ) t;

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
   WHERE cc.id = ANY (v_ids)
     AND cc.status = 'active';

  -- status = 'active' is re-asserted here as well as above: the count returned
  -- has to be what was actually ended, not what this run intended to end.
  WITH ended AS (
    UPDATE public.cohort_coordinators
       SET status = 'removed',
           removed_at = now(),
           removed_by = NULL,
           removal_reason = 'Programme ended',
           removal_evidence_field = 'cohorts.status',
           removal_evidence_value = 'no cohort of this programme is still running',
           removed_automatically = true
     WHERE id = ANY (v_ids)
       AND status = 'active'
    RETURNING id
  )
  SELECT count(*)::integer INTO v_closed FROM ended;

  RETURN v_closed;
END;
$fn$;


-- ─── §9 GRANTS — anon stays out ─────────────────────────────────────────────
-- CREATE OR REPLACE keeps the existing ACL, so for the eight replaced functions
-- these are assertions (checked live 2026-08-08: anon already held nothing on
-- any of them). For the three new ones they are the actual lock — Supabase's
-- ALTER DEFAULT PRIVILEGES grants EXECUTE on every new function to anon, which
-- is a grant separate from PUBLIC and survives a bare REVOKE FROM PUBLIC.
-- fn_is_cohort_coordinator is NOT redefined by this file, but §6 makes it the
-- linchpin of three live gates for the first time — until now nothing called it
-- at all. Re-asserting its lock here is a no-op against today's grants and means
-- the function that decides SoI access is locked in the same file that gives it
-- that job. (It also keeps the CI anon guard honest about the LIVE BASELINE
-- block above, which quotes its definition and which the guard's parser reads as
-- real DDL.)
REVOKE EXECUTE ON FUNCTION public.fn_is_cohort_coordinator(uuid)                      FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_is_cohort_coordinator(uuid)                      TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_is_cohort_programme_authority(text, uuid)        FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_can_appoint_cohort_coordinator(text, uuid)       FROM anon, PUBLIC;
-- `authenticated` is named explicitly here and nowhere else: this is the one
-- function no end-user session may call, and ALTER DEFAULT PRIVILEGES grants
-- EXECUTE to authenticated on every new function as a DIRECT grant — revoking
-- anon and PUBLIC leaves it in place. Rehearsal caught this holding.
REVOKE EXECUTE ON FUNCTION public.fn_cohort_coordinator_close_ended_programmes()      FROM anon, authenticated, PUBLIC;
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
-- Maintenance only. NOT granted to `authenticated`: it can mass-remove every
-- appointment in the system and no end-user session has a reason to call it.
GRANT EXECUTE ON FUNCTION public.fn_cohort_coordinator_close_ended_programmes()       TO service_role;

-- may_appoint_others is a privilege flag on a PostgREST-exposed table. Both
-- statements are no-ops against today's grants — `authenticated` holds SELECT
-- and nothing else on this table (see LIVE BASELINE) — and are written anyway so
-- that a later `GRANT INSERT/UPDATE` cannot hand out the right to appoint as a
-- side effect. INSERT is named as well as UPDATE: locking edits while leaving
-- column-level INSERT open would be a gap, not a guard.
REVOKE UPDATE (may_appoint_others) ON public.cohort_coordinators FROM anon, authenticated;
REVOKE INSERT (may_appoint_others) ON public.cohort_coordinators FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cohort_coordinator_appoint(uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cohort_coordinator_remove(uuid, text)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cohort_coordinators_overview()                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_soi_can_manage_batch(uuid)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_soi_can_review_applications(uuid)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_soi_has_programme_access(uuid)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_soi_prepare_acceptance(uuid, uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_soi_confirm_acceptance(uuid, uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_soi_reject_application(uuid, text)                TO authenticated;
