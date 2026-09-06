-- Multiple registration forms per event, plus clone.
--
-- BEFORE: `event_registration_forms` carried UNIQUE (event_id) — exactly one form
-- per event, enforced in the database. Fields were addressed by
-- UNIQUE (event_id, field_key), so two forms on the same event could not both ask
-- for e.g. "phone". Worse, fields had no form_id at all: they hung off a form only
-- transitively via section_id, while every read (service, public register page,
-- submit API) filtered them by event_id. A second form would therefore have
-- rendered every other form's fields — silently, with no error.
--
-- AFTER: an event holds any number of named forms. Each is addressed publicly by
-- (event_id, slug) so a month's link resolves to its own form and an old link keeps
-- pointing at the month it belonged to. Fields carry form_id and are unique per
-- (form_id, field_key). A submitted registration records which form asked the
-- questions, so custom_fields stays interpretable once forms differ.
--
-- WHY NOW: 8 forms / 2 sections / 10 fields / 1 answered registration out of 1,594.
-- Verified pre-migration that fields-reached-via-section == fields-reached-via-event
-- for every existing form, so the form_id backfill below is lossless. The same
-- restructure against thousands of answered submissions would be a real migration.
--
-- RLS: untouched on purpose. Every existing policy on these three tables gates on
-- event_id, which all of them still carry, so the _manage / _select gates keep
-- working unchanged.

-- ── 1. forms: give a form its own identity; drop the one-per-event cap ────────

ALTER TABLE public.event_registration_forms
  ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT 'Registration Form',
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

ALTER TABLE public.event_registration_forms
  DROP CONSTRAINT IF EXISTS event_registration_forms_event_id_key;

-- Every existing row is its event's only form, so one fixed slug cannot collide.
UPDATE public.event_registration_forms SET slug = 'registration' WHERE slug IS NULL;

ALTER TABLE public.event_registration_forms ALTER COLUMN slug SET NOT NULL;

ALTER TABLE public.event_registration_forms
  ADD CONSTRAINT event_registration_forms_event_id_slug_key UNIQUE (event_id, slug);

-- slug goes in a URL: lowercase alphanumerics separated by single hyphens.
ALTER TABLE public.event_registration_forms
  ADD CONSTRAINT event_registration_forms_slug_format_check
  CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- ── 2. fields: bind to a form; re-scope field_key uniqueness ──────────────────

ALTER TABLE public.event_registration_form_fields
  ADD COLUMN IF NOT EXISTS form_id uuid
  REFERENCES public.event_registration_forms(id) ON DELETE CASCADE;

UPDATE public.event_registration_form_fields f
   SET form_id = s.form_id
  FROM public.event_registration_form_sections s
 WHERE s.id = f.section_id
   AND f.form_id IS NULL;

ALTER TABLE public.event_registration_form_fields ALTER COLUMN form_id SET NOT NULL;

-- (event_id, field_key) was the one-form-per-event fossil: it made field_key a
-- stable answer key across the whole event. Per-form is the correct scope now.
ALTER TABLE public.event_registration_form_fields
  DROP CONSTRAINT IF EXISTS event_registration_form_fields_event_id_field_key_key;

ALTER TABLE public.event_registration_form_fields
  ADD CONSTRAINT event_registration_form_fields_form_id_field_key_key
  UNIQUE (form_id, field_key);

CREATE INDEX IF NOT EXISTS idx_event_registration_form_fields_form_id
  ON public.event_registration_form_fields (form_id);

CREATE INDEX IF NOT EXISTS idx_event_registration_forms_event_id
  ON public.event_registration_forms (event_id);

-- ── 3. registrations: attribute answers to the form that asked them ───────────

ALTER TABLE public.events_registrations
  ADD COLUMN IF NOT EXISTS form_id uuid
  REFERENCES public.event_registration_forms(id) ON DELETE SET NULL;

-- Backfill ONLY where it is unambiguous — the event has exactly one form. Rows on
-- a multi-form event stay NULL rather than being guessed at.
UPDATE public.events_registrations r
   SET form_id = f.id
  FROM public.event_registration_forms f
 WHERE f.event_id = r.event_id
   AND r.form_id IS NULL
   AND (SELECT count(*) FROM public.event_registration_forms f2
         WHERE f2.event_id = r.event_id) = 1;

CREATE INDEX IF NOT EXISTS idx_events_registrations_form_id
  ON public.events_registrations (form_id);

-- ── 4. the save RPC becomes form-scoped ───────────────────────────────────────
-- The old signature (p_event_id uuid, boolean, jsonb) has the SAME argument types
-- as the new one, so CREATE OR REPLACE would refuse to rename the first parameter
-- rather than replace the function. Drop it first.

DROP FUNCTION IF EXISTS public.save_event_registration_form(uuid, boolean, jsonb);

CREATE FUNCTION public.save_event_registration_form(
  p_form_id    uuid,
  p_is_enabled boolean,
  p_sections   jsonb
) RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_event_id   uuid;
  v_section    jsonb;
  v_section_id uuid;
  v_field      jsonb;
BEGIN
  -- The form must already exist — creating one is createForm()'s job now that a
  -- form has a name and a slug the caller chooses. This also resolves event_id,
  -- which sections and fields still carry for their RLS gates.
  SELECT event_id INTO v_event_id
    FROM event_registration_forms WHERE id = p_form_id;
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Registration form % not found', p_form_id;
  END IF;

  UPDATE event_registration_forms
     SET is_enabled = COALESCE(p_is_enabled, true),
         updated_at = now()
   WHERE id = p_form_id;

  -- Clear this form's structure only; fields cascade off their sections.
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
        min_value, max_value, pattern, options, condition
      )
      VALUES (
        p_form_id,
        v_section_id,
        v_event_id,
        v_field->>'field_key',
        v_field->>'field_label',
        v_field->>'field_type',
        COALESCE((v_field->>'is_required')::boolean, false),
        COALESCE((v_field->>'display_order')::int, 0),
        v_field->>'placeholder',
        v_field->>'help_text',
        (v_field->>'min_length')::int,
        (v_field->>'max_length')::int,
        (v_field->>'min_value')::numeric,
        (v_field->>'max_value')::numeric,
        v_field->>'pattern',
        CASE WHEN jsonb_typeof(v_field->'options')   = 'array'  THEN v_field->'options'   ELSE NULL END,
        CASE WHEN jsonb_typeof(v_field->'condition') = 'object' THEN v_field->'condition' ELSE NULL END
      );
    END LOOP;
  END LOOP;
END;
$function$;

-- ── 5. clone ──────────────────────────────────────────────────────────────────
-- One transaction so a clone is all-or-nothing — a half-copied form with some
-- sections and no fields is worse than no copy. SECURITY INVOKER (the default),
-- matching the save RPC: the caller must pass the same _manage RLS gate they would
-- to build the form by hand.

CREATE OR REPLACE FUNCTION public.clone_event_registration_form(
  p_form_id  uuid,
  p_new_name text DEFAULT NULL,
  p_new_slug text DEFAULT NULL
) RETURNS uuid
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

  -- Slug: the caller's, else derived from the name. De-duplicate within the event
  -- so cloning twice cannot trip the (event_id, slug) unique constraint.
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

  -- A clone starts CLOSED. Copying a form must never silently open a second
  -- intake on a live event.
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
    INSERT INTO event_registration_form_sections (form_id, event_id, title, display_order)
    VALUES (v_new_id, v_src.event_id, v_section.title, v_section.display_order)
    RETURNING id INTO v_new_section_id;

    INSERT INTO event_registration_form_fields (
      form_id, section_id, event_id, field_key, field_label, field_type, is_required,
      display_order, placeholder, help_text, min_length, max_length,
      min_value, max_value, pattern, options, condition
    )
    SELECT v_new_id, v_new_section_id, v_src.event_id,
           f.field_key, f.field_label, f.field_type, f.is_required, f.display_order,
           f.placeholder, f.help_text, f.min_length, f.max_length,
           f.min_value, f.max_value, f.pattern, f.options, f.condition
      FROM event_registration_form_fields f
     WHERE f.section_id = v_section.id
     ORDER BY f.display_order;
  END LOOP;

  RETURN v_new_id;
END;
$function$;

-- ── 6. grants ─────────────────────────────────────────────────────────────────
-- DROP FUNCTION discards a function's ACL, so recreating save_… under the new
-- signature silently handed EXECUTE back to PUBLIC (which includes anon). The
-- original carried this hardening; restore it, and give the new clone RPC the
-- same treatment. RLS is still the real gate — this is defence in depth.

REVOKE ALL ON FUNCTION public.save_event_registration_form(uuid, boolean, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_event_registration_form(uuid, boolean, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_event_registration_form(uuid, boolean, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.clone_event_registration_form(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clone_event_registration_form(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.clone_event_registration_form(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.save_event_registration_form(uuid, boolean, jsonb) IS
  'Atomically replace one registration form''s sections + fields. Form-scoped: an event holds many forms. SECURITY INVOKER — the caller must pass the event_registration_form*_manage RLS gate.';

COMMENT ON FUNCTION public.clone_event_registration_form(uuid, text, text) IS
  'Copy a registration form (sections + fields) into a new CLOSED form on the same event; de-duplicates the slug. Returns the new form id. SECURITY INVOKER.';
