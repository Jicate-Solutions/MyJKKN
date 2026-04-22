-- =====================================================================
-- Privilege Source Registry + Self-Registration Helpers — 2026-04-22
--
-- Converts the hardcoded source_kind UNION into a plug-in registry.
-- Applied directly to prod via mcp__supabase__apply_migration across
-- three iterations (v3 quoting bug, v4 missing rebuild fn, v5 search_path
-- fix). This file is the consolidated/authoritative version.
-- =====================================================================

CREATE TABLE IF NOT EXISTS privilege_source_types (
  kind text PRIMARY KEY,
  display_name text NOT NULL,
  description text,
  icon text,
  is_available boolean NOT NULL DEFAULT true,
  config_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  available_note text,
  sort_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE privilege_source_types IS
  'Registry of pluggable privilege sources. Modules self-register via privilege_source_register(). Admin UI reads this table to populate the "Source" dropdown when creating a new privilege group.';

-- FK: privilege_groups.source_kind MUST reference registered kinds
ALTER TABLE privilege_groups DROP CONSTRAINT IF EXISTS privilege_groups_source_kind_chk;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'privilege_groups_source_kind_fk'
  ) THEN
    ALTER TABLE privilege_groups
      ADD CONSTRAINT privilege_groups_source_kind_fk
      FOREIGN KEY (source_kind) REFERENCES privilege_source_types(kind)
      ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Rebuild helper — regenerates v_privilege_memberships_effective from
-- all currently-registered resolver views.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _privilege_rebuild_effective_view()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE v_union_sql text; v_view_count int;
BEGIN
  SELECT COUNT(*) INTO v_view_count
  FROM privilege_source_types st
  WHERE EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = '_resolver_privilege_' || st.kind
      AND c.relkind = 'v'
  );

  IF v_view_count = 0 THEN
    EXECUTE $e$CREATE OR REPLACE VIEW v_privilege_memberships_effective AS
      SELECT NULL::uuid AS id, NULL::uuid AS group_id, NULL::uuid AS learner_id,
             NULL::text AS status, NULL::date AS start_date, NULL::date AS end_date,
             NULL::timestamptz AS revoked_at, NULL::uuid AS revoked_by,
             NULL::text AS revoke_reason, NULL::text AS review_notes,
             NULL::text AS renewal_status, NULL::uuid AS created_by,
             NULL::timestamptz AS created_at, NULL::timestamptz AS updated_at,
             NULL::text AS source_kind
      WHERE false$e$;
    RETURN;
  END IF;

  SELECT string_agg('SELECT * FROM _resolver_privilege_' || quote_ident(st.kind),
                    E'\n  UNION ALL\n  ' ORDER BY st.sort_order, st.kind)
    INTO v_union_sql
  FROM privilege_source_types st
  WHERE EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = '_resolver_privilege_' || st.kind
      AND c.relkind = 'v'
  );

  EXECUTE 'CREATE OR REPLACE VIEW v_privilege_memberships_effective AS ' || v_union_sql;
END;
$fn$;

-- ---------------------------------------------------------------------
-- Self-registration entry point — any module uses this to announce
-- itself as a privilege source. One line in the module's setup migration.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privilege_source_register(
  p_kind text, p_display_name text, p_resolver_sql text,
  p_description text DEFAULT NULL, p_icon text DEFAULT NULL,
  p_is_available boolean DEFAULT true,
  p_config_schema jsonb DEFAULT '{}'::jsonb,
  p_available_note text DEFAULT NULL,
  p_sort_order int DEFAULT 100
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE v_view_name text; v_comment_body text;
BEGIN
  IF p_kind IS NULL OR p_kind = '' THEN
    RAISE EXCEPTION 'privilege_source_register: kind must be non-empty'; END IF;
  IF p_kind !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'privilege_source_register: kind must match [a-z][a-z0-9_]* (got: %)', p_kind; END IF;
  IF p_resolver_sql IS NULL OR p_resolver_sql = '' THEN
    RAISE EXCEPTION 'privilege_source_register: resolver_sql must be non-empty'; END IF;

  v_view_name := '_resolver_privilege_' || p_kind;
  EXECUTE 'CREATE OR REPLACE VIEW ' || quote_ident(v_view_name) || ' AS ' || p_resolver_sql;

  v_comment_body := 'Resolver view for privilege source_kind=' || p_kind
                 || '. Registered via privilege_source_register().';
  EXECUTE format('COMMENT ON VIEW %I IS %L', v_view_name, v_comment_body);

  INSERT INTO privilege_source_types AS t (
    kind, display_name, description, icon, is_available,
    config_schema, available_note, sort_order)
  VALUES (
    p_kind, p_display_name, p_description, p_icon, p_is_available,
    COALESCE(p_config_schema, '{}'::jsonb), p_available_note, p_sort_order)
  ON CONFLICT (kind) DO UPDATE SET
    display_name   = EXCLUDED.display_name,
    description    = COALESCE(EXCLUDED.description, t.description),
    icon           = COALESCE(EXCLUDED.icon,        t.icon),
    is_available   = EXCLUDED.is_available,
    config_schema  = EXCLUDED.config_schema,
    available_note = EXCLUDED.available_note,
    sort_order     = EXCLUDED.sort_order,
    updated_at     = now();

  PERFORM _privilege_rebuild_effective_view();
END;
$fn$;

CREATE OR REPLACE FUNCTION privilege_source_unregister(p_kind text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE v_view_name text; v_in_use_count int;
BEGIN
  IF p_kind IS NULL OR p_kind = '' THEN
    RAISE EXCEPTION 'privilege_source_unregister: kind must be non-empty'; END IF;
  IF p_kind = 'manual' THEN
    RAISE EXCEPTION 'privilege_source_unregister: the manual source cannot be unregistered'; END IF;

  SELECT COUNT(*) INTO v_in_use_count FROM privilege_groups WHERE source_kind = p_kind;
  IF v_in_use_count > 0 THEN
    RAISE EXCEPTION 'privilege_source_unregister: source_kind=% is in use by % privilege_groups', p_kind, v_in_use_count; END IF;

  v_view_name := '_resolver_privilege_' || p_kind;
  EXECUTE 'DROP VIEW IF EXISTS ' || quote_ident(v_view_name);
  DELETE FROM privilege_source_types WHERE kind = p_kind;

  PERFORM _privilege_rebuild_effective_view();
END;
$fn$;

COMMENT ON FUNCTION privilege_source_register(text,text,text,text,text,boolean,jsonb,text,int) IS
  'Self-registration for privilege sources. One line in a module setup migration to expose the module as a pickable source.';

-- =====================================================================
-- Register the two current sources through the helper (same contract
-- any future module will use). Also register 3 placeholders so the
-- admin UI dropdown signals "coming soon" for known upcoming sources.
-- =====================================================================

SELECT privilege_source_register(
  p_kind => 'manual', p_display_name => 'Curate members manually',
  p_description => 'You add and remove members yourself.',
  p_icon => 'user-plus', p_sort_order => 10,
  p_resolver_sql => $r$
    SELECT pm.id, pm.group_id, pm.learner_id, pm.status, pm.start_date, pm.end_date,
           pm.revoked_at, pm.revoked_by, pm.revoke_reason, pm.review_notes,
           pm.renewal_status, pm.created_by, pm.created_at, pm.updated_at,
           'manual'::text AS source_kind
    FROM privilege_members pm
    JOIN privilege_groups pg ON pg.id = pm.group_id
    WHERE pg.source_kind = 'manual'
  $r$
);

SELECT privilege_source_register(
  p_kind => 'lc_members', p_display_name => 'Learners Council',
  p_description => 'Members are read LIVE from the Learners Council module. Privileges follow automatically when the council rotates.',
  p_icon => 'landmark', p_sort_order => 20,
  p_resolver_sql => $r$
    SELECT uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
             pg.id::text || ':' || p.learner_id::text) AS id,
           pg.id AS group_id, p.learner_id,
           CASE WHEN lc.status = 'active' THEN 'active' ELSE 'revoked' END AS status,
           lc.appointed_at::date AS start_date, lc.ended_at::date AS end_date,
           NULL::timestamptz AS revoked_at, NULL::uuid AS revoked_by,
           NULL::text AS revoke_reason, NULL::text AS review_notes,
           'active'::text AS renewal_status, NULL::uuid AS created_by,
           lc.created_at, lc.updated_at, 'lc_members'::text AS source_kind
    FROM privilege_groups pg
    JOIN lc_members lc ON lc.institution_id = pg.institution_id AND lc.status = 'active'
    JOIN profiles p ON p.id = lc.user_id
    WHERE pg.source_kind = 'lc_members' AND p.learner_id IS NOT NULL
  $r$
);

-- Placeholder registry entries (no resolver view). They appear greyed-out
-- in the admin dropdown. When their module ships, a new migration calls
-- privilege_source_register() with a real resolver_sql.
-- NOTE: we skip the register helper for these because it requires resolver_sql.
-- Direct INSERT with ON CONFLICT is safe.
INSERT INTO privilege_source_types
  (kind, display_name, description, icon, is_available, available_note, sort_order)
VALUES
  ('sf100_participants', 'Solve for 100 Participants',
   'Members will sync LIVE from the Solve for 100 module once it ships.',
   'trophy', false,
   'Data source is not yet available. This source activates when the module ships.', 30),
  ('alumni_chapter', 'Alumni Chapter',
   'Members will sync LIVE from Alumni chapter membership when tracked.',
   'graduation-cap', false,
   'Alumni chapter membership table is not yet available.', 40),
  ('hr_cohort', 'HR Cohort',
   'Members will sync LIVE from HR cohorts when the module ships.',
   'briefcase', false,
   'HR cohort tracking is not yet available.', 50)
ON CONFLICT (kind) DO UPDATE SET
  display_name   = EXCLUDED.display_name,
  description    = EXCLUDED.description,
  icon           = EXCLUDED.icon,
  is_available   = EXCLUDED.is_available,
  available_note = EXCLUDED.available_note,
  sort_order     = EXCLUDED.sort_order,
  updated_at     = now();
