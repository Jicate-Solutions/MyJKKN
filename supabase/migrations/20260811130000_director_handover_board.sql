-- ============================================================================
-- Director's Desk — the board. One read, one definition of "not green".
--
-- Date: 2026-08-05
-- Spec: specs/director-desk/SPEC.md (Director interview, 12 locked decisions)
-- Depends on: 20260811100000 (director_handovers, director_handover_audit)
--             20260811100200 (fn_director_handover_revoke / _progress)
--
-- WHY THIS FUNCTION EXISTS AT ALL
-- -------------------------------
-- Decision 12 names four things that stop an item being green:
--
--   1. past its due date and still open        -> chase
--   2. gone quiet (no activity in 7 days)      -> ask
--   3. never accepted (pending  > 48h)         -> reassign
--   4. owner gone (grantee no longer active)   -> reassign, urgently
--
-- Those four are read by TWO different consumers: this page, and the nightly
-- chase engine (PR 5). If each computed them for itself, the Director would be
-- looking at a board that says green while the chase engine is sending a nudge,
-- or vice versa — and there would be no way to tell which one was right.
--
-- So the rules live HERE, once, in SQL. The page renders what this returns; the
-- chase engine will chase what this returns. They cannot disagree, because
-- there is only one implementation to disagree with.
--
-- THE PRIMARY REASON vs. ALL REASONS
-- ----------------------------------
-- An item routinely breaks more than one rule at a time (an overdue item is
-- usually also quiet). The board must not collapse these into one "late"
-- bucket, because the Director's NEXT ACTION differs per rule — chasing someone
-- who has left the institution is wasted effort.
--
-- So two columns come back:
--   * not_green_reason  — the single most-urgent rule, which drives the row's
--                         label and colour, and which makes the top-of-page
--                         counts sum exactly to the not-green total.
--   * not_green_reasons — every rule that fired, so the row can show the rest
--                         without the counts double-counting.
--
-- Urgency order is the order in which the Director's action changes:
--   owner_gone  (no amount of chasing helps — there is nobody to chase)
--   overdue     (the promise is already broken)
--   never_accepted (nobody has even said yes yet)
--   quiet       (accepted, in date, but nothing is happening)
--
-- WHICH ROWS COUNT AS "ON THE DESK"
-- ---------------------------------
-- pending / accepted are the live ones. expired and orphaned are included on
-- purpose: those are the two statuses PR 5's nightly sweep writes, and if the
-- board dropped a row the moment it was swept, the reddest items on the desk
-- would silently disappear at midnight — exactly backwards. done, declined and
-- revoked are closed and are not shown.
--
-- `is_live` is returned separately and means what the spine means by it: the
-- receiver's door is still open. An overdue row is on the desk but not live.
--
-- WHY THE OWNER-GONE RULE READS is_active AND NOT is_login_disabled
-- ----------------------------------------------------------------
-- profiles carries BOTH is_active and is_login_disabled. The spine's access
-- check (fn_handover_grants_key) reads only is_active. This board therefore
-- reads only is_active as well. Flagging a login-disabled person as "owner
-- gone" here would put a red row on the desk for someone whose access is in
-- fact still open — the board and the access engine would be telling the
-- Director two different things. If is_login_disabled should also cut access,
-- that belongs in the spine's predicate, not in a second opinion here.
-- ============================================================================

-- ============================================================================
-- THE BOARD
--
-- Read-only. SECURITY DEFINER so it can join profiles for the grantee's name
-- (director_handovers RLS already lets the granter see their own rows, but the
-- profiles join is not guaranteed readable for every caller, and a silent RLS
-- denial there would render a desk full of "Unknown person" with no error —
-- see feedback_rls_denial_is_always_silent).
--
-- Because it is SECURITY DEFINER, the row filter is re-stated in the body and
-- does NOT rely on the caller's RLS:
--   * you see what you handed out, or
--   * you are a super admin, in which case you see everything your institution
--     scope allows (role_has_institution_access is the house helper; a super
--     admin's scope is 'all', so this is total for them and correctly narrows
--     for any future admin persona granted this key with scope 'own').
--
-- The granter clause is deliberately NOT and-ed with the institution check.
-- A handover carries the GRANTEE's institution_id, so a Director handing work
-- across colleges would otherwise be unable to see the item he himself created.
-- Ownership of the row is the stronger claim; institution scope narrows the
-- "see everyone's" branch only.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_director_handover_board()
RETURNS TABLE (
  id                 uuid,
  route              text,
  title              text,
  note               text,
  permission_keys    text[],
  access_level       text,
  status             text,
  grantee_user_id    uuid,
  grantee_name       text,
  grantee_email      text,
  grantee_is_active  boolean,
  institution_id     uuid,
  due_date           date,
  days_remaining     integer,
  created_at         timestamptz,
  responded_at       timestamptz,
  last_activity_at   timestamptz,
  days_quiet         integer,
  last_note          text,
  is_live            boolean,
  not_green_reason   text,
  not_green_reasons  text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH today AS (
    SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS d
  ),
  visible AS (
    SELECT
      dh.*,
      p.full_name                        AS p_full_name,
      p.email                            AS p_email,
      COALESCE(p.is_active, true)        AS p_active
    FROM public.director_handovers dh
    JOIN public.profiles p ON p.id = dh.grantee_user_id
    WHERE dh.status IN ('pending', 'accepted', 'expired', 'orphaned')
      AND dh.revoked_at IS NULL
      AND (
        -- what you handed out
        dh.granted_by = (SELECT auth.uid())
        -- or everything, if you are a super admin (institution scope still applies)
        OR (
          COALESCE(public.is_super_admin(), false)
          AND (
            dh.institution_id IS NULL
            OR COALESCE(public.role_has_institution_access(dh.institution_id), false)
          )
        )
      )
  ),
  flagged AS (
    SELECT
      v.*,
      (SELECT t.d FROM today t) AS today_ist,

      -- ---- DECISION 12, RULE 4: owner gone -------------------------------
      -- 'orphaned' is what PR 5's sweep writes; p_active is the same thing
      -- observed live, before any sweep has run. Either one means the person
      -- this was handed to is no longer there.
      (v.status = 'orphaned' OR v.p_active = false)                       AS r_owner_gone,

      -- ---- RULE 1: past its due date and still open ----------------------
      -- Dates are compared in IST and the due day is inclusive, matching the
      -- spine: an item due today is not overdue until tomorrow.
      (v.due_date < (SELECT t.d FROM today t))                            AS r_overdue,

      -- ---- RULE 3: never accepted ----------------------------------------
      -- Literally still 'pending', 48h after it was handed over. Once someone
      -- has answered, this rule can never fire again.
      (v.status = 'pending' AND v.created_at < now() - interval '48 hours') AS r_never_accepted,

      -- ---- RULE 2: gone quiet --------------------------------------------
      -- last_activity_at is touched by accept/decline and by every progress
      -- note, and NOT by the nightly chase — otherwise the chase would keep
      -- resetting the very clock it exists to watch.
      (v.last_activity_at < now() - interval '7 days')                    AS r_quiet
    FROM visible v
  )
  SELECT
    f.id,
    f.route,
    f.title,
    f.note,
    f.permission_keys,
    f.access_level,
    f.status,
    f.grantee_user_id,
    -- Never blank. A nameless row on this board is unactionable.
    COALESCE(NULLIF(btrim(COALESCE(f.p_full_name, '')), ''), f.p_email, 'Unnamed account') AS grantee_name,
    f.p_email                                                      AS grantee_email,
    f.p_active                                                     AS grantee_is_active,
    f.institution_id,
    f.due_date,
    (f.due_date - f.today_ist)::int                                AS days_remaining,
    f.created_at,
    f.responded_at,
    f.last_activity_at,
    GREATEST(0, EXTRACT(DAY FROM (now() - f.last_activity_at))::int) AS days_quiet,
    (
      SELECT a.detail->>'note'
      FROM public.director_handover_audit a
      WHERE a.handover_id = f.id
        AND a.action = 'progress'
      ORDER BY a.created_at DESC
      LIMIT 1
    )                                                              AS last_note,

    -- The spine's own definition of live, restated so the desk and the door
    -- agree: status is pending/accepted, the due day has not passed, and the
    -- person is still active. (revoked_at IS NULL is already in the filter.)
    (
      f.status IN ('pending', 'accepted')
      AND f.due_date >= f.today_ist
      AND f.p_active
    )                                                              AS is_live,

    -- The one rule that decides the row's colour and the top-of-page counts.
    CASE
      WHEN f.r_owner_gone     THEN 'owner_gone'
      WHEN f.r_overdue        THEN 'overdue'
      WHEN f.r_never_accepted THEN 'never_accepted'
      WHEN f.r_quiet          THEN 'quiet'
      ELSE NULL
    END                                                            AS not_green_reason,

    -- Every rule that fired. Built by concatenation rather than
    -- array_remove(..., NULL), whose NULL semantics are a trap.
    (CASE WHEN f.r_owner_gone     THEN ARRAY['owner_gone']::text[]     ELSE ARRAY[]::text[] END)
    || (CASE WHEN f.r_overdue        THEN ARRAY['overdue']::text[]        ELSE ARRAY[]::text[] END)
    || (CASE WHEN f.r_never_accepted THEN ARRAY['never_accepted']::text[] ELSE ARRAY[]::text[] END)
    || (CASE WHEN f.r_quiet          THEN ARRAY['quiet']::text[]          ELSE ARRAY[]::text[] END)
                                                                   AS not_green_reasons
  FROM flagged f
  ORDER BY
    CASE
      WHEN f.r_owner_gone     THEN 0
      WHEN f.r_overdue        THEN 1
      WHEN f.r_never_accepted THEN 2
      WHEN f.r_quiet          THEN 3
      ELSE 4
    END,
    f.due_date ASC,
    f.created_at ASC;
$$;

COMMENT ON FUNCTION public.fn_director_handover_board() IS
  'The Director''s board. Computes decision 12''s four not-green rules in SQL so the page and the nightly chase engine cannot disagree about what red means. Returns the granter''s own handovers; super admins see all, within institution scope.';

-- ============================================================================
-- GRANTS
--
-- anon is revoked EXPLICITLY. Revoking PUBLIC alone is not enough: Supabase's
-- ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon hands anon a
-- direct grant separate from PUBLIC, and the anon key ships in every JS bundle.
-- (CLAUDE.md "MANDATORY: Lock new RPCs from anon"; PR #1225.)
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.fn_director_handover_board() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_director_handover_board() TO authenticated;

NOTIFY pgrst, 'reload schema';
