-- ============================================================================
-- Rename lifecycle_status enum value: 'enquiry' → 'admitted'
-- ============================================================================
-- Date:   2026-04-22
-- Scope:  Status-value rename only (Scope 1). URLs, page titles, permission
--         keys, API routes, sidebar entries all stay as "enquiries" — only
--         the underlying lifecycle_status enum value is renamed.
--
-- Effect: All 133 rows currently in 'enquiry' status are now 'admitted'.
--         The rename is metadata-only (instant, no row writes).
--         Column default updated to match.
--         4 AI RPC functions had 'enquiry' literal substituted to 'admitted'.
-- ============================================================================

-- 1. Rename the enum label (in-place, atomic).
ALTER TYPE public.lifecycle_status RENAME VALUE 'enquiry' TO 'admitted';

-- 2. Reset the column default to the new label.
ALTER TABLE public.learners_profiles
  ALTER COLUMN lifecycle_status SET DEFAULT 'admitted'::lifecycle_status;

-- 3. Update the 4 AI RPC functions whose bodies hardcoded the old label.
--    DO block fetches each function's full definition (with parameter
--    defaults preserved), substitutes the literal, and re-executes.
DO $$
DECLARE
  fn TEXT;
BEGIN
  FOR fn IN
    SELECT pg_get_functiondef(p.oid)
    FROM pg_proc p
    WHERE p.proname IN (
            'ai_rpc_admission_statistics',
            'ai_rpc_admissions',
            'ai_rpc_admissions_by_location',
            'ai_rpc_kpi_summary'
          )
      AND p.pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE REPLACE(fn, '''enquiry''', '''admitted''');
  END LOOP;
END $$;
