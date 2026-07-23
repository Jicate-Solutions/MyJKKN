-- =============================================================================
-- Reference / Masters registry — one hub for every master-data catalog
-- Added: 2026-07-11 · branch feat/reference-masters-hub
--
-- Pattern: config-table registry + generic catalog engine (Smile Care model,
-- rebuilt on MyJKKN's Supabase RLS + user_has_permission stack).
-- One registry row per catalog; three RPCs bound to registry rows only —
-- the client NEVER passes a table name or SQL (see feedback #1926).
--
-- TIER-1: ADDITIVE ONLY — new table + 3 RPCs + seed rows. Drops nothing.
-- =============================================================================

-- ── 1. Registry table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reference_catalogs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_key     TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  description     TEXT,
  group_name      TEXT NOT NULL DEFAULT 'General',
  source_table    TEXT NOT NULL,
  -- generic  = browse + inline add/edit via fn_reference_catalog_upsert
  -- linked   = count card only; links out to the module's own editor page
  -- readonly = browse only (table has semantics its own module must own)
  editor_mode     TEXT NOT NULL DEFAULT 'readonly'
                  CHECK (editor_mode IN ('generic','linked','readonly')),
  external_route  TEXT,
  label_column    TEXT NOT NULL DEFAULT 'name',
  -- [{key,label,type:'text'|'textarea'|'number'|'boolean',required,editable,show_in_list}]
  columns_config  JSONB NOT NULL DEFAULT '[]'::jsonb,
  view_permission   TEXT NOT NULL DEFAULT 'reference.catalogs.view',
  manage_permission TEXT NOT NULL DEFAULT 'reference.catalogs.manage',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 100,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES public.profiles(id),
  change_reason   TEXT
);

ALTER TABLE public.reference_catalogs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reference_catalogs_select" ON public.reference_catalogs;
CREATE POLICY "reference_catalogs_select" ON public.reference_catalogs
FOR SELECT USING (
  is_super_admin() OR is_admin() OR user_has_permission('reference.catalogs.view')
);

DROP POLICY IF EXISTS "reference_catalogs_admin_all" ON public.reference_catalogs;
CREATE POLICY "reference_catalogs_admin_all" ON public.reference_catalogs
FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ── 2. Cards RPC — registry metadata + live counts in ONE call ──────────────
-- (counts computed inside the fn, never per-row from a client WHERE — see
--  feedback_secdef_fn_in_where_is_per_row_hoist_to_array)

CREATE OR REPLACE FUNCTION public.fn_reference_catalog_cards()
RETURNS TABLE (
  catalog_key    TEXT,
  display_name   TEXT,
  description    TEXT,
  group_name     TEXT,
  editor_mode    TEXT,
  external_route TEXT,
  sort_order     INTEGER,
  total_count    BIGINT,
  active_count   BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_total BIGINT;
  v_active BIGINT;
  v_has_active BOOLEAN;
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('reference.catalogs.view')) THEN
    RAISE EXCEPTION 'You do not have permission to view reference catalogs';
  END IF;

  FOR r IN
    SELECT c.*
    FROM reference_catalogs c
    WHERE c.is_active
    ORDER BY c.group_name, c.sort_order, c.display_name
  LOOP
    catalog_key    := r.catalog_key;
    display_name   := r.display_name;
    description    := r.description;
    group_name     := r.group_name;
    editor_mode    := r.editor_mode;
    external_route := r.external_route;
    sort_order     := r.sort_order;

    IF to_regclass('public.' || quote_ident(r.source_table)) IS NULL THEN
      -- bad seed stays visible instead of hiding silently
      total_count := NULL;
      active_count := NULL;
      RETURN NEXT;
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns col
      WHERE col.table_schema = 'public'
        AND col.table_name = r.source_table
        AND col.column_name = 'is_active'
    ) INTO v_has_active;

    IF v_has_active THEN
      EXECUTE format(
        'SELECT count(*), count(*) FILTER (WHERE is_active IS NOT FALSE) FROM %I',
        r.source_table
      ) INTO v_total, v_active;
    ELSE
      EXECUTE format('SELECT count(*), count(*) FROM %I', r.source_table)
        INTO v_total, v_active;
    END IF;

    total_count  := v_total;
    active_count := v_active;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_reference_catalog_cards() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_reference_catalog_cards() TO authenticated, service_role;

-- ── 3. Rows RPC — generic browse, projection allowlisted per registry row ───

CREATE OR REPLACE FUNCTION public.fn_reference_catalog_rows(
  p_catalog_key TEXT,
  p_search      TEXT    DEFAULT NULL,
  p_limit       INTEGER DEFAULT 50,
  p_offset      INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat          reference_catalogs%ROWTYPE;
  v_pairs        TEXT;
  v_order_col    TEXT;
  v_where        TEXT := '';
  v_sql          TEXT;
  v_rows         JSONB;
  v_total        BIGINT;
  v_limit        INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset       INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  SELECT * INTO v_cat
  FROM reference_catalogs
  WHERE catalog_key = p_catalog_key AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown reference catalog: %', p_catalog_key;
  END IF;

  IF NOT (is_super_admin() OR is_admin() OR user_has_permission(v_cat.view_permission)) THEN
    RAISE EXCEPTION 'You do not have permission to view this catalog';
  END IF;

  IF v_cat.editor_mode = 'linked' THEN
    RAISE EXCEPTION 'Catalog % is managed in its own module page', p_catalog_key;
  END IF;

  IF to_regclass('public.' || quote_ident(v_cat.source_table)) IS NULL THEN
    RAISE EXCEPTION 'Source table % does not exist', v_cat.source_table;
  END IF;

  -- projection: configured keys ∩ real columns, plus standard columns when present
  SELECT string_agg(format('%L, t.%I', col.column_name, col.column_name), ', ')
  INTO v_pairs
  FROM information_schema.columns col
  WHERE col.table_schema = 'public'
    AND col.table_name = v_cat.source_table
    AND (
      col.column_name IN ('id', 'is_active', 'is_system', 'created_at', 'updated_at')
      OR col.column_name = v_cat.label_column
      OR col.column_name IN (
        SELECT cfg->>'key' FROM jsonb_array_elements(v_cat.columns_config) cfg
      )
    );
  IF v_pairs IS NULL THEN
    RAISE EXCEPTION 'Catalog % has no projectable columns', p_catalog_key;
  END IF;

  -- order: first existing conventional sort column, else the label column
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

  IF p_search IS NOT NULL AND length(trim(p_search)) > 0 THEN
    v_where := format('WHERE t.%I::text ILIKE %L',
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
  RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_reference_catalog_rows(TEXT, TEXT, INTEGER, INTEGER) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_reference_catalog_rows(TEXT, TEXT, INTEGER, INTEGER) TO authenticated, service_role;

-- ── 4. Upsert RPC — generic add/edit, fields allowlisted per registry row ───
-- No DELETE by design: catalogs deactivate via is_active, never hard-delete
-- (master rows are FK targets across modules).

CREATE OR REPLACE FUNCTION public.fn_reference_catalog_upsert(
  p_catalog_key TEXT,
  p_row_id      UUID  DEFAULT NULL,
  p_values      JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat        reference_catalogs%ROWTYPE;
  f            RECORD;
  v_set        TEXT := '';
  v_ins_cols   TEXT := '';
  v_ins_vals   TEXT := '';
  v_cast       TEXT;
  v_id         UUID;
  v_has_col    BOOLEAN;
BEGIN
  SELECT * INTO v_cat
  FROM reference_catalogs
  WHERE catalog_key = p_catalog_key AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown reference catalog: %', p_catalog_key;
  END IF;

  IF v_cat.editor_mode <> 'generic' THEN
    RAISE EXCEPTION 'Catalog % is not editable from the reference hub', p_catalog_key;
  END IF;

  -- SECURITY DEFINER bypasses table RLS — the gate lives HERE, on the
  -- registry row's manage permission (duplicated per standing rule).
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission(v_cat.manage_permission)) THEN
    RAISE EXCEPTION 'You do not have permission to edit this catalog';
  END IF;

  IF to_regclass('public.' || quote_ident(v_cat.source_table)) IS NULL THEN
    RAISE EXCEPTION 'Source table % does not exist', v_cat.source_table;
  END IF;

  -- editable fields = configured editable ∩ real simple-typed columns ∩ payload
  FOR f IN
    SELECT cfg->>'key' AS key, col.data_type
    FROM jsonb_array_elements(v_cat.columns_config) cfg
    JOIN information_schema.columns col
      ON col.table_schema = 'public'
     AND col.table_name = v_cat.source_table
     AND col.column_name = cfg->>'key'
    WHERE COALESCE((cfg->>'editable')::boolean, true)
      AND cfg->>'key' NOT IN
          ('id','created_at','updated_at','created_by','updated_by','is_system','institution_id')
      AND col.data_type IN
          ('text','character varying','integer','bigint','smallint',
           'numeric','boolean','double precision')
      AND p_values ? (cfg->>'key')
  LOOP
    v_cast := CASE f.data_type
      WHEN 'character varying' THEN 'text'
      ELSE f.data_type
    END;
    v_set      := v_set      || format('%I = (%L)::%s, ', f.key, p_values->>f.key, v_cast);
    v_ins_cols := v_ins_cols || format('%I, ', f.key);
    v_ins_vals := v_ins_vals || format('(%L)::%s, ', p_values->>f.key, v_cast);
  END LOOP;

  -- is_active toggle is always allowed when the column exists
  IF p_values ? 'is_active' THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns col
      WHERE col.table_schema = 'public'
        AND col.table_name = v_cat.source_table
        AND col.column_name = 'is_active'
    ) INTO v_has_col;
    IF v_has_col THEN
      v_set      := v_set      || format('is_active = (%L)::boolean, ', p_values->>'is_active');
      v_ins_cols := v_ins_cols || 'is_active, ';
      v_ins_vals := v_ins_vals || format('(%L)::boolean, ', p_values->>'is_active');
    END IF;
  END IF;

  IF v_set = '' THEN
    RAISE EXCEPTION 'No editable fields present in payload for catalog %', p_catalog_key;
  END IF;

  IF p_row_id IS NULL THEN
    -- INSERT · stamp created_by when the column exists
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns col
      WHERE col.table_schema = 'public'
        AND col.table_name = v_cat.source_table
        AND col.column_name = 'created_by'
    ) INTO v_has_col;
    IF v_has_col THEN
      v_ins_cols := v_ins_cols || 'created_by, ';
      v_ins_vals := v_ins_vals || format('(%L)::uuid, ', auth.uid());
    END IF;

    EXECUTE format(
      'INSERT INTO %I (%s) VALUES (%s) RETURNING id',
      v_cat.source_table,
      left(v_ins_cols, -2),
      left(v_ins_vals, -2)
    ) INTO v_id;
  ELSE
    -- UPDATE · stamp updated_at / updated_by when the columns exist
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns col
      WHERE col.table_schema = 'public'
        AND col.table_name = v_cat.source_table
        AND col.column_name = 'updated_at'
    ) INTO v_has_col;
    IF v_has_col THEN
      v_set := v_set || 'updated_at = now(), ';
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns col
      WHERE col.table_schema = 'public'
        AND col.table_name = v_cat.source_table
        AND col.column_name = 'updated_by'
    ) INTO v_has_col;
    IF v_has_col THEN
      v_set := v_set || format('updated_by = (%L)::uuid, ', auth.uid());
    END IF;

    EXECUTE format(
      'UPDATE %I SET %s WHERE id = %L RETURNING id',
      v_cat.source_table,
      left(v_set, -2),
      p_row_id
    ) INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Row % not found in catalog %', p_row_id, p_catalog_key;
    END IF;
  END IF;

  RETURN jsonb_build_object('id', v_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_reference_catalog_upsert(TEXT, UUID, JSONB) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_reference_catalog_upsert(TEXT, UUID, JSONB) TO authenticated, service_role;

-- ── 5. Seeds — 36 catalogs across 10 groups ──────────────────────────────────
-- Guarded by NOT EXISTS on catalog_key (identity), never ON CONFLICT on a
-- mutable column (see feedback_seed_onconflict_mutable_column_resurrection).

INSERT INTO public.reference_catalogs
  (catalog_key, display_name, description, group_name, source_table,
   editor_mode, external_route, label_column, columns_config, sort_order)
SELECT * FROM (VALUES
  -- ── Organization (linked — big bespoke modules) ──
  ('institutions', 'Institutions', 'All JKKN institutions', 'Organization',
   'institutions', 'linked', '/organizations/institutions', 'name', '[]'::jsonb, 10),
  ('departments', 'Departments', 'Departments across institutions', 'Organization',
   'departments', 'linked', '/organizations/departments', 'name', '[]'::jsonb, 20),
  ('degrees', 'Degrees', 'Degree types offered', 'Organization',
   'degrees', 'linked', '/organizations/degrees', 'name', '[]'::jsonb, 30),
  ('programs', 'Programs', 'Academic programs', 'Organization',
   'programs', 'linked', '/organizations/programs', 'name', '[]'::jsonb, 40),
  ('courses', 'Courses', 'Course master list', 'Organization',
   'courses', 'linked', '/organizations/courses', 'name', '[]'::jsonb, 50),

  -- ── Admission ──
  ('community_categories', 'Community categories', 'Community category lookup (OC/BC/MBC/SC/ST…)', 'Admission',
   'community_categories', 'generic', '/admission/settings/lookups/community-categories', 'name',
   '[{"key":"code","label":"Code","type":"text","required":true,"show_in_list":true},
     {"key":"name","label":"Name","type":"text","required":true,"show_in_list":true},
     {"key":"sort_order","label":"Sort order","type":"number","show_in_list":true}]'::jsonb, 10),
  ('castes', 'Castes', 'Caste lookup mapped to community categories', 'Admission',
   'castes', 'linked', '/admission/settings/lookups/castes', 'name', '[]'::jsonb, 20),
  ('quotas', 'Quotas', 'Admission seat quotas', 'Admission',
   'quotas', 'generic', '/admission/settings/lookups/quotas', 'name',
   '[{"key":"code","label":"Code","type":"text","required":true,"show_in_list":true},
     {"key":"name","label":"Name","type":"text","required":true,"show_in_list":true},
     {"key":"sort_order","label":"Sort order","type":"number","show_in_list":true}]'::jsonb, 30),
  ('accommodation_types', 'Accommodation types', 'Hostel / day-scholar accommodation options', 'Admission',
   'accommodation_types', 'generic', '/admission/settings/lookups/accommodation-types', 'name',
   '[{"key":"code","label":"Code","type":"text","required":true,"show_in_list":true},
     {"key":"name","label":"Name","type":"text","required":true,"show_in_list":true},
     {"key":"sort_order","label":"Sort order","type":"number","show_in_list":true}]'::jsonb, 40),
  ('admission_lead_sources', 'Lead sources', 'Where admission leads come from', 'Admission',
   'admission_lead_sources_master', 'generic', '/admission/settings/sources', 'label',
   '[{"key":"key","label":"Key","type":"text","required":true,"show_in_list":true},
     {"key":"label","label":"Label","type":"text","required":true,"show_in_list":true},
     {"key":"description","label":"Description","type":"textarea"},
     {"key":"display_order","label":"Sort order","type":"number","show_in_list":true}]'::jsonb, 50),
  ('admission_statuses', 'Admission statuses', 'Lead / application pipeline statuses', 'Admission',
   'admission_statuses', 'linked', '/admission/settings/statuses', 'label', '[]'::jsonb, 60),
  ('expo_masters', 'Expo masters', 'Recurring education expo events', 'Admission',
   'expo_masters', 'linked', '/admission/marketing/expos/masters', 'event_name', '[]'::jsonb, 70),

  -- ── Academic ──
  ('leave_types', 'Leave types', 'Student / staff leave types', 'Academic',
   'leave_types', 'linked', '/academic/leaves/settings/types', 'leave_type_name', '[]'::jsonb, 10),
  ('leave_onduty_sub_categories', 'On-duty sub-categories', 'OD categories for leave-onduty', 'Academic',
   'leave_onduty_sub_categories', 'linked', '/academic/leave-onduty/settings', 'name', '[]'::jsonb, 20),
  ('school_session_types', 'School session types', 'Session type lookup for school timetables', 'Academic',
   'school_session_types', 'generic', NULL, 'label',
   '[{"key":"code","label":"Code","type":"text","required":true,"show_in_list":true},
     {"key":"label","label":"Label","type":"text","required":true,"show_in_list":true},
     {"key":"description","label":"Description","type":"textarea"},
     {"key":"display_order","label":"Sort order","type":"number","show_in_list":true}]'::jsonb, 30),
  ('program_partner_types', 'Program partner types', 'Partner type lookup for academic programs', 'Academic',
   'program_partner_types', 'generic', NULL, 'label',
   '[{"key":"code","label":"Code","type":"text","required":true,"show_in_list":true},
     {"key":"label","label":"Label","type":"text","required":true,"show_in_list":true},
     {"key":"description","label":"Description","type":"textarea"},
     {"key":"display_order","label":"Sort order","type":"number","show_in_list":true}]'::jsonb, 40),
  ('bos_member_types', 'BoS member types', 'Board of Studies member type lookup', 'Academic',
   'bos_member_types', 'readonly', '/bos', 'name', '[]'::jsonb, 50),

  -- ── CDC & Training ──
  ('cdc_drive_types', 'Drive types', 'Placement drive types', 'CDC & Training',
   'cdc_drive_types', 'generic', NULL, 'display_name',
   '[{"key":"config_key","label":"Key","type":"text","required":true,"show_in_list":true},
     {"key":"display_name","label":"Name","type":"text","required":true,"show_in_list":true},
     {"key":"description","label":"Description","type":"textarea"},
     {"key":"sort_order","label":"Sort order","type":"number","show_in_list":true}]'::jsonb, 10),
  ('cdc_offer_types', 'Offer types', 'Placement offer types', 'CDC & Training',
   'cdc_offer_types', 'generic', NULL, 'display_name',
   '[{"key":"config_key","label":"Key","type":"text","required":true,"show_in_list":true},
     {"key":"display_name","label":"Name","type":"text","required":true,"show_in_list":true},
     {"key":"description","label":"Description","type":"textarea"},
     {"key":"counts_toward_placement","label":"Counts toward placement","type":"boolean","show_in_list":true},
     {"key":"sort_order","label":"Sort order","type":"number"}]'::jsonb, 20),
  ('cdc_training_types', 'Training types', 'CDC training program types', 'CDC & Training',
   'cdc_training_types', 'generic', NULL, 'display_name',
   '[{"key":"config_key","label":"Key","type":"text","required":true,"show_in_list":true},
     {"key":"display_name","label":"Name","type":"text","required":true,"show_in_list":true},
     {"key":"description","label":"Description","type":"textarea"},
     {"key":"default_total_hours","label":"Default hours","type":"number","show_in_list":true},
     {"key":"sort_order","label":"Sort order","type":"number"}]'::jsonb, 30),
  ('cdc_internship_types', 'Internship types', 'Internship engagement types', 'CDC & Training',
   'cdc_internship_types', 'generic', NULL, 'display_name',
   '[{"key":"config_key","label":"Key","type":"text","required":true,"show_in_list":true},
     {"key":"display_name","label":"Name","type":"text","required":true,"show_in_list":true},
     {"key":"description","label":"Description","type":"textarea"},
     {"key":"sort_order","label":"Sort order","type":"number","show_in_list":true}]'::jsonb, 40),
  ('cdc_workshop_types', 'Workshop types', 'CDC workshop types', 'CDC & Training',
   'cdc_workshop_types', 'generic', NULL, 'display_name',
   '[{"key":"config_key","label":"Key","type":"text","required":true,"show_in_list":true},
     {"key":"display_name","label":"Name","type":"text","required":true,"show_in_list":true},
     {"key":"description","label":"Description","type":"textarea"},
     {"key":"sort_order","label":"Sort order","type":"number","show_in_list":true}]'::jsonb, 50),
  ('cdc_mentor_categories', 'Mentor categories', 'Industry mentor categories', 'CDC & Training',
   'cdc_mentor_categories', 'generic', NULL, 'display_name',
   '[{"key":"config_key","label":"Key","type":"text","required":true,"show_in_list":true},
     {"key":"display_name","label":"Name","type":"text","required":true,"show_in_list":true},
     {"key":"description","label":"Description","type":"textarea"},
     {"key":"sort_order","label":"Sort order","type":"number","show_in_list":true}]'::jsonb, 60),
  ('cdc_mentorship_categories', 'Mentorship categories', 'Mentorship engagement categories', 'CDC & Training',
   'cdc_mentorship_categories', 'generic', NULL, 'display_name',
   '[{"key":"config_key","label":"Key","type":"text","required":true,"show_in_list":true},
     {"key":"display_name","label":"Name","type":"text","required":true,"show_in_list":true},
     {"key":"description","label":"Description","type":"textarea"},
     {"key":"sort_order","label":"Sort order","type":"number","show_in_list":true}]'::jsonb, 70),
  ('internship_site_types', 'Internship site types', 'Internship site / venue types', 'CDC & Training',
   'internship_site_types', 'readonly', NULL, 'display_name', '[]'::jsonb, 80),

  -- ── HR & Staff ──
  ('employment_categories', 'Employment categories', 'Staff employment categories', 'HR & Staff',
   'employment_categories', 'generic', NULL, 'category_name',
   '[{"key":"category_name","label":"Name","type":"text","required":true,"show_in_list":true},
     {"key":"description","label":"Description","type":"textarea"},
     {"key":"is_teaching","label":"Teaching","type":"boolean","show_in_list":true},
     {"key":"shows_extended_profile","label":"Extended profile","type":"boolean"},
     {"key":"allows_login","label":"Allows login","type":"boolean","show_in_list":true}]'::jsonb, 10),
  ('hr_regularization_reasons', 'Regularization reasons', 'Attendance regularization reasons', 'HR & Staff',
   'hr_regularization_reasons', 'generic', NULL, 'label',
   '[{"key":"code","label":"Code","type":"text","required":true,"show_in_list":true},
     {"key":"label","label":"Label","type":"text","required":true,"show_in_list":true}]'::jsonb, 20),
  ('hr_attendance_status_types', 'Attendance status types', 'HR attendance status codes (system semantics)', 'HR & Staff',
   'hr_attendance_status_types', 'readonly', NULL, 'label', '[]'::jsonb, 30),

  -- ── Campus Living ──
  ('hostel_categories', 'Hostel categories', 'Hostel room categories (allocation semantics owned by Campus Living)', 'Campus Living',
   'hostel_categories', 'readonly', NULL, 'name', '[]'::jsonb, 10),
  ('mess_categories', 'Mess categories', 'Mess plan categories (caterer-scoped semantics)', 'Campus Living',
   'mess_categories', 'readonly', NULL, 'name', '[]'::jsonb, 20),
  ('hostel_leave_types', 'Hostel leave types', 'Hostel leave type configuration', 'Campus Living',
   'hostel_leave_types', 'readonly', NULL, 'leave_type_name', '[]'::jsonb, 30),

  -- ── Projects & Audit ──
  ('project_statuses', 'Project statuses', 'Project lifecycle statuses', 'Projects & Audit',
   'project_statuses', 'generic', NULL, 'name',
   '[{"key":"key","label":"Key","type":"text","required":true,"show_in_list":true},
     {"key":"name","label":"Name","type":"text","required":true,"show_in_list":true},
     {"key":"category","label":"Category","type":"text","show_in_list":true},
     {"key":"color","label":"Color","type":"text"},
     {"key":"order_index","label":"Sort order","type":"number"}]'::jsonb, 10),
  ('project_budget_categories', 'Project budget categories', 'Budget line categories for projects', 'Projects & Audit',
   'project_budget_categories', 'generic', NULL, 'name',
   '[{"key":"key","label":"Key","type":"text","required":true,"show_in_list":true},
     {"key":"name","label":"Name","type":"text","required":true,"show_in_list":true},
     {"key":"description","label":"Description","type":"textarea"},
     {"key":"order_index","label":"Sort order","type":"number"}]'::jsonb, 20),
  ('audit_finding_types', 'Audit finding types', 'Finding type lookup for audits', 'Projects & Audit',
   'audit_finding_types', 'generic', '/audit/finding-types/settings', 'name',
   '[{"key":"code","label":"Code","type":"text","required":true,"show_in_list":true},
     {"key":"name","label":"Name","type":"text","required":true,"show_in_list":true},
     {"key":"description","label":"Description","type":"textarea"}]'::jsonb, 30),

  -- ── Billing & Inventory ──
  ('billing_categories', 'Billing categories', 'Fee / billing categories', 'Billing & Inventory',
   'billing_categories', 'linked', '/billing/categories', 'category_name', '[]'::jsonb, 10),
  ('ims_item_categories', 'Inventory item categories', 'IMS item category tree (top-level adds only)', 'Billing & Inventory',
   'ims_item_categories', 'generic', NULL, 'name',
   '[{"key":"name","label":"Name","type":"text","required":true,"show_in_list":true},
     {"key":"code","label":"Code","type":"text","show_in_list":true},
     {"key":"description","label":"Description","type":"textarea"},
     {"key":"sort_order","label":"Sort order","type":"number"},
     {"key":"is_chemical","label":"Chemical","type":"boolean","show_in_list":true}]'::jsonb, 20),
  ('resource_parent_categories', 'Resource categories', 'Resource Management global categories (SECDEF write path owns edits)', 'Billing & Inventory',
   'resource_parent_categories', 'readonly', NULL, 'name', '[]'::jsonb, 30),

  -- ── Events & Calendar ──
  ('calendar_categories', 'Calendar categories', 'Academic calendar entry categories', 'Events & Calendar',
   'calendar_categories', 'generic', NULL, 'name',
   '[{"key":"name","label":"Name","type":"text","required":true,"show_in_list":true},
     {"key":"slug","label":"Slug","type":"text","required":true,"show_in_list":true},
     {"key":"color_code","label":"Color","type":"text"},
     {"key":"icon","label":"Icon","type":"text"},
     {"key":"sort_order","label":"Sort order","type":"number"}]'::jsonb, 10),
  ('events_general_categories', 'Event categories', 'General event categories (approval-chain semantics)', 'Events & Calendar',
   'events_general_categories', 'readonly', NULL, 'name', '[]'::jsonb, 20),

  -- ── Solutions & Services ──
  ('sh_solution_types', 'Solution types', 'Solutions Hub solution types', 'Solutions & Services',
   'sh_solution_types', 'generic', NULL, 'name',
   '[{"key":"name","label":"Name","type":"text","required":true,"show_in_list":true},
     {"key":"slug","label":"Slug","type":"text","required":true,"show_in_list":true},
     {"key":"description","label":"Description","type":"textarea"},
     {"key":"icon","label":"Icon","type":"text"},
     {"key":"color","label":"Color","type":"text"}]'::jsonb, 10),
  ('service_types', 'Service request types', 'Service request type configuration (flag semantics owned by module)', 'Solutions & Services',
   'service_types', 'readonly', NULL, 'name', '[]'::jsonb, 20),
  ('application_categories', 'Application categories', 'Application Hub categories', 'Solutions & Services',
   'categories', 'linked', '/applications/categories', 'name', '[]'::jsonb, 30)
) AS seed(catalog_key, display_name, description, group_name, source_table,
          editor_mode, external_route, label_column, columns_config, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.reference_catalogs rc WHERE rc.catalog_key = seed.catalog_key
);
