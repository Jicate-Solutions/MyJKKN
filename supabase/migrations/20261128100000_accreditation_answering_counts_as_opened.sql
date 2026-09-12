-- ============================================================================
-- Answering your own assignment now counts as having opened it
--
-- Date: 2026-09-10
--
-- WHAT WAS WRONG (measured read-only on production, 2026-09-10)
-- --------------------------------------------------------------
-- Director decision 2026-09-08: assignment IS ownership, and first_seen_at
-- ("has this person opened it?") replaces the Accept click as the signal.
-- 20261121113000 gave that column exactly one writer,
-- fn_accreditation_mark_owner_seen, which /accreditation/my-gaps calls
-- fire-and-forget when the page loads.
--
--   · 63 of the 65 'confirmed' rows were answered by the owner themself
--     (acknowledged_by = owner_user_id), through
--     fn_accreditation_acknowledge_ownership.
--   · 58 of those 63 still have first_seen_at NULL, so the owners desk shows
--     "Not opened yet" beside people who answered every item they were given.
--   · Supabase edge logs, 2026-09-09 23:00 → 2026-09-10 23:00 IST: 8 owners
--     made 55 acknowledge calls and 0 mark_owner_seen calls.
--
-- The current My Gaps code cannot show Accept without also issuing mark-seen
-- (both hang off the same load condition), so those people were running OLDER
-- page code. That is expected, not exotic: app/sw.ts ships the service worker
-- with `skipWaiting: false`, so an installed PWA keeps the previous bundle
-- until every tab of it closes.
--
-- WHY THE FIX IS SERVER-SIDE
-- --------------------------
-- A client-side signal cannot reach a client that is not running the new
-- client. The one write that PROVES a person saw a row is the answer itself:
-- fn_accreditation_acknowledge_ownership refuses everyone except the named
-- owner, and it is only ever called from a screen that shows them that row.
-- So the answer now stamps first_seen_at as well — whichever page code sent it.
--
-- WHAT CHANGES
-- ------------
-- 1) fn_accreditation_acknowledge_ownership is re-declared from its LIVE
--    definition (pg_get_functiondef on production, 2026-09-10). That text
--    matches 20260809100600 statement for statement; the only differences are
--    catalogue rendering (`SET search_path TO 'public'`, VOLATILE implied by
--    default). No later migration on main redefines it. The ONE functional
--    change is a fourth line in the UPDATE's SET list:
--
--        first_seen_at = COALESCE(o.first_seen_at, now())
--
--    COALESCE keeps the column write-once, exactly as mark_owner_seen's
--    `WHERE first_seen_at IS NULL` does: the first sighting is the fact worth
--    keeping, and an owner who opened the page last week keeps last week.
--    'confirmed' stays an accepted decision — stale clients still send it. A
--    decline stamps it too, because refusing an item is proof of having seen it.
--    Signature, return shape, every guard and every comment are unchanged.
--
-- 2) A one-time backfill that stamps first_seen_at = acknowledged_at on rows the
--    named owner answered themself.
--
--    This asserts an OBSERVED fact, and that is the whole difference from
--    20261121113000 (#3381), which rightly refused to backfill: marking the
--    owners of that day as "seen" would have asserted visits nobody observed.
--    Here every stamped row carries acknowledged_by = owner_user_id.
--    acknowledged_by is set to a person only by this function, and only after
--    it has proved `v_owner = auth.uid()` — every other application writer
--    (both owners pages, fn_accreditation_assign_metric_owner) sets it to NULL.
--    So the named owner provably acted on that row, at acknowledged_at, and
--    the stamp carries that real timestamp rather than now().
--
--    A row whose owner changed AFTER the answer is excluded: that answer
--    belonged to an earlier tenure, which is the same reason
--    trg_accreditation_metric_owners_first_seen clears the column when the owner
--    changes. Candidates measured on production 2026-09-10: 58 rows, 11 people,
--    all 'confirmed', 0 with owner_changed_at after acknowledged_at.
--
-- NOTHING IS ANNOUNCED
-- --------------------
-- Neither the stamp nor the backfill writes an ownership event, so
-- accreditation-ownership-notify (which reads only that trail) sends nothing.
-- Verified against trg_accreditation_metric_owners_trail as defined on main in
-- 20261125153000:
--
--   · Its UPDATE branch records only a change of owner_user_id, a move INTO
--     'declined', or a move from 'declined' back to 'pending'. Anything else
--     falls to its ELSE, which does `RETURN NULL` with the comment "Everything
--     else changes who is answerable for nothing: stamping first_seen_at when
--     the owner opens their page, accepting an assignment ... Silence here is
--     the point".
--   · The backfill changes neither the owner nor the status, so every row it
--     touches takes that ELSE. It also runs with no signed-in user, and the
--     trigger declines to write any event without auth.uid() ("Reached only by
--     a write with no signed-in user: service_role, psql, a migration ...
--     Refusing to write is a hole in the trail; writing a guessed actor would
--     be a lie in it").
--   · Inside the function the stamp rides the SAME UPDATE as the decision, and
--     the trigger's branch is chosen by owner and status alone. A decline still
--     writes exactly the one 'declined' event it wrote before; a confirm still
--     writes none. Adding a column to the SET list moves no branch.
--
-- trg_accreditation_metric_owners_first_seen (20261121113000) nulls the column
-- only on INSERT or on a change of owner_user_id. Neither statement here does
-- either, so it lets both writes stand.
--
-- TIER: REPLACES one existing SECURITY DEFINER function (same signature) and
-- UPDATEs existing rows. No table, column, policy, trigger or permission key is
-- added, altered or dropped.
-- ============================================================================

-- ── 1) The answer stamps the sighting ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_accreditation_acknowledge_ownership(
  p_owner_id uuid,
  p_decision text
)
RETURNS TABLE (
  id                uuid,
  assignment_status text,
  acknowledged_at   timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_owner  uuid;
BEGIN
  -- The caller is taken from the session and never from an argument. A SECURITY
  -- DEFINER function that accepts the user it should act as is an IDOR, and 75
  -- functions of that shape already exist on this database — not 76.
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;

  IF p_decision NOT IN ('confirmed', 'declined') THEN
    RAISE EXCEPTION 'decision must be confirmed or declined, got %', p_decision
      USING ERRCODE = '22023';
  END IF;

  SELECT o.owner_user_id INTO v_owner
    FROM public.accreditation_metric_owners o
   WHERE o.id = p_owner_id;

  IF v_owner IS NULL THEN
    -- Says nothing about whether the row exists. A caller who may not answer
    -- for a row has no business learning whether it is there.
    RAISE EXCEPTION 'no assignment you can answer for' USING ERRCODE = '42501';
  END IF;

  IF v_owner <> v_caller THEN
    RAISE EXCEPTION 'only the named owner may answer this assignment'
      USING ERRCODE = '42501';
  END IF;

  -- Exactly three columns. Not owner_user_id, not institution_id, not the
  -- scope. A decline stamps acknowledged_at too — the paired CHECK
  -- `(assignment_status = 'pending') = (acknowledged_at IS NULL)` treats
  -- refusing as an answer, because it is one.
  --
  -- 2026-09-10: plus first_seen_at, write-once. Answering an item is the
  -- strongest proof there is that its owner has seen it, and unlike the
  -- fire-and-forget mark-seen call on page load it cannot be skipped by a
  -- client running an older bundle. Still not an ownership column: it says
  -- whether the message reached the person, never who is answerable.
  RETURN QUERY
  UPDATE public.accreditation_metric_owners o
     SET assignment_status = p_decision,
         acknowledged_at   = now(),
         acknowledged_by   = v_caller,
         first_seen_at     = COALESCE(o.first_seen_at, now())
   WHERE o.id = p_owner_id
   RETURNING o.id, o.assignment_status, o.acknowledged_at;
END;
$$;

-- CREATE OR REPLACE keeps the existing ACL, but the standing rule is that every
-- re-declaration of a SECURITY DEFINER function re-asserts the lock in the same
-- file, so a future edit to the grant cannot slip through on a copy of this one.
-- ci:allow-secdef-authenticated every signed-in user may call this, because the
-- intended caller is whichever person was NAMED as owner and that can be any
-- signed-in user. It is not unguarded: the only argument names a ROW, never a
-- user, and the body refuses with 42501 unless that row's owner_user_id equals
-- auth.uid() — the caller comes from the session, not from a parameter. The
-- worst a hostile caller can do is answer their OWN assignment, which is what
-- calling it honestly does. The gate cannot see that guard because auth.uid()
-- is excluded from its predicate list on purpose (it is dual-use — #3130 called
-- it only to record an actor), so a genuinely owner-scoped function has to say
-- so here. Narrowing the grant would break the feature: the owner IS the caller.
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_acknowledge_ownership(uuid, text)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_acknowledge_ownership(uuid, text)
  TO authenticated;

-- The column comment promised a single writer. That is no longer true, and a
-- catalogue comment that lies is how the next engineer ships the wrong fix.
COMMENT ON COLUMN public.accreditation_metric_owners.first_seen_at IS
  'When the named owner first saw their own assignment. NULL means not yet '
  'seen — which is a fact about the message reaching them, never a permission: '
  'a NULL owner has full access and receives every follow-up. Written, only '
  'for the caller''s own rows and only once, by fn_accreditation_mark_owner_seen '
  '(opening /accreditation/my-gaps) and by fn_accreditation_acknowledge_ownership '
  '(answering the assignment, from 2026-09-10). Backfilled once on 2026-09-10 '
  'from acknowledged_at where the owner had answered themself. Reset to NULL by '
  'trg_accreditation_metric_owners_first_seen whenever owner_user_id changes, '
  'because the previous holder''s sighting says nothing about the new one.';

-- ── 2) Backfill: the people who already answered had already seen it ────────
-- UPDATE and SET kept on one line on purpose: the merge-time classifier
-- (migration-class.sh) greps line by line and cannot see a data UPDATE whose
-- SET sits on the next line. This file must classify as a data change.
UPDATE public.accreditation_metric_owners SET first_seen_at = acknowledged_at
 WHERE first_seen_at IS NULL
   AND acknowledged_at IS NOT NULL
   AND acknowledged_by = owner_user_id
   AND (owner_changed_at IS NULL OR owner_changed_at <= acknowledged_at);

-- ── 3) Assert, in this transaction, that the lock held and the stamp is in ──
DO $$
BEGIN
  IF has_function_privilege('anon',
       'public.fn_accreditation_acknowledge_ownership(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute fn_accreditation_acknowledge_ownership';
  END IF;
  IF NOT has_function_privilege('authenticated',
       'public.fn_accreditation_acknowledge_ownership(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute the function My Gaps calls';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p
     WHERE p.oid = 'public.fn_accreditation_acknowledge_ownership(uuid, text)'::regprocedure
       AND p.prosecdef
       AND p.prosrc ~ 'first_seen_at\s*=\s*COALESCE\(o\.first_seen_at,\s*now\(\)\)'
  ) THEN
    RAISE EXCEPTION 'fn_accreditation_acknowledge_ownership was not replaced with the stamping definition';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.accreditation_metric_owners
     WHERE first_seen_at IS NULL
       AND acknowledged_at IS NOT NULL
       AND acknowledged_by = owner_user_id
       AND (owner_changed_at IS NULL OR owner_changed_at <= acknowledged_at)
  ) THEN
    RAISE EXCEPTION 'backfill left an owner-answered row without first_seen_at';
  END IF;
END $$;
