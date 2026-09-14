-- ============================================================================
-- Delegated metric ownership, and a trail that records every hand-over.
--
-- Date: 2026-09-08
-- Director decisions, 2026-09-08 (settled; this migration implements them):
--   1. ASSIGNMENT IS OWNERSHIP. There is no Accept step.
--   2. A BODY OWNER — a row in accreditation_metric_owners whose metric_code
--      IS NULL — may assign METRIC owners inside their own body + institution.
--   3. DELEGATION DOES NOT DISCHARGE. When a body owner delegates a metric the
--      metric owner does the work and the body owner is still answerable, so
--      BOTH keep receiving reminders. Nothing here removes the body-level row.
--   4. A body owner MAY override an assignment somebody else made, inside
--      their own body.
--
-- WHY A SECOND TABLE
-- ------------------
-- 20260809100000 §5 deliberately kept history ONE HOP DEEP on the ownership row
-- itself (previous_owner_user_id + owner_changed_at) and wrote, verbatim: "A
-- full audit trail would be a second table, and one hop answers the question
-- actually being asked." Decision 2 changes the question. Once a body owner can
-- delegate — and decision 4 lets a different body owner override that — the
-- question becomes "who handed this to whom, and who was entitled to", which one
-- hop cannot answer: the second hand-over overwrites the first. This is that
-- second table. The one-hop columns are KEPT and kept correct; they are what the
-- owners page renders today and this migration does not touch that page.
--
-- APPEND-ONLY, AND WHY IT NEEDS TWO LOCKS
-- ---------------------------------------
-- Supabase ships ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon,
-- authenticated, service_role. A new table in schema public is therefore born
-- UPDATE-able and DELETE-able by the anon key that ships inside every page of
-- https://www.jkkn.ai. RLS alone is not the answer either: an audit trail whose
-- immutability rests on "we forgot to write an UPDATE policy" is one policy away
-- from being editable. So both doors are shut explicitly — the table grants and
-- the policy set — and service_role (which carries BYPASSRLS) remains the only
-- thing that can correct a row.
-- ============================================================================

-- ── 1) The trail ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.accreditation_ownership_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Nullable, and ON DELETE SET NULL rather than CASCADE: deleting the
  -- ownership row must LEAVE the record of it having existed. A trail that
  -- disappears with the thing it describes is not a trail.
  owner_row_id        uuid NULL
                        REFERENCES public.accreditation_metric_owners(id)
                        ON DELETE SET NULL,

  institution_id      uuid NOT NULL,
  body_code           text NOT NULL,
  metric_code         text NULL,          -- NULL = the event concerns the whole body

  action              text NOT NULL,
  from_user_id        uuid NULL,          -- who held it immediately before (NULL = nobody did)
  to_user_id          uuid NULL,          -- who holds it after (NULL for 'cleared')
  actor_user_id       uuid NOT NULL,      -- who DID it
  actor_is_body_owner boolean NOT NULL DEFAULT false,
  note                text NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT accreditation_ownership_events_action_check
    CHECK (action IN ('assigned', 'reassigned', 'cleared', 'declined', 'seen'))
);

COMMENT ON TABLE public.accreditation_ownership_events IS
  'Append-only record of every accreditation ownership hand-over. INSERT only: '
  'no UPDATE or DELETE policy exists and both are revoked at table level, so '
  'service_role (BYPASSRLS) is the only thing that can correct a row. '
  'Director decisions 2-4, 2026-09-08.';

COMMENT ON COLUMN public.accreditation_ownership_events.actor_is_body_owner IS
  'true when the actor was entitled to this assignment BECAUSE they hold the '
  'body-level row (metric_code IS NULL) — the delegation power of decision 2 — '
  'rather than because they hold accreditation.naac.narrative.manage. An IQAC '
  'coordinator who also happens to own the body records false: they reached the '
  'assignment through the permission branch, which is checked first.';

COMMENT ON COLUMN public.accreditation_ownership_events.metric_code IS
  'NULL = the event concerns the whole body for this institution, mirroring '
  'accreditation_metric_owners.metric_code.';

COMMENT ON COLUMN public.accreditation_ownership_events.institution_id IS
  'Deliberately carries no foreign key. The trail must outlive the rows it '
  'describes; ON DELETE CASCADE would erase the history of a closed institution '
  'and ON DELETE SET NULL cannot apply to a NOT NULL column. Same reasoning for '
  'from_user_id / to_user_id / actor_user_id, which reference no profile.';

-- The two reads this table exists to answer: "what has happened in this body,
-- newest first" (the owners desk) and "what has been handed to me" (a person's
-- own history, which the SELECT policy below lets them see).
CREATE INDEX IF NOT EXISTS idx_accred_ownership_events_body
  ON public.accreditation_ownership_events (institution_id, body_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_accred_ownership_events_to_user
  ON public.accreditation_ownership_events (to_user_id, created_at DESC);

ALTER TABLE public.accreditation_ownership_events ENABLE ROW LEVEL SECURITY;

-- ── 2) Door one: table grants ───────────────────────────────────────────────
-- anon loses everything. authenticated keeps exactly SELECT and INSERT — the
-- UPDATE/DELETE/TRUNCATE it was handed by the Supabase default is taken back
-- here, so append-only survives someone later adding a permissive policy.
--
-- `authenticated` MUST be named in the REVOKE. Revoking from PUBLIC alone leaves
-- it holding everything, because ALTER DEFAULT PRIVILEGES grants it DIRECTLY —
-- the same separate-grant trap the CLAUDE.md anon rule describes for functions,
-- one level down. Written first as `FROM anon, PUBLIC`, and the assertion at the
-- foot of this file failed on it: authenticated could still UPDATE and DELETE
-- the audit trail. Revoke, then grant back the two verbs it needs.
REVOKE ALL ON TABLE public.accreditation_ownership_events
  FROM anon, authenticated, PUBLIC;
GRANT  SELECT, INSERT ON TABLE public.accreditation_ownership_events TO authenticated;
GRANT  ALL             ON TABLE public.accreditation_ownership_events TO service_role;

-- ── 3) Door two: policies ───────────────────────────────────────────────────
-- SELECT: IQAC (or a super admin) sees their institutions' trail; everybody
-- else sees the rows they are personally named in — the person who handed it
-- over, the person who received it, and the person who acted.
DROP POLICY IF EXISTS accred_ownership_events_select ON public.accreditation_ownership_events;
CREATE POLICY accred_ownership_events_select ON public.accreditation_ownership_events
  FOR SELECT USING (
    (SELECT is_super_admin())
    OR ((SELECT user_has_permission('accreditation.naac.narrative.manage'))
        AND role_has_institution_access(institution_id))
    OR (SELECT auth.uid()) = from_user_id
    OR (SELECT auth.uid()) = to_user_id
    OR (SELECT auth.uid()) = actor_user_id
  );

-- INSERT: you may record what YOU did, and nothing else. Without the
-- actor_user_id test any signed-in account could forge a row attributing an
-- assignment to somebody else, which would make the trail worth less than no
-- trail. fn_accreditation_assign_metric_owner below is SECURITY DEFINER and
-- writes past RLS; this policy governs the direct client writes the later
-- 'seen' and 'declined' events need.
DROP POLICY IF EXISTS accred_ownership_events_insert ON public.accreditation_ownership_events;
CREATE POLICY accred_ownership_events_insert ON public.accreditation_ownership_events
  FOR INSERT WITH CHECK (
    actor_user_id = (SELECT auth.uid())
  );

-- No UPDATE policy and no DELETE policy, on purpose. Their absence is the
-- append-only guarantee; the revokes above are the second lock on the same door.

-- ── 4) Assigning a metric owner ─────────────────────────────────────────────
-- The caller is taken from the session and never from an argument: a SECURITY
-- DEFINER function that accepts the user it should act as is an IDOR.
CREATE OR REPLACE FUNCTION public.fn_accreditation_assign_metric_owner(
  p_institution_id uuid,
  p_body_code      text,
  p_metric_code    text,
  p_to_user_id     uuid,
  p_note           text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller          uuid := auth.uid();
  v_by_permission   boolean := false;
  v_is_body_owner   boolean := false;
  v_row_id          uuid;
  v_previous_owner  uuid;
  v_action          text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;

  -- This function assigns METRIC owners. A body-level row is created by IQAC
  -- through the owners page, not delegated by a body owner to themselves.
  IF p_metric_code IS NULL OR btrim(p_metric_code) = '' THEN
    RAISE EXCEPTION 'a metric code is required: this assigns metric owners, not body owners'
      USING ERRCODE = '22023';
  END IF;

  IF p_body_code IS NULL OR btrim(p_body_code) = '' THEN
    RAISE EXCEPTION 'a body code is required' USING ERRCODE = '22023';
  END IF;

  IF p_institution_id IS NULL OR p_to_user_id IS NULL THEN
    RAISE EXCEPTION 'an institution and a person to own it are both required'
      USING ERRCODE = '22023';
  END IF;

  -- (b) first branch: IQAC, or a super admin.
  v_by_permission :=
    is_super_admin()
    OR (user_has_permission('accreditation.naac.narrative.manage')
        AND role_has_institution_access(p_institution_id));

  -- (b) second branch: the caller holds the body-level row for THIS body and
  -- THIS institution. A declined body assignment confers nothing — somebody who
  -- has refused the accountability cannot hand pieces of it out.
  IF NOT v_by_permission THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.accreditation_metric_owners o
       WHERE o.owner_user_id     = v_caller
         AND o.institution_id    = p_institution_id
         AND o.body_code         = p_body_code
         AND o.metric_code       IS NULL
         AND o.assignment_status <> 'declined'
    ) INTO v_is_body_owner;
  END IF;

  IF NOT (v_by_permission OR v_is_body_owner) THEN
    -- Says nothing about whether the body or the metric exists. A caller who
    -- may not assign here has no business learning what is here.
    RAISE EXCEPTION 'only the body owner or IQAC may assign within this body'
      USING ERRCODE = '42501';
  END IF;

  -- Scope: institution-level ownership (programme_id IS NULL). The uniqueness
  -- key added by 20260809100000 §3 is
  -- (institution_id, body_code, metric_code, programme_id) NULLS NOT DISTINCT,
  -- so an NBA programme slice is a DIFFERENT row and is not touched here.
  SELECT o.id, o.owner_user_id
    INTO v_row_id, v_previous_owner
    FROM public.accreditation_metric_owners o
   WHERE o.institution_id = p_institution_id
     AND o.body_code      = p_body_code
     AND o.metric_code    = p_metric_code
     AND o.programme_id   IS NULL
   FOR UPDATE;

  IF v_row_id IS NULL THEN
    v_action := 'assigned';
    INSERT INTO public.accreditation_metric_owners
      (institution_id, body_code, metric_code, owner_user_id, created_by)
    VALUES
      (p_institution_id, p_body_code, p_metric_code, p_to_user_id, v_caller)
    RETURNING id INTO v_row_id;

  ELSIF v_previous_owner IS DISTINCT FROM p_to_user_id THEN
    v_action := 'reassigned';
    -- assignment_status and acknowledged_* move together or the paired CHECK
    -- `(assignment_status = 'pending') = (acknowledged_at IS NULL)` added by
    -- 20260809100000 §5 rejects the row. The previous holder's acknowledgement
    -- is not the new holder's, so it is cleared rather than inherited.
    UPDATE public.accreditation_metric_owners o
       SET owner_user_id          = p_to_user_id,
           previous_owner_user_id = v_previous_owner,
           owner_changed_at       = now(),
           assignment_status      = 'pending',
           acknowledged_at        = NULL,
           acknowledged_by        = NULL
     WHERE o.id = v_row_id;

  ELSE
    -- Already theirs. The ownership row is left exactly as it is — re-affirming
    -- must not reset an acknowledgement — but the act is still recorded.
    v_action := 'assigned';
  END IF;

  INSERT INTO public.accreditation_ownership_events
    (owner_row_id, institution_id, body_code, metric_code, action,
     from_user_id, to_user_id, actor_user_id, actor_is_body_owner, note)
  VALUES
    (v_row_id, p_institution_id, p_body_code, p_metric_code, v_action,
     v_previous_owner, p_to_user_id, v_caller, v_is_body_owner, p_note);

  RETURN v_row_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_accreditation_assign_metric_owner(uuid, text, text, uuid, text)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_assign_metric_owner(uuid, text, text, uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.fn_accreditation_assign_metric_owner(uuid, text, text, uuid, text) IS
  'Assigns the owner of one metric and records the hand-over. Entitled callers: '
  'a super admin, a holder of accreditation.naac.narrative.manage with access to '
  'the institution, or the body owner of that body (decision 2). Delegating does '
  'not discharge the body owner (decision 3): the body-level row is untouched.';

-- ── 5) Backfill, so the trail is not empty on day one ───────────────────────
-- One 'assigned' event per ownership row that already exists, carrying only
-- what that row actually holds: created_by as the actor, created_at as the
-- moment. Nothing is inferred.
--
-- ROWS WITH created_by IS NULL ARE SKIPPED, and this is a real gap. actor_user_id
-- is NOT NULL because "who did it" is the entire point of the column, and the
-- only ways to backfill a row whose created_by was never recorded are to write
-- a person who may not have done it (an audit trail asserting a false actor is
-- worse than one with a hole) or to relax the column for everybody. Neither is
-- worth it for history that predates the trail. The gap is visible: any owner
-- row with no 'assigned' event is a row whose creator was never recorded.
INSERT INTO public.accreditation_ownership_events
  (owner_row_id, institution_id, body_code, metric_code, action,
   from_user_id, to_user_id, actor_user_id, actor_is_body_owner, note, created_at)
SELECT
  o.id,
  o.institution_id,
  o.body_code,
  o.metric_code,
  'assigned',
  NULL,
  o.owner_user_id,
  o.created_by,
  false,
  'Backfilled from the ownership row when the trail was created; the trail did not exist when this assignment was made.',
  o.created_at
FROM public.accreditation_metric_owners o
WHERE o.created_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
      FROM public.accreditation_ownership_events e
     WHERE e.owner_row_id = o.id
  );

-- ── 6) Assert, in this transaction, that both locks actually took ───────────
DO $$
BEGIN
  IF has_function_privilege('anon',
       'public.fn_accreditation_assign_metric_owner(uuid, text, text, uuid, text)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute fn_accreditation_assign_metric_owner';
  END IF;

  IF NOT has_function_privilege('authenticated',
       'public.fn_accreditation_assign_metric_owner(uuid, text, text, uuid, text)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute the function the owners page calls';
  END IF;

  IF has_table_privilege('anon', 'public.accreditation_ownership_events', 'SELECT')
     OR has_table_privilege('anon', 'public.accreditation_ownership_events', 'INSERT') THEN
    RAISE EXCEPTION 'anon still reaches accreditation_ownership_events';
  END IF;

  IF has_table_privilege('authenticated', 'public.accreditation_ownership_events', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.accreditation_ownership_events', 'DELETE') THEN
    RAISE EXCEPTION 'the ownership trail is not append-only: authenticated can still change it';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.accreditation_ownership_events', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated cannot append to the ownership trail';
  END IF;
END $$;
