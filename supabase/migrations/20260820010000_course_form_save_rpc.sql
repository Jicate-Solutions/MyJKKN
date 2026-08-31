-- Course Events — Phase 3, Task 1.
-- fn_save_course_registration_form(p_form jsonb, p_sections jsonb) RETURNS jsonb
--
-- WHY AN RPC
-- ----------
-- A form save is a parent plus two levels of children, and it REPLACES rather
-- than merges. Split across REST calls, a failure between "delete the old
-- structure" and "insert the new one" leaves a live public form with no fields —
-- worse than not saving at all, because the form stays reachable and simply
-- collects nothing. One function, one transaction, all-or-nothing.
--
-- WHY SECURITY INVOKER — do not "harden" this to DEFINER
-- -----------------------------------------------------
-- course_registration_forms_manage already gates on courses.forms.manage AND
-- role_has_institution_access(). Running as the caller inherits that predicate
-- for free and it can never drift out of step with the policy. A DEFINER version
-- would bypass RLS and have to re-implement the predicate by hand; this repo has
-- a recorded incident of exactly such a hand-copied predicate over-granting.
--
-- THE CATCH INVOKER INTRODUCES
-- ---------------------------
-- Under RLS a blocked UPDATE or DELETE affects ZERO ROWS SILENTLY — it does not
-- raise. So this function verifies its writes and raises 42501 itself. INSERT is
-- the exception: a WITH CHECK failure raises 42501 on its own.
--
-- THE BUG THIS IS WRITTEN TO AVOID
-- --------------------------------
-- The Events form builder hung fields off SECTIONS only, while three call sites
-- filtered them by event_id. The moment a second form existed, every form
-- rendered every other form's fields. course_registration_form_fields.form_id is
-- NOT NULL here precisely so that cannot happen — and this writer sets it
-- explicitly on every field rather than relying on the section link.

CREATE OR REPLACE FUNCTION public.fn_save_course_registration_form(
  p_form     jsonb,
  p_sections jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_form_id         uuid;
  v_course_event_id uuid;
  v_institution_id  uuid;
  v_rows            int;
  v_remaining       int;
  v_sections        jsonb;
  v_section         jsonb;
  v_section_id      uuid;
  v_field           jsonb;
  v_section_no      int := 0;
  v_field_no        int := 0;
  v_field_count     int := 0;
BEGIN
  v_form_id         := NULLIF(btrim(COALESCE(p_form->>'id', '')), '')::uuid;
  v_course_event_id := NULLIF(btrim(COALESCE(p_form->>'course_event_id', '')), '')::uuid;

  IF v_course_event_id IS NULL THEN
    RAISE EXCEPTION 'course_event_id is required to save a registration form'
      USING ERRCODE = '22023';
  END IF;

  -- The tenant is resolved from the course, NEVER trusted from the payload —
  -- otherwise a caller could write a form into another institution by lying.
  SELECT institution_id INTO v_institution_id
    FROM course_events
   WHERE id = v_course_event_id;

  IF v_institution_id IS NULL THEN
    RAISE EXCEPTION 'Course % was not found, or you do not have access to it', v_course_event_id
      USING ERRCODE = '42501';
  END IF;

  -- ── the form itself ───────────────────────────────────────────────────────
  IF v_form_id IS NULL THEN
    INSERT INTO course_registration_forms (
      course_event_id, institution_id, name, slug, description, display_order, is_enabled
    ) VALUES (
      v_course_event_id,
      v_institution_id,
      btrim(p_form->>'name'),
      btrim(p_form->>'slug'),
      NULLIF(btrim(COALESCE(p_form->>'description', '')), ''),
      COALESCE(NULLIF(btrim(COALESCE(p_form->>'display_order', '')), '')::int, 0),
      -- A form is born CLOSED. Enabling it is the act that opens public intake,
      -- and it must be deliberate — never a side effect of saving a draft.
      COALESCE((p_form->>'is_enabled')::boolean, false)
    )
    RETURNING id INTO v_form_id;
    -- No row-count check needed: an RLS WITH CHECK failure on INSERT raises 42501.
  ELSE
    -- course_event_id is in the WHERE, not the SET: a form must never move
    -- between courses, and this also stops a caller editing another course's
    -- form by pairing its id with a course they can reach.
    UPDATE course_registration_forms SET
      name          = btrim(p_form->>'name'),
      slug          = btrim(p_form->>'slug'),
      description   = NULLIF(btrim(COALESCE(p_form->>'description', '')), ''),
      display_order = COALESCE(NULLIF(btrim(COALESCE(p_form->>'display_order', '')), '')::int, 0),
      is_enabled    = COALESCE((p_form->>'is_enabled')::boolean, false)
    WHERE id = v_form_id
      AND course_event_id = v_course_event_id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION
        'Form % could not be updated — it does not belong to course %, or you lack courses.forms.manage on it',
        v_form_id, v_course_event_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ── replace the structure ─────────────────────────────────────────────────
  -- Fields are deleted BY FORM, not left to cascade off sections. Fields may
  -- legitimately have section_id NULL (a form with no sections), and those would
  -- survive a sections-only delete and then collide on UNIQUE (form_id,
  -- field_key) when the new set is inserted.
  DELETE FROM course_registration_form_fields WHERE form_id = v_form_id;
  DELETE FROM course_registration_form_sections WHERE form_id = v_form_id;

  -- Zero deleted rows is legitimate (a brand-new form), so the check cannot be
  -- "did we delete anything?". It has to be "is anything still there?" — which
  -- is what an RLS-blocked DELETE would leave behind.
  SELECT (SELECT count(*) FROM course_registration_form_fields WHERE form_id = v_form_id)
       + (SELECT count(*) FROM course_registration_form_sections WHERE form_id = v_form_id)
    INTO v_remaining;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION
      'Could not clear the existing structure of form % — % row(s) remain; you lack courses.forms.manage on them',
      v_form_id, v_remaining
      USING ERRCODE = '42501';
  END IF;

  -- A JSON null, a missing key or a non-array all mean "no sections". COALESCE
  -- would not catch a JSON null, and jsonb_array_elements raises on a scalar.
  v_sections := CASE
    WHEN jsonb_typeof(p_sections) = 'array' THEN p_sections
    ELSE '[]'::jsonb
  END;

  FOR v_section IN SELECT * FROM jsonb_array_elements(v_sections)
  LOOP
    -- display_order is renumbered from 0 in array order rather than taken from
    -- the client, so a reordered UI cannot produce a form that renders in a
    -- different order than it was designed in.
    INSERT INTO course_registration_form_sections (form_id, title, description, display_order)
    VALUES (
      v_form_id,
      COALESCE(NULLIF(btrim(COALESCE(v_section->>'title', '')), ''), 'Section'),
      NULLIF(btrim(COALESCE(v_section->>'description', '')), ''),
      v_section_no
    )
    RETURNING id INTO v_section_id;
    v_section_no := v_section_no + 1;

    FOR v_field IN
      SELECT * FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(v_section->'fields') = 'array'
             THEN v_section->'fields' ELSE '[]'::jsonb END)
    LOOP
      INSERT INTO course_registration_form_fields (
        -- form_id is set EXPLICITLY, not inferred from the section. This is the
        -- whole point: a reader filtering by form_id can never pick up another
        -- form's fields, which is the bug the Events builder shipped.
        form_id, section_id, field_key, label, field_type, is_required,
        options, placeholder, help_text, validation, display_order
      ) VALUES (
        v_form_id,
        v_section_id,
        btrim(v_field->>'field_key'),
        btrim(v_field->>'label'),
        v_field->>'field_type',
        COALESCE((v_field->>'is_required')::boolean, false),
        -- options and validation are NOT NULL jsonb. A missing key, a JSON null
        -- or the wrong type must become the empty default, not a 23502.
        CASE WHEN jsonb_typeof(v_field->'options') = 'array'
             THEN v_field->'options' ELSE '[]'::jsonb END,
        NULLIF(btrim(COALESCE(v_field->>'placeholder', '')), ''),
        NULLIF(btrim(COALESCE(v_field->>'help_text', '')), ''),
        CASE WHEN jsonb_typeof(v_field->'validation') = 'object'
             THEN v_field->'validation' ELSE '{}'::jsonb END,
        v_field_no
      );
      v_field_no    := v_field_no + 1;
      v_field_count := v_field_count + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'form_id', v_form_id,
    'section_count', v_section_no,
    'field_count', v_field_count
  );
END;
$function$;

-- Supabase's default privileges grant EXECUTE to anon DIRECTLY, so revoking from
-- PUBLIC alone leaves anon holding it. Revoke from both, explicitly.
REVOKE ALL ON FUNCTION public.fn_save_course_registration_form(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_save_course_registration_form(jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_save_course_registration_form(jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.fn_save_course_registration_form(jsonb, jsonb) IS
  'Saves a course registration form and REPLACES its sections and fields in ONE '
  'transaction — a half-replaced form would stay publicly reachable while '
  'collecting nothing. SECURITY INVOKER: the caller''s own RLS '
  '(courses.forms.manage) applies inside the body, and because a blocked '
  'UPDATE/DELETE affects zero rows silently under RLS the function verifies its '
  'writes and raises 42501. Every field is written with an explicit form_id so a '
  'reader filtering by form_id can never pick up another form''s fields.';
