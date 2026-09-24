-- ============================================================================
-- event_registration_form_sections.condition — show a WHOLE section only when
-- another field's answer matches (same {field, op, value} shape as
-- event_registration_form_fields.condition).
-- ----------------------------------------------------------------------------
-- Asked 2026-09-24 on the 360 Degree Townhall form: "Please select your
-- category" = Parent should reveal the Parent section and hide the Learner
-- section, without repeating the rule on every field. The save and clone
-- RPCs carry the column (save deletes and reinserts every section; a column
-- it does not copy is wiped on the next unrelated edit).
-- ============================================================================

ALTER TABLE public.event_registration_form_sections
  ADD COLUMN IF NOT EXISTS condition jsonb;

COMMENT ON COLUMN public.event_registration_form_sections.condition IS
  'Section-level visibility rule {field, op, value}; NULL = always shown. Evaluated by isSectionVisible() in components/events/dynamic-field-input.tsx';

CREATE OR REPLACE FUNCTION public.save_event_registration_form(p_form_id uuid, p_is_enabled boolean, p_sections jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event_id   uuid;
  v_section    jsonb;
  v_section_id uuid;
  v_field      jsonb;
BEGIN
  SELECT event_id INTO v_event_id
    FROM event_registration_forms WHERE id = p_form_id;
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Registration form % not found', p_form_id;
  END IF;

  UPDATE event_registration_forms
     SET is_enabled = COALESCE(p_is_enabled, true),
         updated_at = now()
   WHERE id = p_form_id;

  DELETE FROM event_registration_form_sections WHERE form_id = p_form_id;

  FOR v_section IN
    SELECT * FROM jsonb_array_elements(COALESCE(p_sections, '[]'::jsonb))
  LOOP
    INSERT INTO event_registration_form_sections (form_id, event_id, title, display_order, condition)
    VALUES (
      p_form_id,
      v_event_id,
      COALESCE(NULLIF(btrim(v_section->>'title'), ''), 'Section'),
      COALESCE((v_section->>'display_order')::int, 0),
      CASE WHEN jsonb_typeof(v_section->'condition') = 'object' THEN v_section->'condition' ELSE NULL END
    )
    RETURNING id INTO v_section_id;

    FOR v_field IN
      SELECT * FROM jsonb_array_elements(COALESCE(v_section->'fields', '[]'::jsonb))
    LOOP
      INSERT INTO event_registration_form_fields (
        form_id, section_id, event_id, field_key, field_label, field_type, is_required,
        display_order, placeholder, help_text, min_length, max_length,
        min_value, max_value, pattern, options, condition, media_url, prefill_source
      )
      VALUES (
        p_form_id,
        v_section_id,
        v_event_id,
        v_field->>'field_key',
        v_field->>'field_label',
        v_field->>'field_type',
        CASE WHEN v_field->>'field_type' = 'image_display' THEN false
             ELSE COALESCE((v_field->>'is_required')::boolean, false) END,
        COALESCE((v_field->>'display_order')::int, 0),
        v_field->>'placeholder',
        v_field->>'help_text',
        (v_field->>'min_length')::int,
        (v_field->>'max_length')::int,
        (v_field->>'min_value')::numeric,
        (v_field->>'max_value')::numeric,
        v_field->>'pattern',
        CASE WHEN jsonb_typeof(v_field->'options')   = 'array'  THEN v_field->'options'   ELSE NULL END,
        CASE WHEN jsonb_typeof(v_field->'condition') = 'object' THEN v_field->'condition' ELSE NULL END,
        NULLIF(btrim(COALESCE(v_field->>'media_url', '')), ''),
        NULLIF(btrim(COALESCE(v_field->>'prefill_source', '')), '')
      );
    END LOOP;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.clone_event_registration_form(p_form_id uuid, p_new_name text DEFAULT NULL::text, p_new_slug text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_src            event_registration_forms%ROWTYPE;
  v_new_id         uuid;
  v_name           text;
  v_slug           text;
  v_base           text;
  v_n              int := 2;
  v_section        record;
  v_new_section_id uuid;
BEGIN
  SELECT * INTO v_src FROM event_registration_forms WHERE id = p_form_id;
  IF v_src.id IS NULL THEN
    RAISE EXCEPTION 'Registration form % not found', p_form_id;
  END IF;

  v_name := COALESCE(NULLIF(btrim(p_new_name), ''), v_src.name || ' (copy)');

  v_base := COALESCE(
    NULLIF(btrim(p_new_slug), ''),
    NULLIF(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), '')
  );
  v_base := btrim(COALESCE(v_base, 'form'), '-');
  IF v_base = '' THEN v_base := 'form'; END IF;

  v_slug := v_base;
  WHILE EXISTS (
    SELECT 1 FROM event_registration_forms
     WHERE event_id = v_src.event_id AND slug = v_slug
  ) LOOP
    v_slug := v_base || '-' || v_n;
    v_n := v_n + 1;
  END LOOP;

  INSERT INTO event_registration_forms
    (event_id, name, slug, description, is_enabled, display_order)
  VALUES (
    v_src.event_id, v_name, v_slug, v_src.description, false,
    COALESCE((SELECT max(display_order) + 1 FROM event_registration_forms
               WHERE event_id = v_src.event_id), 0)
  )
  RETURNING id INTO v_new_id;

  FOR v_section IN
    SELECT * FROM event_registration_form_sections
     WHERE form_id = p_form_id ORDER BY display_order
  LOOP
    INSERT INTO event_registration_form_sections (form_id, event_id, title, display_order, condition)
    VALUES (v_new_id, v_src.event_id, v_section.title, v_section.display_order, v_section.condition)
    RETURNING id INTO v_new_section_id;

    INSERT INTO event_registration_form_fields (
      form_id, section_id, event_id, field_key, field_label, field_type, is_required,
      display_order, placeholder, help_text, min_length, max_length,
      min_value, max_value, pattern, options, condition, media_url, prefill_source
    )
    SELECT v_new_id, v_new_section_id, v_src.event_id,
           f.field_key, f.field_label, f.field_type, f.is_required, f.display_order,
           f.placeholder, f.help_text, f.min_length, f.max_length,
           f.min_value, f.max_value, f.pattern, f.options, f.condition, f.media_url, f.prefill_source
      FROM event_registration_form_fields f
     WHERE f.section_id = v_section.id
     ORDER BY f.display_order;
  END LOOP;

  RETURN v_new_id;
END;
$function$;
