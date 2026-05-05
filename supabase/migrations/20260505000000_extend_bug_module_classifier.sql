-- =====================================================
-- Migration: extend bug_reports module_name + sub_module_name CASE
--            to cover all 34 modules from lib/navigation/modules.ts
-- Date: 2026-05-05
-- Why:  Existing CASE only knew 11 module slugs. As MyJKKN added new
--       top-level routes (campus-living, service-requests, faculty,
--       audit, accreditation, etc.), bugs from those URLs silently
--       fell through to module_name='other' — 1,201 historical bugs
--       in production with 4+ misclassified in screenshot 2026-05-05.
--       Drift now caught by scripts/check-bug-module-classifier.mjs.
--
-- Effect: GENERATED STORED columns are recomputed on table rewrite.
--         DROP + ADD pattern below recomputes module_name AND
--         sub_module_name for ALL 1,201 existing rows automatically —
--         no separate backfill UPDATE needed.
--
-- Source of truth: supabase/setup/01_tables.sql (the CASE here MUST
--                  match that file's CASE; check-bug-module-classifier.mjs
--                  enforces the parity in CI).
-- =====================================================

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
    WHEN page_url ~ '/my-bug-reports/' THEN 'my-bug-reports'
    WHEN page_url ~ '/notifications/' THEN 'notifications'
    WHEN page_url ~ '/okr/' THEN 'okr'
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
    WHEN page_url ~ '/my-bug-reports/' THEN substring(page_url FROM '/my-bug-reports/([^/?#]+)')
    WHEN page_url ~ '/notifications/' THEN substring(page_url FROM '/notifications/([^/?#]+)')
    WHEN page_url ~ '/okr/' THEN substring(page_url FROM '/okr/([^/?#]+)')
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
    ELSE NULL
  END
) STORED;

-- Recreate indexes (DROP COLUMN dropped them implicitly).
CREATE INDEX IF NOT EXISTS idx_bug_reports_module_name ON public.bug_reports(module_name);
CREATE INDEX IF NOT EXISTS idx_bug_reports_sub_module_name ON public.bug_reports(module_name, sub_module_name);
