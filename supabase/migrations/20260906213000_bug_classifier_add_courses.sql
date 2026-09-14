-- =============================================================================
-- Bug classifier: teach bug_reports.module_name the seven modules it never learned
-- (ai-pulse, bos, ims, meetings, procurement, projects, courses)
--
-- Date:    2026-09-06 (version token 20260906213000; FILE ONLY until the W12
--          apply stage runs it — the DROP COLUMN below trips the wave's
--          destructive-statement gate on purpose, so the Director allows this
--          version by hand: echo 20260906213000 >> ~/.config/obsidian/.ship-wave/allow-destructive)
-- PR:      fix/bug-classifier-courses-slug
-- Gate:    .github/workflows/module-config-audits.yml → scripts/check-bug-module-classifier.mjs
--
-- WHY
-- ---
-- `lib/navigation/modules.ts` gained seven modules over the months (ai-pulse,
-- bos, ims, meetings, procurement, projects, courses — every one a real route
-- under app/(routes)/) and the generated column that files every bug report
-- under a module never learned any of them. scripts/check-bug-module-classifier.mjs
-- has carried them as "7 legacy missing slugs" in its baseline, and bugs
-- reported from those pages file as 'other' in /admin/bug-reports. The Module
-- Config Audits check only fails a PR on NEW drift, so nothing forced the fix;
-- five stale PRs (#2344 #2582 #2950 #2951 #2975) tripped it because their
-- merge-base predated `courses`. Those five are unblocked by merging main into
-- their branches (W12 stale-head lane); this file fixes the classification.
--
-- WHAT
-- ----
-- The two GENERATED STORED columns (module_name, sub_module_name) cannot have
-- their expression altered in place, so — exactly like the applied precedent
-- 20260505000000_extend_bug_module_classifier.sql — they are dropped and
-- re-added with the CASE from supabase/setup/01_tables.sql plus seven branches
-- appended AFTER every existing one, so first-match order for the old modules
-- is unchanged (/organizations/courses/… stays organizations; /bos/courses/…
-- files under bos because bos precedes courses among the new ones). Re-adding
-- a STORED generated column recomputes it for every existing row, so historical
-- bugs from these pages move from 'other' to their module with no backfill.
--
-- DEPENDENCY: the view bug_reports_with_details selects both columns, so
-- DROP COLUMN would be refused ("other objects depend on it"). The view is
-- dropped first and re-created verbatim from supabase/setup/05_views.sql at the
-- end. Indexes dropped implicitly with the columns are re-created.
--
-- No BEGIN/COMMIT in the file, so the reviewer's BEGIN … ROLLBACK rehearsal and
-- the wave's own dry-run actually roll back.
-- =============================================================================

DROP VIEW IF EXISTS public.bug_reports_with_details;

-- ci:allow-anon-table bug_reports_ready_for_repro is NOT a new relation — it
-- already exists in production and is dropped and restored here only so the
-- generated column beneath it can be replaced. Its REVOKE is real but lives as
-- EXECUTE 'REVOKE ...' inside the restoring DO block, which this guard's own
-- header documents as its deliberate false positive ("a string literal inside a
-- DO body is treated as executable ... -- ci:allow-anon-table covers it"). The
-- statement matcher needs a statement that STARTS with REVOKE, and one cannot
-- be written at the top level here: the restore is conditional on the view
-- having existed, so an unconditional top-level REVOKE would raise 42P01 and
-- roll the whole migration back in any environment that never had the view.
-- The lock is instead asserted at RUNTIME in the closing DO block — a stronger
-- check than this one, because it reads has_table_privilege on the rebuilt view
-- rather than looking for the presence of a statement. The sibling view
-- bug_reports_with_details keeps its plain top-level REVOKE either way; this
-- marker waives the check, not the revoke.
-- ---------------------------------------------------------------------------
-- The SECOND dependent view. Added 2026-09-08 after this file froze the ship
-- wave at 11:24 with:
--     2BP01: cannot drop column module_name of table bug_reports because other
--     objects depend on it
--     DETAIL: view bug_reports_ready_for_repro depends on column module_name
-- The DEPENDENCY note above reasoned about bug_reports_with_details and that
-- half is right; bug_reports_ready_for_repro selects module_name too and was
-- missed. Both must be gone before DROP COLUMN, or the whole file rolls back --
-- which is why nothing in the repo could merge or apply for the rest of the day.
--
-- It is captured at RUNTIME rather than transcribed, because unlike its sibling
-- this view HAS NO DEFINITION IN THIS REPOSITORY: `git grep` over jicate/main
-- finds it only in 20260808190000's REVOKE line and in generated types/supabase.ts,
-- never in a CREATE. It was created out of band, so production is its only source
-- of truth and pg_get_viewdef is the only faithful way to put it back. Writing
-- one by hand here would be inventing a view and calling it a restoration.
--
-- reloptions are carried across verbatim, so a view that is security_invoker
-- comes back security_invoker and one that is not is not -- this file must fix
-- a dependency, not silently change who a view runs as.
DO $$
DECLARE
  v_def  text;
  v_opts text;
BEGIN
  IF to_regclass('public.bug_reports_ready_for_repro') IS NULL THEN
    RAISE NOTICE 'bug_reports_ready_for_repro absent - nothing to preserve';
    RETURN;
  END IF;

  SELECT pg_get_viewdef('public.bug_reports_ready_for_repro'::regclass, true),
         COALESCE(array_to_string(c.reloptions, ', '), '')
    INTO v_def, v_opts
    FROM pg_class c
   WHERE c.oid = 'public.bug_reports_ready_for_repro'::regclass;

  IF v_def IS NULL OR btrim(v_def) = '' THEN
    RAISE EXCEPTION 'could not read the definition of bug_reports_ready_for_repro; refusing to drop a view this file could not put back';
  END IF;

  PERFORM set_config('jkkn.repro_viewdef',  v_def,  true);   -- true = transaction-local,
  PERFORM set_config('jkkn.repro_viewopts', v_opts, true);   -- so a rolled-back rehearsal leaves nothing behind
  EXECUTE 'DROP VIEW public.bug_reports_ready_for_repro';
END $$;

ALTER TABLE public.bug_reports DROP COLUMN IF EXISTS module_name;
ALTER TABLE public.bug_reports DROP COLUMN IF EXISTS sub_module_name;

ALTER TABLE public.bug_reports ADD COLUMN module_name VARCHAR(100) GENERATED ALWAYS AS (
  CASE
    WHEN page_url IS NULL THEN 'unknown'
    WHEN page_url ~ '/academic/' THEN 'academic'
    WHEN page_url ~ '/admission/' THEN 'admission'                 -- before /admin/
    WHEN page_url ~ '/admin/' THEN 'admin'
    WHEN page_url ~ '/ai-query/' THEN 'ai-query'
    WHEN page_url ~ '/application-hub/' THEN 'application-hub'     -- before /applications/
    WHEN page_url ~ '/applications/' THEN 'applications'
    WHEN page_url ~ '/audit-trail/' THEN 'audit-trail'             -- before /audit/
    WHEN page_url ~ '/audit/' THEN 'audit'
    WHEN page_url ~ '/accreditation/' THEN 'accreditation'
    WHEN page_url ~ '/billing/' THEN 'billing'
    WHEN page_url ~ '/bug-leaderboard/' THEN 'bug-leaderboard'
    WHEN page_url ~ '/campus-living/' THEN 'campus-living'
    WHEN page_url ~ '/dashboard/' THEN 'dashboard'
    WHEN page_url ~ '/events/' THEN 'events'
    WHEN page_url ~ '/faculty/' THEN 'faculty'
    WHEN page_url ~ '/health/' THEN 'health'
    WHEN page_url ~ '/hr/' THEN 'hr'
    WHEN page_url ~ '/learners-council/' THEN 'learners-council'   -- before /learners/
    WHEN page_url ~ '/learners/' THEN 'learners'
    WHEN page_url ~ '/learn/' THEN 'learn'
    WHEN page_url ~ '/moments/' THEN 'moments'
    WHEN page_url ~ '/my-bug-reports/' THEN 'my-bug-reports'
    WHEN page_url ~ '/notifications/' THEN 'notifications'
    WHEN page_url ~ '/okr/' THEN 'okr'
    WHEN page_url ~ '/online-meetings/' THEN 'online-meetings'
    WHEN page_url ~ '/organizations?/' THEN 'organizations'
    WHEN page_url ~ '/profile/' THEN 'profile'
    WHEN page_url ~ '/resource-management/' THEN 'resource-management'
    WHEN page_url ~ '/service-requests/' THEN 'service-requests'
    WHEN page_url ~ '/settings/' THEN 'settings'
    WHEN page_url ~ '/solutions/' THEN 'solutions'
    WHEN page_url ~ '/staff/' THEN 'staff'
    WHEN page_url ~ '/startup-studio/' THEN 'startup-studio'
    WHEN page_url ~ '/system/' THEN 'system'
    WHEN page_url ~ '/users/' THEN 'users'
    WHEN page_url ~ '/vac/' THEN 'vac'
    WHEN page_url ~ '/work-pulse/' THEN 'work-pulse'
    -- the seven modules the classifier never learned (checker baseline 2026-09-06), appended AFTER every
    -- existing branch so first-match order for the old ones is unchanged; /bos/courses/ files under bos
    WHEN page_url ~ '/ai-pulse/' THEN 'ai-pulse'
    WHEN page_url ~ '/bos/' THEN 'bos'
    WHEN page_url ~ '/ims/' THEN 'ims'
    WHEN page_url ~ '/meetings/' THEN 'meetings'
    WHEN page_url ~ '/procurement/' THEN 'procurement'
    WHEN page_url ~ '/projects/' THEN 'projects'
    WHEN page_url ~ '/courses/' THEN 'courses'                     -- last: /organizations/courses/ stays organizations
    ELSE 'other'
  END
) STORED;

ALTER TABLE public.bug_reports ADD COLUMN sub_module_name VARCHAR(100) GENERATED ALWAYS AS (
  CASE
    WHEN page_url IS NULL THEN NULL
    WHEN page_url ~ '/academic/' THEN substring(page_url FROM '/academic/([^/?#]+)')
    WHEN page_url ~ '/admission/' THEN substring(page_url FROM '/admission/([^/?#]+)')
    WHEN page_url ~ '/admin/' THEN substring(page_url FROM '/admin/([^/?#]+)')
    WHEN page_url ~ '/ai-query/' THEN substring(page_url FROM '/ai-query/([^/?#]+)')
    WHEN page_url ~ '/application-hub/' THEN substring(page_url FROM '/application-hub/([^/?#]+)')
    WHEN page_url ~ '/applications/' THEN substring(page_url FROM '/applications/([^/?#]+)')
    WHEN page_url ~ '/audit-trail/' THEN substring(page_url FROM '/audit-trail/([^/?#]+)')
    WHEN page_url ~ '/audit/' THEN substring(page_url FROM '/audit/([^/?#]+)')
    WHEN page_url ~ '/accreditation/' THEN substring(page_url FROM '/accreditation/([^/?#]+)')
    WHEN page_url ~ '/billing/' THEN substring(page_url FROM '/billing/([^/?#]+)')
    WHEN page_url ~ '/bug-leaderboard/' THEN substring(page_url FROM '/bug-leaderboard/([^/?#]+)')
    WHEN page_url ~ '/campus-living/' THEN substring(page_url FROM '/campus-living/([^/?#]+)')
    WHEN page_url ~ '/dashboard/' THEN substring(page_url FROM '/dashboard/([^/?#]+)')
    WHEN page_url ~ '/events/' THEN substring(page_url FROM '/events/([^/?#]+)')
    WHEN page_url ~ '/faculty/' THEN substring(page_url FROM '/faculty/([^/?#]+)')
    WHEN page_url ~ '/health/' THEN substring(page_url FROM '/health/([^/?#]+)')
    WHEN page_url ~ '/hr/' THEN substring(page_url FROM '/hr/([^/?#]+)')
    WHEN page_url ~ '/learners-council/' THEN substring(page_url FROM '/learners-council/([^/?#]+)')
    WHEN page_url ~ '/learners/' THEN substring(page_url FROM '/learners/([^/?#]+)')
    WHEN page_url ~ '/learn/' THEN substring(page_url FROM '/learn/([^/?#]+)')
    WHEN page_url ~ '/moments/' THEN substring(page_url FROM '/moments/([^/?#]+)')
    WHEN page_url ~ '/my-bug-reports/' THEN substring(page_url FROM '/my-bug-reports/([^/?#]+)')
    WHEN page_url ~ '/notifications/' THEN substring(page_url FROM '/notifications/([^/?#]+)')
    WHEN page_url ~ '/okr/' THEN substring(page_url FROM '/okr/([^/?#]+)')
    WHEN page_url ~ '/online-meetings/' THEN substring(page_url FROM '/online-meetings/([^/?#]+)')
    WHEN page_url ~ '/organizations?/' THEN substring(page_url FROM '/organizations?/([^/?#]+)')
    WHEN page_url ~ '/profile/' THEN substring(page_url FROM '/profile/([^/?#]+)')
    WHEN page_url ~ '/resource-management/' THEN substring(page_url FROM '/resource-management/([^/?#]+)')
    WHEN page_url ~ '/service-requests/' THEN substring(page_url FROM '/service-requests/([^/?#]+)')
    WHEN page_url ~ '/settings/' THEN substring(page_url FROM '/settings/([^/?#]+)')
    WHEN page_url ~ '/solutions/' THEN substring(page_url FROM '/solutions/([^/?#]+)')
    WHEN page_url ~ '/staff/' THEN substring(page_url FROM '/staff/([^/?#]+)')
    WHEN page_url ~ '/startup-studio/' THEN substring(page_url FROM '/startup-studio/([^/?#]+)')
    WHEN page_url ~ '/system/' THEN substring(page_url FROM '/system/([^/?#]+)')
    WHEN page_url ~ '/users/' THEN substring(page_url FROM '/users/([^/?#]+)')
    WHEN page_url ~ '/vac/' THEN substring(page_url FROM '/vac/([^/?#]+)')
    WHEN page_url ~ '/work-pulse/' THEN substring(page_url FROM '/work-pulse/([^/?#]+)')
    WHEN page_url ~ '/ai-pulse/' THEN substring(page_url FROM '/ai-pulse/([^/?#]+)')
    WHEN page_url ~ '/bos/' THEN substring(page_url FROM '/bos/([^/?#]+)')
    WHEN page_url ~ '/ims/' THEN substring(page_url FROM '/ims/([^/?#]+)')
    WHEN page_url ~ '/meetings/' THEN substring(page_url FROM '/meetings/([^/?#]+)')
    WHEN page_url ~ '/procurement/' THEN substring(page_url FROM '/procurement/([^/?#]+)')
    WHEN page_url ~ '/projects/' THEN substring(page_url FROM '/projects/([^/?#]+)')
    WHEN page_url ~ '/courses/' THEN substring(page_url FROM '/courses/([^/?#]+)')
    ELSE NULL
  END
) STORED;

-- Indexes were dropped implicitly with the columns.
CREATE INDEX IF NOT EXISTS idx_bug_reports_module_name ON public.bug_reports(module_name);
CREATE INDEX IF NOT EXISTS idx_bug_reports_sub_module_name ON public.bug_reports(module_name, sub_module_name);

-- The dependent view, verbatim from supabase/setup/05_views.sql.
-- security_invoker = true is NOT optional and NOT decorative: the DROP VIEW above
-- destroys the view's reloptions and its whole ACL, so a bare re-CREATE would
-- resurrect it as a SECURITY DEFINER-equivalent view owned by the superuser --
-- silently reverting migration 20251210_fix_security_and_performance_issues.sql
-- and serving every bug report (and the joined reporter's name/email) to anyone
-- who can read the view, bypassing bug_reports RLS entirely.
CREATE OR REPLACE VIEW public.bug_reports_with_details
WITH (security_invoker = true)
AS
SELECT
    br.id,
    br.created_at,
    br.reporter_user_id,
    br.page_url,
    br.description,
    br.category,
    br.screenshot_url,
    br.attachment_urls,
    br.console_logs,
    br.status,
    br.resolved_at,
    br.metadata,
    br.display_id,
    br.institution_id,
    br.department_id,
    p.full_name AS reporter_name,
    p.email AS reporter_email,
    p.role AS reporter_role,
    i.name AS institution_name,
    d.department_name,
    d.department_code,
    br.module_name,
    br.sub_module_name,
    -- Restored from migration 20260717061500_bug_reports_duplicate_machinery.sql.
    -- supabase/setup/05_views.sql had drifted and never received these three, so a
    -- recreation copied "verbatim" from that file silently DELETES the duplicate
    -- feature from /admin/bug-reports (list badge, detail page, mark-duplicate
    -- dialog) -- and silently, because the UI reads `duplicate_count ?? 0`.
    br.duplicate_of,
    canon.display_id AS duplicate_of_display_id,
    (SELECT count(*)::int FROM public.bug_reports dup WHERE dup.duplicate_of = br.id) AS duplicate_count
FROM public.bug_reports br
LEFT JOIN public.profiles p ON br.reporter_user_id = p.id
LEFT JOIN public.institutions i ON br.institution_id = i.id
LEFT JOIN public.departments d ON br.department_id = d.id
LEFT JOIN public.bug_reports canon ON br.duplicate_of = canon.id;

-- The DROP VIEW above also destroyed the view's grants. Supabase's
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon
-- re-grants the re-created view to anon, so the revoke must be explicit --
-- exactly the omission the "New tables lock anon" gate refused.
REVOKE ALL ON TABLE public.bug_reports_with_details FROM anon, PUBLIC;
GRANT  SELECT ON TABLE public.bug_reports_with_details TO authenticated;
GRANT  ALL    ON TABLE public.bug_reports_with_details TO service_role;

-- ---------------------------------------------------------------------------
-- Put the second view back, from the definition captured above. Same ACL
-- reasoning as its sibling and for the same reason: DROP VIEW destroyed this
-- view's grants too, and Supabase's ALTER DEFAULT PRIVILEGES re-grants a newly
-- created view to anon. 20260808190000 revoked anon on this exact view; without
-- these three lines this file would silently undo that.
DO $$
DECLARE
  v_def  text := current_setting('jkkn.repro_viewdef',  true);
  v_opts text := current_setting('jkkn.repro_viewopts', true);
BEGIN
  IF v_def IS NULL OR btrim(v_def) = '' THEN
    RAISE NOTICE 'no captured definition - view was absent before this file ran';
    RETURN;
  END IF;

  IF btrim(v_opts) = '' THEN
    EXECUTE format('CREATE VIEW public.bug_reports_ready_for_repro AS %s', v_def);
  ELSE
    EXECUTE format('CREATE VIEW public.bug_reports_ready_for_repro WITH (%s) AS %s', v_opts, v_def);
  END IF;

  EXECUTE 'REVOKE ALL ON TABLE public.bug_reports_ready_for_repro FROM anon, PUBLIC';
  EXECUTE 'GRANT  SELECT ON TABLE public.bug_reports_ready_for_repro TO authenticated';
  EXECUTE 'GRANT  ALL    ON TABLE public.bug_reports_ready_for_repro TO service_role';
END $$;

-- End-state assert: the new expression knows /courses/, the view is back, both indexes exist.
DO $$
DECLARE
  expr TEXT;
BEGIN
  SELECT pg_get_expr(d.adbin, d.adrelid) INTO expr
    FROM pg_attribute a
    JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE a.attrelid = 'public.bug_reports'::regclass AND a.attname = 'module_name';
  IF expr IS NULL OR expr NOT LIKE '%/courses/%' OR expr NOT LIKE '%/projects/%' OR expr NOT LIKE '%/ai-pulse/%' THEN
    RAISE EXCEPTION 'bug_reports.module_name expression does not classify /courses/';
  END IF;
  IF to_regclass('public.bug_reports_with_details') IS NULL THEN
    RAISE EXCEPTION 'bug_reports_with_details view was not re-created';
  END IF;
  -- Same three questions for the second dependent view. It is asserted only
  -- when a definition was actually captured: on an environment that never had
  -- the view there is nothing to restore and nothing to check.
  IF current_setting('jkkn.repro_viewdef', true) IS NOT NULL
     AND btrim(current_setting('jkkn.repro_viewdef', true)) <> '' THEN
    IF to_regclass('public.bug_reports_ready_for_repro') IS NULL THEN
      RAISE EXCEPTION 'bug_reports_ready_for_repro was dropped and not put back';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       AND has_table_privilege('anon', 'public.bug_reports_ready_for_repro', 'SELECT') THEN
      RAISE EXCEPTION 'anon can still SELECT bug_reports_ready_for_repro - this file just undid 20260808190000';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
       AND NOT has_table_privilege('authenticated', 'public.bug_reports_ready_for_repro', 'SELECT') THEN
      RAISE EXCEPTION 'authenticated lost SELECT on bug_reports_ready_for_repro';
    END IF;
  END IF;
  -- The view existing is not the same as the view being safe: assert the two
  -- properties the DROP destroyed, or this migration silently un-does 20251210.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'bug_reports_with_details'
       AND c.reloptions @> ARRAY['security_invoker=true']
  ) THEN
    RAISE EXCEPTION 'bug_reports_with_details lost WITH (security_invoker = true) - it would bypass bug_reports RLS';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND has_table_privilege('anon', 'public.bug_reports_with_details', 'SELECT') THEN
    RAISE EXCEPTION 'anon can still SELECT bug_reports_with_details';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
     AND NOT has_table_privilege('authenticated', 'public.bug_reports_with_details', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated lost SELECT on bug_reports_with_details - the admin bug page would 42501';
  END IF;
  -- The duplicate machinery must survive the recreation, or /admin/bug-reports
  -- loses it with no error anywhere.
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'bug_reports_with_details'
         AND column_name IN ('duplicate_of','duplicate_of_display_id','duplicate_count')) <> 3 THEN
    RAISE EXCEPTION 'bug_reports_with_details lost the duplicate columns (20260717061500)';
  END IF;
  IF to_regclass('public.idx_bug_reports_module_name') IS NULL
     OR to_regclass('public.idx_bug_reports_sub_module_name') IS NULL THEN
    RAISE EXCEPTION 'bug_reports module indexes were not re-created';
  END IF;
END $$;
