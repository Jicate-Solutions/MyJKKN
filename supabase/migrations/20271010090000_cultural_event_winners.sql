-- BUG-006273 (COO, 9 Oct): cultural events need the same Winner / Runner-up
-- provision sports tournaments have (#4222 records tournament_entries.final_rank).
-- A cultural event's participants are rows in events_registrations, so the place
-- is recorded there.
--
-- Director rulings (9 Oct 23:20):
--   * 1st, 2nd and 3rd place.
--   * NO TIES: one registration per place per set. A set is the event's
--     registration form (a registration with no form is its own set per event).
--   * Places can change at any time; every change is saved with who made it.
--
-- WHO MAY RECORD: the event's creator, its in-charge (events.config->incharges),
-- a super admin, or an admin with institution access to the event. An event
-- with no institution is super-admin only for the admin clause.
--
-- WHY A TRIGGER AS WELL AS THE RPC: RLS grants rows, not columns. Live UPDATE
-- policies on events_registrations still let a registrant update their OWN row
-- and an in-charge / creator of event A update rows of A. The guard refuses any
-- client (anon / authenticated) change that would set, clear or MOVE a place
-- (event_id / form_id), or rewrite who a placed row names, unless the caller
-- may record winners on BOTH the old and the new event. Service-role and direct
-- database sessions are trusted for authority, but not for validity.

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------
ALTER TABLE public.events_registrations
  ADD COLUMN IF NOT EXISTS final_rank smallint
    CONSTRAINT events_registrations_final_rank_check CHECK (final_rank BETWEEN 1 AND 3);

COMMENT ON COLUMN public.events_registrations.final_rank IS
  'Place won in a cultural event: 1 winner, 2 runner-up, 3 third place; NULL = not placed. One per (event, form, place). Written through fn_set_event_registration_ranks (BUG-006273); guarded by trg_events_registrations_final_rank_guard; history in event_winner_rank_changes.';

-- ---------------------------------------------------------------------------
-- 2. No ties: one registration per place per (event, form)
-- ---------------------------------------------------------------------------
-- A static key, so it holds under concurrent saves (the second writer waits for
-- the first and then fails with 23505) and cannot drift when forms are added,
-- emptied or a row's form changes.
-- Not CONCURRENTLY: the migration runs in one transaction. The build briefly
-- blocks writes on events_registrations (about 6.4k rows today, sub-second);
-- apply off-peak.
CREATE UNIQUE INDEX IF NOT EXISTS events_registrations_final_rank_one_per_set
  ON public.events_registrations
     (event_id, COALESCE(form_id, '00000000-0000-0000-0000-000000000000'::uuid), final_rank)
  WHERE final_rank IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Authority
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_can_record_event_winners(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR (
      public.is_admin()
      AND EXISTS (
        SELECT 1
        FROM public.events e
        WHERE e.id = p_event_id
          AND e.institution_id IS NOT NULL
          AND public.role_has_institution_access(e.institution_id)
      )
    )
    OR public.fn_is_event_incharge(p_event_id)
    OR EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = p_event_id
        AND e.created_by = auth.uid()
    );
$$;
COMMENT ON FUNCTION public.fn_can_record_event_winners(uuid) IS
  'May the caller record an event''s winners (events_registrations.final_rank)? Creator, in-charge, super admin, or an admin with institution access to the event''s (non-NULL) institution. BUG-006273.';

REVOKE EXECUTE ON FUNCTION public.fn_can_record_event_winners(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_can_record_event_winners(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Guard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_events_registrations_final_rank_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- ALLOWLIST: the operational columns anyone with row UPDATE rights may still
  -- change on a placed (winning) row — check-in, kit, certificate, QR and
  -- payment. EVERY other column, including any added later, is frozen on a
  -- placed row for a caller without winner authority.
  c_allowed CONSTANT text[] := ARRAY[
    'status', 'checked_in', 'checked_in_at', 'checked_in_by',
    'tshirt_collected', 'tshirt_collected_at', 'tshirt_collected_by',
    'certificate_issued', 'certificate_issued_at', 'certificate_issued_by',
    'qr_code_url', 'qr_generated_at',
    'payment_status', 'payment_amount', 'payment_method', 'payment_reference',
    'updated_at'
  ];
  -- ACTIVE: the only statuses a placed (winning) row may have. KEEP IN STEP
  -- with WINNER_ACTIVE_STATUSES in hooks/events/use-event-winners.ts (used by
  -- components/events/shared/event-winners-card.tsx to decide who is offered).
  -- Any other status (cancelled, disqualified, no_show, waitlisted, anything
  -- added later) is "out": it cannot hold a place.
  c_active CONSTANT text[] := ARRAY['registered', 'confirmed', 'checked_in', 'pending'];
  v_rank_changed boolean := false;
  v_moved boolean := false;
  v_withdrawn boolean := false;
  v_type text;
BEGIN
  -- Deleting a placed row removes a winner: same authority as changing one.
  IF TG_OP = 'DELETE' THEN
    IF OLD.final_rank IS NULL OR COALESCE(auth.role(), '') NOT IN ('anon', 'authenticated') THEN
      RETURN OLD;
    END IF;
    -- The event itself is being deleted (events_registrations_event_id_fkey is
    -- ON DELETE CASCADE): whoever could delete the event takes its winners with
    -- it. The parent row is already gone, so the authority check would fail
    -- closed; the history trigger still logs each removal.
    IF NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = OLD.event_id) THEN
      RETURN OLD;
    END IF;
    IF NOT COALESCE(public.fn_can_record_event_winners(OLD.event_id), false) THEN
      RAISE EXCEPTION 'Only the event''s creator, its in-charge or an administrator can remove a winner.'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.final_rank IS NULL THEN
      RETURN NEW;
    END IF;
    v_rank_changed := true;
  ELSE
    -- Fast exit: the trigger fires on every UPDATE, and almost every row is
    -- not a winner.
    IF OLD.final_rank IS NULL AND NEW.final_rank IS NULL THEN
      RETURN NEW;
    END IF;

    -- A registration form was deleted (events_registrations_form_id_fkey is ON
    -- DELETE SET NULL). The place belonged to a competition that no longer
    -- exists, so it is cleared; this also keeps it from colliding with a place
    -- in the no-form set. A system move: no authority check; the history
    -- trigger logs the clear on the old form. (Deleting a form that has
    -- winners needs winner authority: fn_event_registration_forms_winner_guard.)
    IF OLD.form_id IS NOT NULL AND NEW.form_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.event_registration_forms f WHERE f.id = OLD.form_id) THEN
      NEW.final_rank := NULL;
      RETURN NEW;
    END IF;

    -- A winner who leaves the ACTIVE set (cancelled, disqualified, no_show,
    -- anything else) loses the place (desk ruling 10 Oct): final_rank is
    -- cleared for every caller, and the history trigger logs the clear. A row
    -- outside ACTIVE therefore never holds a place.
    IF OLD.final_rank IS NOT NULL
       AND NOT (NEW.status = ANY (c_active)) THEN
      NEW.final_rank := NULL;
      v_withdrawn := true;
    END IF;

    v_rank_changed := NEW.final_rank IS DISTINCT FROM OLD.final_rank;
    v_moved := NEW.event_id IS DISTINCT FROM OLD.event_id
            OR NEW.form_id IS DISTINCT FROM OLD.form_id;
  END IF;

  -- Validity, for every caller: a place only on a live registration of a
  -- cultural event.
  IF NEW.final_rank IS NOT NULL AND (v_rank_changed OR v_moved) THEN
    SELECT e.event_type INTO v_type FROM public.events e WHERE e.id = NEW.event_id;
    IF v_type IS DISTINCT FROM 'cultural' THEN
      RAISE EXCEPTION 'Winners can be recorded only for cultural events.' USING ERRCODE = '22023';
    END IF;
    IF NOT (NEW.status = ANY (c_active)) THEN
      RAISE EXCEPTION 'Only an active registration (registered, confirmed, checked in or pending) can hold a place.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Service role and direct database sessions are trusted for authority.
  IF COALESCE(auth.role(), '') NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  -- A row that already holds a place.
  IF TG_OP = 'UPDATE' AND OLD.final_rank IS NOT NULL THEN
    -- Winner authority on both ends: anything goes (subject to validity above).
    IF COALESCE(public.fn_can_record_event_winners(OLD.event_id), false)
       AND COALESCE(public.fn_can_record_event_winners(NEW.event_id), false) THEN
      RETURN NEW;
    END IF;

    -- The registrant on their own placed row: the ONLY change allowed is
    -- cancelling it (plus updated_at). That clears the place (above) and is
    -- logged. The operational allowlist below is for ops writers, not for the
    -- registrant (desk ruling 10 Oct).
    IF OLD.profile_id IS NOT NULL AND OLD.profile_id = auth.uid() THEN
      IF (to_jsonb(NEW) - ARRAY['status', 'updated_at', 'final_rank'])
           IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'updated_at', 'final_rank'])
         OR (NEW.status IS DISTINCT FROM OLD.status AND NOT (v_withdrawn AND NEW.status = 'cancelled'))
         OR (v_rank_changed AND NOT v_withdrawn) THEN
        RAISE EXCEPTION 'Your registration holds a place; you can cancel it, but other changes need the event''s organisers.'
          USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;

    -- Other updaters the row's RLS let through (committee / volunteer ops
    -- screens): only the allowlisted operational columns may change.
    -- final_rank is judged separately (a withdrawal clears it).
    IF (to_jsonb(NEW) - c_allowed - 'final_rank') IS DISTINCT FROM (to_jsonb(OLD) - c_allowed - 'final_rank') THEN
      RAISE EXCEPTION 'This registration holds a place; only the event''s creator, its in-charge or an administrator can change who or where it is.'
        USING ERRCODE = '42501';
    END IF;
    IF v_rank_changed AND NOT v_withdrawn THEN
      RAISE EXCEPTION 'Only the event''s creator, its in-charge or an administrator can record or change winners.'
        USING ERRCODE = '42501';
    END IF;
    -- Status: moves WITHIN the ACTIVE set (check-in and the like) are free.
    -- Any move out of (or into) it needs winner authority (profile_id is
    -- frozen above, so an updater cannot re-point the row to themselves and
    -- "self-cancel").
    IF NEW.status IS DISTINCT FROM OLD.status
       AND (NOT (OLD.status = ANY (c_active)) OR NOT (NEW.status = ANY (c_active))) THEN
      RAISE EXCEPTION 'Only the registrant (to cancel), or the event''s creator, its in-charge or an administrator, can change this winner''s status.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Giving a place (INSERT placed, or an unplaced row being placed). COALESCE:
  -- a NULL answer fails closed. Both ends of a move are checked.
  IF NOT COALESCE(public.fn_can_record_event_winners(NEW.event_id), false)
     OR (TG_OP = 'UPDATE' AND NOT COALESCE(public.fn_can_record_event_winners(OLD.event_id), false)) THEN
    RAISE EXCEPTION 'Only the event''s creator, its in-charge or an administrator can record or change winners.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_events_registrations_final_rank_guard() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_events_registrations_final_rank_guard ON public.events_registrations;
CREATE TRIGGER trg_events_registrations_final_rank_guard
  -- Every UPDATE (no column list): the allowlist must also cover columns
  -- added after this migration.
  BEFORE INSERT OR UPDATE OR DELETE
  ON public.events_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_events_registrations_final_rank_guard();

-- ---------------------------------------------------------------------------
-- 5. The write path
-- ---------------------------------------------------------------------------
-- p_changes: [{"registration_id": "<uuid>", "final_rank": 1|2|3|null}, ...]
-- One transaction: every change lands or none does. Pass 1 empties the places
-- that are changing hands; pass 2 fills the new places — so a swap never trips
-- the no-tie index. The last entry for a registration wins.
CREATE OR REPLACE FUNCTION public.fn_set_event_registration_ranks(p_event_id uuid, p_changes jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
  v_bad integer;
  v_total integer;
  v_found integer;
  v_ids uuid[];
  v_forms uuid[];
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(public.fn_can_record_event_winners(p_event_id), false) THEN
    RAISE EXCEPTION 'Only the event''s creator, its in-charge or an administrator can record winners.'
      USING ERRCODE = '42501';
  END IF;

  SELECT e.event_type INTO v_type FROM public.events e WHERE e.id = p_event_id;
  IF v_type IS DISTINCT FROM 'cultural' THEN
    RAISE EXCEPTION 'Winners can be recorded here only for cultural events.'
      USING ERRCODE = '22023';
  END IF;

  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array' THEN
    RAISE EXCEPTION 'Changes must be a list.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_bad
  FROM jsonb_array_elements(p_changes) x
  WHERE jsonb_typeof(x) <> 'object'
     OR NOT (x ? 'registration_id')
     OR NOT (x ? 'final_rank')
     OR (x->>'registration_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR (jsonb_typeof(x->'final_rank') <> 'null'
         AND (jsonb_typeof(x->'final_rank') <> 'number'
              OR (x->>'final_rank') !~ '^[1-3]$'));
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Each change needs a registration and a place of 1, 2, 3 or none.'
      USING ERRCODE = '22023';
  END IF;

  -- LOCKING, in the same order as a form DELETE (form row, then its
  -- registrations — see fn_event_registration_forms_winner_guard), so the two
  -- paths queue instead of deadlocking:
  --   1. read the listed rows and their forms, without a lock;
  --   2. lock those forms FOR SHARE, in id order (a form delete in flight
  --      either finishes first or waits for this save);
  --   3. lock the rows FOR UPDATE, in id order (overlapping saves queue);
  --   4. re-check, on the locked rows, that every one is still in this event
  --      and still on the form read in step 1 — before any write.
  SELECT count(DISTINCT (x->>'registration_id')::uuid) INTO v_total
  FROM jsonb_array_elements(p_changes) AS t(x);

  -- 1.
  SELECT array_agg(r.id ORDER BY r.id), array_agg(r.form_id ORDER BY r.id)
    INTO v_ids, v_forms
  FROM public.events_registrations r
  WHERE r.id IN (SELECT (x->>'registration_id')::uuid FROM jsonb_array_elements(p_changes) AS t(x));

  -- 2.
  PERFORM 1
  FROM public.event_registration_forms f
  WHERE f.id = ANY (v_forms)
  ORDER BY f.id
  FOR SHARE OF f;

  -- 3.
  PERFORM 1
  FROM public.events_registrations r
  WHERE r.id = ANY (v_ids)
  ORDER BY r.id
  FOR UPDATE OF r;

  -- 4. (a new statement: it sees anything committed while we waited)
  SELECT count(*) INTO v_found
  FROM public.events_registrations r
  WHERE r.id = ANY (v_ids)
    AND r.event_id = p_event_id
    AND r.form_id IS NOT DISTINCT FROM v_forms[array_position(v_ids, r.id)];
  IF COALESCE(v_found, 0) <> v_total THEN
    RAISE EXCEPTION 'A registration in the list does not belong to this event.'
      USING ERRCODE = '22023';
  END IF;

  -- Pass 1: empty the places that must be emptied — a row being cleared, or a
  -- row whose current place another listed row is taking (a swap or a cycle).
  -- A plain move to a free place is left to pass 2, so its history is one row.
  WITH ch AS (
    SELECT DISTINCT ON ((x->>'registration_id')::uuid)
           (x->>'registration_id')::uuid AS reg_id,
           NULLIF(x->>'final_rank', '')::smallint AS rank
    FROM jsonb_array_elements(p_changes) WITH ORDINALITY AS t(x, ord)
    ORDER BY (x->>'registration_id')::uuid, ord DESC
  )
  UPDATE public.events_registrations r
     SET final_rank = NULL
    FROM ch
   WHERE r.id = ch.reg_id
     AND r.event_id = p_event_id
     AND r.final_rank IS NOT NULL
     AND r.final_rank IS DISTINCT FROM ch.rank
     AND (ch.rank IS NULL
          OR EXISTS (
               SELECT 1
               FROM ch c2
               JOIN public.events_registrations r2 ON r2.id = c2.reg_id
               WHERE c2.reg_id <> ch.reg_id
                 AND c2.rank = r.final_rank
                 -- same set only: a row in another form wanting the same
                 -- place number does not need this one emptied
                 AND COALESCE(r2.form_id, '00000000-0000-0000-0000-000000000000'::uuid)
                   = COALESCE(r.form_id, '00000000-0000-0000-0000-000000000000'::uuid)));

  -- Pass 2: fill the new places.
  WITH ch AS (
    SELECT DISTINCT ON ((x->>'registration_id')::uuid)
           (x->>'registration_id')::uuid AS reg_id,
           NULLIF(x->>'final_rank', '')::smallint AS rank
    FROM jsonb_array_elements(p_changes) WITH ORDINALITY AS t(x, ord)
    ORDER BY (x->>'registration_id')::uuid, ord DESC
  )
  UPDATE public.events_registrations r
     SET final_rank = ch.rank
    FROM ch
   WHERE r.id = ch.reg_id
     AND r.event_id = p_event_id
     AND ch.rank IS NOT NULL
     AND r.final_rank IS DISTINCT FROM ch.rank;

  RETURN v_total;
END;
$$;
COMMENT ON FUNCTION public.fn_set_event_registration_ranks(uuid, jsonb) IS
  'Records/clears 1st/2nd/3rd place on a cultural event''s registrations, atomically (empties changing places, then fills). Caller must pass fn_can_record_event_winners. BUG-006273.';

-- A user-session function: it refuses a caller with no auth.uid(), so the
-- service role gets no grant.
REVOKE EXECUTE ON FUNCTION public.fn_set_event_registration_ranks(uuid, jsonb) FROM anon, PUBLIC, service_role;
GRANT  EXECUTE ON FUNCTION public.fn_set_event_registration_ranks(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Change history (Director ruling, 9 Oct 23:20): places can change at any
--    time, and every change is saved with who made it
-- ---------------------------------------------------------------------------
-- No foreign keys on purpose: the history outlives a deleted registration.
CREATE TABLE IF NOT EXISTS public.event_winner_rank_changes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL,
  registration_id uuid NOT NULL,
  form_id         uuid,
  old_rank        smallint,
  new_rank        smallint,
  changed_by      uuid DEFAULT auth.uid(),
  changed_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_winner_rank_changes_event
  ON public.event_winner_rank_changes (event_id, changed_at DESC);
COMMENT ON TABLE public.event_winner_rank_changes IS
  'Every change of events_registrations.final_rank, from any write path, with who made it (NULL for service-role / direct sessions). A placed row moved between events or forms logs a clear where it was and a set where it went; deleting a placed row logs a clear. Written only by trg_events_registrations_final_rank_history. BUG-006273.';

ALTER TABLE public.event_winner_rank_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_winner_rank_changes FROM anon, PUBLIC;
REVOKE ALL ON public.event_winner_rank_changes FROM authenticated;
GRANT SELECT ON public.event_winner_rank_changes TO authenticated;
GRANT ALL ON public.event_winner_rank_changes TO service_role;

DROP POLICY IF EXISTS event_winner_rank_changes_read ON public.event_winner_rank_changes;
CREATE POLICY event_winner_rank_changes_read ON public.event_winner_rank_changes
  FOR SELECT TO authenticated
  USING (public.fn_can_record_event_winners(event_id));
-- No INSERT / UPDATE / DELETE policy: clients cannot write history.

CREATE OR REPLACE FUNCTION public.fn_events_registrations_final_rank_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.final_rank IS NOT NULL THEN
      INSERT INTO public.event_winner_rank_changes (event_id, registration_id, form_id, old_rank, new_rank, changed_by)
      VALUES (NEW.event_id, NEW.id, NEW.form_id, NULL, NEW.final_rank, auth.uid());
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.final_rank IS NOT NULL THEN
      INSERT INTO public.event_winner_rank_changes (event_id, registration_id, form_id, old_rank, new_rank, changed_by)
      VALUES (OLD.event_id, OLD.id, OLD.form_id, OLD.final_rank, NULL, auth.uid());
    END IF;
  ELSIF (NEW.event_id IS DISTINCT FROM OLD.event_id OR NEW.form_id IS DISTINCT FROM OLD.form_id)
        AND (OLD.final_rank IS NOT NULL OR NEW.final_rank IS NOT NULL) THEN
    -- A move between events or forms: a clear where it was, a set where it went.
    IF OLD.final_rank IS NOT NULL THEN
      INSERT INTO public.event_winner_rank_changes (event_id, registration_id, form_id, old_rank, new_rank, changed_by)
      VALUES (OLD.event_id, NEW.id, OLD.form_id, OLD.final_rank, NULL, auth.uid());
    END IF;
    IF NEW.final_rank IS NOT NULL THEN
      INSERT INTO public.event_winner_rank_changes (event_id, registration_id, form_id, old_rank, new_rank, changed_by)
      VALUES (NEW.event_id, NEW.id, NEW.form_id, NULL, NEW.final_rank, auth.uid());
    END IF;
  ELSIF NEW.final_rank IS DISTINCT FROM OLD.final_rank THEN
    INSERT INTO public.event_winner_rank_changes (event_id, registration_id, form_id, old_rank, new_rank, changed_by)
    VALUES (NEW.event_id, NEW.id, NEW.form_id, OLD.final_rank, NEW.final_rank, auth.uid());
  END IF;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_events_registrations_final_rank_history() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_events_registrations_final_rank_history ON public.events_registrations;
CREATE TRIGGER trg_events_registrations_final_rank_history
  AFTER INSERT OR DELETE OR UPDATE OF final_rank, event_id, form_id, status ON public.events_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_events_registrations_final_rank_history();

-- ---------------------------------------------------------------------------
-- 7. Deleting a form that has winners
-- ---------------------------------------------------------------------------
-- Deleting a form sets form_id NULL on its registrations, and the guard then
-- clears their places (section 4). The forms' own RLS
-- (event_registration_forms_manage) is wider than winner authority (it also
-- admits sports.tournaments.manage holders), so the winner check is made
-- here, before the form goes. An event being deleted (cascade) is exempt.
CREATE OR REPLACE FUNCTION public.fn_event_registration_forms_winner_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') NOT IN ('anon', 'authenticated') THEN
    RETURN OLD;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = OLD.event_id) THEN
    RETURN OLD;
  END IF;
  -- Lock the form's registrations first: a placement committing after a
  -- plain EXISTS would otherwise be wiped by ON DELETE SET NULL with no
  -- authority check. The form row is already locked by this DELETE, so the
  -- order is form -> rows, the same as fn_set_event_registration_ranks.
  PERFORM 1
  FROM public.events_registrations r
  WHERE r.form_id = OLD.id
  ORDER BY r.id
  FOR UPDATE OF r;

  IF EXISTS (
       SELECT 1 FROM public.events_registrations r
       WHERE r.form_id = OLD.id AND r.final_rank IS NOT NULL
     )
     AND NOT COALESCE(public.fn_can_record_event_winners(OLD.event_id), false) THEN
    RAISE EXCEPTION 'This form has recorded winners; only the event''s creator, in-charge or an administrator can delete it.'
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_event_registration_forms_winner_guard() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_event_registration_forms_winner_guard ON public.event_registration_forms;
CREATE TRIGGER trg_event_registration_forms_winner_guard
  BEFORE DELETE ON public.event_registration_forms
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_event_registration_forms_winner_guard();

-- ---------------------------------------------------------------------------
-- 8. Self-check
-- ---------------------------------------------------------------------------
DO $assert$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events_registrations' AND column_name = 'final_rank'
  ) THEN
    RAISE EXCEPTION 'events_registrations.final_rank missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'events_registrations_final_rank_one_per_set'
      AND i.indisunique
      AND i.indrelid = 'public.events_registrations'::regclass
  ) THEN
    RAISE EXCEPTION 'no-tie unique index missing';
  END IF;
  -- The guard must fire on EVERY UPDATE (no column list, so the allowlist
  -- also covers future columns), and on INSERT and DELETE.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgname = 'trg_events_registrations_final_rank_guard'
      AND t.tgrelid = 'public.events_registrations'::regclass
      AND NOT t.tgisinternal
      AND cardinality(t.tgattr::int2[]) = 0
      AND (t.tgtype & 4) <> 0    -- INSERT
      AND (t.tgtype & 8) <> 0    -- DELETE
      AND (t.tgtype & 16) <> 0   -- UPDATE
  ) THEN
    RAISE EXCEPTION 'final_rank guard trigger missing, limited to some columns, or not firing on INSERT/UPDATE/DELETE';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_events_registrations_final_rank_history'
      AND tgrelid = 'public.events_registrations'::regclass
      AND NOT tgisinternal
      AND (tgtype & 8) <> 0  -- also fires on DELETE
      -- and on status, so a withdrawal's cleared place is logged
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
             FROM pg_attribute a
            WHERE a.attrelid = tgrelid AND a.attnum = ANY (tgattr))
          @> ARRAY['event_id', 'final_rank', 'form_id', 'status']
  ) THEN
    RAISE EXCEPTION 'final_rank history trigger missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_event_registration_forms_winner_guard'
      AND tgrelid = 'public.event_registration_forms'::regclass
      AND NOT tgisinternal
      AND (tgtype & 8) <> 0
  ) THEN
    RAISE EXCEPTION 'form-delete winner guard trigger missing';
  END IF;
  IF has_function_privilege('anon', 'public.fn_event_registration_forms_winner_guard()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute the form-delete winner guard';
  END IF;
  IF has_function_privilege('anon', 'public.fn_set_event_registration_ranks(uuid, jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_can_record_event_winners(uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.fn_set_event_registration_ranks(uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon (or service_role, for the user-session RPC) can still execute a winners function';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_set_event_registration_ranks(uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute fn_set_event_registration_ranks';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.event_winner_rank_changes'::regclass) THEN
    RAISE EXCEPTION 'RLS is off on event_winner_rank_changes';
  END IF;
  IF has_table_privilege('anon', 'public.event_winner_rank_changes', 'SELECT')
     OR has_table_privilege('authenticated', 'public.event_winner_rank_changes', 'INSERT')
     OR has_table_privilege('authenticated', 'public.event_winner_rank_changes', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.event_winner_rank_changes', 'DELETE') THEN
    RAISE EXCEPTION 'event_winner_rank_changes is writable by clients or readable by anon';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'event_winner_rank_changes' AND cmd <> 'SELECT'
  ) THEN
    RAISE EXCEPTION 'event_winner_rank_changes has a client write policy';
  END IF;
END
$assert$;
