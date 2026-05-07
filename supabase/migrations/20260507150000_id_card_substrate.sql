-- =============================================================================
-- ID Card Substrate (Phase 1A)
-- =============================================================================
-- Greenfield work for Director-grade ID-card config subsystem.
-- Hardware: Evolis Primacy 2, double-sided, NO encoders fitted.
-- Central station, 1 location.
--
-- Tier-1 migration (data-touching, additive only):
--   - 1 column added: students.photo_url (TEXT NULL)
--   - 3 tables: id_card_templates, id_card_print_jobs (storage bucket: student-photos)
--   - 1 reader fn: fn_get_id_card_policy(uuid)
--   - 11 platform_policies seeds (printer config, encoder toggles, photo fallback)
--   - ~10 RLS policies on new tables only
--
-- Zero behavior change today. No UI / API / print agent yet — this is the
-- storage layer only. Director must approve before this applies to production.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- A. SCHEMA
-- -----------------------------------------------------------------------------

-- A.1 students.photo_url (additive, nullable — does not break existing rows)
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS photo_url TEXT NULL;

COMMENT ON COLUMN public.students.photo_url IS
  'Optional photo URL for ID card rendering. Nullable; falls back per id_card.photo_fallback policy.';

-- A.2 id_card_templates — layout + field mapping definitions
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

-- A.3 id_card_print_jobs — queue of print requests
CREATE TABLE IF NOT EXISTS public.id_card_print_jobs (
  id              UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  template_id     UUID NOT NULL REFERENCES public.id_card_templates(id) ON DELETE RESTRICT,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','rendering','sent_to_agent','printed','failed')),
  enqueued_by     UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  enqueued_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  picked_up_at    TIMESTAMPTZ NULL,
  result          JSONB NULL
);

COMMENT ON TABLE public.id_card_print_jobs IS
  'Print job queue. Print agent picks up rows where status=pending, transitions through rendering/sent_to_agent/printed/failed.';

CREATE INDEX IF NOT EXISTS idx_id_card_print_jobs_status_enqueued
  ON public.id_card_print_jobs (status, enqueued_at);

CREATE INDEX IF NOT EXISTS idx_id_card_print_jobs_student
  ON public.id_card_print_jobs (student_id);

-- A.4 storage bucket: student-photos (private, 5MB limit, png/jpeg only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'student-photos',
  'student-photos',
  FALSE,
  5242880,
  ARRAY['image/png','image/jpeg']
)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- B. RLS — additive only on new tables/bucket
-- -----------------------------------------------------------------------------

ALTER TABLE public.id_card_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.id_card_print_jobs ENABLE ROW LEVEL SECURITY;

-- B.1 id_card_templates: service_role full; super_admin full

DROP POLICY IF EXISTS "id_card_templates_service_role_all" ON public.id_card_templates;
CREATE POLICY "id_card_templates_service_role_all"
  ON public.id_card_templates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "id_card_templates_super_admin_all" ON public.id_card_templates;
CREATE POLICY "id_card_templates_super_admin_all"
  ON public.id_card_templates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

-- B.2 id_card_print_jobs: service_role full; super_admin/registrar/admission_admin select+insert; student select-own

DROP POLICY IF EXISTS "id_card_print_jobs_service_role_all" ON public.id_card_print_jobs;
CREATE POLICY "id_card_print_jobs_service_role_all"
  ON public.id_card_print_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "id_card_print_jobs_admin_select" ON public.id_card_print_jobs;
CREATE POLICY "id_card_print_jobs_admin_select"
  ON public.id_card_print_jobs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin','registrar','admission_admin')
    )
  );

DROP POLICY IF EXISTS "id_card_print_jobs_admin_insert" ON public.id_card_print_jobs;
CREATE POLICY "id_card_print_jobs_admin_insert"
  ON public.id_card_print_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin','registrar','admission_admin')
    )
  );

DROP POLICY IF EXISTS "id_card_print_jobs_student_select_own" ON public.id_card_print_jobs;
CREATE POLICY "id_card_print_jobs_student_select_own"
  ON public.id_card_print_jobs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE s.id = id_card_print_jobs.student_id
        AND s.college_email = p.email
        AND p.role = 'student'
    )
  );

-- B.3 storage bucket student-photos: admin upload, students read own

DROP POLICY IF EXISTS "student_photos_admin_upload" ON storage.objects;
CREATE POLICY "student_photos_admin_upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'student-photos'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin','registrar','admission_admin')
    )
  );

DROP POLICY IF EXISTS "student_photos_admin_update" ON storage.objects;
CREATE POLICY "student_photos_admin_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'student-photos'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin','registrar','admission_admin')
    )
  );

DROP POLICY IF EXISTS "student_photos_admin_select" ON storage.objects;
CREATE POLICY "student_photos_admin_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'student-photos'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin','registrar','admission_admin')
    )
  );

DROP POLICY IF EXISTS "student_photos_student_select_own" ON storage.objects;
CREATE POLICY "student_photos_student_select_own"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'student-photos'
    AND EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE s.college_email = p.email
        AND p.role = 'student'
        AND storage.objects.name LIKE s.id::text || '/%'
    )
  );

-- -----------------------------------------------------------------------------
-- C. Reader function: fn_get_id_card_policy
-- -----------------------------------------------------------------------------
-- Returns one row with IdCardPolicy shape via jsonb_build_object.
-- Reads platform_policies with scope precedence: institution > global.
-- SECURITY DEFINER, search_path locked. pgcrypto/extensions schema-qualified.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_get_id_card_policy(
  p_institution_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_result JSONB;

  -- Helper: read one policy value with scope precedence (institution > global)
  -- Returns NULL if not found at either scope.
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
  -- Precedence pattern: COALESCE(institution-scoped value, global value)
  -- Each policy resolved independently so partial overrides work.

  SELECT (value #>> '{}')::TEXT INTO v_printer_model
  FROM public.platform_policies
  WHERE policy_key = 'id_card.printer.model'
    AND is_active = TRUE
    AND (
      (p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id)
      OR scope_type = 'global'
    )
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END
  LIMIT 1;

  SELECT (value #>> '{}')::INTEGER INTO v_sides
  FROM public.platform_policies
  WHERE policy_key = 'id_card.printer.sides'
    AND is_active = TRUE
    AND (
      (p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id)
      OR scope_type = 'global'
    )
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END
  LIMIT 1;

  SELECT (value #>> '{}')::TEXT INTO v_ribbon_type
  FROM public.platform_policies
  WHERE policy_key = 'id_card.printer.ribbon_type'
    AND is_active = TRUE
    AND (
      (p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id)
      OR scope_type = 'global'
    )
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END
  LIMIT 1;

  SELECT (value #>> '{}')::BOOLEAN INTO v_magstripe_enabled
  FROM public.platform_policies
  WHERE policy_key = 'id_card.encoding.magstripe_enabled'
    AND is_active = TRUE
    AND (
      (p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id)
      OR scope_type = 'global'
    )
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END
  LIMIT 1;

  SELECT (value #>> '{}')::BOOLEAN INTO v_magstripe_hardware
  FROM public.platform_policies
  WHERE policy_key = 'id_card.encoding.magstripe_hardware_present'
    AND is_active = TRUE
    AND (
      (p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id)
      OR scope_type = 'global'
    )
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END
  LIMIT 1;

  SELECT (value #>> '{}')::BOOLEAN INTO v_chip_enabled
  FROM public.platform_policies
  WHERE policy_key = 'id_card.encoding.chip_enabled'
    AND is_active = TRUE
    AND (
      (p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id)
      OR scope_type = 'global'
    )
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END
  LIMIT 1;

  SELECT (value #>> '{}')::BOOLEAN INTO v_chip_hardware
  FROM public.platform_policies
  WHERE policy_key = 'id_card.encoding.chip_hardware_present'
    AND is_active = TRUE
    AND (
      (p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id)
      OR scope_type = 'global'
    )
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END
  LIMIT 1;

  SELECT (value #>> '{}')::BOOLEAN INTO v_rfid_enabled
  FROM public.platform_policies
  WHERE policy_key = 'id_card.encoding.rfid_enabled'
    AND is_active = TRUE
    AND (
      (p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id)
      OR scope_type = 'global'
    )
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END
  LIMIT 1;

  SELECT (value #>> '{}')::BOOLEAN INTO v_rfid_hardware
  FROM public.platform_policies
  WHERE policy_key = 'id_card.encoding.rfid_hardware_present'
    AND is_active = TRUE
    AND (
      (p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id)
      OR scope_type = 'global'
    )
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END
  LIMIT 1;

  -- station_endpoint_url stored as JSONB null or "url" — extract text or NULL
  SELECT CASE
           WHEN value IS NULL OR value = 'null'::jsonb THEN NULL
           ELSE value #>> '{}'
         END
  INTO v_station_endpoint_url
  FROM public.platform_policies
  WHERE policy_key = 'id_card.station.endpoint_url'
    AND is_active = TRUE
    AND (
      (p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id)
      OR scope_type = 'global'
    )
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END
  LIMIT 1;

  -- photo_fallback is a JSONB array, kept as JSONB
  SELECT value INTO v_photo_fallback
  FROM public.platform_policies
  WHERE policy_key = 'id_card.photo_fallback'
    AND is_active = TRUE
    AND (
      (p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id)
      OR scope_type = 'global'
    )
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END
  LIMIT 1;

  -- Defensive defaults if a policy row is missing at apply time
  v_printer_model        := COALESCE(v_printer_model, 'primacy_2');
  v_sides                := COALESCE(v_sides, 2);
  v_ribbon_type          := COALESCE(v_ribbon_type, 'YMCKOK');
  v_magstripe_enabled    := COALESCE(v_magstripe_enabled, FALSE);
  v_magstripe_hardware   := COALESCE(v_magstripe_hardware, FALSE);
  v_chip_enabled         := COALESCE(v_chip_enabled, FALSE);
  v_chip_hardware        := COALESCE(v_chip_hardware, FALSE);
  v_rfid_enabled         := COALESCE(v_rfid_enabled, FALSE);
  v_rfid_hardware        := COALESCE(v_rfid_hardware, FALSE);
  v_photo_fallback       := COALESCE(v_photo_fallback, '["students.photo_url","placeholder"]'::jsonb);

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
  'Returns the resolved ID card policy as JSONB with shape IdCardPolicy. Scope precedence: institution > global. Defensive defaults baked in.';

GRANT EXECUTE ON FUNCTION public.fn_get_id_card_policy(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_id_card_policy(UUID) TO service_role;

-- -----------------------------------------------------------------------------
-- D. platform_policies seeds (11 rows, all is_system=false, scope_type='global')
-- -----------------------------------------------------------------------------
-- value column is JSONB. Use to_jsonb() on Postgres typed values for clean encoding.

INSERT INTO public.platform_policies (
  policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active
) VALUES
  ('id_card.printer.model',                     'global', NULL, to_jsonb('primacy_2'::TEXT),  'ID card printer model identifier (Evolis Primacy 2).',                'text',    FALSE, TRUE),
  ('id_card.printer.sides',                     'global', NULL, to_jsonb(2::INTEGER),         'Number of card sides printed (1 or 2).',                              'integer', FALSE, TRUE),
  ('id_card.printer.ribbon_type',               'global', NULL, to_jsonb('YMCKOK'::TEXT),     'Printer ribbon type. YMCKO=single-side, YMCKOK=double-side, monochrome=mono.', 'text', FALSE, TRUE),
  ('id_card.encoding.magstripe_enabled',        'global', NULL, to_jsonb(FALSE),              'Whether magstripe encoding is enabled in the print pipeline.',        'boolean', FALSE, TRUE),
  ('id_card.encoding.magstripe_hardware_present','global', NULL, to_jsonb(FALSE),             'Whether magstripe encoder hardware is fitted to the printer.',        'boolean', FALSE, TRUE),
  ('id_card.encoding.chip_enabled',             'global', NULL, to_jsonb(FALSE),              'Whether chip (smart card) encoding is enabled in the print pipeline.', 'boolean', FALSE, TRUE),
  ('id_card.encoding.chip_hardware_present',    'global', NULL, to_jsonb(FALSE),              'Whether chip encoder hardware is fitted to the printer.',             'boolean', FALSE, TRUE),
  ('id_card.encoding.rfid_enabled',             'global', NULL, to_jsonb(FALSE),              'Whether RFID encoding is enabled in the print pipeline.',             'boolean', FALSE, TRUE),
  ('id_card.encoding.rfid_hardware_present',    'global', NULL, to_jsonb(FALSE),              'Whether RFID encoder hardware is fitted to the printer.',             'boolean', FALSE, TRUE),
  ('id_card.station.endpoint_url',              'global', NULL, 'null'::jsonb,                'Print station agent endpoint URL. NULL when no agent registered yet.', 'text',    FALSE, TRUE),
  ('id_card.photo_fallback',                    'global', NULL, '["students.photo_url","placeholder"]'::jsonb, 'Ordered list of photo source fallbacks for ID card rendering.', 'jsonb', FALSE, TRUE)
ON CONFLICT DO NOTHING;

COMMIT;
