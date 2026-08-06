-- ============================================================================
-- COHORT SPINE — permission keys that unlock ONE programme, not all of them
-- Created: 2026-08-01  (Director decision, same date)
-- ============================================================================
-- WHAT THIS FIXES
--   PR #2740 creates a School of Influence Programme Coordinator by granting the
--   SHARED cohort spine keys — cohort.view / .create / .edit / .manage. Its own
--   header discloses the consequence honestly: those four keys are checked by RLS
--   on public.cohorts and public.cohort_memberships, and that RLS is NOT scoped
--   per programme kind. So the role also reaches sf100, foundations, cdc, trainer
--   and mba_associate cohorts inside the holder's institution scope.
--
--   The RPC layer was never the leak. fn_soi_can_manage_batch already returns
--   false for any cohort whose kind is not 'school_of_influence'. The leak is at
--   the BASE TABLE, where a coordinator can query and write cohort rows directly
--   through PostgREST without going near an SoI function. This file closes it at
--   that layer.
--
-- MEASURED LIVE 2026-08-01 (production, ref kvizhngldtiuufknvehv)
--   public.cohorts holds 5 rows: 3 school_of_influence, 1 mba_associate, 1 sf100.
--   So the leak is not hypothetical — a coordinator holding cohort.view today can
--   read two cohorts belonging to two other programmes.
--   16 roles carry a cohort.* key and EVERY ONE of them is stored false, which is
--   exactly as dead as absent: user_has_permission evaluates
--   (permissions->>key)::boolean = true. (`permissions ? 'key'` tests EXISTENCE,
--   not value — the reading that produced a false governance alarm here once.)
--   There is therefore no effective cohort.* holder in production right now, and
--   this file still proves the additive property structurally rather than leaning
--   on that fact, because it will not stay true.
--
-- THE SHAPE, AND WHY IT CANNOT NARROW ANYONE
--   Four new keys, one per spine action, carrying the programme in the key:
--     cohort.school_of_influence.view / .create / .edit / .manage
--   Ten NEW policies are added beside the spine's existing ones. Not one existing
--   policy is dropped, replaced or edited — grep this file for the eight spine
--   policy names and you will find them ONLY inside the proof harness.
--   PostgreSQL OR-combines permissive policies, so an additional permissive
--   policy can only ever ADMIT more rows; it is structurally incapable of hiding
--   a row an existing policy admits. That is the whole safety argument, and
--   section 4 proves the premise (the eight spine policies are byte-identical
--   before and after this file runs) instead of asserting it.
--
--   Rewriting the spine policies to say "broad key OR narrow key" would produce
--   the same runtime truth table and is the shape the brief sketched — but it
--   would mean re-issuing eight live policies from text, and re-issuing a live
--   object from anything but its current definition is how a money gate got
--   silently reverted on this project before. Adding policies touches none of it.
--
--   This is also the pattern the spine already uses for programme-scoped access:
--   cohorts_soi_member_select and cohort_memberships_soi_member_select
--   (20260808140000) are additive SoI-only policies sitting beside these same
--   broad ones today.
--
-- TO authenticated ON EVERY NEW POLICY
--   The eight spine policies are TO public, which includes anon. That is not a
--   live hole — user_has_permission returns false without a session — but new
--   policies should not re-inherit the looser shape, so anon is excluded
--   structurally here rather than by argument.
--
-- WHAT IS DELIBERATELY *NOT* WIDENED
--   public.fn_apply_cohort_adjustment_proposal reads user_has_permission
--   ('cohort.manage') directly and belongs to the cohort-adjustment module, not
--   to School of Influence. It is left exactly as it is, so a holder of the
--   narrow keys alone cannot reach it. Section 4 asserts that it stayed narrow —
--   a fix for one leak must not open another.
--   cohort_status_events UPDATE and DELETE stay admin-only. The audit trail is
--   append-only by design and a programme-scoped key is no reason to change that.
--
-- NOT APPLIED TO ANY DATABASE — this ships as a FILE; the Director applies it.
--   Fully idempotent. It carries no BEGIN;/COMMIT; of its own so that wrapping it
--   in BEGIN .. ROLLBACK stays a genuine dry run: an inner COMMIT turns a
--   rehearsal into a live apply.
--   It grants nothing to anybody. Defining a capability and handing it to a
--   person are separate decisions, and section 4 FAILS if any role is found
--   holding one of these keys at true when the file finishes.
-- ============================================================================


-- ── 0. Proof harness — snapshot the spine BEFORE any DDL in this file ────────
-- The claim this file has to earn is "every existing holder of cohort.* keeps
-- exactly the access they have now". The strongest available proof is not an
-- argument about permissive policies, it is a before/after byte comparison of the
-- eight policies that grant that access, taken inside this file's own execution.
-- Section 4 fails the migration if a single character moved.
--
-- Every reference is pg_temp-qualified, deliberately. An UNqualified
-- `DROP TABLE IF EXISTS soi_scope_spine_before` resolves through search_path and
-- would happily drop a real table of that name in public; pg_temp cannot. The
-- qualified form is also safe when no temp schema exists yet — verified against
-- production 2026-08-01, it simply finds nothing.
DROP TABLE IF EXISTS pg_temp.soi_scope_spine_before;

CREATE TEMP TABLE soi_scope_spine_before AS
SELECT
  tablename,
  policyname,
  cmd,
  roles::text                AS roles,
  COALESCE(qual, '')         AS qual,
  COALESCE(with_check, '')   AS with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname IN (
    'cohorts_select_permission',
    'cohorts_insert_permission',
    'cohorts_update_permission',
    'cohorts_delete_permission',
    'cohort_memberships_select_permission',
    'cohort_memberships_insert_permission',
    'cohort_memberships_update_permission',
    'cohort_memberships_delete_permission'
  );


-- ── 0b. Prerequisites, probed the catalog-safe way (fail CLOSED) ─────────────
-- Section 3 replaces two SECURITY DEFINER functions. If the S6 migration has not
-- been applied yet, CREATE OR REPLACE would happily create them from scratch and
-- quietly discard whatever S6 intended — so stop with a sentence a human can act
-- on instead. Probed through pg_proc BY NAME: has_function_privilege() and a
-- ::regprocedure cast both RAISE when the object is absent, which would turn this
-- friendly guard into the very error it exists to explain.
DO $$
DECLARE
  v_spine integer;
  v_fn    integer;
BEGIN
  SELECT count(*) INTO v_spine FROM pg_temp.soi_scope_spine_before;
  IF v_spine <> 8 THEN
    RAISE EXCEPTION
      'ABORT: expected the cohort spine''s 8 permission policies, found %. Apply '
      '20260731040000_cohort_core_spine.sql before this file — the programme-scoped '
      'policies below are meant to sit BESIDE those eight, not to replace them.',
      v_spine;
  END IF;

  SELECT count(*) INTO v_fn
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('fn_soi_can_manage_batch', 'fn_soi_can_review_applications');

  IF v_fn < 2 THEN
    RAISE EXCEPTION
      'ABORT: expected fn_soi_can_manage_batch and fn_soi_can_review_applications '
      'to exist, found % of 2. Apply 20260808145000_soi_attendance_completion.sql '
      'and 20260808140000_soi_access_gate_and_roster_privacy.sql first — section 3 '
      'widens those functions and must not create them from nothing.', v_fn;
  END IF;
END $$;


-- ── 1. cohorts — the programme-scoped path ───────────────────────────────────
-- kind is NOT NULL text on this table, so `kind = 'school_of_influence'` is a
-- total test: there is no null row that slips past it.
--
-- Institution scoping is carried over unchanged from the broad policies. A
-- programme-scoped key is about WHICH PROGRAMME, not about which college; the
-- holder still sees only their own institution plus any explicit
-- user_institution_access grant.

DROP POLICY IF EXISTS cohorts_soi_scoped_select ON public.cohorts;
CREATE POLICY cohorts_soi_scoped_select ON public.cohorts
  FOR SELECT TO authenticated
  USING (
    kind = 'school_of_influence'
    AND (SELECT public.user_has_permission('cohort.school_of_influence.view'::text))
    AND (SELECT public.role_has_institution_access(cohorts.institution_id))
  );

DROP POLICY IF EXISTS cohorts_soi_scoped_insert ON public.cohorts;
CREATE POLICY cohorts_soi_scoped_insert ON public.cohorts
  FOR INSERT TO authenticated
  WITH CHECK (
    kind = 'school_of_influence'
    AND (SELECT public.user_has_permission('cohort.school_of_influence.create'::text))
    AND (SELECT public.role_has_institution_access(cohorts.institution_id))
  );

-- USING and WITH CHECK are BOTH written out, and both demand
-- kind = 'school_of_influence'.
--   USING alone would let a holder pick up an SoI batch and re-label its kind as
--   'sf100' — landing a row in another programme's namespace through the back
--   door, which is precisely the leak this file exists to close.
--   Repeating role_has_institution_access on the new row likewise stops a batch
--   being pushed into an institution the holder cannot reach.
-- (PostgreSQL would default WITH CHECK to the USING expression here, so this is
--  belt-and-braces rather than a fix — but the guarantee is load-bearing enough
--  to state in the policy instead of relying on a default.)
DROP POLICY IF EXISTS cohorts_soi_scoped_update ON public.cohorts;
CREATE POLICY cohorts_soi_scoped_update ON public.cohorts
  FOR UPDATE TO authenticated
  USING (
    kind = 'school_of_influence'
    AND (SELECT public.user_has_permission('cohort.school_of_influence.edit'::text))
    AND (SELECT public.role_has_institution_access(cohorts.institution_id))
  )
  WITH CHECK (
    kind = 'school_of_influence'
    AND (SELECT public.user_has_permission('cohort.school_of_influence.edit'::text))
    AND (SELECT public.role_has_institution_access(cohorts.institution_id))
  );

DROP POLICY IF EXISTS cohorts_soi_scoped_delete ON public.cohorts;
CREATE POLICY cohorts_soi_scoped_delete ON public.cohorts
  FOR DELETE TO authenticated
  USING (
    kind = 'school_of_influence'
    AND (SELECT public.user_has_permission('cohort.school_of_influence.manage'::text))
    AND (SELECT public.role_has_institution_access(cohorts.institution_id))
  );


-- ── 2. cohort_memberships and cohort_status_events — scope through the parent ─
-- The kind test rides along inside the same EXISTS the broad policies already use
-- to reach the parent cohort, so the shape stays recognisable next to its
-- neighbour and no new helper function is introduced.
--
-- ONE PROPERTY WORTH STATING because it is easy to trip over, and it is inherited
-- from the broad policies rather than invented here: that EXISTS reads
-- public.cohorts, so it is itself subject to cohorts' RLS. A holder given
-- cohort.school_of_influence.create WITHOUT .view cannot see the parent batch, so
-- the EXISTS finds nothing and the INSERT is refused. The .view key is therefore
-- load-bearing on every write path, exactly as cohort.view is on the broad one.
-- That matters most on the ACCEPT path: CohortService.createMembership does
-- .insert().select().single(), so without the read-back right the row lands, the
-- read returns nothing, .single() throws, and the result is an orphan membership
-- with the application still showing 'pending'. Grant the four together.

DROP POLICY IF EXISTS cohort_memberships_soi_scoped_select ON public.cohort_memberships;
CREATE POLICY cohort_memberships_soi_scoped_select ON public.cohort_memberships
  FOR SELECT TO authenticated
  USING (
    (SELECT public.user_has_permission('cohort.school_of_influence.view'::text))
    AND EXISTS (
      SELECT 1 FROM public.cohorts c
      WHERE c.id = cohort_memberships.cohort_id
        AND c.kind = 'school_of_influence'
        AND public.role_has_institution_access(c.institution_id)
    )
  );

DROP POLICY IF EXISTS cohort_memberships_soi_scoped_insert ON public.cohort_memberships;
CREATE POLICY cohort_memberships_soi_scoped_insert ON public.cohort_memberships
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.user_has_permission('cohort.school_of_influence.create'::text))
    AND EXISTS (
      SELECT 1 FROM public.cohorts c
      WHERE c.id = cohort_memberships.cohort_id
        AND c.kind = 'school_of_influence'
        AND public.role_has_institution_access(c.institution_id)
    )
  );

-- Both halves spelled out again, and this one is stricter than its broad
-- neighbour on purpose: the broad UPDATE policy lets a membership be re-pointed
-- at any cohort in scope, including another programme's. Requiring the parent to
-- be School of Influence in WITH CHECK as well means a transfer under the narrow
-- key can only ever land inside this programme.
DROP POLICY IF EXISTS cohort_memberships_soi_scoped_update ON public.cohort_memberships;
CREATE POLICY cohort_memberships_soi_scoped_update ON public.cohort_memberships
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.user_has_permission('cohort.school_of_influence.edit'::text))
    AND EXISTS (
      SELECT 1 FROM public.cohorts c
      WHERE c.id = cohort_memberships.cohort_id
        AND c.kind = 'school_of_influence'
        AND public.role_has_institution_access(c.institution_id)
    )
  )
  WITH CHECK (
    (SELECT public.user_has_permission('cohort.school_of_influence.edit'::text))
    AND EXISTS (
      SELECT 1 FROM public.cohorts c
      WHERE c.id = cohort_memberships.cohort_id
        AND c.kind = 'school_of_influence'
        AND public.role_has_institution_access(c.institution_id)
    )
  );

DROP POLICY IF EXISTS cohort_memberships_soi_scoped_delete ON public.cohort_memberships;
CREATE POLICY cohort_memberships_soi_scoped_delete ON public.cohort_memberships
  FOR DELETE TO authenticated
  USING (
    (SELECT public.user_has_permission('cohort.school_of_influence.manage'::text))
    AND EXISTS (
      SELECT 1 FROM public.cohorts c
      WHERE c.id = cohort_memberships.cohort_id
        AND c.kind = 'school_of_influence'
        AND public.role_has_institution_access(c.institution_id)
    )
  );

-- cohort_status_events — an audit row is written on EVERY membership transition,
-- so without the INSERT right the transition itself fails, not merely its history.
-- The event targets a cohort directly or through its membership; both routes are
-- tested, both are pinned to this programme's kind. UPDATE and DELETE are left
-- admin-only, unchanged.
DROP POLICY IF EXISTS cohort_status_events_soi_scoped_select ON public.cohort_status_events;
CREATE POLICY cohort_status_events_soi_scoped_select ON public.cohort_status_events
  FOR SELECT TO authenticated
  USING (
    (SELECT public.user_has_permission('cohort.school_of_influence.view'::text))
    AND EXISTS (
      SELECT 1 FROM public.cohorts c
      WHERE (
              c.id = cohort_status_events.cohort_id
              OR c.id = (
                SELECT m.cohort_id FROM public.cohort_memberships m
                WHERE m.id = cohort_status_events.membership_id
              )
            )
        AND c.kind = 'school_of_influence'
        AND public.role_has_institution_access(c.institution_id)
    )
  );

DROP POLICY IF EXISTS cohort_status_events_soi_scoped_insert ON public.cohort_status_events;
CREATE POLICY cohort_status_events_soi_scoped_insert ON public.cohort_status_events
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.user_has_permission('cohort.school_of_influence.edit'::text))
    AND EXISTS (
      SELECT 1 FROM public.cohorts c
      WHERE (
              c.id = cohort_status_events.cohort_id
              OR c.id = (
                SELECT m.cohort_id FROM public.cohort_memberships m
                WHERE m.id = cohort_status_events.membership_id
              )
            )
        AND c.kind = 'school_of_influence'
        AND public.role_has_institution_access(c.institution_id)
    )
  );


-- ── 3. The two RPC gates — teach them the narrow key as well ─────────────────
-- Every School of Influence RPC funnels through one of these two. Without this
-- section a coordinator holding only the narrow keys could read and write the
-- base tables but every RPC — create session, list sessions, session roster, mark
-- attendance, batch completion, the whole application review queue — would refuse
-- them, which is a worse outcome than the leak.
--
-- BOTH BODIES BELOW WERE TAKEN FROM LIVE pg_proc.prosrc ON 2026-08-01, not from a
-- repo file. Re-issuing a SECURITY DEFINER function from stale text is how a money
-- gate got silently reverted on this project. The ONLY edit in each is the
-- permission test, which becomes "broad key OR narrow key". Everything else —
-- comments, guard order, COALESCE discipline, the archived_at and source_event_id
-- logic — is reproduced verbatim.
--
-- WIDENING THESE IS SAFE PRECISELY BECAUSE THEY ARE ALREADY HARD-SCOPED:
-- fn_soi_can_manage_batch returns false for any cohort whose kind is not
-- 'school_of_influence', and fn_soi_can_review_applications answers only for
-- events that have a School of Influence batch pointing at them. Neither can
-- speak about another programme no matter which key gets it through the door.
--
-- The broad key is listed FIRST in each test so the existing path is evaluated
-- first and short-circuits — a holder of cohort.manage reaches the same answer
-- through the same branch, with one extra call only in the case where they would
-- have been refused anyway.

CREATE OR REPLACE FUNCTION public.fn_soi_can_manage_batch(p_cohort_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
  RETURN COALESCE(public.is_super_admin(), false)
      OR COALESCE(public.is_admin(), false)
      OR ((COALESCE(public.user_has_permission('cohort.manage'), false)
           OR COALESCE(public.user_has_permission('cohort.school_of_influence.manage'), false))
          AND COALESCE(public.role_has_institution_access(v_inst), false));
END;
$$;

COMMENT ON FUNCTION public.fn_soi_can_manage_batch(uuid) IS
  'School of Influence S6: may the signed-in caller run this batch? '
  'cohort.manage OR cohort.school_of_influence.manage, scoped to the batch '
  'institution; super admin / admin first. '
  'Returns false for any cohort that is not kind=school_of_influence.';

-- Re-asserted on every replace. Supabase's ALTER DEFAULT PRIVILEGES hands anon a
-- direct EXECUTE grant on every new function, separate from PUBLIC, so revoking
-- PUBLIC alone would leave the function callable with the anon key that ships in
-- every browser bundle. Writing no GRANT is not the same as denying one.
REVOKE EXECUTE ON FUNCTION public.fn_soi_can_manage_batch(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_soi_can_manage_batch(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.fn_soi_can_review_applications(p_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

COMMENT ON FUNCTION public.fn_soi_can_review_applications(uuid) IS
  'School of Influence S5: may the signed-in caller review applications for this '
  'event? Requires a School of Influence batch pointing at the event, plus '
  'cohort.manage OR cohort.school_of_influence.manage with institution access to '
  'one of those batches; super admin / admin first.';

REVOKE EXECUTE ON FUNCTION public.fn_soi_can_review_applications(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_soi_can_review_applications(uuid) TO authenticated;


-- ── 4. Apply-time assert on the END STATE ────────────────────────────────────
-- Everything below inspects the database AFTER this file ran, and RAISEs rather
-- than NOTICEs, so a partial apply cannot pass for a good one.
DO $$
DECLARE
  v_new_policies integer;
  v_missing      text;
  v_drift        integer;
  v_drift_detail text;
  v_spine        integer;
  v_broad_ok     integer;
  v_granted      text;
  v_manage_src   text;
  v_review_src   text;
  v_adjust_src   text;
  v_leaky        text;
BEGIN
  -- (a) all ten programme-scoped policies exist, and any that do not are named
  SELECT count(*) INTO v_new_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname IN (
      'cohorts_soi_scoped_select',
      'cohorts_soi_scoped_insert',
      'cohorts_soi_scoped_update',
      'cohorts_soi_scoped_delete',
      'cohort_memberships_soi_scoped_select',
      'cohort_memberships_soi_scoped_insert',
      'cohort_memberships_soi_scoped_update',
      'cohort_memberships_soi_scoped_delete',
      'cohort_status_events_soi_scoped_select',
      'cohort_status_events_soi_scoped_insert'
    );

  IF v_new_policies <> 10 THEN
    SELECT string_agg(want, ', ' ORDER BY want) INTO v_missing
    FROM unnest(ARRAY[
      'cohorts_soi_scoped_select',
      'cohorts_soi_scoped_insert',
      'cohorts_soi_scoped_update',
      'cohorts_soi_scoped_delete',
      'cohort_memberships_soi_scoped_select',
      'cohort_memberships_soi_scoped_insert',
      'cohort_memberships_soi_scoped_update',
      'cohort_memberships_soi_scoped_delete',
      'cohort_status_events_soi_scoped_select',
      'cohort_status_events_soi_scoped_insert'
    ]) AS want
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND policyname = want
    );

    RAISE EXCEPTION
      'ABORT: expected 10 programme-scoped policies, found %. Missing: %.',
      v_new_policies, COALESCE(v_missing, '<none — a name collided instead>');
  END IF;

  -- (b) THE CENTRAL PROOF. The eight spine policies that carry the broad cohort.*
  --     keys must be byte-for-byte what they were when this file started: same
  --     command, same roles, same USING, same WITH CHECK. If that holds, every
  --     existing holder of cohort.* evaluates the identical expression they
  --     evaluated before, so their access cannot have changed — and because the
  --     ten policies added above are PERMISSIVE, they can only ever admit extra
  --     rows on top, never withdraw one.
  SELECT count(*) INTO v_drift
  FROM pg_temp.soi_scope_spine_before b
  FULL OUTER JOIN (
    SELECT
      tablename,
      policyname,
      cmd,
      roles::text              AS roles,
      COALESCE(qual, '')       AS qual,
      COALESCE(with_check, '') AS with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname IN (
        'cohorts_select_permission',
        'cohorts_insert_permission',
        'cohorts_update_permission',
        'cohorts_delete_permission',
        'cohort_memberships_select_permission',
        'cohort_memberships_insert_permission',
        'cohort_memberships_update_permission',
        'cohort_memberships_delete_permission'
      )
  ) a ON a.policyname = b.policyname
  WHERE b.policyname IS NULL
     OR a.policyname IS NULL
     OR a.tablename  IS DISTINCT FROM b.tablename
     OR a.cmd        IS DISTINCT FROM b.cmd
     OR a.roles      IS DISTINCT FROM b.roles
     OR a.qual       IS DISTINCT FROM b.qual
     OR a.with_check IS DISTINCT FROM b.with_check;

  IF v_drift <> 0 THEN
    SELECT string_agg(COALESCE(a.policyname, b.policyname), ', ') INTO v_drift_detail
    FROM pg_temp.soi_scope_spine_before b
    FULL OUTER JOIN (
      SELECT policyname, cmd, roles::text AS roles,
             COALESCE(qual,'') AS qual, COALESCE(with_check,'') AS with_check
      FROM pg_policies
      WHERE schemaname = 'public'
        AND policyname IN (
          'cohorts_select_permission','cohorts_insert_permission',
          'cohorts_update_permission','cohorts_delete_permission',
          'cohort_memberships_select_permission','cohort_memberships_insert_permission',
          'cohort_memberships_update_permission','cohort_memberships_delete_permission'
        )
    ) a ON a.policyname = b.policyname
    WHERE b.policyname IS NULL OR a.policyname IS NULL
       OR a.cmd IS DISTINCT FROM b.cmd OR a.roles IS DISTINCT FROM b.roles
       OR a.qual IS DISTINCT FROM b.qual OR a.with_check IS DISTINCT FROM b.with_check;

    RAISE EXCEPTION
      'ABORT: % spine policy/policies changed while this file ran (%). This file is '
      'meant to be purely additive — existing holders of cohort.* must keep exactly '
      'the access they had. Something in it is editing the spine; remove that before '
      'applying.', v_drift, COALESCE(v_drift_detail, '<unnamed>');
  END IF;

  -- (c) belt-and-braces on (b): the eight are still present and each still names
  --     the broad key it is supposed to check. (b) proves nothing moved during
  --     this run; (c) proves the end state is actually the working one, which is
  --     what a reader of the log wants to see stated.
  SELECT count(*) INTO v_spine
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname IN (
      'cohorts_select_permission','cohorts_insert_permission',
      'cohorts_update_permission','cohorts_delete_permission',
      'cohort_memberships_select_permission','cohort_memberships_insert_permission',
      'cohort_memberships_update_permission','cohort_memberships_delete_permission'
    );

  IF v_spine <> 8 THEN
    RAISE EXCEPTION 'ABORT: expected the spine''s 8 policies intact, found %.', v_spine;
  END IF;

  SELECT count(*) INTO v_broad_ok
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      (policyname IN ('cohorts_select_permission','cohort_memberships_select_permission')
        AND qual LIKE '%cohort.view%')
      OR (policyname IN ('cohorts_insert_permission','cohort_memberships_insert_permission')
        AND with_check LIKE '%cohort.create%')
      OR (policyname IN ('cohorts_update_permission','cohort_memberships_update_permission')
        AND qual LIKE '%cohort.edit%')
      OR (policyname IN ('cohorts_delete_permission','cohort_memberships_delete_permission')
        AND qual LIKE '%cohort.manage%')
    );

  IF v_broad_ok <> 8 THEN
    RAISE EXCEPTION
      'ABORT: only % of the 8 spine policies still test their broad cohort.* key. '
      'An existing holder would silently lose access.', v_broad_ok;
  END IF;

  -- (d) both widened gates still admit the BROAD key. If a replace above dropped
  --     it, every current cohort.manage path into School of Influence would break
  --     at once — the opposite of additive.
  SELECT p.prosrc INTO v_manage_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_soi_can_manage_batch';

  SELECT p.prosrc INTO v_review_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_soi_can_review_applications';

  IF v_manage_src IS NULL OR v_manage_src NOT LIKE '%''cohort.manage''%'
     OR v_manage_src NOT LIKE '%''cohort.school_of_influence.manage''%'
     OR v_manage_src NOT LIKE '%school_of_influence''%' THEN
    RAISE EXCEPTION
      'ABORT: fn_soi_can_manage_batch must accept BOTH cohort.manage and '
      'cohort.school_of_influence.manage, and must still refuse any cohort whose '
      'kind is not school_of_influence.';
  END IF;

  IF v_review_src IS NULL OR v_review_src NOT LIKE '%''cohort.manage''%'
     OR v_review_src NOT LIKE '%''cohort.school_of_influence.manage''%' THEN
    RAISE EXCEPTION
      'ABORT: fn_soi_can_review_applications must accept BOTH cohort.manage and '
      'cohort.school_of_influence.manage.';
  END IF;

  -- (e) neither gate is reachable without a session. Checked by VALUE against
  --     pg_proc.proacl, not by "we wrote no GRANT" — Supabase's default
  --     privileges hand anon EXECUTE on new functions all by themselves.
  --
  --     Read through aclexplode rather than has_function_privilege: there is no
  --     role literally named 'public' (PUBLIC is the pseudo-grantee oid 0), so
  --     has_function_privilege('public', ...) RAISES instead of answering, and
  --     has_function_privilege('anon', ...) RAISES on any database where that
  --     role happens not to exist. aclexplode answers both from the catalog and
  --     cannot throw.
  --
  --     A NULL proacl is treated as LEAKY, not as clean: for functions, no ACL
  --     entry means the built-in default is in force, and that default grants
  --     EXECUTE to PUBLIC. "No GRANT recorded" is the leak, not the absence of one.
  SELECT string_agg(p.proname, ', ') INTO v_leaky
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('fn_soi_can_manage_batch', 'fn_soi_can_review_applications')
    AND (
      p.proacl IS NULL
      OR EXISTS (
        SELECT 1
        FROM aclexplode(p.proacl) ae
        LEFT JOIN pg_roles r ON r.oid = ae.grantee
        WHERE ae.privilege_type = 'EXECUTE'
          AND (ae.grantee = 0 OR r.rolname = 'anon')
      )
    );

  IF v_leaky IS NOT NULL THEN
    RAISE EXCEPTION
      'ABORT: % still EXECUTE-able by anon or PUBLIC. The anon key ships in every '
      'browser bundle.', v_leaky;
  END IF;

  -- (f) the fix did not leak sideways. fn_apply_cohort_adjustment_proposal reads
  --     cohort.manage directly and belongs to a DIFFERENT module; a holder of the
  --     narrow keys alone must not reach it.
  SELECT p.prosrc INTO v_adjust_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_apply_cohort_adjustment_proposal';

  IF v_adjust_src IS NOT NULL AND v_adjust_src LIKE '%cohort.school_of_influence.%' THEN
    RAISE EXCEPTION
      'ABORT: fn_apply_cohort_adjustment_proposal now accepts a School of Influence '
      'key. That function belongs to the cohort-adjustment module and must stay '
      'closed to programme-scoped holders.';
  END IF;

  -- (g) nobody has been given these keys. Defining a capability and handing it to
  --     a person are separate decisions. Read BY VALUE, byte for byte the
  --     expression user_has_permission itself runs — `permissions ? key` would
  --     test only existence, the reading that produced a false governance alarm
  --     here before.
  SELECT string_agg(role_key, ', ' ORDER BY role_key) INTO v_granted
  FROM public.custom_roles
  WHERE COALESCE((permissions ->> 'cohort.school_of_influence.view')::boolean, false)
     OR COALESCE((permissions ->> 'cohort.school_of_influence.create')::boolean, false)
     OR COALESCE((permissions ->> 'cohort.school_of_influence.edit')::boolean, false)
     OR COALESCE((permissions ->> 'cohort.school_of_influence.manage')::boolean, false);

  IF v_granted IS NOT NULL THEN
    RAISE EXCEPTION
      'ABORT: role(s) % already hold a programme-scoped key at TRUE. This migration '
      'defines the keys and must not grant them to anybody — assignment is a '
      'separate, Director-owned decision made in Role Management.', v_granted;
  END IF;

  RAISE NOTICE
    'cohort.school_of_influence.{view,create,edit,manage} defined: 10 programme-scoped '
    'policies added, 2 School of Influence gates widened, 8 spine policies byte-identical, '
    '0 roles granted.';
END $$;

DROP TABLE IF EXISTS pg_temp.soi_scope_spine_before;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- WHAT PR #2740 SHOULD CHANGE ONCE THIS IS APPLIED
--   In 20260808210000_soi_programme_coordinator_role.sql, swap the four broad
--   keys in the soi_programme_coordinator permissions object:
--       cohort.view    → cohort.school_of_influence.view
--       cohort.create  → cohort.school_of_influence.create
--       cohort.edit    → cohort.school_of_influence.edit
--       cohort.manage  → cohort.school_of_influence.manage
--   Keep startup_studio.school_of_influence.configure exactly as it is: that key
--   was already programme-scoped, and #2740's platform_policies policies pin it
--   to policy_key LIKE 'soi.%' with fn_soi_can_manage_batch on the target batch.
--   The coordinator then keeps every power the Director chose and loses only the
--   reach into sf100, foundations, cdc, trainer and mba_associate cohorts.
--
--   ONE CODE FOLLOW-UP, owned by whoever owns that file, not by this one:
--   lib/services/school-of-influence/batch-service.ts sets
--   SOI_TRANSFER_PERMISSION = 'cohort.manage' as a client-side pre-check so a
--   refusal reads as a sentence instead of an RLS zero-row silence (rule 27).
--   With the narrow key alone that check refuses a coordinator who the database
--   would in fact allow. It needs to accept either key. Nothing is unsafe in the
--   meantime — the database is the floor and it is now correct — but the message
--   would be wrong, so it should not be left long.
--
--   Five SoI RPCs also print '...it needs the "cohort.manage" permission for this
--   institution.' in their refusal text. Still true, now incomplete. Worth
--   updating when one of them is next edited; not worth re-issuing five live
--   SECURITY DEFINER functions for a sentence.
-- ============================================================================
