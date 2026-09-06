-- Migration: 2026-06-09 06:40 IST
-- Title:   fix(security/platform): Phase 2 anon lockdown — RLS-off tables + ai_rpc_* functions
-- Status:  APPLIED-LIVE 2026-06-09 via Management API (this file documents prod grant-state
--          so it is not undocumented drift, and reproduces it on a fresh staging rebuild).
--
-- Purpose:
--   Follow-up to PR #1225 (11 YoY RPCs) and PR #1230 / migration
--   20260605191101 (155 platform RPCs). The 2026-06-09 live re-verification of the
--   2026-06-07 three-layer security sweep found the anon attack surface was BOTH
--   still live AND larger than the 2026-06-07 snapshot recorded:
--
--   C1/H4 — 70 RLS-DISABLED public tables had a direct `anon` grant (full
--           SELECT/INSERT/UPDATE/DELETE). PROVEN exposed: `anon` HTTP read of
--           `students_backup_20251223` returned HTTP 200 + a real student row.
--           These split into:
--             * ~20 real backup / operational tables (dated PII backups,
--               intake_history, wa_settings, pde_attempt_grants, event_* …)
--             * ~50 `_`-prefixed scratch/diagnostic tables left behind by prior
--               migration & lockdown sessions (several contain copies of real data).
--   C2  — 50 `ai_rpc_*` SECURITY DEFINER functions were still anon-EXECUTABLE
--           (drifted up from 36 at the 2026-06-07 sweep). The `ai_rpc_*` family
--           trusts a caller-supplied `p_user_id` and bypasses RLS, so an
--           unauthenticated client holding the public anon key could impersonate.
--
-- Root cause (recap from PR #1225 / migration 20260605191101):
--   Supabase's default schema setup includes
--     ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ... TO anon
--   which grants `anon` directly on every new table AND function — separate from
--   PUBLIC. The standard `REVOKE ALL FROM PUBLIC` does NOT undo the direct `anon`
--   grant; an explicit `REVOKE ... FROM anon` is required.
--
-- Method:
--   Dynamic (catalog-driven) revokes rather than a hardcoded name list, because the
--   2026-06-07 static list (20 tables / 36 fns) was already stale by 2026-06-09
--   (70 tables / 50 fns). Catalog-driven = complete today and idempotent on rerun.
--
--   H-followup — Revoking anon does NOT secure an RLS-disabled table on its own:
--           Supabase grants `authenticated` by default too, so with RLS off any
--           logged-in user (incl. a student) could still read these tables. FIX 1b
--           closes that on the redundant-PII tables (backups + `_`-scratch only).
--
-- Scope guard:
--   FIX 1 targets ONLY RLS-DISABLED tables. RLS-protected tables that legitimately
--   serve anon (e.g. admission-landing public reads) are unaffected — their RLS
--   policies remain the access control, and their grants are untouched.
--   FIX 1b is further narrowed to backup/scratch tables (name LIKE '_%' OR ILIKE
--   '%backup%' OR ILIKE '%deleted_guests%') — NO application code reads these — so
--   revoking `authenticated` cannot break a feature. Real operational RLS-off
--   tables (intake_history, wa_settings, wa_quick_replies, api_key_usage_logs,
--   data_quality_review, pde_attempt_grants, learner_application_sequences_by_code,
--   event_*) are intentionally LEFT for a careful enable-RLS-+-policy pass.
--
-- NOT in this migration (separate decisions, intentionally deferred):
--   (a) DROP of the ~50 `_`-prefixed scratch tables + dated PII backups
--       (destructive / irreversible — awaiting explicit Director sign-off).
--   (b) The ~380 non-`ai_rpc` SECURITY DEFINER functions still anon-executable —
--       some are intentionally public (admission-landing community/caste reads,
--       fn_get_policy* config lookups). Needs a per-function review pass, not a
--       blanket revoke.
--   (c) `users.manage` grant to HR roles (was proposed in the sweep): SKIPPED —
--       `users.manage` is a phantom key (absent from lib/constants/permissions.ts,
--       referenced by no guard, granted to no role). Granting it would be a no-op.

-- ──────────────────────────────────────────────────────────────────────────────
-- FIX 1 (C1/H4): revoke ALL anon privileges on every RLS-DISABLED public table.
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r   record;
  cnt int := 0;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = false
      AND (
        has_table_privilege('anon', c.oid, 'SELECT')
        OR has_table_privilege('anon', c.oid, 'INSERT')
        OR has_table_privilege('anon', c.oid, 'UPDATE')
        OR has_table_privilege('anon', c.oid, 'DELETE')
      )
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', r.relname);
    cnt := cnt + 1;
  END LOOP;
  RAISE NOTICE 'Phase 2 lockdown: revoked anon on % RLS-off table(s)', cnt;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- FIX 1b (H-followup): revoke authenticated/anon/PUBLIC on backup + scratch tables.
--   These are RLS-off redundant-PII copies that no app code reads; lock to
--   service_role + owner only. 56 tables (7 dated PII backups + 49 `_`-scratch).
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r   record;
  cnt int := 0;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = false
      AND (c.relname LIKE '\_%' OR c.relname ILIKE '%backup%' OR c.relname ILIKE '%deleted_guests%')
      AND (
        has_table_privilege('authenticated', c.oid, 'SELECT')
        OR has_table_privilege('anon', c.oid, 'SELECT')
      )
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated, anon, PUBLIC', r.relname);
    cnt := cnt + 1;
  END LOOP;
  RAISE NOTICE 'Phase 2 lockdown: revoked authenticated/anon on % backup-scratch table(s)', cnt;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- FIX 2 (C2): revoke anon (and PUBLIC) EXECUTE on every ai_rpc_* function.
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r   record;
  cnt int := 0;
BEGIN
  FOR r IN
    SELECT 'public.' || quote_ident(p.proname)
           || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'ai_rpc_%'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || r.sig || ' FROM anon, PUBLIC';
    cnt := cnt + 1;
  END LOOP;
  RAISE NOTICE 'Phase 2 lockdown: revoked anon EXECUTE on % ai_rpc_* function(s)', cnt;
END $$;
