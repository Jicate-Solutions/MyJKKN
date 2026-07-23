-- =============================================================================
-- Reference engine v2 — select (enum/fixed-options) + fk (linked-table) fields
-- Added: 2026-07-12 · branch feat/reference-hub-v2 · follows 20260711221500
--
-- 1. fn_reference_catalog_upsert v2: field allowlist extended to enum and
--    uuid columns (cast type comes from pg_catalog, never from the client).
-- 2. NEW fn_reference_catalog_fk_options: dropdown options for fk fields —
--    the target table/label column come from the REGISTRY row's field config
--    (super-admin-writable only), never from the client (#1926 discipline).
--
-- TIER-1: ADDITIVE (one CREATE OR REPLACE + one new fn). Drops nothing.
-- =============================================================================

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

  -- SECURITY DEFINER bypasses table RLS — the gate lives HERE.
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission(v_cat.manage_permission)) THEN
    RAISE EXCEPTION 'You do not have permission to edit this catalog';
  END IF;

  IF to_regclass('public.' || quote_ident(v_cat.source_table)) IS NULL THEN
    RAISE EXCEPTION 'Source table % does not exist', v_cat.source_table;
  END IF;

  -- editable fields = configured editable ∩ real columns of coverable type
  -- ∩ payload keys. Coverable: simple scalars, uuid (fk fields), enums
  -- (select fields). Cast type comes from pg_catalog (trusted), value is
  -- literal-quoted — the client contributes DATA only.
  FOR f IN
    SELECT cfg->>'key' AS key,
           format_type(a.atttypid, a.atttypmod) AS ftype,
           ty.typtype AS typkind
    FROM jsonb_array_elements(v_cat.columns_config) cfg
    JOIN pg_attribute a
      ON a.attrelid = ('public.' || quote_ident(v_cat.source_table))::regclass
     AND a.attname = cfg->>'key'
     AND a.attnum > 0 AND NOT a.attisdropped
    JOIN pg_type ty ON ty.oid = a.atttypid
    WHERE COALESCE((cfg->>'editable')::boolean, true)
      AND cfg->>'key' NOT IN
          ('id','created_at','updated_at','created_by','updated_by','is_system')
      AND p_values ? (cfg->>'key')
      AND (
        ty.typtype = 'e'  -- enum → select field
        OR format_type(a.atttypid, a.atttypmod) IN
           ('text','integer','bigint','smallint','boolean',
            'double precision','real','uuid')
        OR format_type(a.atttypid, a.atttypmod) LIKE 'character varying%'
        OR format_type(a.atttypid, a.atttypmod) LIKE 'numeric%'
      )
  LOOP
    v_cast := CASE
      WHEN f.ftype LIKE 'character varying%' THEN 'text'
      WHEN f.ftype LIKE 'numeric%' THEN 'numeric'
      ELSE f.ftype  -- includes enum type names from format_type (trusted)
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

-- ── fk dropdown options — target table comes from the registry field config ──

CREATE OR REPLACE FUNCTION public.fn_reference_catalog_fk_options(
  p_catalog_key TEXT,
  p_field_key   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat        reference_catalogs%ROWTYPE;
  v_fk_table   TEXT;
  v_fk_label   TEXT;
  v_has_active BOOLEAN;
  v_where      TEXT := '';
  v_out        JSONB;
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

  SELECT cfg->>'fk_table', cfg->>'fk_label_column'
  INTO v_fk_table, v_fk_label
  FROM jsonb_array_elements(v_cat.columns_config) cfg
  WHERE cfg->>'key' = p_field_key AND cfg->>'type' = 'fk'
  LIMIT 1;
  IF v_fk_table IS NULL OR v_fk_label IS NULL THEN
    RAISE EXCEPTION 'Field % of catalog % is not an fk field', p_field_key, p_catalog_key;
  END IF;

  IF to_regclass('public.' || quote_ident(v_fk_table)) IS NULL THEN
    RAISE EXCEPTION 'FK table % does not exist', v_fk_table;
  END IF;
  PERFORM 1 FROM information_schema.columns col
   WHERE col.table_schema = 'public' AND col.table_name = v_fk_table
     AND col.column_name = v_fk_label;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FK label column %.% does not exist', v_fk_table, v_fk_label;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns col
    WHERE col.table_schema = 'public' AND col.table_name = v_fk_table
      AND col.column_name = 'is_active'
  ) INTO v_has_active;
  IF v_has_active THEN
    v_where := 'WHERE is_active IS NOT FALSE';
  END IF;

  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(o), ''[]''::jsonb) FROM (
       SELECT jsonb_build_object(''value'', id, ''label'', %I::text) AS o
       FROM %I %s ORDER BY %I::text LIMIT 2000
     ) sub',
    v_fk_label, v_fk_table, v_where, v_fk_label
  ) INTO v_out;

  RETURN v_out;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_reference_catalog_fk_options(TEXT, TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_reference_catalog_fk_options(TEXT, TEXT) TO authenticated, service_role;
