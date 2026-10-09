-- BUG-006273 (COO, 9 Oct): cultural events need the same Winner / Runner-up
-- provision sports tournaments have (#4222 records tournament_entries.final_rank).
-- A cultural event's participants are rows in events_registrations, so the place
-- is recorded there.
--
-- WHO MAY RECORD: the event's creator, its in-charge (events.config->incharges),
-- a super admin, or an admin with institution access to the event — the same
-- shape as fn_can_manage_event_waitlist.
--
-- WHY A TRIGGER AS WELL AS THE RPC: RLS grants rows, not columns. Live RLS on
-- events_registrations still carries events_reg_public_event_update (any signed-in
-- person may update registrations of a public, non-draft event), and a person
-- inserting their own registration could send final_rank = 1. The guard trigger
-- refuses any client (anon / authenticated) change to final_rank unless the
-- caller passes the same authority check, whatever policy let the row through.
-- Service-role and direct database sessions are trusted, as everywhere else.

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------
ALTER TABLE public.events_registrations
  ADD COLUMN IF NOT EXISTS final_rank smallint
    CONSTRAINT events_registrations_final_rank_check CHECK (final_rank BETWEEN 1 AND 3);

COMMENT ON COLUMN public.events_registrations.final_rank IS
  'Place won in a cultural event: 1 winner, 2 runner-up, 3 third place; NULL = not placed. Written only through fn_set_event_registration_ranks (BUG-006273); guarded by trg_events_registrations_final_rank_guard.';

-- ---------------------------------------------------------------------------
-- 2. Authority
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
          AND (e.institution_id IS NULL OR public.role_has_institution_access(e.institution_id))
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
  'May the caller record an event''s winners (events_registrations.final_rank)? Creator, in-charge, super admin, or an admin with institution access. BUG-006273.';

REVOKE EXECUTE ON FUNCTION public.fn_can_record_event_winners(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_can_record_event_winners(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Column guard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_events_registrations_final_rank_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.final_rank IS NULL THEN
      RETURN NEW;
    END IF;
  ELSIF NEW.final_rank IS NOT DISTINCT FROM OLD.final_rank THEN
    RETURN NEW;
  END IF;

  -- Service role and direct database sessions are trusted.
  IF COALESCE(auth.role(), '') NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  -- COALESCE: a NULL answer fails closed.
  IF NOT COALESCE(public.fn_can_record_event_winners(NEW.event_id), false) THEN
    RAISE EXCEPTION 'Only the event''s creator, its in-charge or an administrator can record winners.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_events_registrations_final_rank_guard() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_events_registrations_final_rank_guard ON public.events_registrations;
CREATE TRIGGER trg_events_registrations_final_rank_guard
  BEFORE INSERT OR UPDATE OF final_rank ON public.events_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_events_registrations_final_rank_guard();

-- ---------------------------------------------------------------------------
-- 4. The write path
-- ---------------------------------------------------------------------------
-- p_changes: [{"registration_id": "<uuid>", "final_rank": 1|2|3|null}, ...]
-- One transaction: either every change lands or none does. Clears run before
-- sets so no point in the run has two people on one place when the screen sent
-- a swap. Only cultural events — tournaments rank tournament_entries instead.
CREATE OR REPLACE FUNCTION public.fn_set_event_registration_ranks(p_event_id uuid, p_changes jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
  v_bad integer;
  v_n integer := 0;
  v_rows integer;
  c record;
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
     OR (jsonb_typeof(x->'final_rank') <> 'null'
         AND (jsonb_typeof(x->'final_rank') <> 'number'
              OR (x->>'final_rank') !~ '^[1-3]$'));
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Each change needs a registration and a place of 1, 2, 3 or none.'
      USING ERRCODE = '22023';
  END IF;

  FOR c IN
    SELECT (x->>'registration_id')::uuid AS reg_id,
           NULLIF(x->>'final_rank', '')::smallint AS rank,
           ord
    FROM jsonb_array_elements(p_changes) WITH ORDINALITY AS t(x, ord)
    ORDER BY (x->'final_rank' = 'null'::jsonb) DESC, ord
  LOOP
    UPDATE public.events_registrations r
       SET final_rank = c.rank
     WHERE r.id = c.reg_id
       AND r.event_id = p_event_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'A registration in the list does not belong to this event.'
        USING ERRCODE = '22023';
    END IF;
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$$;
COMMENT ON FUNCTION public.fn_set_event_registration_ranks(uuid, jsonb) IS
  'Records/clears 1st/2nd/3rd place on a cultural event''s registrations, atomically, clears first. Caller must pass fn_can_record_event_winners. BUG-006273.';

REVOKE EXECUTE ON FUNCTION public.fn_set_event_registration_ranks(uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_set_event_registration_ranks(uuid, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Self-check
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
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_events_registrations_final_rank_guard'
      AND tgrelid = 'public.events_registrations'::regclass
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'final_rank guard trigger missing';
  END IF;
  IF has_function_privilege('anon', 'public.fn_set_event_registration_ranks(uuid, jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_can_record_event_winners(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can still execute a winners function';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_set_event_registration_ranks(uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute fn_set_event_registration_ranks';
  END IF;
END
$assert$;
