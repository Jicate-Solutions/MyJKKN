-- =============================================================================
-- Reference external API — per-catalog opt-in + service-role read functions
-- Added: 2026-07-12 · branch feat/reference-external-api · follows 20260712000200
--
-- Director decisions (interview 2026-07-12): per-catalog ON/OFF switch,
-- READ-ONLY external access, ACTIVE entries only.
--
-- Two SECURITY DEFINER functions granted to service_role ONLY — they exist
-- for the Application Hub API routes (Bearer api_keys auth happens in the
-- route; these fns additionally enforce api_enabled + active-only, so even
-- a route bug cannot read a switched-off catalog).
--
-- TIER-1 ADDITIVE: one column + two fns + seed UPDATEs. Drops nothing.
-- =============================================================================

ALTER TABLE public.reference_catalogs
  ADD COLUMN IF NOT EXISTS api_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.reference_catalogs.api_enabled IS
  'When true, this catalog is readable by registered child apps through the Application Hub reference API (read-only, active entries only). New catalogs default OFF.';

-- ── Directory of switched-on catalogs ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_reference_api_catalogs()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_count BIGINT;
  v_has_active BOOLEAN;
  v_out JSONB := '[]'::jsonb;
BEGIN
  FOR r IN
    SELECT c.*
    FROM reference_catalogs c
    WHERE c.is_active AND c.api_enabled
    ORDER BY c.group_name, c.sort_order, c.display_name
  LOOP
    IF to_regclass('public.' || quote_ident(r.source_table)) IS NULL THEN
      CONTINUE;
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns col
      WHERE col.table_schema = 'public'
        AND col.table_name = r.source_table
        AND col.column_name = 'is_active'
    ) INTO v_has_active;
    IF v_has_active THEN
      EXECUTE format('SELECT count(*) FROM %I WHERE is_active IS NOT FALSE', r.source_table)
        INTO v_count;
    ELSE
      EXECUTE format('SELECT count(*) FROM %I', r.source_table) INTO v_count;
    END IF;
    v_out := v_out || jsonb_build_object(
      'catalog_key', r.catalog_key,
      'name', r.display_name,
      'description', r.description,
      'group', r.group_name,
      'entry_count', v_count
    );
  END LOOP;
  RETURN v_out;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_reference_api_catalogs() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_reference_api_catalogs() TO service_role;

-- ── Rows of one switched-on catalog (active-only, projection allowlisted) ────

CREATE OR REPLACE FUNCTION public.fn_reference_api_rows(
  p_catalog_key TEXT,
  p_search      TEXT    DEFAULT NULL,
  p_limit       INTEGER DEFAULT 100,
  p_offset      INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat       reference_catalogs%ROWTYPE;
  v_pairs     TEXT;
  v_order_col TEXT;
  v_where     TEXT;
  v_has_active BOOLEAN;
  v_sql       TEXT;
  v_rows      JSONB;
  v_total     BIGINT;
  v_limit     INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
  v_offset    INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  SELECT * INTO v_cat
  FROM reference_catalogs
  WHERE catalog_key = p_catalog_key AND is_active AND api_enabled;
  IF NOT FOUND THEN
    -- switched-off and unknown catalogs are indistinguishable to callers
    RAISE EXCEPTION 'CATALOG_NOT_AVAILABLE';
  END IF;

  IF to_regclass('public.' || quote_ident(v_cat.source_table)) IS NULL THEN
    RAISE EXCEPTION 'CATALOG_NOT_AVAILABLE';
  END IF;

  -- projection: configured list/display columns ∩ real columns, plus id.
  -- Deliberately NO created_by/updated_by (internal user ids stay internal).
  SELECT string_agg(format('%L, t.%I', col.column_name, col.column_name), ', ')
  INTO v_pairs
  FROM information_schema.columns col
  WHERE col.table_schema = 'public'
    AND col.table_name = v_cat.source_table
    AND (
      col.column_name = 'id'
      OR col.column_name = v_cat.label_column
      OR col.column_name IN (
        SELECT cfg->>'key' FROM jsonb_array_elements(v_cat.columns_config) cfg
      )
    );
  IF v_pairs IS NULL THEN
    RAISE EXCEPTION 'CATALOG_NOT_AVAILABLE';
  END IF;

  SELECT col.column_name INTO v_order_col
  FROM information_schema.columns col
  WHERE col.table_schema = 'public'
    AND col.table_name = v_cat.source_table
    AND col.column_name IN ('sort_order', 'display_order', 'order_index', 'priority_order')
  ORDER BY col.column_name
  LIMIT 1;
  IF v_order_col IS NULL THEN
    v_order_col := v_cat.label_column;
  END IF;

  -- ACTIVE ENTRIES ONLY (Director decision) when the column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns col
    WHERE col.table_schema = 'public'
      AND col.table_name = v_cat.source_table
      AND col.column_name = 'is_active'
  ) INTO v_has_active;
  v_where := CASE WHEN v_has_active THEN 'WHERE t.is_active IS NOT FALSE' ELSE 'WHERE true' END;

  IF p_search IS NOT NULL AND length(trim(p_search)) > 0 THEN
    v_where := v_where || format(' AND t.%I::text ILIKE %L',
                                 v_cat.label_column, '%' || trim(p_search) || '%');
  END IF;

  v_sql := format(
    'SELECT COALESCE(jsonb_agg(row_obj), ''[]''::jsonb), COALESCE(max(full_count), 0)
     FROM (
       SELECT jsonb_build_object(%s) AS row_obj, count(*) OVER () AS full_count
       FROM %I t
       %s
       ORDER BY t.%I NULLS LAST
       LIMIT %s OFFSET %s
     ) sub',
    v_pairs, v_cat.source_table, v_where, v_order_col, v_limit, v_offset
  );

  EXECUTE v_sql INTO v_rows, v_total;
  RETURN jsonb_build_object(
    'catalog_key', v_cat.catalog_key,
    'name', v_cat.display_name,
    'rows', v_rows,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_reference_api_rows(TEXT, TEXT, INTEGER, INTEGER) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_reference_api_rows(TEXT, TEXT, INTEGER, INTEGER) TO service_role;

-- ── Seed: switch ON the clearly-safe lookups ─────────────────────────────────
-- ON  = plain vocabulary lists external forms genuinely need.
-- OFF (stays default false, listed here for the audit trail):
--   school_master / mess_caterers            → institutional network + contacts
--   custom_roles / privilege_*               → access-control internals
--   okr_auto_track_sources                   → contains query templates
--   hr_pay_components / hr_* signal inputs   → payroll/recruitment internals
--   *_committees / lc_positions              → people-adjacent org structure
--   billing_categories                       → fee amounts (Director can flip on later)
--   project_* / referral_categories / resource_* / ai_pulse_* → internal ops

UPDATE public.reference_catalogs
SET api_enabled = true,
    updated_at = now(),
    change_reason = 'External reference API v1 seed: safe vocabulary lookups (interview 2026-07-12)'
WHERE catalog_key IN (
  'community_categories', 'castes', 'quotas', 'accommodation_types',
  'admission_lead_sources', 'admission_statuses',
  'school_session_types', 'program_partner_types', 'bos_taxonomy_levels',
  'cdc_drive_types', 'cdc_offer_types', 'cdc_training_types',
  'cdc_internship_types', 'cdc_workshop_types', 'cdc_mentor_categories',
  'cdc_mentorship_categories', 'internship_site_types',
  'cdc_expertise_areas', 'cdc_industry_sectors', 'exam_definitions',
  'employment_categories', 'hr_regularization_reasons', 'hr_attendance_status_types',
  'calendar_categories', 'hostel_amenity_tags', 'grievance_categories',
  'internship_cycle_status_labels'
);
