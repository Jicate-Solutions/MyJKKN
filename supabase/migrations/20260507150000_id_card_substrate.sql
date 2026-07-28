-- ============================================================================
-- ID Card Substrate (Phase 1A) — REWRITTEN 2026-07-22
-- ============================================================================
-- ORIGINAL was written 2026-05-07 pointing at public.students. But that table
-- had already been renamed to public.learners_profiles by 2026-05-02 — so the
-- original never applied to prod. This rewrite:
--   • Points every FK / RLS join at public.learners_profiles
--   • Drops the redundant ALTER (learners_profiles.student_photo_url exists)
--   • Uses dynamic user_has_permission() everywhere — no hardcoded roles
--   • Adds explicit REVOKE FROM anon, PUBLIC on the reader fn (2026-06-06 rule)
--   • Registers 7 permission keys + default-assigns them to registrar,
--     admission_admin, student, learner (per Director interview Q1–Q8)
--   • Learner self-view = belt+suspenders (UUID link OR email match)
--
-- Tier-1, additive only, zero behavior change today. Approved 2026-07-22.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- A. Schema
-- ----------------------------------------------------------------------------

-- A.1 id_card_templates
CREATE TABLE IF NOT EXISTS public.id_card_templates (
  id                 UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  name               TEXT NOT NULL,
  institution_id     UUID NULL REFERENCES public.institutions(id) ON DELETE SET NULL,
  front_layout_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  back_layout_json   JSONB NULL,
  field_mappings     JSONB NOT NULL DEFAULT '[]'::jsonb,
  active             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.id_card_templates IS
  'ID card template definitions: layout JSON for front/back + field mappings card_field -> db_column.';

CREATE INDEX IF NOT EXISTS idx_id_card_templates_institution_active
  ON public.id_card_templates (institution_id, active);

-- A.2 id_card_print_jobs — student_id references learners_profiles (canonical)
CREATE TABLE IF NOT EXISTS public.id_card_print_jobs (
  id              UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  template_id     UUID NOT NULL REFERENCES public.id_card_templates(id) ON DELETE RESTRICT,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','rendering','sent_to_agent','printed','failed')),
  enqueued_by     UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  enqueued_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  picked_up_at    TIMESTAMPTZ NULL,
  result          JSONB NULL
);

COMMENT ON TABLE public.id_card_print_jobs IS
  'Print job queue. Bridge picks up status=pending rows, transitions through rendering/sent_to_agent/printed/failed. student_id => learners_profiles (canonical).';

CREATE INDEX IF NOT EXISTS idx_id_card_print_jobs_status_enqueued
  ON public.id_card_print_jobs (status, enqueued_at);

CREATE INDEX IF NOT EXISTS idx_id_card_print_jobs_student
  ON public.id_card_print_jobs (student_id);

-- A.3 storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'student-photos',
  'student-photos',
  FALSE,
  5242880,
  ARRAY['image/png','image/jpeg']
)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- B. RLS — dynamic permission-based
-- ----------------------------------------------------------------------------

ALTER TABLE public.id_card_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.id_card_print_jobs ENABLE ROW LEVEL SECURITY;

-- B.1 id_card_templates (service_role + 4 authenticated policies)

DROP POLICY IF EXISTS "id_card_templates_service_role_all" ON public.id_card_templates;
CREATE POLICY "id_card_templates_service_role_all"
  ON public.id_card_templates FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "id_card_templates_view" ON public.id_card_templates;
CREATE POLICY "id_card_templates_view"
  ON public.id_card_templates FOR SELECT TO authenticated
  USING (
    public.is_super_admin() OR public.is_admin()
    OR public.user_has_permission('id_cards.templates.view')
  );

DROP POLICY IF EXISTS "id_card_templates_create" ON public.id_card_templates;
CREATE POLICY "id_card_templates_create"
  ON public.id_card_templates FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin() OR public.is_admin()
    OR public.user_has_permission('id_cards.templates.create')
  );

DROP POLICY IF EXISTS "id_card_templates_edit" ON public.id_card_templates;
CREATE POLICY "id_card_templates_edit"
  ON public.id_card_templates FOR UPDATE TO authenticated
  USING (
    public.is_super_admin() OR public.is_admin()
    OR public.user_has_permission('id_cards.templates.edit')
  )
  WITH CHECK (
    public.is_super_admin() OR public.is_admin()
    OR public.user_has_permission('id_cards.templates.edit')
  );

DROP POLICY IF EXISTS "id_card_templates_delete" ON public.id_card_templates;
CREATE POLICY "id_card_templates_delete"
  ON public.id_card_templates FOR DELETE TO authenticated
  USING (
    public.is_super_admin() OR public.is_admin()
    OR public.user_has_permission('id_cards.templates.delete')
  );

-- B.2 id_card_print_jobs (service_role + 3 admin + 1 learner-own)

DROP POLICY IF EXISTS "id_card_print_jobs_service_role_all" ON public.id_card_print_jobs;
CREATE POLICY "id_card_print_jobs_service_role_all"
  ON public.id_card_print_jobs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "id_card_print_jobs_admin_view" ON public.id_card_print_jobs;
CREATE POLICY "id_card_print_jobs_admin_view"
  ON public.id_card_print_jobs FOR SELECT TO authenticated
  USING (
    public.is_super_admin() OR public.is_admin()
    OR public.user_has_permission('id_cards.jobs.view')
  );

DROP POLICY IF EXISTS "id_card_print_jobs_admin_insert" ON public.id_card_print_jobs;
CREATE POLICY "id_card_print_jobs_admin_insert"
  ON public.id_card_print_jobs FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin() OR public.is_admin()
    OR public.user_has_permission('id_cards.jobs.manage')
  );

DROP POLICY IF EXISTS "id_card_print_jobs_admin_update" ON public.id_card_print_jobs;
CREATE POLICY "id_card_print_jobs_admin_update"
  ON public.id_card_print_jobs FOR UPDATE TO authenticated
  USING (
    public.is_super_admin() OR public.is_admin()
    OR public.user_has_permission('id_cards.jobs.manage')
  )
  WITH CHECK (
    public.is_super_admin() OR public.is_admin()
    OR public.user_has_permission('id_cards.jobs.manage')
  );

-- Learner self-view: BOTH UUID link OR email match (belt+suspenders)
DROP POLICY IF EXISTS "id_card_print_jobs_learner_view_own" ON public.id_card_print_jobs;
CREATE POLICY "id_card_print_jobs_learner_view_own"
  ON public.id_card_print_jobs FOR SELECT TO authenticated
  USING (
    public.user_has_permission('id_cards.my-cards.view')
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.learner_id = id_card_print_jobs.student_id
      )
      OR
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE lp.id = id_card_print_jobs.student_id
          AND lp.college_email IS NOT NULL
          AND lp.college_email = p.email
      )
    )
  );

-- B.3 storage bucket student-photos

DROP POLICY IF EXISTS "student_photos_admin_upload" ON storage.objects;
CREATE POLICY "student_photos_admin_upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'student-photos'
    AND (
      public.is_super_admin() OR public.is_admin()
      OR public.user_has_permission('id_cards.jobs.manage')
    )
  );

DROP POLICY IF EXISTS "student_photos_admin_update" ON storage.objects;
CREATE POLICY "student_photos_admin_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'student-photos'
    AND (
      public.is_super_admin() OR public.is_admin()
      OR public.user_has_permission('id_cards.jobs.manage')
    )
  );

DROP POLICY IF EXISTS "student_photos_admin_select" ON storage.objects;
CREATE POLICY "student_photos_admin_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'student-photos'
    AND (
      public.is_super_admin() OR public.is_admin()
      OR public.user_has_permission('id_cards.jobs.view')
    )
  );

DROP POLICY IF EXISTS "student_photos_learner_select_own" ON storage.objects;
CREATE POLICY "student_photos_learner_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'student-photos'
    AND public.user_has_permission('id_cards.my-cards.view')
    AND EXISTS (
      SELECT 1
      FROM public.learners_profiles lp
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE (
        p.learner_id = lp.id
        OR (lp.college_email IS NOT NULL AND lp.college_email = p.email)
      )
      AND storage.objects.name LIKE lp.id::text || '/%'
    )
  );

-- ----------------------------------------------------------------------------
-- C. Reader function: fn_get_id_card_policy(uuid) — anon-revoked
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_get_id_card_policy(
  p_institution_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_result JSONB;
  v_printer_model            TEXT;
  v_sides                    INTEGER;
  v_ribbon_type              TEXT;
  v_magstripe_enabled        BOOLEAN;
  v_magstripe_hardware       BOOLEAN;
  v_chip_enabled             BOOLEAN;
  v_chip_hardware            BOOLEAN;
  v_rfid_enabled             BOOLEAN;
  v_rfid_hardware            BOOLEAN;
  v_station_endpoint_url     TEXT;
  v_photo_fallback           JSONB;
BEGIN
  SELECT (value #>> '{}')::TEXT INTO v_printer_model
  FROM public.platform_policies
  WHERE policy_key = 'id_card.printer.model' AND is_active = TRUE
    AND ((p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id) OR scope_type = 'global')
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END LIMIT 1;

  SELECT (value #>> '{}')::INTEGER INTO v_sides
  FROM public.platform_policies
  WHERE policy_key = 'id_card.printer.sides' AND is_active = TRUE
    AND ((p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id) OR scope_type = 'global')
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END LIMIT 1;

  SELECT (value #>> '{}')::TEXT INTO v_ribbon_type
  FROM public.platform_policies
  WHERE policy_key = 'id_card.printer.ribbon_type' AND is_active = TRUE
    AND ((p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id) OR scope_type = 'global')
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END LIMIT 1;

  SELECT (value #>> '{}')::BOOLEAN INTO v_magstripe_enabled
  FROM public.platform_policies
  WHERE policy_key = 'id_card.encoding.magstripe_enabled' AND is_active = TRUE
    AND ((p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id) OR scope_type = 'global')
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END LIMIT 1;

  SELECT (value #>> '{}')::BOOLEAN INTO v_magstripe_hardware
  FROM public.platform_policies
  WHERE policy_key = 'id_card.encoding.magstripe_hardware_present' AND is_active = TRUE
    AND ((p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id) OR scope_type = 'global')
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END LIMIT 1;

  SELECT (value #>> '{}')::BOOLEAN INTO v_chip_enabled
  FROM public.platform_policies
  WHERE policy_key = 'id_card.encoding.chip_enabled' AND is_active = TRUE
    AND ((p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id) OR scope_type = 'global')
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END LIMIT 1;

  SELECT (value #>> '{}')::BOOLEAN INTO v_chip_hardware
  FROM public.platform_policies
  WHERE policy_key = 'id_card.encoding.chip_hardware_present' AND is_active = TRUE
    AND ((p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id) OR scope_type = 'global')
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END LIMIT 1;

  SELECT (value #>> '{}')::BOOLEAN INTO v_rfid_enabled
  FROM public.platform_policies
  WHERE policy_key = 'id_card.encoding.rfid_enabled' AND is_active = TRUE
    AND ((p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id) OR scope_type = 'global')
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END LIMIT 1;

  SELECT (value #>> '{}')::BOOLEAN INTO v_rfid_hardware
  FROM public.platform_policies
  WHERE policy_key = 'id_card.encoding.rfid_hardware_present' AND is_active = TRUE
    AND ((p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id) OR scope_type = 'global')
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END LIMIT 1;

  SELECT CASE WHEN value IS NULL OR value = 'null'::jsonb THEN NULL ELSE value #>> '{}' END
  INTO v_station_endpoint_url
  FROM public.platform_policies
  WHERE policy_key = 'id_card.station.endpoint_url' AND is_active = TRUE
    AND ((p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id) OR scope_type = 'global')
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END LIMIT 1;

  SELECT value INTO v_photo_fallback
  FROM public.platform_policies
  WHERE policy_key = 'id_card.photo_fallback' AND is_active = TRUE
    AND ((p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id) OR scope_type = 'global')
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END LIMIT 1;

  v_printer_model        := COALESCE(v_printer_model, 'primacy_2');
  v_sides                := COALESCE(v_sides, 2);
  v_ribbon_type          := COALESCE(v_ribbon_type, 'YMCKOK');
  v_magstripe_enabled    := COALESCE(v_magstripe_enabled, FALSE);
  v_magstripe_hardware   := COALESCE(v_magstripe_hardware, FALSE);
  v_chip_enabled         := COALESCE(v_chip_enabled, FALSE);
  v_chip_hardware        := COALESCE(v_chip_hardware, FALSE);
  v_rfid_enabled         := COALESCE(v_rfid_enabled, FALSE);
  v_rfid_hardware        := COALESCE(v_rfid_hardware, FALSE);
  v_photo_fallback       := COALESCE(v_photo_fallback, '["learners_profiles.student_photo_url","placeholder"]'::jsonb);

  v_result := jsonb_build_object(
    'printer_model',         v_printer_model,
    'sides',                 v_sides,
    'encoding', jsonb_build_object(
      'magstripe_enabled',           v_magstripe_enabled,
      'magstripe_hardware_present',  v_magstripe_hardware,
      'chip_enabled',                v_chip_enabled,
      'chip_hardware_present',       v_chip_hardware,
      'rfid_enabled',                v_rfid_enabled,
      'rfid_hardware_present',       v_rfid_hardware
    ),
    'station_endpoint_url',  v_station_endpoint_url,
    'ribbon_type',           v_ribbon_type,
    'photo_fallback',        v_photo_fallback
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.fn_get_id_card_policy(UUID) IS
  'Returns the resolved ID card policy as JSONB with shape IdCardPolicy. Scope precedence: institution > global.';

REVOKE EXECUTE ON FUNCTION public.fn_get_id_card_policy(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_get_id_card_policy(UUID) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_get_id_card_policy(UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- D. platform_policies seeds (11 rows)
-- ----------------------------------------------------------------------------

-- Note: data_type must be one of ('number','string','boolean','array','object','enum')
-- per platform_policies_data_type_check constraint. 'text'/'integer'/'jsonb' rejected.
INSERT INTO public.platform_policies (
  policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active
) VALUES
  ('id_card.printer.model',                      'global', NULL, to_jsonb('primacy_2'::TEXT), 'ID card printer model identifier (Evolis Primacy 2).',                            'string',  FALSE, TRUE),
  ('id_card.printer.sides',                      'global', NULL, to_jsonb(2::INTEGER),        'Number of card sides printed (1 or 2).',                                          'number',  FALSE, TRUE),
  ('id_card.printer.ribbon_type',                'global', NULL, to_jsonb('YMCKOK'::TEXT),    'Printer ribbon type. YMCKO=single-side, YMCKOK=double-side, monochrome=mono.',    'string',  FALSE, TRUE),
  ('id_card.encoding.magstripe_enabled',         'global', NULL, to_jsonb(FALSE),             'Whether magstripe encoding is enabled in the print pipeline.',                    'boolean', FALSE, TRUE),
  ('id_card.encoding.magstripe_hardware_present','global', NULL, to_jsonb(FALSE),             'Whether magstripe encoder hardware is fitted to the printer.',                    'boolean', FALSE, TRUE),
  ('id_card.encoding.chip_enabled',              'global', NULL, to_jsonb(FALSE),             'Whether chip (smart card) encoding is enabled in the print pipeline.',            'boolean', FALSE, TRUE),
  ('id_card.encoding.chip_hardware_present',     'global', NULL, to_jsonb(FALSE),             'Whether chip encoder hardware is fitted to the printer.',                         'boolean', FALSE, TRUE),
  ('id_card.encoding.rfid_enabled',              'global', NULL, to_jsonb(FALSE),             'Whether RFID encoding is enabled in the print pipeline.',                         'boolean', FALSE, TRUE),
  ('id_card.encoding.rfid_hardware_present',     'global', NULL, to_jsonb(FALSE),             'Whether RFID encoder hardware is fitted to the printer.',                         'boolean', FALSE, TRUE),
  ('id_card.station.endpoint_url',               'global', NULL, 'null'::jsonb,               'Print station agent endpoint URL. NULL when no agent registered yet.',            'string',  FALSE, TRUE),
  ('id_card.photo_fallback',                     'global', NULL, '["learners_profiles.student_photo_url","placeholder"]'::jsonb, 'Ordered photo source fallbacks for ID card rendering.', 'array',  FALSE, TRUE)
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- E. Default permission assignments (JSONB merge into custom_roles)
-- ----------------------------------------------------------------------------

-- Note: role_key mapping to actual prod roles (verified via rehearsal):
--   'admission_admin' → 'admission' (Admission Officer — closest semantic match)
--   'learner' does not exist; only 'student' is canonical
-- Director should confirm 'admission' is intended target; if a different admission-adjacent
-- role should also get these perms (admission_staff / administrator), grant via Role Management.
UPDATE public.custom_roles
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
      'id_cards.templates.view',   true,
      'id_cards.templates.create', true,
      'id_cards.templates.edit',   true,
      'id_cards.templates.delete', true,
      'id_cards.jobs.view',        true,
      'id_cards.jobs.manage',      true
    ),
    updated_at = now()
WHERE role_key IN ('registrar', 'admission');

UPDATE public.custom_roles
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
      'id_cards.my-cards.view', true
    ),
    updated_at = now()
WHERE role_key = 'student';

COMMIT;
