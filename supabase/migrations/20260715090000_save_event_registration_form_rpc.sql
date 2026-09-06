-- Atomic bulk save for a tournament's dynamic registration form.
--
-- SECURITY INVOKER (default) on purpose: the existing
-- event_registration_form{s,_sections,_fields} "_manage" RLS policies already
-- encode exactly the tournament manage rule --
--   is_super_admin() OR is_admin() OR fn_is_event_incharge(event_id)
--   OR (user_has_permission('sports.tournaments.manage') AND institution access)
-- -- so running as the caller reuses that gate verbatim (in-charges included)
-- and needs no service-role and no re-encoded auth. A non-manager who calls
-- this simply fails the RLS WITH CHECK inside the function, which raises and
-- rolls the whole transaction back.
--
-- Strategy: delete-all-then-reinsert. Safe because
-- events_registrations.custom_fields keys answers by field_key, never by the
-- field row id -- so churning ids on save orphans nothing. This keeps the
-- client payload a plain "desired final state" with no ids and no diffing.

BEGIN;

CREATE OR REPLACE FUNCTION save_event_registration_form(
  p_event_id uuid,
  p_is_enabled boolean,
  p_sections jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_form_id    uuid;
  v_section    jsonb;
  v_section_id uuid;
  v_field      jsonb;
BEGIN
  -- 1. Lazy-create / update the form row (RLS authorizes via WITH CHECK).
  INSERT INTO event_registration_forms (event_id, is_enabled)
  VALUES (p_event_id, COALESCE(p_is_enabled, true))
  ON CONFLICT (event_id) DO UPDATE SET is_enabled = EXCLUDED.is_enabled
  RETURNING id INTO v_form_id;

  -- 2. Clear existing structure; fields cascade off sections.
  DELETE FROM event_registration_form_sections WHERE form_id = v_form_id;

  -- 3. Re-insert the desired structure, in payload order.
  FOR v_section IN
    SELECT * FROM jsonb_array_elements(COALESCE(p_sections, '[]'::jsonb))
  LOOP
    INSERT INTO event_registration_form_sections (form_id, event_id, title, display_order)
    VALUES (
      v_form_id,
      p_event_id,
      COALESCE(NULLIF(btrim(v_section->>'title'), ''), 'Section'),
      COALESCE((v_section->>'display_order')::int, 0)
    )
    RETURNING id INTO v_section_id;

    FOR v_field IN
      SELECT * FROM jsonb_array_elements(COALESCE(v_section->'fields', '[]'::jsonb))
    LOOP
      INSERT INTO event_registration_form_fields (
        section_id, event_id, field_key, field_label, field_type, is_required,
        display_order, placeholder, help_text, min_length, max_length,
        min_value, max_value, pattern, options, condition
      )
      VALUES (
        v_section_id,
        p_event_id,
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
$$;

COMMENT ON FUNCTION save_event_registration_form(uuid, boolean, jsonb) IS
  'Atomically replaces a tournament registration form (sections + fields) from a desired-state payload. SECURITY INVOKER: authorization comes from the event_registration_form_* _manage RLS policies.';

REVOKE ALL ON FUNCTION save_event_registration_form(uuid, boolean, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION save_event_registration_form(uuid, boolean, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION save_event_registration_form(uuid, boolean, jsonb) TO authenticated;

COMMIT;
