-- Migration: Lock privilege-resolver views + DDL functions from anon
-- Date: 2026-06-16
-- Reason:
--   The privilege-resolver subsystem (originally created bare in
--   20260422_privilege_source_registry_and_resolvers.sql) inherited Supabase's
--   default ALTER DEFAULT PRIVILEGES ... GRANT ALL ON {TABLES,FUNCTIONS} TO anon.
--   Result:
--     (a) anon could SELECT the 5 privilege views (membership PII: learner_id,
--         group_id, status, dates) — re-exposed after PR #1256 because the
--         per-object revoke does NOT survive a CREATE OR REPLACE of a *fresh*
--         resolver view (a newly-registered source_kind is born with the anon grant).
--     (b) anon AND authenticated could EXECUTE the 3 SECURITY DEFINER functions,
--         which run DDL (CREATE/DROP VIEW with caller-supplied resolver_sql) and
--         have NO internal auth guard — a privilege-escalation vector. 0 app-code
--         callers exist, so locking EXECUTE to service_role/superuser is safe.
--
-- Durable fix: bake the REVOKE into the functions so every FUTURE resolver view
--   (and a rebuilt parent view) is born locked from anon. Plus a one-time DCL to
--   fix the current live objects.
--
-- Scope decision:
--   * VIEWS: revoke anon + PUBLIC on all 5. KEEP authenticated + service_role
--     (parent view v_privilege_memberships_effective has 8 client call sites:
--      academic/privileges/verify page, api/academic/privileges/card route,
--      privilege-service.ts, card-generator-service.ts). All 5 views are
--      security_invoker=false, so authenticated only needs the parent grant.
--   * FUNCTIONS: revoke anon + authenticated + PUBLIC (0 app callers, no internal
--     guard, DDL-executing). Leaves service_role/superuser (migrations) only.
--
-- Reference: reference_myjkkn_live_anon_exposure_2026_06_07, PR #1256,
--   feedback_supabase_anon_execute_default_grant, CLAUDE.md "Lock new RPCs from anon".

-- ============================================================================
-- 1. _privilege_rebuild_effective_view() — self-revoke parent view after rebuild
-- ============================================================================
CREATE OR REPLACE FUNCTION public._privilege_rebuild_effective_view()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_union_sql text;
  v_view_count int;
BEGIN
  SELECT COUNT(*) INTO v_view_count
  FROM privilege_source_types st
  WHERE EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = '_resolver_privilege_' || st.kind
      AND c.relkind = 'v'
  );

  IF v_view_count = 0 THEN
    EXECUTE $e$
      CREATE OR REPLACE VIEW v_privilege_memberships_effective AS
      SELECT NULL::uuid AS id, NULL::uuid AS group_id, NULL::uuid AS learner_id,
             NULL::text AS status, NULL::date AS start_date, NULL::date AS end_date,
             NULL::timestamptz AS revoked_at, NULL::uuid AS revoked_by,
             NULL::text AS revoke_reason, NULL::text AS review_notes,
             NULL::text AS renewal_status, NULL::uuid AS created_by,
             NULL::timestamptz AS created_at, NULL::timestamptz AS updated_at,
             NULL::text AS source_kind
      WHERE false
    $e$;
    -- Lock the freshly (re)created parent view from anon. Durable: survives every rebuild.
    EXECUTE 'REVOKE ALL ON v_privilege_memberships_effective FROM anon, PUBLIC';
    RETURN;
  END IF;

  SELECT string_agg('SELECT * FROM _resolver_privilege_' || quote_ident(st.kind),
                    E'\n  UNION ALL\n  '
                    ORDER BY st.sort_order, st.kind)
    INTO v_union_sql
  FROM privilege_source_types st
  WHERE EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = '_resolver_privilege_' || st.kind
      AND c.relkind = 'v'
  );

  EXECUTE 'CREATE OR REPLACE VIEW v_privilege_memberships_effective AS ' || v_union_sql;
  -- Lock the freshly (re)created parent view from anon. Durable: survives every rebuild.
  EXECUTE 'REVOKE ALL ON v_privilege_memberships_effective FROM anon, PUBLIC';
END;
$function$;

-- ============================================================================
-- 2. privilege_source_register(...) — self-revoke each new resolver view from anon
-- ============================================================================
CREATE OR REPLACE FUNCTION public.privilege_source_register(p_kind text, p_display_name text, p_resolver_sql text, p_description text DEFAULT NULL::text, p_icon text DEFAULT NULL::text, p_is_available boolean DEFAULT true, p_config_schema jsonb DEFAULT '{}'::jsonb, p_available_note text DEFAULT NULL::text, p_sort_order integer DEFAULT 100)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_view_name text;
  v_comment_body text;
BEGIN
  IF p_kind IS NULL OR p_kind = '' THEN
    RAISE EXCEPTION 'privilege_source_register: kind must be non-empty';
  END IF;
  IF p_kind !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'privilege_source_register: kind must match [a-z][a-z0-9_]* (got: %)', p_kind;
  END IF;
  IF p_resolver_sql IS NULL OR p_resolver_sql = '' THEN
    RAISE EXCEPTION 'privilege_source_register: resolver_sql must be non-empty';
  END IF;

  v_view_name := '_resolver_privilege_' || p_kind;
  EXECUTE 'CREATE OR REPLACE VIEW ' || quote_ident(v_view_name) || ' AS ' || p_resolver_sql;
  -- Lock the freshly created resolver view from anon. Durable: every new source_kind is born locked.
  EXECUTE 'REVOKE ALL ON ' || quote_ident(v_view_name) || ' FROM anon, PUBLIC';

  v_comment_body := 'Resolver view for privilege source_kind=' || p_kind
                 || '. Registered via privilege_source_register().';
  EXECUTE format('COMMENT ON VIEW %I IS %L', v_view_name, v_comment_body);

  INSERT INTO privilege_source_types AS t (
    kind, display_name, description, icon, is_available,
    config_schema, available_note, sort_order
  )
  VALUES (
    p_kind, p_display_name, p_description, p_icon, p_is_available,
    COALESCE(p_config_schema, '{}'::jsonb), p_available_note, p_sort_order
  )
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
$function$;

-- ============================================================================
-- 3. One-time DCL: fix the CURRENT live objects
-- ============================================================================
-- 3a. Views: revoke anon + PUBLIC. authenticated + service_role preserved.
REVOKE ALL ON public._resolver_privilege_lc_members            FROM anon, PUBLIC;
REVOKE ALL ON public._resolver_privilege_manual                FROM anon, PUBLIC;
REVOKE ALL ON public._resolver_privilege_yuva_chapter_chairs   FROM anon, PUBLIC;
REVOKE ALL ON public._resolver_privilege_yuva_vertical_chairs  FROM anon, PUBLIC;
REVOKE ALL ON public.v_privilege_memberships_effective         FROM anon, PUBLIC;

-- 3b. DDL functions: revoke anon + authenticated + PUBLIC (0 app callers, no internal guard).
--     Leaves service_role/superuser (migrations) only.
REVOKE EXECUTE ON FUNCTION public._privilege_rebuild_effective_view()                                                      FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.privilege_source_register(text, text, text, text, text, boolean, jsonb, text, integer)   FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.privilege_source_unregister(text)                                                        FROM anon, authenticated, PUBLIC;

-- Refresh PostgREST schema cache so the grant changes propagate to the REST layer.
NOTIFY pgrst, 'reload schema';
