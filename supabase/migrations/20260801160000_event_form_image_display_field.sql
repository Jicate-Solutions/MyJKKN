-- Display-only image field on registration forms.
--
-- Distinct from 'image', which is a REGISTRANT upload. 'image_display' is
-- content the ORGANIZER attaches while building the form — a poster, a sample of
-- the document required, a QR code, a seating plan — and every registrant simply
-- sees it. It collects no answer and is never "required".
--
-- STORAGE IS PUBLIC, unlike registrant uploads. That is a deliberate difference,
-- not an oversight: an anonymous visitor has to render this image with a plain
-- <img src>, and a signed URL would expire while the form is still live. The
-- private bucket stays private precisely because it holds other people's ID
-- proofs; a form's own poster is content the organizer is publishing.
--
-- WHY A COLUMN AND NOT options JSONB: options is FormFieldOption[] for
-- select/radio. Smuggling a URL through it would give one column two unrelated
-- meanings and break anything that iterates options as choices.

-- ── 1. the column ────────────────────────────────────────────────────────────

ALTER TABLE public.event_registration_form_fields
  ADD COLUMN IF NOT EXISTS media_url text;

COMMENT ON COLUMN public.event_registration_form_fields.media_url IS
  'Public URL of the image shown by an image_display field. NULL for every other field type.';

-- ── 2. the field type ────────────────────────────────────────────────────────

ALTER TABLE public.event_registration_form_fields
  DROP CONSTRAINT IF EXISTS event_registration_form_fields_field_type_check;

ALTER TABLE public.event_registration_form_fields
  ADD CONSTRAINT event_registration_form_fields_field_type_check
  CHECK (field_type = ANY (ARRAY[
    'text', 'number', 'phone', 'email', 'select', 'multi_select',
    'date', 'textarea', 'file', 'image', 'image_display', 'checkbox', 'radio'
  ]));

-- ── 3. teach the save RPC about media_url ────────────────────────────────────
--
-- MANDATORY, not optional polish: this function DELETEs every section (cascading
-- to fields) and reinserts them from the JSONB payload on each save. A column it
-- does not carry is silently wiped the next time anyone edits the form — the
-- organizer's poster would vanish on an unrelated label change.
--
-- CREATE OR REPLACE with the IDENTICAL signature (uuid, boolean, jsonb). That
-- does NOT drop the function, so its ACL survives — currently
-- {postgres, authenticated, service_role} with no anon and no PUBLIC. Adding or
-- renaming a parameter would force a DROP, which discards the ACL and hands
-- EXECUTE back to PUBLIC (incl. anon) — the exact regression the multi-form
-- migration had to repair. Verified post-apply.

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
    INSERT INTO event_registration_form_sections (form_id, event_id, title, display_order)
    VALUES (
      p_form_id,
      v_event_id,
      COALESCE(NULLIF(btrim(v_section->>'title'), ''), 'Section'),
      COALESCE((v_section->>'display_order')::int, 0)
    )
    RETURNING id INTO v_section_id;

    FOR v_field IN
      SELECT * FROM jsonb_array_elements(COALESCE(v_section->'fields', '[]'::jsonb))
    LOOP
      INSERT INTO event_registration_form_fields (
        form_id, section_id, event_id, field_key, field_label, field_type, is_required,
        display_order, placeholder, help_text, min_length, max_length,
        min_value, max_value, pattern, options, condition, media_url
      )
      VALUES (
        p_form_id,
        v_section_id,
        v_event_id,
        v_field->>'field_key',
        v_field->>'field_label',
        v_field->>'field_type',
        -- A display-only image asks nothing, so it can never be "required" —
        -- forced here as well as in the UI, because a required field with no
        -- input would make the form permanently unsubmittable.
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
        NULLIF(btrim(COALESCE(v_field->>'media_url', '')), '')
      );
    END LOOP;
  END LOOP;
END;
$function$;

-- ── 4. public bucket for organizer-supplied form media ───────────────────────
-- Separate from event-registration-uploads (private) so the two can never be
-- confused: everything in HERE is meant to be seen by anyone holding the form
-- link, everything in THERE is somebody's private document.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-form-media',
  'event-form-media',
  true,
  5242880, -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
