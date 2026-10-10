-- Two more registration-form field types.
--
--   'rich_text'  DISPLAY ONLY, like 'image_display': text the organizer writes
--                in the builder (bold / italic / underline / text colour) and
--                every registrant simply reads. Collects no answer, is never
--                "required".
--   'url'        a link the registrant shares — a video, a drive folder, a
--                portfolio. An ordinary answer (a string in custom_fields);
--                the http(s) check lives in validateCustomFields, alongside
--                the required check, not here.
--
-- WHY rich_content IS jsonb AND NOT AN HTML STRING: the public registration
-- page is unauthenticated, and the text is rendered by walking the editor's
-- JSON document into React elements (components/events/registration/
-- rich-text-display.tsx). There is no HTML to sanitise, so nothing stored here
-- can become markup on that page.
--
-- WHY A COLUMN AND NOT help_text: help_text is the plain line under a question
-- and is printed as text by every renderer. Putting a document in it would give
-- one column two meanings — the same reason media_url got its own column.

-- ── 1. the column ────────────────────────────────────────────────────────────

ALTER TABLE public.event_registration_form_fields
  ADD COLUMN IF NOT EXISTS rich_content jsonb;

COMMENT ON COLUMN public.event_registration_form_fields.rich_content IS
  'Editor JSON document shown by a rich_text field. NULL for every other field type.';

-- ── 2. the field types ───────────────────────────────────────────────────────

ALTER TABLE public.event_registration_form_fields
  DROP CONSTRAINT IF EXISTS event_registration_form_fields_field_type_check;

ALTER TABLE public.event_registration_form_fields
  ADD CONSTRAINT event_registration_form_fields_field_type_check
  CHECK (field_type = ANY (ARRAY[
    'text', 'number', 'phone', 'email', 'url', 'select', 'multi_select',
    'date', 'textarea', 'file', 'image', 'image_display', 'rich_text',
    'checkbox', 'radio'
  ]));

-- ── 3. teach the save RPC about rich_content ─────────────────────────────────
--
-- MANDATORY for the same reason media_url and prefill_source were: this function
-- DELETEs every section (cascading to fields) and reinserts them from the JSONB
-- payload on each save, so a column it does not carry is wiped the next time
-- anyone edits the form.
--
-- CREATE OR REPLACE with the IDENTICAL signature (uuid, boolean, jsonb), so the
-- function is not dropped and its ACL survives — {postgres, authenticated,
-- service_role}, no anon, no PUBLIC. The body is the live definition as of
-- 2026-10-08 plus rich_content and the wider "never required" rule.

CREATE OR REPLACE FUNCTION public.save_event_registration_form(
  p_form_id uuid,
  p_is_enabled boolean,
  p_sections jsonb
)
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
        min_value, max_value, pattern, options, condition, media_url, prefill_source,
        rich_content
      )
      VALUES (
        p_form_id,
        v_section_id,
        v_event_id,
        v_field->>'field_key',
        v_field->>'field_label',
        v_field->>'field_type',
        -- A display-only field asks nothing, so it can never be "required" —
        -- forced here as well as in the UI, because a required field with no
        -- input would make the form permanently unsubmittable.
        CASE WHEN v_field->>'field_type' IN ('image_display', 'rich_text') THEN false
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
        NULLIF(btrim(COALESCE(v_field->>'prefill_source', '')), ''),
        -- Only a rich_text field keeps a document; anything else sending one is
        -- a stale client, not a second place to store text.
        CASE WHEN v_field->>'field_type' = 'rich_text'
              AND jsonb_typeof(v_field->'rich_content') = 'object'
             THEN v_field->'rich_content' ELSE NULL END
      );
    END LOOP;
  END LOOP;
END;
$function$;
