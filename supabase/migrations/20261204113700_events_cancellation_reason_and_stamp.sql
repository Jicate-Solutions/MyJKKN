-- Events — an event can be cancelled, and the reason is recorded OFF the public
-- table (2026-09-13)
--
-- FILE ONLY / NOT APPLIED — the operator applies this at merge. Nothing here was
-- run against production by the author.
--
-- ─── WHY THIS FILE CHANGED SHAPE (Director's ruling, 13 Sep) ─────────────────
--
-- This migration originally added three COLUMNS to public.events:
-- cancellation_reason, cancelled_at, cancelled_by, plus a BEFORE UPDATE trigger.
-- That shape could not hold the ruling it was written to serve.
--
-- `events_public_read` is `USING (is_public = true AND status NOT IN
-- ('draft','cancelled'))` with NO `TO` clause, so it applies to `anon`, which
-- holds the table-level SELECT grant. `is_public` DEFAULTS TO TRUE. A CANCELLED
-- event is excluded by that status filter — but the reason is kept, not cleared,
-- when an event is reinstated. So: cancel (reason typed) -> reinstate -> the row
-- is anon-readable again WITH the organiser's verbatim text on it, and
-- `GET /rest/v1/events?id=eq.<id>&select=cancellation_reason` with the public
-- anon key returns it. The page never had to print it for it to be published.
--
-- THE DIRECTOR CHOSE: "Keep the reason out of the public table entirely." Ruled
-- over three alternatives, each rejected for a stated reason:
--
--   · Erase the reason on reinstate — closes the hole by DESTROYING the
--     institutional record, which is the opposite of "full reason kept inside".
--   · A column allow-list on `events` — PostgreSQL cannot subtract a column from
--     a table-level grant, so it means REVOKE SELECT on events then GRANT every
--     OTHER column by name. It then FAILS SILENTLY the day someone adds a
--     column: the new column is simply invisible to anon with no error anywhere.
--     That silent failure mode is the reason it was declined.
--   · Park it until deploy — needs a human to remember, later, under pressure.
--
-- A separate table needs nobody to remember anything. It survives reinstating,
-- renaming, re-opening, and every future column added to `events`.
--
-- CHEAPEST IT WILL EVER BE. This file has never been applied anywhere, so this
-- is a design change, not a data migration: there is no production row to move
-- and no catalog to correct. The same change after the columns exist would mean
-- backfilling rows and dropping columns out from under a live anon-readable
-- view. The filename is deliberately unchanged — renaming an applied migration
-- silently reverts later hardenings of its objects, and a rename buys nothing
-- here.
--
-- ─── WHAT WAS THERE ──────────────────────────────────────────────────────────
--
-- `cancelled` has always been a legal value of events.status (it appears in the
-- shared EVENT_STATUS_TRANSITIONS map, and fn_event_cancelled_cascade_release
-- has fired on it since 20260417000004). What did not exist was any way for a
-- general event to REACH it: GENERAL_EVENT_STATUS_TRANSITIONS allowed only
-- draft <-> live, so "cancelling" an event in practice meant pushing it back to
-- Draft. That hides the public page and closes registration — and tells the
-- people already registered nothing at all, because nothing recorded that the
-- event was called off.
--
-- ─── WHAT THIS ADDS ──────────────────────────────────────────────────────────
--
-- ONE table, public.event_cancellations, and one BEFORE INSERT OR UPDATE
-- trigger on it. `public.events` gains NO columns — that is the point.
--
--   event_id      the event this is about. PRIMARY KEY, so an event has at most
--                 one cancellation record and re-cancelling updates it in place.
--                 ON DELETE CASCADE: the record is about the event, not about
--                 anything that should outlive it.
--   reason        the organiser's own words, when there are any. NULLABLE — see
--                 the long note above the trigger. Never anon-readable: `anon`
--                 holds no grant on this table and no policy names it.
--   cancelled_at  when. Stamped by the trigger, never accepted from a client.
--   cancelled_by  who, from auth.uid(). Stamped by the trigger, never accepted
--                 from a client — a browser that can write the row could
--                 otherwise name somebody else as the canceller.
--
-- WHO READS IT: signed-in users at the event's institution, which is exactly
-- the audience `events_auth_read` already gives the event itself to. The
-- /events/[id] console shows the reason in full, unchanged, to the same people
-- who could always see it. Nothing an organiser could see before is lost.
--
-- WHO CAN WRITE IT: the union of everyone who can UPDATE the event today
-- (`events_auth_update` OR `events_incharge_update`), so nobody who can cancel
-- an event loses the ability to record why.

-- ---------------------------------------------------------------------------
-- 0. Repair: an environment that applied the EARLIER shape of this file
-- ---------------------------------------------------------------------------
-- Production has not applied this migration, so on production this block is a
-- no-op. It exists for any developer or staging database that applied the
-- column-based draft: leaving those three columns in place there would leave
-- the exact anon exposure this file was rewritten to close.
--
-- The data is copied ACROSS before anything is dropped, so no reason is lost.
--
-- DROP COLUMN is guarded rather than attempted blind. `public.events` carries
-- dependent views — public.marathon_events is one, and it is anon-readable —
-- and DROP COLUMN fails on a dependent view with an error that names the view
-- but not what to do about it. Dependents are enumerated from pg_depend and
-- reported by name; the operator drops and rebuilds them, and re-runs. Nothing
-- is CASCADEd: silently deleting a view that serves an external site is worse
-- than stopping.

DO $events_cancellation_repair$
DECLARE
  v_has_cols BOOLEAN;
  v_dependents TEXT;
BEGIN
  -- ALL THREE, not just the reason. A database holding cancelled_at/cancelled_by
  -- without cancellation_reason — a partially-applied earlier draft, or a
  -- hand-dropped column — would otherwise skip the repair entirely and then fail
  -- section 6, which asserts on all three, leaving a half-applied migration that
  -- re-running cannot clear.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'events'
       AND column_name IN ('cancellation_reason', 'cancelled_at', 'cancelled_by')
  ) INTO v_has_cols;

  IF NOT v_has_cols THEN
    RETURN;  -- the expected path everywhere, production included
  END IF;

  RAISE WARNING 'public.events carries the old cancellation columns — moving them to public.event_cancellations';

  -- Enumerate the views that would block the drop, from the catalog rather than
  -- from anyone's memory of which views exist.
  SELECT string_agg(DISTINCT c.relname, ', ')
    INTO v_dependents
    FROM pg_depend d
    JOIN pg_rewrite r  ON r.oid = d.objid
    JOIN pg_class   c  ON c.oid = r.ev_class
    JOIN pg_class   t  ON t.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
   WHERE t.relname = 'events'
     AND t.relnamespace = 'public'::regnamespace
     AND a.attname IN ('cancellation_reason', 'cancelled_at', 'cancelled_by')
     AND c.relname <> 'events';

  IF v_dependents IS NOT NULL THEN
    RAISE EXCEPTION
      'public.events.cancellation_reason is still published by: %. Drop and rebuild those relations without the three cancellation columns, then re-run this migration. Not CASCADEd on purpose — one of them may serve an external site.',
      v_dependents;
  END IF;
END
$events_cancellation_repair$;

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.event_cancellations (
  event_id     UUID PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  reason       TEXT,
  cancelled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_by UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.event_cancellations IS
  'Why a general event was called off, in the organiser''s own words, plus who called it off and when. '
  'It lives HERE and not on public.events because public.events is anon-readable: events_public_read has '
  'no TO clause and is_public defaults to true, so a cancelled event that is later REINSTATED would '
  'publish the reason to the anon key even though no page prints it (Director''s ruling, 13 Sep 2026: '
  '"keep the reason out of the public table entirely"). `anon` holds no grant on this table and no policy '
  'names it. Read by signed-in users at the event''s institution — the same audience events_auth_read '
  'gives the event to — and shown in full on the /events/[id] console. One row per event at most; kept, '
  'not deleted, if the event is later reinstated.';

COMMENT ON COLUMN public.event_cancellations.reason IS
  'The organiser''s own words. NULLABLE: required by the cancel dialog on /events/[id] and by '
  'GeneralEventService.cancel(), not by this table, so a re-cancel or a future caller without a reason '
  'records the moment rather than failing. Normalised (trimmed, blank to NULL) by the stamp trigger.';

COMMENT ON COLUMN public.event_cancellations.cancelled_at IS
  'When the event was called off. Stamped by trg_event_cancellation_stamp on every write; never accepted '
  'from a client. Re-cancelling an event refreshes it, because the most recent cancellation is the one '
  'this row describes.';

COMMENT ON COLUMN public.event_cancellations.cancelled_by IS
  'auth.uid() of whoever called the event off. Stamped by trg_event_cancellation_stamp; never accepted '
  'from a client, so it names the actual actor rather than whoever the browser claimed. NULL for a '
  'service-role or migration write, which has no auth.uid(). No FK, like events.created_by: the row must '
  'outlive the account.';

-- ---------------------------------------------------------------------------
-- 2. RLS — and deliberately NO public policy
-- ---------------------------------------------------------------------------
-- Every policy below is `TO authenticated`. There is no anon policy, by design
-- and not by omission: the whole reason this table exists is that `anon` must
-- not be able to reach the reason by any route.

ALTER TABLE public.event_cancellations ENABLE ROW LEVEL SECURITY;

-- READ: the audience events_auth_read gives the event itself to — signed-in
-- users at the event's institution — UNION everyone the write policies below
-- admit. The union matters in both directions and neither arm is decorative:
--
--   · WITHOUT the writer arms, a creator or in-charge whose profiles.institution_id
--     is NULL or points elsewhere could WRITE a reason and then not read it back.
--     `maybeSingle()` returns data:null with NO error for a row RLS hides, so the
--     console would tell that person "No reason was recorded for this
--     cancellation" about the sentence they had just written — a silent wrong
--     answer, and the worst kind.
--   · WITHOUT the institution arm, colleagues who could always see the reason
--     when it was a column on `events` would stop seeing it, which is a
--     behaviour change this ruling never asked for.
--
-- ⚠️ OPEN QUESTION FOR THE DIRECTOR, carried over rather than silently decided:
-- the institution arm means ANY signed-in profile at that college — including
-- learners — can read every cancellation reason for its events. That is exactly
-- as wide as the old column on `events` was, so this is not a regression, and
-- narrowing it is a product decision about who "inside" means, not a bug fix.
-- If it should be narrower, delete the institution arm: the writer arms already
-- cover organisers, and the cancel dialog's copy is the other half to change.
DROP POLICY IF EXISTS "event_cancellations_auth_read" ON public.event_cancellations;
CREATE POLICY "event_cancellations_auth_read" ON public.event_cancellations
  FOR SELECT TO authenticated USING (
    (SELECT public.is_super_admin())
    OR EXISTS (
      SELECT 1 FROM public.events e
       WHERE e.id = event_cancellations.event_id
         AND (
           e.institution_id IN (
             SELECT p.institution_id FROM public.profiles p
              WHERE p.id = (SELECT auth.uid()) AND p.institution_id IS NOT NULL
           )
           OR e.created_by = (SELECT auth.uid())
           OR public.fn_is_event_incharge(e.id)
         )
    )
  );

-- WRITE: the UNION of everyone who can UPDATE the event today — events_auth_update
-- (super admin / creator / the grandfather clause for rows that predate ownership)
-- OR events_incharge_update. Written out rather than approximated: anyone who can
-- move an event to `cancelled` must be able to record why, or cancelling half-fails
-- for them.
DROP POLICY IF EXISTS "event_cancellations_auth_write" ON public.event_cancellations;
CREATE POLICY "event_cancellations_auth_write" ON public.event_cancellations
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
       WHERE e.id = event_cancellations.event_id
         AND (
           (SELECT public.is_super_admin())
           OR e.created_by = (SELECT auth.uid())
           OR (
             e.created_by IS NULL
             AND e.institution_id IN (
               SELECT p.institution_id FROM public.profiles p
                WHERE p.id = (SELECT auth.uid()) AND p.institution_id IS NOT NULL
             )
           )
           OR public.fn_is_event_incharge(e.id)
         )
    )
  );

-- UPDATE: same set. Re-cancelling an event rewrites its one row rather than
-- inserting a second, so the write path needs both verbs.
DROP POLICY IF EXISTS "event_cancellations_auth_update" ON public.event_cancellations;
CREATE POLICY "event_cancellations_auth_update" ON public.event_cancellations
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.events e
       WHERE e.id = event_cancellations.event_id
         AND (
           (SELECT public.is_super_admin())
           OR e.created_by = (SELECT auth.uid())
           OR (
             e.created_by IS NULL
             AND e.institution_id IN (
               SELECT p.institution_id FROM public.profiles p
                WHERE p.id = (SELECT auth.uid()) AND p.institution_id IS NOT NULL
             )
           )
           OR public.fn_is_event_incharge(e.id)
         )
    )
  );

-- No DELETE policy, and no DELETE grant below. The record of a cancellation is
-- not a thing a console should be able to erase; deleting the EVENT takes it
-- away through ON DELETE CASCADE, which is the only removal that makes sense.

-- ---------------------------------------------------------------------------
-- 3. Grants — `authenticated` named explicitly
-- ---------------------------------------------------------------------------
-- `authenticated` is NAMED in the REVOKE, not left to the FROM anon, PUBLIC
-- form. Supabase's ALTER DEFAULT PRIVILEGES grants `authenticated` its OWN
-- direct privileges on every new table, separate from PUBLIC, so revoking from
-- anon and PUBLIC alone would leave DELETE and TRUNCATE sitting on the role
-- every signed-in browser uses.
--
-- REVOKE ALL rather than naming verbs: it covers the ones a future PostgreSQL
-- adds, and the GRANT immediately below is then the complete, readable list of
-- what anyone can do to this table.

REVOKE ALL ON public.event_cancellations FROM anon, PUBLIC, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.event_cancellations TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. The stamp: actor and moment recorded, reason normalised
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER + SET search_path, matching the sibling guard
-- fn_guard_event_privileged_fields on public.events. EXECUTE is revoked from
-- anon and PUBLIC below (PostgreSQL does not check EXECUTE when a trigger
-- fires, so the revoke costs nothing and closes the direct-call door that
-- Supabase's ALTER DEFAULT PRIVILEGES would otherwise leave open to anon).
--
-- ⚠️ THIS TRIGGER DOES NOT REQUIRE A REASON, AND MUST NOT.
--
-- An earlier draft raised 23514 when a cancellation was recorded without a
-- reason. The requirement belongs where a reason can actually be TYPED — the
-- cancel dialog on /events/[id], and GeneralEventService.cancel(), both of
-- which refuse a blank one. A table-wide RAISE would turn any future caller
-- that records a cancellation without a reason into a runtime failure, and
-- there is no reader that cannot cope: the /events/[id] console renders "No
-- reason was recorded for this cancellation", and the public page never reads
-- this table at all, so a blank reason changes nothing there — it shows the
-- same standard cancellation notice either way.
--
-- cancelled_at / cancelled_by are re-stamped on UPDATE as well as INSERT,
-- deliberately. This table holds ONE row per event and it is written only by the
-- cancel path, so an UPDATE here means the event was cancelled again — and the
-- most recent cancellation is the one the row describes.

CREATE OR REPLACE FUNCTION public.fn_event_cancellation_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Whitespace is not a reason. Normalise it to NULL so every reader can test
  -- one thing, and no caller can satisfy a UI requirement with a space.
  NEW.reason       := nullif(btrim(coalesce(NEW.reason, '')), '');
  NEW.cancelled_at := now();
  -- NULL for service-role / migration / cron writes, which have no auth.uid().
  NEW.cancelled_by := auth.uid();
  NEW.updated_at   := now();

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_event_cancellation_stamp() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_event_cancellation_stamp() TO authenticated;

COMMENT ON FUNCTION public.fn_event_cancellation_stamp() IS
  'BEFORE INSERT OR UPDATE on event_cancellations. Stamps cancelled_at = now() and cancelled_by = '
  'auth.uid(), and normalises a blank reason to NULL. The client never sets the last two: a browser that '
  'can write the row could otherwise name somebody else as the canceller. It does NOT require a reason — '
  'that requirement lives where a reason can be typed (the cancel dialog on /events/[id] and '
  'GeneralEventService.cancel()). Adds no permission check — the event_cancellations_auth_* policies '
  'remain the only gate.';

DROP TRIGGER IF EXISTS trg_event_cancellation_stamp ON public.event_cancellations;
CREATE TRIGGER trg_event_cancellation_stamp
  BEFORE INSERT OR UPDATE ON public.event_cancellations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_event_cancellation_stamp();

-- ---------------------------------------------------------------------------
-- 5. The old shape is removed, not just superseded
-- ---------------------------------------------------------------------------
-- No-ops on production (nothing there applied the earlier draft). For a database
-- that did, this takes the trigger away before section 6 asserts the columns are
-- gone — leaving it would stamp columns that no longer exist.

DROP TRIGGER  IF EXISTS trg_events_stamp_cancellation ON public.events;
DROP FUNCTION IF EXISTS public.fn_events_stamp_cancellation();

DO $events_cancellation_drop_old$
DECLARE
  v_has_reason BOOLEAN;
  v_has_at     BOOLEAN;
  v_has_by     BOOLEAN;
  v_where      TEXT;
BEGIN
  -- Each column INDEPENDENTLY. A partial old shape is a real state — an earlier
  -- draft that half-applied, or a hand-dropped column — and the copy below is
  -- built by EXECUTE rather than written out because static SQL naming
  -- `e.cancellation_reason` fails to plan when that column is the one missing,
  -- which would abort the migration AFTER the table, policies and trigger were
  -- created and leave a half-applied state no re-run could clear.
  SELECT
    bool_or(column_name = 'cancellation_reason'),
    bool_or(column_name = 'cancelled_at'),
    bool_or(column_name = 'cancelled_by')
  INTO v_has_reason, v_has_at, v_has_by
  FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'events';

  IF coalesce(v_has_reason, false) OR coalesce(v_has_at, false) OR coalesce(v_has_by, false) THEN
    -- ⚠️ THE TRIGGER MUST NOT RUN OVER THE BACKFILL. trg_event_cancellation_stamp
    -- fires BEFORE INSERT unconditionally and overwrites cancelled_at with now()
    -- and cancelled_by with auth.uid() — which is NULL on a migration connection.
    -- Left enabled it would replace the REAL who and when of every cancellation
    -- recorded under the old shape with "now, nobody", and the next statement
    -- drops the source columns, so the loss is irreversible. Disabling it for the
    -- copy keeps the trigger unconditional everywhere else, which is what stops a
    -- browser naming somebody else as the canceller.
    ALTER TABLE public.event_cancellations DISABLE TRIGGER trg_event_cancellation_stamp;

    -- Carry the words across BEFORE the columns go. Section 0 has already proved
    -- no view depends on them, so the drop below cannot fail on a dependency.
    -- Only the columns that EXIST are named; the rest are typed NULLs.
    v_where := array_to_string(ARRAY[
      CASE WHEN v_has_reason THEN 'e.cancellation_reason IS NOT NULL' END,
      CASE WHEN v_has_at     THEN 'e.cancelled_at IS NOT NULL'        END,
      CASE WHEN v_has_by     THEN 'e.cancelled_by IS NOT NULL'        END
    ], ' OR ');

    EXECUTE format(
      'INSERT INTO public.event_cancellations (event_id, reason, cancelled_at, cancelled_by)
       SELECT e.id, %s, coalesce(%s, now()), %s FROM public.events e WHERE %s
       ON CONFLICT (event_id) DO NOTHING',
      CASE WHEN v_has_reason THEN 'e.cancellation_reason' ELSE 'NULL::text'        END,
      CASE WHEN v_has_at     THEN 'e.cancelled_at'        ELSE 'NULL::timestamptz' END,
      CASE WHEN v_has_by     THEN 'e.cancelled_by'        ELSE 'NULL::uuid'        END,
      v_where
    );

    ALTER TABLE public.event_cancellations ENABLE TRIGGER trg_event_cancellation_stamp;

    -- Prove the history actually survived, BEFORE destroying the source. If the
    -- stamp had eaten it, every carried row would now read cancelled_at = the
    -- moment of this migration — so compare against the source while it exists.
    IF v_has_at THEN
      IF EXISTS (
        SELECT 1
          FROM public.events e
          JOIN public.event_cancellations c ON c.event_id = e.id
         WHERE e.cancelled_at IS NOT NULL
           AND c.cancelled_at IS DISTINCT FROM e.cancelled_at
      ) THEN
        RAISE EXCEPTION 'the backfill did not preserve cancelled_at — refusing to drop the source columns';
      END IF;
    END IF;

    ALTER TABLE public.events
      DROP COLUMN IF EXISTS cancellation_reason,
      DROP COLUMN IF EXISTS cancelled_at,
      DROP COLUMN IF EXISTS cancelled_by;
  END IF;
END
$events_cancellation_drop_old$;

-- ---------------------------------------------------------------------------
-- 6. Assert the end state, rather than trusting the statements above
-- ---------------------------------------------------------------------------
-- Every check here can FAIL. That is the point: a grant block that cannot fail
-- verifies nothing.

DO $events_cancellation_assert$
BEGIN
  -- The reason is not on the anon-readable table. This is the ruling itself.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'events'
       AND column_name IN ('cancellation_reason', 'cancelled_at', 'cancelled_by')
  ) THEN
    RAISE EXCEPTION 'public.events still carries a cancellation column — the reason is anon-reachable on a reinstated event';
  END IF;

  -- anon can do NOTHING to the new table. Asserted per verb, because a single
  -- leftover privilege is the whole failure.
  IF has_table_privilege('anon', 'public.event_cancellations', 'SELECT') THEN
    RAISE EXCEPTION 'anon can SELECT public.event_cancellations';
  END IF;
  IF has_table_privilege('anon', 'public.event_cancellations', 'INSERT') THEN
    RAISE EXCEPTION 'anon can INSERT into public.event_cancellations';
  END IF;
  IF has_table_privilege('anon', 'public.event_cancellations', 'UPDATE') THEN
    RAISE EXCEPTION 'anon can UPDATE public.event_cancellations';
  END IF;
  IF has_table_privilege('anon', 'public.event_cancellations', 'DELETE') THEN
    RAISE EXCEPTION 'anon can DELETE from public.event_cancellations';
  END IF;

  -- authenticated holds exactly the three verbs granted above, and not DELETE —
  -- the direct grant Supabase's default privileges hand out is revoked, not
  -- assumed away.
  IF NOT has_table_privilege('authenticated', 'public.event_cancellations', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated cannot SELECT public.event_cancellations — the console cannot show the reason';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.event_cancellations', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated cannot INSERT into public.event_cancellations — cancelling cannot record a reason';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.event_cancellations', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated cannot UPDATE public.event_cancellations — re-cancelling cannot refresh the reason';
  END IF;
  IF has_table_privilege('authenticated', 'public.event_cancellations', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated can DELETE from public.event_cancellations — a cancellation record must not be erasable';
  END IF;

  -- RLS actually on. A table with policies and RLS disabled is a table with no
  -- policies.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
     WHERE oid = 'public.event_cancellations'::regclass AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS is not enabled on public.event_cancellations';
  END IF;

  -- And no policy hands it to anon by naming PUBLIC or leaving roles open.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'event_cancellations'
       AND ('anon' = ANY(roles) OR 'public' = ANY(roles))
  ) THEN
    RAISE EXCEPTION 'a policy on public.event_cancellations is open to anon or PUBLIC';
  END IF;
END
$events_cancellation_assert$;
