-- ============================================================================
-- Director's Desk — the board. One read, one definition of "not green".
--
-- Date: 2026-08-05
-- Spec: specs/director-desk/SPEC.md (Director interview, 12 locked decisions)
-- Depends on: 20260811100000 (director_handovers, director_handover_audit,
--                             fn_handover_grants_key)
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
-- A fifth was added on 2026-08-05 after adversarial review, and it is not a
-- flavour of the other four:
--
--   5. the door never opened (the row is open, in date, and grants NOTHING)
--
-- The rules live HERE, once, in SQL, so that every consumer renders the same
-- verdict and none of them can invent a private idea of red.
--
-- WHAT PR 5 ACTUALLY DOES — checked on branch feat/director-desk-chase rather
-- than assumed, because an earlier version of this header asserted it:
-- lib/services/director-desk/handover-chase-service.ts does NOT call this
-- function. It selects from director_handovers directly, and it implements only
-- the overdue rule and the explain-within-24h window — it has no quiet rule of
-- its own at all. So there is no live disagreement today. But the coupling this
-- header claimed does not exist, and anyone adding a quiet rule to the chase
-- engine must call this function rather than read last_activity_at, or the
-- defect fixed below (see grantee_activity_at) comes straight back in the
-- nightly job while the board stays honest.
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
--   no_access   (there is nobody to chase either: the door never opened, so
--                nothing was ever possible. Ranks above overdue because it
--                EXPLAINS the overdue: hand it again, at the right level.)
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
-- WHO IS ENTITLED TO SEE MORE THAN THEIR OWN HANDOVERS
--
-- Extracted into its own function on 2026-08-05, for one reason: the page needs
-- to know the answer too.
--
-- The board used to filter on `granted_by = auth.uid() OR is_super_admin()`
-- while the page it feeds was gated on `director.handover.view_all`, a key
-- labelled "See every handover on the Director's desk". Those are not the same
-- population, and the gap was not theoretical:
--
--   * production carries exactly one `administrator` account with
--     is_super_admin = false. isPageAccessible() waves that role through every
--     route guard (hasAdminBypass mirrors the database's is_admin()), so the
--     account opened /director-desk, matched neither branch of the filter, and
--     was shown "Nothing is out with anyone." permanently — a factual claim
--     about the whole institution, made from a query that had asked only about
--     rows the caller had personally created.
--
--   * anyone granted director.handover.view_all through Role Management got the
--     same screen, for the same reason.
--
-- The decision (SPEC option (a)): the key means what its label says. This
-- function is the single definition of "sees everything", and BOTH the row
-- filter below and the page's empty-state wording read it, so the page can
-- never again describe an own-rows-only result as an institution-wide fact.
--
-- The three branches mirror this codebase's canonical policy shape exactly
-- (`is_super_admin() OR is_admin() OR user_has_permission(key)` — CLAUDE.md,
-- "Standardized RLS Policy Pattern"), which is also what the client-side route
-- guard already enforces. It grants nothing the page gate did not already open.
--
-- Institution scope is applied by the CALLER, not here: role_has_institution_access
-- narrows a "sees everything" caller to their own college, and that is a
-- per-row question this per-caller function has no row to ask it about.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_director_handover_sees_all()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.is_super_admin(), false)
      OR COALESCE(public.is_admin(), false)
      OR COALESCE(public.user_has_permission('director.handover.view_all'), false);
$$;

COMMENT ON FUNCTION public.fn_director_handover_sees_all() IS
  'True when the caller is entitled to every handover in their institution scope, not merely the ones they handed out. Read by fn_director_handover_board''s row filter AND by /director-desk, so an own-rows-only result can never be worded as an institution-wide fact.';

REVOKE EXECUTE ON FUNCTION public.fn_director_handover_sees_all() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_director_handover_sees_all() TO authenticated;


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
--   * you hold the "see everything" entitlement above, in which case you see
--     everything your institution scope allows.
--
-- The granter clause is deliberately NOT and-ed with the institution check.
-- A handover carries the GRANTEE's institution_id, so a Director handing work
-- across colleges would otherwise be unable to see the item he himself created.
-- Ownership of the row is the stronger claim; institution scope narrows the
-- "see everyone's" branch only.
--
-- DROP before CREATE: the returned column list changed on 2026-08-05
-- (last_grantee_activity_at was added), and CREATE OR REPLACE cannot change a
-- function's result type. Without the drop this migration fails on any
-- environment that already ran an earlier copy of it.
-- ============================================================================

DROP FUNCTION IF EXISTS public.fn_director_handover_board();

CREATE OR REPLACE FUNCTION public.fn_director_handover_board()
RETURNS TABLE (
  id                        uuid,
  route                     text,
  title                     text,
  note                      text,
  permission_keys           text[],
  access_level              text,
  status                    text,
  grantee_user_id           uuid,
  grantee_name              text,
  grantee_email             text,
  grantee_is_active         boolean,
  institution_id            uuid,
  due_date                  date,
  days_remaining            integer,
  created_at                timestamptz,
  responded_at              timestamptz,
  last_activity_at          timestamptz,
  last_grantee_activity_at  timestamptz,
  days_quiet                integer,
  last_note                 text,
  is_live                   boolean,
  not_green_reason          text,
  not_green_reasons         text[]
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
      COALESCE(p.is_active, true)        AS p_active,

      -- ---- THE QUIET CLOCK, READ FROM THE RIGHT WRIST -------------------
      -- last_activity_at is written by fn_director_handover_progress, and that
      -- RPC admits `grantee_user_id = auth.uid() OR granted_by = auth.uid()`.
      -- The Director is the granter. So the Director posting a nudge stamped
      -- the very column the "gone quiet" rule reads, and the row went green —
      -- turning "Post a nudge" into a button that clears the flag it was
      -- raised by, with the receiver still having done nothing. Proven on
      -- Postgres 16: nudge every 8th day and a 60-day handover reads green for
      -- 52 of them, then flips straight to overdue with no warning.
      --
      -- The clock therefore reads ONLY the grantee's own footprints in the
      -- audit trail — accept, decline, and every progress note they wrote —
      -- because the question the rule asks is "is the person doing the work
      -- doing anything", and nobody else's keystrokes can answer it.
      --
      -- COALESCE to created_at, not NULL: a handover nobody has touched must
      -- start its clock the moment it was handed over. Left as NULL the
      -- comparison below would evaluate to NULL, which is not true, and an
      -- untouched item would be the one thing that could never go quiet.
      COALESCE(
        (
          SELECT max(a.created_at)
          FROM public.director_handover_audit a
          WHERE a.handover_id = dh.id
            AND a.actor_user_id = dh.grantee_user_id
        ),
        dh.created_at
      )                                  AS grantee_activity_at,

      -- ---- IS THE DOOR ACTUALLY OPEN ------------------------------------
      -- Calls the spine's OWN predicate, once per key. It used to be restated
      -- here as "status is open AND the date has not passed AND the person is
      -- active", which is three of the spine's conjuncts and silently dropped
      -- two: fn_handover_key_allowed_at_level and fn_handover_key_is_blocked.
      --
      -- That gap was worth 207 of 860 MENU_PERMISSIONS keys at the DEFAULT
      -- access level: hand over /improvement-board/manage-boards (key
      -- improvement.board.manage) at 'update' and the board reported live,
      -- green, 14 days left, while fn_handover_grants_key returned FALSE and
      -- the receiver got access-denied. The Director then read the eventual
      -- "gone quiet" as "he is ignoring me".
      --
      -- Calling fn_handover_grants_key rather than re-deriving it is the point:
      -- a restatement can drift from the thing it restates, and this one did.
      -- Executable because this function is SECURITY DEFINER and its owner owns
      -- that function too — fn_handover_grants_key is deliberately granted to
      -- no role (spine migration 20260811100000).
      --
      -- KNOWN IMPRECISION, stated rather than hidden: fn_handover_grants_key
      -- asks "may this PERSON use this key", so a receiver holding the same key
      -- through a SECOND live handover makes this row read live. The door
      -- genuinely is open in that case — the board is telling the truth about
      -- what the Director asked ("can they work on it?"), it is simply not
      -- telling him which row opened it. The failure this replaces was the
      -- opposite and far worse: green over a door that was shut.
      EXISTS (
        SELECT 1
        FROM unnest(COALESCE(dh.permission_keys, ARRAY[]::text[])) AS k(key)
        WHERE public.fn_handover_grants_key(dh.grantee_user_id, k.key)
      )                                  AS door_open
    FROM public.director_handovers dh
    JOIN public.profiles p ON p.id = dh.grantee_user_id
    WHERE dh.status IN ('pending', 'accepted', 'expired', 'orphaned')
      AND dh.revoked_at IS NULL
      AND (
        -- what you handed out
        dh.granted_by = (SELECT auth.uid())
        -- or everything, if you are entitled to it (institution scope applies)
        OR (
          public.fn_director_handover_sees_all()
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
      --
      -- 'expired' is included for the same reason 'orphaned' is included in the
      -- rule above: it is what PR 5's sweep writes when the date passes. Reading
      -- only the date would leave a swept row that somehow disagrees with its own
      -- due_date wearing a green "on track" chip while its access is shut — the
      -- one thing this board must never do.
      (v.status = 'expired' OR v.due_date < (SELECT t.d FROM today t))     AS r_overdue,

      -- ---- RULE 3: never accepted ----------------------------------------
      -- Literally still 'pending', 48h after it was handed over. Once someone
      -- has answered, this rule can never fire again.
      (v.status = 'pending' AND v.created_at < now() - interval '48 hours') AS r_never_accepted,

      -- ---- RULE 2: gone quiet --------------------------------------------
      -- Reads the GRANTEE's clock only. See grantee_activity_at above for why
      -- the Director's own nudge must not touch it, and the nightly chase must
      -- not either.
      (v.grantee_activity_at < now() - interval '7 days')                 AS r_quiet,

      -- ---- RULE 5: the door never opened ---------------------------------
      -- The row is open by every lifecycle test the Director can see, and it
      -- unlocks nothing. Either no key it names survives its access level, or
      -- every key it names is walled, or it names none at all, or the receiver
      -- has moved college since. Whatever the cause, the receiver is looking at
      -- an access-denied panel and the Director is looking at a green row.
      --
      -- Deliberately NOT folded into 'quiet': the fix is not a conversation,
      -- it is handing the same page over again at a level that covers the key.
      --
      -- The first three conjuncts are the LIFECYCLE half of the old is_live —
      -- status, date, person — spelled out rather than referenced, because a
      -- sibling alias in the same SELECT list is not addressable in SQL.
      (
        v.status IN ('pending', 'accepted')
        AND v.due_date >= (SELECT t.d FROM today t)
        AND v.p_active
        AND NOT v.door_open
      )                                                                   AS r_no_access
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
    -- The raw column, unchanged: anyone's activity, including the Director's
    -- own nudges. Returned for transparency and for the audit trail's sake.
    f.last_activity_at,
    -- The one the quiet rule actually reads.
    f.grantee_activity_at                                          AS last_grantee_activity_at,
    -- ...and therefore the one "days quiet" is counted from. Counting from
    -- last_activity_at here would have printed "Updated today" the instant the
    -- Director talked to himself.
    GREATEST(0, EXTRACT(DAY FROM (now() - f.grantee_activity_at))::int) AS days_quiet,
    (
      SELECT a.detail->>'note'
      FROM public.director_handover_audit a
      WHERE a.handover_id = f.id
        AND a.action = 'progress'
      ORDER BY a.created_at DESC
      LIMIT 1
    )                                                              AS last_note,

    -- The spine's own answer, not a second opinion about it.
    f.door_open                                                    AS is_live,

    -- The one rule that decides the row's colour and the top-of-page counts.
    CASE
      WHEN f.r_owner_gone     THEN 'owner_gone'
      WHEN f.r_no_access      THEN 'no_access'
      WHEN f.r_overdue        THEN 'overdue'
      WHEN f.r_never_accepted THEN 'never_accepted'
      WHEN f.r_quiet          THEN 'quiet'
      ELSE NULL
    END                                                            AS not_green_reason,

    -- Every rule that fired. Built by concatenation rather than
    -- array_remove(..., NULL), whose NULL semantics are a trap.
    (CASE WHEN f.r_owner_gone     THEN ARRAY['owner_gone']::text[]     ELSE ARRAY[]::text[] END)
    || (CASE WHEN f.r_no_access      THEN ARRAY['no_access']::text[]      ELSE ARRAY[]::text[] END)
    || (CASE WHEN f.r_overdue        THEN ARRAY['overdue']::text[]        ELSE ARRAY[]::text[] END)
    || (CASE WHEN f.r_never_accepted THEN ARRAY['never_accepted']::text[] ELSE ARRAY[]::text[] END)
    || (CASE WHEN f.r_quiet          THEN ARRAY['quiet']::text[]          ELSE ARRAY[]::text[] END)
                                                                   AS not_green_reasons
  FROM flagged f
  ORDER BY
    CASE
      WHEN f.r_owner_gone     THEN 0
      WHEN f.r_no_access      THEN 1
      WHEN f.r_overdue        THEN 2
      WHEN f.r_never_accepted THEN 3
      WHEN f.r_quiet          THEN 4
      ELSE 5
    END,
    f.due_date ASC,
    f.created_at ASC;
$$;

COMMENT ON FUNCTION public.fn_director_handover_board() IS
  'The Director''s board. Computes decision 12''s not-green rules in SQL so the page and the nightly chase engine cannot disagree about what red means. is_live calls the spine''s fn_handover_grants_key rather than restating it; the quiet clock reads the GRANTEE''s audit rows only, so a Director''s own nudge cannot reset it. Returns the caller''s own handovers, plus everything in scope for holders of the see-everything entitlement.';

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
