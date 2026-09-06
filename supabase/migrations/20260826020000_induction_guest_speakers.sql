-- ============================================================================
-- Induction — record a guest speaker who has NO JKKN login account
-- File: 20260826020000_induction_guest_speakers.sql | Date: 2026-08-26
--
-- THE DEFECT (measured on production 2026-08-13)
--   public.event_session_speakers.profile_id is uuid NOT NULL, and 0 of the 45
--   live rows carry a NULL profile_id. The picker copy says "Only people WITH a
--   login account". So an outside guest who genuinely taught an induction
--   session — a visiting doctor, an alumnus, an industry speaker — cannot be
--   recorded AT ALL. Four such people are missing from the 2026 record.
--
--   There are no guest columns of any kind today, so this is NOT relaxing a
--   constraint. It adds a second, reusable identity and then requires EXACTLY
--   ONE of the two to be present on every link row.
--
-- WHY THE GUEST TABLE IS CLUSTER-WIDE (Director decision D11)
--   event_guest_speakers deliberately has NO institution_id. A guest is saved
--   ONCE and reused across colleges, and the coordinator at the second college
--   must be able to SEE that they already spoke at the first — that visible
--   history is the whole point of the decision, and an institution column would
--   make it unreachable. Access is therefore gated on the induction permission
--   keys alone, with no role_has_institution_access() clause. That absence is a
--   decision, not an oversight.
--
-- WHAT THIS DOES NOT TOUCH
--   fn_induction_mark_attendance (and the four sibling gates in
--   20260702150000) authorize an assigned resource person with
--   `sp.profile_id = auth.uid()`. On a guest row profile_id is NULL and
--   `NULL = auth.uid()` is NULL — never TRUE — so a guest speaker gains NO
--   attendance-marking rights and NO event access. Verified against every
--   consumer of the table; not one of them is rewritten here.
--
-- OBJECTS
--   1. public.event_guest_speakers            — the reusable guest record
--   2. event_session_speakers                 — guest_speaker_id + one-identity CHECK
--   3. fn_induction_set_session_speakers      — REPLACED: routes each id to the
--                                               identity space it belongs to
--   4. fn_induction_guest_speakers_directory  — reuse + history (D11)
--   5. fn_guest_speaker_conflicts             — the availability spine, widened
--                                               to the guest identity (D11)
-- ============================================================================

-- ── 1. The reusable guest record ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_guest_speakers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name    text NOT NULL,
  designation  text,
  organization text,
  email        text,
  phone        text,
  created_by   uuid DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_guest_speaker_name_present CHECK (length(btrim(full_name)) > 0)
);

-- Search index for the reuse picker (name is what a coordinator types).
CREATE INDEX IF NOT EXISTS idx_egs_full_name ON public.event_guest_speakers (lower(full_name));

-- NO unique constraint on the name, deliberately: two genuinely different guests
-- can share a name, which is exactly why the picker shows their session history.

DROP TRIGGER IF EXISTS set_updated_at ON public.event_guest_speakers;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.event_guest_speakers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.event_guest_speakers ENABLE ROW LEVEL SECURITY;

-- Supabase's ALTER DEFAULT PRIVILEGES hands the public anon key the full grant on
-- every new table in schema public. RLS does not undo that grant, so revoke it.
REVOKE ALL ON TABLE public.event_guest_speakers FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.event_guest_speakers TO authenticated;
-- No DELETE grant and no DELETE policy: a guest is a shared, permanent record and
-- the link column below is ON DELETE RESTRICT. Removing one is an admin task.

DROP POLICY IF EXISTS egs_select ON public.event_guest_speakers;
CREATE POLICY egs_select ON public.event_guest_speakers
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR user_has_permission('induction.view')
  OR user_has_permission('induction.manage')
);

DROP POLICY IF EXISTS egs_insert ON public.event_guest_speakers;
CREATE POLICY egs_insert ON public.event_guest_speakers
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin() OR user_has_permission('induction.manage')
);

DROP POLICY IF EXISTS egs_update ON public.event_guest_speakers;
CREATE POLICY egs_update ON public.event_guest_speakers
FOR UPDATE
USING      (is_super_admin() OR is_admin() OR user_has_permission('induction.manage'))
WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('induction.manage'));

-- ── 2. The link row carries EXACTLY ONE identity ────────────────────────────
ALTER TABLE public.event_session_speakers
  ADD COLUMN IF NOT EXISTS guest_speaker_id uuid
  REFERENCES public.event_guest_speakers(id) ON DELETE RESTRICT;

ALTER TABLE public.event_session_speakers ALTER COLUMN profile_id DROP NOT NULL;

-- ADD CONSTRAINT has no IF NOT EXISTS; guard it so the file stays re-runnable.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conname = 'ck_session_speaker_one_identity'
      AND c.conrelid = 'public.event_session_speakers'::regclass
  ) THEN
    ALTER TABLE public.event_session_speakers
      ADD CONSTRAINT ck_session_speaker_one_identity
      CHECK (num_nonnulls(profile_id, guest_speaker_id) = 1);
  END IF;
END $$;

-- uq_session_speaker UNIQUE (session_id, profile_id) permits many NULLs, so it
-- cannot stop the same guest being linked twice. This partial index does.
CREATE UNIQUE INDEX IF NOT EXISTS uq_session_guest_speaker
  ON public.event_session_speakers (session_id, guest_speaker_id)
  WHERE guest_speaker_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ess_guest ON public.event_session_speakers(guest_speaker_id);

-- ── 3. The write path routes each id to its identity space ──────────────────
-- Signature is UNCHANGED on purpose. CREATE OR REPLACE cannot rename a parameter,
-- and a DROP would break the deployed frontend (which calls by the named argument
-- p_profile_ids) for the whole window between this migration and the next deploy.
-- So p_profile_ids now means "the speaker ids for this session" — each is routed
-- to a profile row or a guest row depending on which table it exists in. UUIDs
-- from the two tables cannot collide. Replace-set semantics are unchanged: the
-- caller sends the whole list and the whole set is rebuilt.
--
-- The old deployed frontend keeps working: it can only ever send profile ids, and
-- it cannot create a guest, so there is nothing of the new kind for it to drop.
CREATE OR REPLACE FUNCTION public.fn_induction_set_session_speakers(
  p_session_id   uuid,
  p_profile_ids  uuid[],
  p_source_label text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst    uuid;
  v_ids     uuid[];
  v_people  integer;
  v_guests  integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_induction_set_session_speakers: not authenticated';
  END IF;
  SELECT ip.institution_id INTO v_inst
  FROM public.event_sessions es
  JOIN public.induction_programs ip ON ip.event_id = es.event_id
  WHERE es.id = p_session_id;
  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'fn_induction_set_session_speakers: not an induction session';
  END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_set_session_speakers: not authorized';
  END IF;

  v_ids := COALESCE(p_profile_ids, ARRAY[]::uuid[]);

  DELETE FROM public.event_session_speakers WHERE session_id = p_session_id;

  -- Account-holders. Unchanged rule: only users the caller can actually reach,
  -- so a coordinator cannot link a person from an institution they have no
  -- access to (cross-tenant link injection).
  INSERT INTO public.event_session_speakers (session_id, profile_id, source_label, created_by)
  SELECT p_session_id, sid, p_source_label, auth.uid()
  FROM unnest(v_ids) AS sid
  WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = sid
                AND (is_super_admin() OR is_admin() OR role_has_institution_access(p.institution_id)))
  ON CONFLICT (session_id, profile_id) DO NOTHING;
  GET DIAGNOSTICS v_people = ROW_COUNT;

  -- Guests. Cluster-wide by decision D11, so there is no institution test here;
  -- authority to write came from the induction.manage check above. An id that is
  -- a profile is never treated as a guest.
  INSERT INTO public.event_session_speakers (session_id, guest_speaker_id, source_label, created_by)
  SELECT p_session_id, sid, p_source_label, auth.uid()
  FROM unnest(v_ids) AS sid
  WHERE EXISTS (SELECT 1 FROM public.event_guest_speakers g WHERE g.id = sid)
    AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = sid)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_guests = ROW_COUNT;

  RETURN v_people + v_guests;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_set_session_speakers(uuid, uuid[], text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_set_session_speakers(uuid, uuid[], text) TO authenticated;

-- ── 4. Reuse a saved guest, and see where they have spoken (D11) ────────────
-- Cluster-wide on purpose: the history a coordinator needs in order to tell two
-- similarly-named guests apart is precisely the history from the OTHER colleges.
--
-- Every OUT column is prefixed or otherwise distinct from the table columns it
-- reads, and every column reference in the body is table-qualified — the 42702
-- "column reference is ambiguous" trap resolves at EXECUTION, not at CREATE.
CREATE OR REPLACE FUNCTION public.fn_induction_guest_speakers_directory(
  p_query text    DEFAULT NULL,
  p_limit integer DEFAULT 25
)
RETURNS TABLE (
  guest_id           uuid,
  guest_name         text,
  guest_designation  text,
  guest_organization text,
  guest_email        text,
  guest_phone        text,
  sessions_count     integer,
  last_session_at    timestamptz,
  last_event_name    text,
  colleges_label     text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.id,
         g.full_name,
         g.designation,
         g.organization,
         g.email,
         g.phone,
         COALESCE(h.n, 0)::integer,
         h.last_at,
         h.last_event,
         h.colleges
  FROM public.event_guest_speakers g
  LEFT JOIN LATERAL (
    SELECT count(*)::integer                                             AS n,
           max(es.start_at)                                              AS last_at,
           (array_agg(ev.name ORDER BY es.start_at DESC NULLS LAST))[1]  AS last_event,
           string_agg(DISTINCT i.name, ', ')                             AS colleges
    FROM public.event_session_speakers sp
    JOIN public.event_sessions es           ON es.id = sp.session_id
    LEFT JOIN public.events ev              ON ev.id = es.event_id
    LEFT JOIN public.induction_programs ip  ON ip.event_id = es.event_id
    LEFT JOIN public.institutions i         ON i.id = ip.institution_id
    WHERE sp.guest_speaker_id = g.id
  ) h ON true
  WHERE (is_super_admin() OR is_admin()
         OR user_has_permission('induction.view')
         OR user_has_permission('induction.manage'))
    AND (
      p_query IS NULL OR btrim(p_query) = ''
      OR g.full_name              ILIKE '%' || btrim(p_query) || '%'
      OR COALESCE(g.organization, '') ILIKE '%' || btrim(p_query) || '%'
      OR COALESCE(g.email, '')        ILIKE '%' || btrim(p_query) || '%'
    )
  ORDER BY g.full_name
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
$$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_guest_speakers_directory(text, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_guest_speakers_directory(text, integer) TO authenticated;

-- ── 5. The availability spine, widened to the guest identity (D11) ──────────
-- This is the SAME mechanism as fn_person_conflicts / fn_people_conflicts, not a
-- second one: identical row shape, identical 'event' source, identical advisory
-- policy, and the caller merges the rows into the one conflict map the picker
-- already renders. fn_person_conflicts itself could not simply be widened — it
-- takes a profiles.id and reads profiles.institution_id for its scope guard, and
-- a guest has neither. A guest has exactly one diary (sessions they speak at):
-- no timetable, no meeting_bookings row, no event_human_roles row.
CREATE OR REPLACE FUNCTION public.fn_guest_speaker_conflicts(
  p_guest_ids uuid[],
  p_start     timestamptz,
  p_end       timestamptz
)
RETURNS TABLE (
  guest_id   uuid,
  source     text,
  ref_id     uuid,
  label      text,
  starts_at  timestamptz,
  ends_at    timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sp.guest_speaker_id,
         'event'::text,
         es.id,
         ('Speaking: ' || COALESCE(ev.name, 'event') || COALESCE(' — ' || es.title, ''))::text,
         es.start_at,
         es.end_at
  FROM public.event_session_speakers sp
  JOIN public.event_sessions es ON es.id = sp.session_id
  LEFT JOIN public.events ev    ON ev.id = es.event_id
  WHERE sp.guest_speaker_id = ANY (COALESCE(p_guest_ids, ARRAY[]::uuid[]))
    AND p_start IS NOT NULL AND p_end IS NOT NULL AND p_end > p_start
    AND es.status IS DISTINCT FROM 'cancelled'
    AND es.start_at < p_end
    AND es.end_at   > p_start
    AND (is_super_admin() OR is_admin()
         OR user_has_permission('induction.view')
         OR user_has_permission('induction.manage'));
$$;

REVOKE EXECUTE ON FUNCTION public.fn_guest_speaker_conflicts(uuid[], timestamptz, timestamptz) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_guest_speaker_conflicts(uuid[], timestamptz, timestamptz) TO authenticated;

-- ── End-state assert. RAISE EXCEPTION, never NOTICE: a guard whose miss path is
-- a NOTICE reads as success in Studio and in a pooled session. ───────────────
DO $$
DECLARE v_nullable text; v_has_check boolean; v_anon boolean;
BEGIN
  SELECT c.is_nullable INTO v_nullable
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'event_session_speakers'
    AND c.column_name = 'profile_id';
  IF v_nullable IS DISTINCT FROM 'YES' THEN
    RAISE EXCEPTION 'guest speakers: event_session_speakers.profile_id is still NOT NULL';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint pc
    WHERE pc.conname = 'ck_session_speaker_one_identity'
      AND pc.conrelid = 'public.event_session_speakers'::regclass
  ) INTO v_has_check;
  IF NOT v_has_check THEN
    RAISE EXCEPTION 'guest speakers: the exactly-one-identity CHECK is missing';
  END IF;

  SELECT has_table_privilege('anon', 'public.event_guest_speakers', 'SELECT') INTO v_anon;
  IF v_anon THEN
    RAISE EXCEPTION 'guest speakers: anon still holds SELECT on event_guest_speakers';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
