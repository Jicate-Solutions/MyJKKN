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
  v_rank_changed boolean;
  v_moved boolean := false;
  v_renamed boolean := false;
  v_type text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.final_rank IS NULL THEN
      RETURN NEW;
    END IF;
    v_rank_changed := true;
  ELSE
    v_rank_changed := NEW.final_rank IS DISTINCT FROM OLD.final_rank;
    v_moved := NEW.event_id IS DISTINCT FROM OLD.event_id
            OR NEW.form_id IS DISTINCT FROM OLD.form_id;
    v_renamed := NEW.participant_name IS DISTINCT FROM OLD.participant_name
              OR NEW.institution_name IS DISTINCT FROM OLD.institution_name
              OR NEW.department IS DISTINCT FROM OLD.department;
    -- Nothing about a place changes: an unplaced row moving or being renamed,
    -- or a placed row whose other columns change.
    IF NOT v_rank_changed
       AND NOT ((v_moved OR v_renamed) AND (OLD.final_rank IS NOT NULL OR NEW.final_rank IS NOT NULL)) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Validity, for every caller: a place only on a live registration of a
  -- cultural event.
  IF NEW.final_rank IS NOT NULL AND (v_rank_changed OR v_moved) THEN
    SELECT e.event_type INTO v_type FROM public.events e WHERE e.id = NEW.event_id;
    IF v_type IS DISTINCT FROM 'cultural' THEN
      RAISE EXCEPTION 'Winners can be recorded only for cultural events.' USING ERRCODE = '22023';
    END IF;
    IF NEW.status = 'cancelled' THEN
      RAISE EXCEPTION 'A cancelled registration cannot hold a place.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Service role and direct database sessions are trusted for authority.
  IF COALESCE(auth.role(), '') NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  -- COALESCE: a NULL answer fails closed. Both ends of a move are checked, so a
  -- row cannot carry a place out of, or into, an event the caller does not run.
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
  BEFORE INSERT OR UPDATE OF final_rank, event_id, form_id, participant_name, institution_name, department
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

  -- The last entry per registration wins.
  WITH ch AS (
    SELECT DISTINCT ON ((x->>'registration_id')::uuid)
           (x->>'registration_id')::uuid AS reg_id,
           NULLIF(x->>'final_rank', '')::smallint AS rank
    FROM jsonb_array_elements(p_changes) WITH ORDINALITY AS t(x, ord)
    ORDER BY (x->>'registration_id')::uuid, ord DESC
  )
  SELECT count(*), count(r.id) INTO v_total, v_found
  FROM ch LEFT JOIN public.events_registrations r ON r.id = ch.reg_id AND r.event_id = p_event_id;
  IF v_found <> v_total THEN
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
          OR EXISTS (SELECT 1 FROM ch c2 WHERE c2.reg_id <> ch.reg_id AND c2.rank = r.final_rank));

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

REVOKE EXECUTE ON FUNCTION public.fn_set_event_registration_ranks(uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_set_event_registration_ranks(uuid, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Change history (Director ruling, 9 Oct 23:20): places can change at any
--    time, and every change is saved with who made it
-- ---------------------------------------------------------------------------
-- No foreign keys on purpose: the history outlives a deleted registration.
CREATE TABLE IF NOT EXISTS public.event_winner_rank_changes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL,
  registration_id uuid NOT NULL,
  old_rank        smallint,
  new_rank        smallint,
  changed_by      uuid DEFAULT auth.uid(),
  changed_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_winner_rank_changes_event
  ON public.event_winner_rank_changes (event_id, changed_at DESC);
COMMENT ON TABLE public.event_winner_rank_changes IS
  'Every change of events_registrations.final_rank, from any write path, with who made it (NULL for service-role / direct sessions). A placed row moved between events logs a clear on the old event and a set on the new. Written only by trg_events_registrations_final_rank_history. BUG-006273.';

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
      INSERT INTO public.event_winner_rank_changes (event_id, registration_id, old_rank, new_rank, changed_by)
      VALUES (NEW.event_id, NEW.id, NULL, NEW.final_rank, auth.uid());
    END IF;
  ELSIF NEW.event_id IS DISTINCT FROM OLD.event_id
        AND (OLD.final_rank IS NOT NULL OR NEW.final_rank IS NOT NULL) THEN
    IF OLD.final_rank IS NOT NULL THEN
      INSERT INTO public.event_winner_rank_changes (event_id, registration_id, old_rank, new_rank, changed_by)
      VALUES (OLD.event_id, NEW.id, OLD.final_rank, NULL, auth.uid());
    END IF;
    IF NEW.final_rank IS NOT NULL THEN
      INSERT INTO public.event_winner_rank_changes (event_id, registration_id, old_rank, new_rank, changed_by)
      VALUES (NEW.event_id, NEW.id, NULL, NEW.final_rank, auth.uid());
    END IF;
  ELSIF NEW.final_rank IS DISTINCT FROM OLD.final_rank THEN
    INSERT INTO public.event_winner_rank_changes (event_id, registration_id, old_rank, new_rank, changed_by)
    VALUES (NEW.event_id, NEW.id, OLD.final_rank, NEW.final_rank, auth.uid());
  END IF;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_events_registrations_final_rank_history() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_events_registrations_final_rank_history ON public.events_registrations;
CREATE TRIGGER trg_events_registrations_final_rank_history
  AFTER INSERT OR UPDATE OF final_rank, event_id ON public.events_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_events_registrations_final_rank_history();

-- ---------------------------------------------------------------------------
-- 7. Self-check
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
  -- The guard must fire on a move and on a rename, not only on final_rank.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgname = 'trg_events_registrations_final_rank_guard'
      AND t.tgrelid = 'public.events_registrations'::regclass
      AND NOT t.tgisinternal
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
             FROM pg_attribute a
            WHERE a.attrelid = t.tgrelid AND a.attnum = ANY (t.tgattr))
          @> ARRAY['department', 'event_id', 'final_rank', 'form_id', 'institution_name', 'participant_name']
  ) THEN
    RAISE EXCEPTION 'final_rank guard trigger missing or not watching event_id/form_id/identity columns';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_events_registrations_final_rank_history'
      AND tgrelid = 'public.events_registrations'::regclass
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'final_rank history trigger missing';
  END IF;
  IF has_function_privilege('anon', 'public.fn_set_event_registration_ranks(uuid, jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_can_record_event_winners(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can still execute a winners function';
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
