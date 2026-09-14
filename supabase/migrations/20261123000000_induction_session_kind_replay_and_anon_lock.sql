-- ============================================================================
-- Fresher Induction — session `kind`, restated at a version of its own
-- File: 20261123000000_induction_session_kind_replay_and_anon_lock.sql
-- Date: 2026-09-09
--
-- WHY THIS FILE REPEATS 20261118000000_induction_session_kind_is_explicit.sql
--
-- That file (#3412) and 20261118000000_induction_my_mentor_no_contact.sql both
-- claim version 20261118000000. supabase_migrations.schema_migrations keys on
-- `version` and that column is the PRIMARY KEY, so on a from-scratch replay the
-- first of the two to run takes the ledger row and the second is treated as
-- already applied and silently skipped. Which one loses is not something the
-- repo decides.
--
-- Neither file may be renumbered: both have run against production, and
-- scripts/ci/check-migration-rename-applied.mjs refuses a rename of an applied
-- migration because renaming re-arms finished work as pending. So the fix is
-- not a rename — it is this file, at a version of its own, restating the final
-- definition of fn_induction_upsert_session. If the replay skips
-- 20261118000000_induction_session_kind_is_explicit.sql, this one still lands
-- the right function. The function half is byte-identical to what is already
-- deployed, so re-running it against production changes nothing.
--
-- THE ACL HALF IS ALSO A NO-OP, and the header said otherwise until the live
-- ACL was read. CORRECTED 2026-09-09: this file originally claimed that adding
-- p_kind in 20260827040000 made a new function that inherited the default
-- EXECUTE TO PUBLIC, so the 15-argument form had been anon-callable since
-- 2026-08-27. That was reasoning from the general rule, not from production.
-- pg_proc.proacl, read live before applying, is:
--
--     postgres=X/postgres | authenticated=X/postgres | service_role=X/postgres
--
-- No PUBLIC entry, and has_function_privilege('anon', …, 'EXECUTE') is false.
-- The lock was already there. The REVOKE below therefore takes nothing away;
-- it states on a fresh database what production already enforces, which is the
-- whole reason for restating it here rather than inheriting it from
-- 20260629120000 (that file locked the 14-argument form).
--
-- Checked at the same time, because REVOKE … FROM PUBLIC is the kind of line
-- that removes an inherited grant nobody meant to lose: service_role holds its
-- own explicit EXECUTE, so it is unaffected. Confirmed after applying.
--
-- The behaviour, unchanged from 20261118000000: `kind` is an explicit choice.
--
--     p_kind NULL              -> leave `kind` exactly as it is (API callers)
--     p_kind ''                -> ordinary session
--     p_kind 'registration'    -> registration desk
--     p_kind 'mentor_checkin'  -> monthly mentor check-in
--
-- Read that file's header for the bug this behaviour exists to fix (the Arts
-- induction talk counted as a monthly check-in).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_induction_upsert_session(
  p_event_id uuid,
  p_session_id uuid,
  p_day_number integer,
  p_batch_id uuid,
  p_start_at timestamp with time zone,
  p_end_at timestamp with time zone,
  p_title text,
  p_description text DEFAULT NULL::text,
  p_venue_text text DEFAULT NULL::text,
  p_speaker_text text DEFAULT NULL::text,
  p_outcome_text text DEFAULT NULL::text,
  p_resource_links jsonb DEFAULT '[]'::jsonb,
  p_session_order integer DEFAULT 1,
  p_venue_resource_id uuid DEFAULT NULL::uuid,
  p_kind text DEFAULT NULL::text
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inst          UUID;
  v_sid           UUID;
  v_existing_res  UUID;
  v_existing_text TEXT;
  v_venue_text    TEXT;
  v_res_name      TEXT;
  v_res_status    TEXT;
  v_res_inst      UUID;
  v_res_is_venue  BOOLEAN;
  v_kind          TEXT;
BEGIN
  SELECT ip.institution_id INTO v_inst FROM public.induction_programs ip WHERE ip.event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_upsert_session: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN
    RAISE EXCEPTION 'fn_induction_upsert_session: not authorized';
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN RAISE EXCEPTION 'fn_induction_upsert_session: title required'; END IF;
  IF p_start_at IS NULL OR p_end_at IS NULL OR p_end_at <= p_start_at THEN
    RAISE EXCEPTION 'fn_induction_upsert_session: end must be after start';
  END IF;
  IF p_batch_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.induction_batches b WHERE b.id = p_batch_id AND b.event_id = p_event_id) THEN
    RAISE EXCEPTION 'fn_induction_upsert_session: batch does not belong to this induction';
  END IF;
  -- CHANGED (this migration): 'mentor_checkin' joins 'registration' as a value
  -- the caller may set. The form shows both as checkboxes, so the value it
  -- sends is the value the user chose.
  v_kind := NULLIF(btrim(COALESCE(p_kind, '')), '');
  IF v_kind IS NOT NULL AND v_kind NOT IN ('registration', 'mentor_checkin') THEN
    RAISE EXCEPTION 'fn_induction_upsert_session: unsupported session kind %', v_kind;
  END IF;

  IF p_session_id IS NOT NULL THEN
    SELECT es.venue_resource_id, es.venue_text
      INTO v_existing_res, v_existing_text
    FROM public.event_sessions es
    WHERE es.id = p_session_id AND es.event_id = p_event_id;
  END IF;

  IF p_venue_resource_id IS NULL THEN
    v_venue_text := NULL;
  ELSIF p_session_id IS NOT NULL AND p_venue_resource_id IS NOT DISTINCT FROM v_existing_res THEN
    v_venue_text := v_existing_text;
  ELSE
    SELECT r.name,
           r.status,
           r.institution_id,
           EXISTS (
             SELECT 1 FROM public.resource_parent_categories pc
             WHERE pc.id = r.parent_category_id
               AND lower(btrim(pc.name)) = 'spaces & venues'
           )
      INTO v_res_name, v_res_status, v_res_inst, v_res_is_venue
    FROM public.resources r
    WHERE r.id = p_venue_resource_id;

    IF v_res_name IS NULL THEN
      RAISE EXCEPTION 'fn_induction_upsert_session: venue resource not found';
    END IF;
    IF NOT v_res_is_venue THEN
      RAISE EXCEPTION 'fn_induction_upsert_session: resource is not a Spaces & Venues room';
    END IF;
    IF v_res_status IS DISTINCT FROM 'available' THEN
      RAISE EXCEPTION 'fn_induction_upsert_session: venue is not available';
    END IF;
    -- NOT touched: this gates whether the caller may use THIS VENUE (its own
    -- institution), an unrelated concern from "can this caller manage this induction."
    IF NOT (is_super_admin() OR is_admin() OR role_has_institution_access(v_res_inst)) THEN
      RAISE EXCEPTION 'fn_induction_upsert_session: no access to that venue''s institution';
    END IF;
    v_venue_text := v_res_name;
  END IF;

  IF p_session_id IS NULL THEN
    INSERT INTO public.event_sessions
      (event_id, title, description, start_at, end_at, day_number, session_order,
       venue_text, venue_resource_id, speaker_text, outcome_text, resource_links,
       batch_id, status, created_by, kind)
    VALUES
      (p_event_id, btrim(p_title), p_description, p_start_at, p_end_at, p_day_number,
       COALESCE(p_session_order, 1), v_venue_text, p_venue_resource_id, p_speaker_text,
       p_outcome_text, COALESCE(p_resource_links, '[]'::jsonb), p_batch_id, 'scheduled', auth.uid(),
       v_kind)
    RETURNING id INTO v_sid;
  ELSE
    UPDATE public.event_sessions SET
      title = btrim(p_title), description = p_description,
      start_at = p_start_at, end_at = p_end_at, day_number = p_day_number,
      session_order = COALESCE(p_session_order, session_order),
      venue_text = v_venue_text, venue_resource_id = p_venue_resource_id,
      speaker_text = p_speaker_text, outcome_text = p_outcome_text,
      resource_links = COALESCE(p_resource_links, '[]'::jsonb),
      -- CHANGED (this migration): no write-once rule. p_kind NULL still leaves
      -- the stored value alone (for callers that do not own the field); any
      -- other value is taken literally, including '' to clear it. The form
      -- always sends what its checkboxes show, so a check-in rewritten into a
      -- talk stops being a check-in — the 185967bf case in the header.
      kind = CASE WHEN p_kind IS NULL THEN kind ELSE v_kind END,
      batch_id = p_batch_id, updated_at = now()
    WHERE id = p_session_id AND event_id = p_event_id
    RETURNING id INTO v_sid;
    IF v_sid IS NULL THEN RAISE EXCEPTION 'fn_induction_upsert_session: session not found for this induction'; END IF;
  END IF;
  RETURN v_sid;
END $function$;

-- The anon lock, stated rather than inherited. 15 arguments, matching the
-- signature above; 20260629120000 locked the 14-argument form.
REVOKE EXECUTE ON FUNCTION public.fn_induction_upsert_session(
  uuid, uuid, integer, uuid, timestamptz, timestamptz, text, text, text, text,
  text, jsonb, integer, uuid, text)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_upsert_session(
  uuid, uuid, integer, uuid, timestamptz, timestamptz, text, text, text, text,
  text, jsonb, integer, uuid, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
