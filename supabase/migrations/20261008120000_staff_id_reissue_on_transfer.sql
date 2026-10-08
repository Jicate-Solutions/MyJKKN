-- Staff ID re-issue when a staff member changes institution or teaching type.
--
-- WHY THIS EXISTS. staff.staff_id encodes two facts: the institution prefix and
-- the teaching bucket (DCH001 teaching, NOTDCH001 non-teaching). Since
-- 20260828120000 the code has been permanent -- trg_staff_autonumber rejects any
-- UPDATE that changes it -- but nothing reacted when institution_id or
-- category_id changed, so the code silently stopped matching the person. On
-- 2026-10-08, 11 active staff already carried a code from their OLD institution
-- or OLD teaching bucket (DCH070 on a non-teaching person, NOTCET028 on a Main
-- Office person) and no application path could fix them.
--
-- THE RULE (confirmed with the user 2026-10-08):
--   * An ACTIVE staff member whose institution OR teaching flag changes is
--     issued a fresh code from the new bucket's counter, in the same UPDATE.
--     Moving between two teaching categories (or two non-teaching ones) keeps
--     the code: the code does not encode the category, only the flag.
--   * The old code is RETIRED, never reused: it goes to staff_id_history, is
--     appended to staff.retired_staff_ids (so the staff-list search and the
--     JKKN ID resolver still find the person by it), and fn_next_staff_code
--     refuses to hand it out again.
--   * An INACTIVE staff member keeps their code through an edit (a leaver must
--     not consume a number); on reactivation a code that no longer matches the
--     current bucket is re-issued.
--   * Manual edits of staff_id stay rejected for EVERY role, super admins
--     included. Only this trigger can change the code.
--
-- NOTHING keys on the text code: every other `staff_id` column in the schema is
-- the UUID staff.id, so re-issuing breaks no relation. Issued salary registers
-- snapshot the code on purpose (hr_salary_register_lines.employee_code) and are
-- deliberately left alone.
--
-- TRIGGERS ON public.staff touched here: trg_staff_autonumber (function body
-- rewritten, trigger definition unchanged).

-- ── 1. History of retired codes ──────────────────────────────────────────────
-- Records RETIRED codes only. The first issue is not logged here, because on
-- INSERT the staff row does not exist yet when the BEFORE trigger runs and the
-- FK to it could not be satisfied.

CREATE TABLE IF NOT EXISTS public.staff_id_history (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_uuid          uuid        NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  staff_id            text        NOT NULL,
  new_staff_id        text,
  reason              text        NOT NULL,
  from_institution_id uuid        REFERENCES public.institutions(id) ON DELETE SET NULL,
  to_institution_id   uuid        REFERENCES public.institutions(id) ON DELETE SET NULL,
  from_is_teaching    boolean,
  to_is_teaching      boolean,
  changed_by          uuid,
  retired_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_id_history_reason_chk CHECK (reason IN (
    'institution_change', 'teaching_change', 'institution_and_teaching_change',
    'reactivation', 'corrective_reissue'
  ))
);

COMMENT ON TABLE public.staff_id_history IS
  'Staff IDs that were retired when the holder changed institution or teaching type. '
  'staff_id here is the RETIRED code. Written only by fn_staff_autonumber (SECURITY DEFINER) '
  'and the one-off corrective re-issue; there is no policy granting any user a write.';

-- A retired code is retired exactly once: fn_next_staff_code never re-issues it.
CREATE UNIQUE INDEX IF NOT EXISTS staff_id_history_staff_id_uq
  ON public.staff_id_history (staff_id);

CREATE INDEX IF NOT EXISTS idx_staff_id_history_staff_uuid
  ON public.staff_id_history (staff_uuid, retired_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_id_history_from_institution
  ON public.staff_id_history (from_institution_id);
CREATE INDEX IF NOT EXISTS idx_staff_id_history_to_institution
  ON public.staff_id_history (to_institution_id);

ALTER TABLE public.staff_id_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staff_id_history FROM anon, authenticated;
GRANT SELECT ON public.staff_id_history TO authenticated;

-- Visible exactly to whoever can see the staff row: the EXISTS runs under the
-- caller's own RLS on staff, so institution scope is inherited, not restated.
DROP POLICY IF EXISTS staff_id_history_select ON public.staff_id_history;
CREATE POLICY staff_id_history_select
  ON public.staff_id_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id_history.staff_uuid));

-- ── 2. Searchable copy of the retired codes ──────────────────────────────────
-- Space-joined. Exists only so the existing `.ilike` staff search can match an
-- old code without a cross-table OR (PostgREST cannot OR across an embed).
-- staff_id_history is the source of truth; the trigger is the only writer and
-- overwrites any value a caller sends.

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS retired_staff_ids text;

COMMENT ON COLUMN public.staff.retired_staff_ids IS
  'Space-separated staff IDs this person held before being re-issued one on a change of '
  'institution or teaching type. Derived from staff_id_history by trg_staff_autonumber; '
  'a value supplied by a caller is discarded. Search-only.';

-- ── 3. Generator: never hand out a retired code ──────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_next_staff_code(
  p_institution_id uuid,
  p_is_teaching    boolean
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prefix text;
  v_full   text;
  v_seq    integer;
  v_code   text;
  v_guard  integer := 0;
BEGIN
  IF p_institution_id IS NULL THEN
    RAISE EXCEPTION 'Cannot issue a staff ID: this staff member has no institution.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_is_teaching IS NULL THEN
    RAISE EXCEPTION 'Cannot issue a staff ID: this staff member has no employment category, so teaching / non-teaching is unknown.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT i.staff_code_prefix INTO v_prefix
  FROM public.institutions i WHERE i.id = p_institution_id;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Cannot issue a staff ID: institution % has no staff_code_prefix configured.', p_institution_id
      USING ERRCODE = 'P0001';
  END IF;

  v_full := CASE WHEN p_is_teaching THEN v_prefix ELSE 'NOT' || v_prefix END;

  LOOP
    v_guard := v_guard + 1;
    IF v_guard > 5000 THEN
      RAISE EXCEPTION 'Could not find a free staff ID for prefix % after 5000 attempts.', v_full
        USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.staff_id_counters AS c (institution_id, is_teaching, next_seq)
    VALUES (p_institution_id, p_is_teaching, 2)
    ON CONFLICT (institution_id, is_teaching)
      DO UPDATE SET next_seq = c.next_seq + 1, updated_at = now()
    RETURNING c.next_seq - 1 INTO v_seq;

    v_code := v_full || lpad(v_seq::text, 3, '0');

    -- Free means: held by nobody now AND never held by anybody. The second half
    -- is what keeps an old printed card or sheet from pointing at a stranger.
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.staff_id = v_code)
          AND NOT EXISTS (SELECT 1 FROM public.staff_id_history h WHERE h.staff_id = v_code);
  END LOOP;

  RETURN v_code;
END;
$$;

COMMENT ON FUNCTION public.fn_next_staff_code(uuid, boolean) IS
  'Claims and returns the next staff ID for an institution x teaching bucket, skipping any code '
  'a living or retired staff member holds. SECURITY DEFINER because staff_id_counters grants no direct writes.';

-- ── 4. Trigger function: generate on creation, re-issue on a bucket change ───

CREATE OR REPLACE FUNCTION public.fn_staff_autonumber()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new_teaching    boolean;
  v_old_teaching    boolean;
  v_inst_changed    boolean;
  v_teach_changed   boolean := false;
  v_reactivated     boolean;
  v_reason          text;
  v_new_code        text;
  v_expected_prefix text;
BEGIN
  -- The edit form defaults this field to `staff?.staff_id || ''`, so a staff
  -- member with no code submits '' against a NULL OLD value. Without this
  -- normalisation the permanence guard below reads that as a manual edit and
  -- rejects every edit of an ID-less staff member.
  NEW.staff_id := nullif(btrim(coalesce(NEW.staff_id, '')), '');

  IF TG_OP = 'INSERT' THEN
    NEW.retired_staff_ids := NULL;

    -- Active staff only. Anything the caller supplied is discarded: creation
    -- is never manual.
    IF coalesce(NEW.is_active, false) THEN
      SELECT ec.is_teaching INTO v_new_teaching
      FROM public.employment_categories ec WHERE ec.id = NEW.category_id;

      NEW.staff_id := public.fn_next_staff_code(NEW.institution_id, v_new_teaching);
    ELSE
      NEW.staff_id := NULL;
    END IF;

    RETURN NEW;
  END IF;

  -- UPDATE. retired_staff_ids is derived; a caller never sets it.
  NEW.retired_staff_ids := OLD.retired_staff_ids;

  -- One guard covers every manual path: changing a code, clearing a code, and
  -- setting a code on a row that has none. There is deliberately no super-admin
  -- escape hatch. A re-issue below is the trigger's own doing, never a caller's
  -- -- the form round-trips the UNCHANGED value, which passes this guard.
  IF NEW.staff_id IS DISTINCT FROM OLD.staff_id THEN
    RAISE EXCEPTION 'Staff ID is system-generated and cannot be set or changed manually; it is re-issued automatically when the institution or staff type changes.'
      USING ERRCODE = 'P0001';
  END IF;

  v_inst_changed := NEW.institution_id IS DISTINCT FROM OLD.institution_id;
  v_reactivated  := coalesce(NEW.is_active, false) AND NOT coalesce(OLD.is_active, false);

  -- Only look the categories up when something that could matter moved; this
  -- trigger fires on every staff UPDATE, including bulk edits.
  IF v_inst_changed
     OR v_reactivated
     OR NEW.category_id IS DISTINCT FROM OLD.category_id THEN

    SELECT ec.is_teaching INTO v_new_teaching
    FROM public.employment_categories ec WHERE ec.id = NEW.category_id;
    SELECT ec.is_teaching INTO v_old_teaching
    FROM public.employment_categories ec WHERE ec.id = OLD.category_id;

    v_teach_changed := v_old_teaching IS DISTINCT FROM v_new_teaching;

    IF coalesce(NEW.is_active, false)
       AND OLD.staff_id IS NOT NULL
       AND (v_inst_changed OR v_teach_changed) THEN
      -- The person moved bucket. Same-flag category changes do not land here.
      v_reason := CASE
        WHEN v_inst_changed AND v_teach_changed THEN 'institution_and_teaching_change'
        WHEN v_inst_changed                     THEN 'institution_change'
        ELSE                                         'teaching_change'
      END;

    ELSIF v_reactivated AND NEW.staff_id IS NULL THEN
      -- Rejoin path. Only reaches staff who never held a code -- deactivation
      -- does NOT clear one, so a returning staff member keeps theirs.
      NEW.staff_id := public.fn_next_staff_code(NEW.institution_id, v_new_teaching);

    ELSIF v_reactivated AND NEW.staff_id IS NOT NULL AND v_new_teaching IS NOT NULL THEN
      -- An inactive person's code is left alone while they are away, so it may
      -- have gone stale. Prefixes are [A-Z]{2,8} by CHECK, so this is regex-safe.
      SELECT CASE WHEN v_new_teaching THEN i.staff_code_prefix
                  ELSE 'NOT' || i.staff_code_prefix END
        INTO v_expected_prefix
      FROM public.institutions i WHERE i.id = NEW.institution_id;

      IF v_expected_prefix IS NOT NULL
         AND NEW.staff_id !~ ('^' || v_expected_prefix || '[0-9]+$') THEN
        v_reason := 'reactivation';
      END IF;
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    v_new_code := public.fn_next_staff_code(NEW.institution_id, v_new_teaching);

    INSERT INTO public.staff_id_history (
      staff_uuid, staff_id, new_staff_id, reason,
      from_institution_id, to_institution_id, from_is_teaching, to_is_teaching, changed_by
    ) VALUES (
      OLD.id, OLD.staff_id, v_new_code, v_reason,
      OLD.institution_id, NEW.institution_id, v_old_teaching, v_new_teaching, auth.uid()
    );

    NEW.retired_staff_ids := nullif(btrim(coalesce(OLD.retired_staff_ids, '') || ' ' || OLD.staff_id), '');
    NEW.staff_id := v_new_code;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_staff_autonumber() IS
  'Issues a staff ID on creation (active staff only), re-issues it when an ACTIVE staff member changes '
  'institution or teaching type (or is reactivated with a stale code), and rejects every manual change. '
  'Bulk backfills must DISABLE TRIGGER trg_staff_autonumber -- the manual-change guard blocks any rewrite, '
  'including their own.';

-- Both are SECURITY DEFINER and CLAIM a number on every call; keep them off the
-- REST API. REVOKE FROM PUBLIC alone leaves Supabase's direct anon/authenticated
-- grants in place, so name them. CREATE OR REPLACE kept the earlier ACL, this
-- just re-asserts it.
REVOKE ALL ON FUNCTION public.fn_next_staff_code(uuid, boolean) FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.fn_staff_autonumber() FROM anon, authenticated, PUBLIC;

-- ── 5. JKKN ID resolver: a retired code still finds the person ───────────────
-- A printed ID card's barcode carries the code it was printed with. After a
-- re-issue that code is gone from staff.staff_id; without this, scanning an old
-- card finds nobody. Matched as 'team_code' so the caller needs no new case.

CREATE OR REPLACE FUNCTION public.fn_resolve_person(p_query text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_q        text := btrim(coalesce(p_query, ''));
  v_lower    text;
  v_digits   text;
  v_phone    text;
  v_all      boolean;
  v_results  jsonb;
BEGIN
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('users.jkkn_id.view')
  ) THEN
    RAISE EXCEPTION 'Not authorised to look people up'
      USING ERRCODE = '42501';
  END IF;

  v_all := COALESCE(public.is_super_admin(), false) OR public.is_admin();

  IF length(v_q) < 2 THEN
    RETURN jsonb_build_object(
      'query', v_q, 'ok', true, 'results', '[]'::jsonb,
      'note', 'Type at least two characters.'
    );
  END IF;

  v_lower  := lower(v_q);
  v_digits := regexp_replace(v_q, '[^0-9]', '', 'g');
  v_phone  := CASE WHEN length(v_digits) >= 10 THEN right(v_digits, 10) END;

  -- A JKKN ID that fails its check digit is a typo, and is reported as one.
  IF v_q ~ '^[0-9]{6}-[0-9]$' AND NOT public.fn_jkkn_id_validate(v_q) THEN
    RETURN jsonb_build_object(
      'query',   v_q,
      'ok',      false,
      'error',   'invalid_check_digit',
      'message', 'That is not a valid JKKN ID — the check digit does not match, so at least one digit is wrong. Read it again from the card rather than searching for it.',
      'results', '[]'::jsonb
    );
  END IF;

  WITH learner_hits AS (
    SELECT
      lp.id,
      CASE
        WHEN ji.jkkn_id IS NOT NULL AND btrim(ji.jkkn_id) = v_q         THEN 'jkkn_id'
        WHEN lower(btrim(coalesce(lp.roll_number, '')))      = v_lower   THEN 'roll_number'
        WHEN lower(btrim(coalesce(lp.register_number, '')))  = v_lower   THEN 'register_number'
        WHEN lower(btrim(coalesce(lp.application_id, '')))   = v_lower   THEN 'application_number'
        WHEN lower(btrim(coalesce(lp.neet_roll_number, ''))) = v_lower   THEN 'neet_roll'
        WHEN v_phone IS NOT NULL
             AND right(regexp_replace(coalesce(lp.student_mobile, ''), '[^0-9]', '', 'g'), 10) = v_phone
                                                                        THEN 'phone'
        WHEN lower(coalesce(lp.student_email, '')) = v_lower
          OR lower(coalesce(lp.college_email, '')) = v_lower             THEN 'email'
        WHEN EXISTS (
               SELECT 1 FROM public.jkkn_identity_aliases al
                WHERE al.jkkn_identity_id = ji.id
                  AND lower(btrim(al.alias_value)) = v_lower
             )                                                          THEN 'alias'
        ELSE 'name'
      END AS matched_on,
      lp.first_name, lp.last_name, lp.student_photo_url, lp.institution_id,
      lp.program_id, ay.year AS admission_year, lp.lifecycle_status, lp.roll_number,
      lp.register_number, lp.application_id, ji.jkkn_id
    FROM public.learners_profiles lp
    LEFT JOIN public.jkkn_identities ji ON ji.learner_profile_id = lp.id
    LEFT JOIN public.admission_years ay ON ay.id = lp.admission_year_id
    WHERE (v_all OR public.role_has_institution_access(lp.institution_id))
      AND (
           (ji.jkkn_id IS NOT NULL AND btrim(ji.jkkn_id) = v_q)
        OR EXISTS (
             SELECT 1 FROM public.jkkn_identity_aliases al
              WHERE al.jkkn_identity_id = ji.id
                AND lower(btrim(al.alias_value)) = v_lower
           )
        OR lower(btrim(coalesce(lp.roll_number, '')))      = v_lower
        OR lower(btrim(coalesce(lp.register_number, '')))  = v_lower
        OR lower(btrim(coalesce(lp.application_id, '')))   = v_lower
        OR lower(btrim(coalesce(lp.neet_roll_number, ''))) = v_lower
        OR lower(coalesce(lp.student_email, ''))           = v_lower
        OR lower(coalesce(lp.college_email, ''))           = v_lower
        OR (v_phone IS NOT NULL
            AND right(regexp_replace(coalesce(lp.student_mobile, ''), '[^0-9]', '', 'g'), 10) = v_phone)
        OR lower(btrim(lp.first_name || ' ' || coalesce(lp.last_name, ''))) LIKE '%' || v_lower || '%'
      )
    LIMIT 25
  ),
  team_hits AS (
    SELECT
      st.id,
      CASE
        WHEN ji.jkkn_id IS NOT NULL AND btrim(ji.jkkn_id) = v_q      THEN 'jkkn_id'
        WHEN lower(btrim(coalesce(st.staff_id, '')))       = v_lower  THEN 'team_code'
        WHEN v_lower = ANY (string_to_array(lower(coalesce(st.retired_staff_ids, '')), ' '))
                                                                      THEN 'team_code'
        WHEN v_phone IS NOT NULL
             AND right(regexp_replace(coalesce(st.phone, ''), '[^0-9]', '', 'g'), 10) = v_phone
                                                                      THEN 'phone'
        WHEN lower(coalesce(st.email, ''))             = v_lower
          OR lower(coalesce(st.institution_email, '')) = v_lower       THEN 'email'
        WHEN EXISTS (
               SELECT 1 FROM public.jkkn_identity_aliases al
                WHERE al.jkkn_identity_id = ji.id
                  AND lower(btrim(al.alias_value)) = v_lower
             )                                                        THEN 'alias'
        ELSE 'name'
      END AS matched_on,
      st.first_name, st.last_name, st.profile_picture, st.institution_id,
      st.designation, st.is_active, st.staff_id, ji.jkkn_id
    FROM public.staff st
    LEFT JOIN public.jkkn_identities ji ON ji.team_member_id = st.id
    WHERE (v_all OR public.role_has_institution_access(st.institution_id))
      AND (
           (ji.jkkn_id IS NOT NULL AND btrim(ji.jkkn_id) = v_q)
        OR EXISTS (
             SELECT 1 FROM public.jkkn_identity_aliases al
              WHERE al.jkkn_identity_id = ji.id
                AND lower(btrim(al.alias_value)) = v_lower
           )
        OR lower(btrim(coalesce(st.staff_id, ''))) = v_lower
        OR v_lower = ANY (string_to_array(lower(coalesce(st.retired_staff_ids, '')), ' '))
        OR lower(coalesce(st.email, ''))             = v_lower
        OR lower(coalesce(st.institution_email, '')) = v_lower
        OR (v_phone IS NOT NULL
            AND right(regexp_replace(coalesce(st.phone, ''), '[^0-9]', '', 'g'), 10) = v_phone)
        OR lower(btrim(st.first_name || ' ' || coalesce(st.last_name, ''))) LIKE '%' || v_lower || '%'
      )
    LIMIT 25
  ),
  associate_hits AS (
    SELECT
      p.id,
      CASE
        WHEN btrim(ji.jkkn_id) = v_q                  THEN 'jkkn_id'
        WHEN lower(coalesce(p.email, '')) = v_lower   THEN 'email'
        WHEN EXISTS (
               SELECT 1 FROM public.jkkn_identity_aliases al
                WHERE al.jkkn_identity_id = ji.id
                  AND lower(btrim(al.alias_value)) = v_lower
             )                                        THEN 'alias'
        ELSE 'name'
      END AS matched_on,
      p.full_name, p.avatar_url, p.institution_id,
      ji.person_kind, ji.jkkn_id
    FROM public.profiles p
    JOIN public.jkkn_identities ji ON ji.profile_id = p.id
    WHERE ji.person_kind IN ('associate', 'external_participant')
      AND (v_all OR public.role_has_institution_access(p.institution_id))
      AND (
           btrim(ji.jkkn_id) = v_q
        OR EXISTS (
             SELECT 1 FROM public.jkkn_identity_aliases al
              WHERE al.jkkn_identity_id = ji.id
                AND lower(btrim(al.alias_value)) = v_lower
           )
        OR lower(coalesce(p.email, '')) = v_lower
        OR lower(coalesce(p.full_name, '')) LIKE '%' || v_lower || '%'
      )
    LIMIT 25
  ),
  merged AS (
    SELECT jsonb_build_object(
             'person_kind',      'learner',
             'person_id',        lh.id,
             'matched_on',       lh.matched_on,
             'full_name',        btrim(lh.first_name || ' ' || coalesce(lh.last_name, '')),
             'photo_url',        lh.student_photo_url,
             'institution_name', i.name,
             'programme',        pr.program_name,
             'admission_year',   lh.admission_year,
             'status',           lh.lifecycle_status::text,
             'jkkn_id',          btrim(lh.jkkn_id),
             'roll_number',      lh.roll_number,
             'register_number',  lh.register_number,
             'application_number', lh.application_id
           ) AS row_json
      FROM learner_hits lh
      LEFT JOIN public.institutions i ON i.id = lh.institution_id
      LEFT JOIN public.programs    pr ON pr.id = lh.program_id
    UNION ALL
    SELECT jsonb_build_object(
             'person_kind',      'team_member',
             'person_id',        th.id,
             'matched_on',       th.matched_on,
             'full_name',        btrim(th.first_name || ' ' || coalesce(th.last_name, '')),
             'photo_url',        th.profile_picture,
             'institution_name', i.name,
             'programme',        th.designation,
             'admission_year',   NULL,
             'status',           CASE WHEN th.is_active THEN 'active' ELSE 'inactive' END,
             'jkkn_id',          btrim(th.jkkn_id),
             'team_code',        th.staff_id
           ) AS row_json
      FROM team_hits th
      LEFT JOIN public.institutions i ON i.id = th.institution_id
    UNION ALL
    SELECT jsonb_build_object(
             'person_kind',      ah.person_kind,
             'person_id',        ah.id,
             'matched_on',       ah.matched_on,
             'full_name',        coalesce(btrim(ah.full_name), 'Name unavailable'),
             'photo_url',        ah.avatar_url,
             'institution_name', i.name,
             'programme',        NULL,
             'admission_year',   NULL,
             'status',           NULL,
             'jkkn_id',          btrim(ah.jkkn_id)
           ) AS row_json
      FROM associate_hits ah
      LEFT JOIN public.institutions i ON i.id = ah.institution_id
  )
  SELECT COALESCE(jsonb_agg(row_json), '[]'::jsonb) INTO v_results FROM merged;

  RETURN jsonb_build_object(
    'query',      v_q,
    'ok',         true,
    'results',    v_results,
    'count',      jsonb_array_length(v_results),
    'scope_note', CASE
                    WHEN v_all THEN 'Searched every institution.'
                    ELSE 'Searched only the institutions your role can see. Someone you cannot find here may exist elsewhere in the cluster.'
                  END
  );
END;
$function$;

-- ── 6. JKKN ID directory: team-member search also reads retired codes ────────
-- Only the two team_member search predicates change (the count and the page);
-- every other line is the deployed body.

CREATE OR REPLACE FUNCTION public.fn_jkkn_directory(p_kind text DEFAULT 'learner'::text, p_institution_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_issued text DEFAULT NULL::text, p_admission_year integer DEFAULT NULL::integer, p_search text DEFAULT NULL::text, p_sort_by text DEFAULT 'name'::text, p_sort_order text DEFAULT 'asc'::text, p_page integer DEFAULT 1, p_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_all    boolean;
  v_q      text := lower(btrim(coalesce(p_search, '')));
  v_sort   text;
  v_desc   boolean := lower(coalesce(p_sort_order, 'asc')) = 'desc';
  v_limit  int := LEAST(GREATEST(coalesce(p_limit, 25), 1), 100);
  v_total  bigint;
  v_pages  int;
  v_page   int;
  v_rows   jsonb;
BEGIN
  -- Gate + scope: identical to fn_resolve_person.
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('users.jkkn_id.view')
  ) THEN
    RAISE EXCEPTION 'Not authorised to look people up'
      USING ERRCODE = '42501';
  END IF;

  v_all := COALESCE(public.is_super_admin(), false) OR public.is_admin();

  IF p_kind IS NULL OR p_kind NOT IN ('learner', 'team_member', 'associate') THEN
    RAISE EXCEPTION 'kind must be learner, team_member or associate (got %)', p_kind
      USING ERRCODE = '22023';
  END IF;

  -- Sort whitelist. Anything unknown falls back to name rather than erroring —
  -- a stale bookmark should degrade, not 400.
  v_sort := CASE
    WHEN p_sort_by IN ('name', 'jkkn_id', 'code', 'status', 'admission_year') THEN p_sort_by
    ELSE 'name'
  END;

  IF p_kind = 'learner' THEN
    SELECT count(*) INTO v_total
      FROM public.learners_profiles lp
      LEFT JOIN public.jkkn_identities ji ON ji.learner_profile_id = lp.id
      LEFT JOIN public.admission_years ay ON ay.id = lp.admission_year_id
     WHERE (v_all OR public.role_has_institution_access(lp.institution_id))
       AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
       AND (p_status IS NULL OR lp.lifecycle_status::text = p_status)
       AND (p_admission_year IS NULL OR ay.year = p_admission_year)
       AND (p_issued IS NULL
            OR (p_issued = 'issued'     AND ji.jkkn_id IS NOT NULL)
            OR (p_issued = 'not_issued' AND ji.jkkn_id IS NULL))
       AND (v_q = ''
            OR lower(btrim(lp.first_name || ' ' || coalesce(lp.last_name, ''))) LIKE '%' || v_q || '%'
            OR lower(btrim(coalesce(lp.roll_number, '')))     LIKE '%' || v_q || '%'
            OR lower(btrim(coalesce(lp.register_number, ''))) LIKE '%' || v_q || '%'
            OR btrim(coalesce(ji.jkkn_id, '')) = btrim(coalesce(p_search, '')));

    v_pages := GREATEST(1, CEIL(v_total::numeric / v_limit)::int);
    v_page  := LEAST(GREATEST(coalesce(p_page, 1), 1), v_pages);

    SELECT COALESCE(jsonb_agg(row_json), '[]'::jsonb) INTO v_rows FROM (
      SELECT jsonb_build_object(
               'id',               lp.id,
               'kind',             'learner',
               'name',             btrim(lp.first_name || ' ' || coalesce(lp.last_name, '')),
               'photo_url',        lp.student_photo_url,
               'email',            NULL,
               'jkkn_id',          btrim(ji.jkkn_id),
               'roll_number',      lp.roll_number,
               'register_number',  lp.register_number,
               'team_code',        NULL,
               'designation',      NULL,
               'program',          pr.program_name,
               'institution_name', i.name,
               'admission_year',   ay.year,
               'status',           lp.lifecycle_status::text
             ) AS row_json
        FROM public.learners_profiles lp
        LEFT JOIN public.jkkn_identities ji ON ji.learner_profile_id = lp.id
        LEFT JOIN public.admission_years ay ON ay.id = lp.admission_year_id
        LEFT JOIN public.institutions    i  ON i.id  = lp.institution_id
        LEFT JOIN public.programs        pr ON pr.id = lp.program_id
       WHERE (v_all OR public.role_has_institution_access(lp.institution_id))
         AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
         AND (p_status IS NULL OR lp.lifecycle_status::text = p_status)
         AND (p_admission_year IS NULL OR ay.year = p_admission_year)
         AND (p_issued IS NULL
              OR (p_issued = 'issued'     AND ji.jkkn_id IS NOT NULL)
              OR (p_issued = 'not_issued' AND ji.jkkn_id IS NULL))
         AND (v_q = ''
              OR lower(btrim(lp.first_name || ' ' || coalesce(lp.last_name, ''))) LIKE '%' || v_q || '%'
              OR lower(btrim(coalesce(lp.roll_number, '')))     LIKE '%' || v_q || '%'
              OR lower(btrim(coalesce(lp.register_number, ''))) LIKE '%' || v_q || '%'
              OR btrim(coalesce(ji.jkkn_id, '')) = btrim(coalesce(p_search, '')))
       ORDER BY
         (CASE WHEN NOT v_desc THEN
            CASE v_sort
              WHEN 'name'           THEN lower(btrim(lp.first_name || ' ' || coalesce(lp.last_name, '')))
              WHEN 'jkkn_id'        THEN btrim(ji.jkkn_id)
              WHEN 'code'           THEN lower(btrim(coalesce(lp.roll_number, '')))
              WHEN 'status'         THEN lp.lifecycle_status::text
              WHEN 'admission_year' THEN lpad(coalesce(ay.year, 0)::text, 6, '0')
            END
          END) ASC NULLS LAST,
         (CASE WHEN v_desc THEN
            CASE v_sort
              WHEN 'name'           THEN lower(btrim(lp.first_name || ' ' || coalesce(lp.last_name, '')))
              WHEN 'jkkn_id'        THEN btrim(ji.jkkn_id)
              WHEN 'code'           THEN lower(btrim(coalesce(lp.roll_number, '')))
              WHEN 'status'         THEN lp.lifecycle_status::text
              WHEN 'admission_year' THEN lpad(coalesce(ay.year, 0)::text, 6, '0')
            END
          END) DESC NULLS LAST,
         lp.id
       LIMIT v_limit OFFSET (v_page - 1) * v_limit
    ) page_rows;

  ELSIF p_kind = 'team_member' THEN
    SELECT count(*) INTO v_total
      FROM public.staff st
      LEFT JOIN public.jkkn_identities ji ON ji.team_member_id = st.id
     WHERE (v_all OR public.role_has_institution_access(st.institution_id))
       AND (p_institution_id IS NULL OR st.institution_id = p_institution_id)
       AND (p_status IS NULL
            OR (p_status = 'active'   AND st.is_active IS TRUE)
            OR (p_status = 'inactive' AND st.is_active IS NOT TRUE))
       AND (p_issued IS NULL
            OR (p_issued = 'issued'     AND ji.jkkn_id IS NOT NULL)
            OR (p_issued = 'not_issued' AND ji.jkkn_id IS NULL))
       AND (v_q = ''
            OR lower(btrim(st.first_name || ' ' || coalesce(st.last_name, ''))) LIKE '%' || v_q || '%'
            OR lower(btrim(coalesce(st.staff_id, ''))) LIKE '%' || v_q || '%'
            OR lower(coalesce(st.retired_staff_ids, '')) LIKE '%' || v_q || '%'
            OR lower(coalesce(st.email, ''))             LIKE '%' || v_q || '%'
            OR lower(coalesce(st.institution_email, '')) LIKE '%' || v_q || '%'
            OR btrim(coalesce(ji.jkkn_id, '')) = btrim(coalesce(p_search, '')));

    v_pages := GREATEST(1, CEIL(v_total::numeric / v_limit)::int);
    v_page  := LEAST(GREATEST(coalesce(p_page, 1), 1), v_pages);

    SELECT COALESCE(jsonb_agg(row_json), '[]'::jsonb) INTO v_rows FROM (
      SELECT jsonb_build_object(
               'id',               st.id,
               'kind',             'team_member',
               'name',             btrim(st.first_name || ' ' || coalesce(st.last_name, '')),
               'photo_url',        st.profile_picture,
               'email',            coalesce(st.institution_email, st.email),
               'jkkn_id',          btrim(ji.jkkn_id),
               'roll_number',      NULL,
               'register_number',  NULL,
               'team_code',        st.staff_id,
               'designation',      st.designation,
               'program',          NULL,
               'institution_name', i.name,
               'admission_year',   NULL,
               'status',           CASE WHEN st.is_active THEN 'active' ELSE 'inactive' END
             ) AS row_json
        FROM public.staff st
        LEFT JOIN public.jkkn_identities ji ON ji.team_member_id = st.id
        LEFT JOIN public.institutions    i  ON i.id = st.institution_id
       WHERE (v_all OR public.role_has_institution_access(st.institution_id))
         AND (p_institution_id IS NULL OR st.institution_id = p_institution_id)
         AND (p_status IS NULL
              OR (p_status = 'active'   AND st.is_active IS TRUE)
              OR (p_status = 'inactive' AND st.is_active IS NOT TRUE))
         AND (p_issued IS NULL
              OR (p_issued = 'issued'     AND ji.jkkn_id IS NOT NULL)
              OR (p_issued = 'not_issued' AND ji.jkkn_id IS NULL))
         AND (v_q = ''
              OR lower(btrim(st.first_name || ' ' || coalesce(st.last_name, ''))) LIKE '%' || v_q || '%'
              OR lower(btrim(coalesce(st.staff_id, ''))) LIKE '%' || v_q || '%'
              OR lower(coalesce(st.retired_staff_ids, '')) LIKE '%' || v_q || '%'
              OR lower(coalesce(st.email, ''))             LIKE '%' || v_q || '%'
              OR lower(coalesce(st.institution_email, '')) LIKE '%' || v_q || '%'
              OR btrim(coalesce(ji.jkkn_id, '')) = btrim(coalesce(p_search, '')))
       ORDER BY
         (CASE WHEN NOT v_desc THEN
            CASE v_sort
              WHEN 'name'    THEN lower(btrim(st.first_name || ' ' || coalesce(st.last_name, '')))
              WHEN 'jkkn_id' THEN btrim(ji.jkkn_id)
              WHEN 'code'    THEN lower(btrim(coalesce(st.staff_id, '')))
              WHEN 'status'  THEN CASE WHEN st.is_active THEN 'active' ELSE 'inactive' END
              ELSE lower(btrim(st.first_name || ' ' || coalesce(st.last_name, '')))
            END
          END) ASC NULLS LAST,
         (CASE WHEN v_desc THEN
            CASE v_sort
              WHEN 'name'    THEN lower(btrim(st.first_name || ' ' || coalesce(st.last_name, '')))
              WHEN 'jkkn_id' THEN btrim(ji.jkkn_id)
              WHEN 'code'    THEN lower(btrim(coalesce(st.staff_id, '')))
              WHEN 'status'  THEN CASE WHEN st.is_active THEN 'active' ELSE 'inactive' END
              ELSE lower(btrim(st.first_name || ' ' || coalesce(st.last_name, '')))
            END
          END) DESC NULLS LAST,
         st.id
       LIMIT v_limit OFFSET (v_page - 1) * v_limit
    ) page_rows;

  ELSE
    -- Associates and external participants exist in the directory only through
    -- the register (INNER join), so the 'not_issued' filter is empty here by
    -- construction.
    SELECT count(*) INTO v_total
      FROM public.profiles p
      JOIN public.jkkn_identities ji ON ji.profile_id = p.id
     WHERE ji.person_kind IN ('associate', 'external_participant')
       AND (v_all OR public.role_has_institution_access(p.institution_id))
       AND (p_institution_id IS NULL OR p.institution_id = p_institution_id)
       AND (p_issued IS NULL OR p_issued = 'issued')
       AND (v_q = ''
            OR lower(coalesce(p.full_name, '')) LIKE '%' || v_q || '%'
            OR lower(coalesce(p.email, ''))     LIKE '%' || v_q || '%'
            OR btrim(ji.jkkn_id) = btrim(coalesce(p_search, '')));

    v_pages := GREATEST(1, CEIL(v_total::numeric / v_limit)::int);
    v_page  := LEAST(GREATEST(coalesce(p_page, 1), 1), v_pages);

    SELECT COALESCE(jsonb_agg(row_json), '[]'::jsonb) INTO v_rows FROM (
      SELECT jsonb_build_object(
               'id',               p.id,
               'kind',             ji.person_kind,
               'name',             coalesce(btrim(p.full_name), 'Name unavailable'),
               'photo_url',        p.avatar_url,
               'email',            p.email,
               'jkkn_id',          btrim(ji.jkkn_id),
               'roll_number',      NULL,
               'register_number',  NULL,
               'team_code',        NULL,
               'designation',      NULL,
               'program',          NULL,
               'institution_name', i.name,
               'admission_year',   NULL,
               'status',           NULL
             ) AS row_json
        FROM public.profiles p
        JOIN public.jkkn_identities ji ON ji.profile_id = p.id
        LEFT JOIN public.institutions i ON i.id = p.institution_id
       WHERE ji.person_kind IN ('associate', 'external_participant')
         AND (v_all OR public.role_has_institution_access(p.institution_id))
         AND (p_institution_id IS NULL OR p.institution_id = p_institution_id)
         AND (p_issued IS NULL OR p_issued = 'issued')
         AND (v_q = ''
              OR lower(coalesce(p.full_name, '')) LIKE '%' || v_q || '%'
              OR lower(coalesce(p.email, ''))     LIKE '%' || v_q || '%'
              OR btrim(ji.jkkn_id) = btrim(coalesce(p_search, '')))
       ORDER BY
         (CASE WHEN NOT v_desc THEN
            CASE v_sort
              WHEN 'jkkn_id' THEN btrim(ji.jkkn_id)
              ELSE lower(coalesce(p.full_name, ''))
            END
          END) ASC NULLS LAST,
         (CASE WHEN v_desc THEN
            CASE v_sort
              WHEN 'jkkn_id' THEN btrim(ji.jkkn_id)
              ELSE lower(coalesce(p.full_name, ''))
            END
          END) DESC NULLS LAST,
         p.id
       LIMIT v_limit OFFSET (v_page - 1) * v_limit
    ) page_rows;
  END IF;

  RETURN jsonb_build_object(
    'ok',          true,
    'rows',        v_rows,
    'total',       v_total,
    'page',        v_page,
    'limit',       v_limit,
    'total_pages', v_pages
  );
END;
$function$;
