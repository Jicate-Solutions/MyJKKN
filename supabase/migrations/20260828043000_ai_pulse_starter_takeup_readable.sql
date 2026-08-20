-- ============================================================================
-- AI Pulse — make starter take-up readable, and make "what counts as a session"
--            a config row instead of a constant in code
-- Created: 2026-08-13
-- ============================================================================
-- ✅ APPLIED TO PRODUCTION 2026-08-13, on the Director's explicit instruction,
--    and recorded in supabase_migrations.schema_migrations. Rehearsed first in
--    BEGIN … ROLLBACK (this file declares no BEGIN/COMMIT, so the rehearsal
--    genuinely rolled back) with a residue check issued as a SEPARATE call.
--
--    VERIFIED BEHAVIOURALLY under RLS, not by object inspection:
--      • Champion (krishnaveni_a@jkkn.ac.in) reads 298 starter rows — was 0.
--      • A plain learner reads 0 — the policy does not over-grant.
--      • anon is refused with `permission denied for table`, i.e. stopped at the
--        privilege level before RLS is even consulted.
--
--    NOTE FOR WHOEVER READS THIS NEXT: anon held INSERT/SELECT/UPDATE/DELETE/
--    TRUNCATE here via Supabase's default grant. TRUNCATE is NOT subject to RLS,
--    so "RLS with no policy" did not mask it — anon could have truncated this
--    table. The REVOKE below closed that. 1,154 of 1,558 public tables still
--    carry the same anon TRUNCATE grant; that is a separate, open finding.
--
-- WHY (1 of 2) — the parent of an already-fixed table is still deny-all
--   `ai_pulse_domain_starters` shipped (20260719110000) with
--   `ENABLE ROW LEVEL SECURITY` and ZERO policies. In PostgreSQL that is
--   deny-all: with no policy to evaluate, every row is withheld from every role
--   without BYPASSRLS — including super admins, because `is_super_admin()` only
--   ever runs *inside* a policy and there is no policy for it to run in.
--
--   Its CHILD table `ai_pulse_domain_starter_events` had exactly this defect and
--   it was fixed on 2026-07-31 (20260731180000) after production impersonation
--   showed a super admin reading 0 starters for a learner who had 2. The PARENT
--   was not fixed in that pass. That leaves the fix incomplete in a way that
--   matters: `cycle_id` lives on the parent, so without it there is no
--   starter → cycle link at all, and per-cycle take-up cannot be computed even
--   by a caller the child policy already admits.
--
--   The read does not fail loudly. PostgREST returns an empty set with a count
--   of 0 and NO error, so a caller that trusts the count prints a hard "0" —
--   "nobody used the starter prompt" when the truth is "you were not allowed to
--   look". The new Champion Console trend page
--   (app/(routes)/ai-pulse/admin/trends) refuses to print that zero: until this
--   migration is applied it renders "not captured" and names this policy gap as
--   the reason. Applying this file is what turns that section on. The reading
--   code needs no change — rows simply start arriving.
--
-- WHAT (1 of 2)
--   Adds the SELECT policy this table should have shipped with, mirroring the
--   sibling policy on the child table clause for clause, and closes the `anon`
--   default grant.
--
--   NO LEARNER CLAUSE, deliberately. The child policy carries
--   `profile_id = auth.uid()` so a learner can read their own trail; this table
--   has no profile_id — its columns are the generated prompt and its rolled-up
--   counters, which are aggregate content, never one learner's text. Learners
--   reach their own starter through `fn_ai_pulse_my_domain_starters`, a SECURITY
--   DEFINER function that does not consult this policy and is unaffected here.
--   Do not invent a profile_id column to "match" the sibling.
--
--   NO institution_id ON THIS TABLE — there IS an `institution_id` column, but
--   it is nullable and unbackfilled, so a `role_has_institution_access(...)`
--   clause would silently withhold every row whose column is NULL. Scoping it
--   needs a backfill plus writer changes and is deliberately out of scope for
--   this read fix; it is called out here for follow-up rather than half-done.
--   This matches the asymmetry already recorded on the child table.
--
--   WRITES ARE UNAFFECTED. Rows are inserted and updated by SECURITY DEFINER
--   functions (`fn_ai_pulse_record_domain_starter`,
--   `fn_ai_pulse_measure_domain_starters`), not by an authenticated client, so a
--   SELECT-only policy cannot disturb generation or measurement.
--
--   Every guard is COALESCE-wrapped: these are SECURITY DEFINER helpers that can
--   return NULL, and NULL in a USING clause is not TRUE, so an un-wrapped guard
--   silently falls through instead of granting.
--
-- WHY (2 of 2) — one judgement call, made visible
--   The trend page must decide which cycles count as sessions. Two production
--   cycles (2026-07-02 and 2026-06-25) have exactly ONE attendee, where every
--   rate is forced to 0% or 100% and would swing a trend line that otherwise
--   moves in single-digit points. Per the standing rule that every policy
--   decision is a config row rather than a constant, the bar is seeded here so
--   the Champion can tune it at /ai-pulse/admin/policies without a deploy. The
--   page falls back to 2 when the row is absent, so it behaves correctly before
--   this file is applied — the row makes the judgement auditable, not possible.
--
-- NO FUNCTION IS CREATED OR REPLACED by this file, so there is no SECURITY
-- DEFINER body whose grants need re-asserting. The table-level `REVOKE … FROM
-- anon` below is the analogous discipline and mirrors the sibling migration.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. The missing SELECT policy on the parent table
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "ai_pulse_domain_starters_select"
  ON public.ai_pulse_domain_starters;

CREATE POLICY "ai_pulse_domain_starters_select"
ON public.ai_pulse_domain_starters
FOR SELECT
TO authenticated
USING (
  COALESCE(is_super_admin(), false)
  OR COALESCE(is_admin(), false)
  -- Staff carrying department-level AI Pulse oversight — the same two keys the
  -- child events policy admits, so parent and child are readable together or
  -- not at all. `aiPulse:anomaly.review` is the designated-champion key and the
  -- one the Champion Console trend page is gated on.
  OR COALESCE(user_has_permission('aiPulse:dept.heatmap'), false)
  OR COALESCE(user_has_permission('aiPulse:anomaly.review'), false)
);

-- Supabase's `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon` left
-- anon holding SELECT/INSERT/UPDATE/DELETE/TRUNCATE on this table. Until now
-- RLS-with-no-policy masked that; the moment a SELECT policy exists the grant is
-- one mis-scoped policy away from being live. Revoke it explicitly.
REVOKE ALL ON public.ai_pulse_domain_starters FROM anon;


-- ---------------------------------------------------------------------------
-- 2. The session bar, as a config row
-- ---------------------------------------------------------------------------

INSERT INTO public.ai_pulse_policies
  (config_key, display_name, description, value_jsonb, data_type, min_value)
VALUES
  ('trend_min_session_attendees',
   'AI Pulse: attendees before a cycle counts as a session',
   'Least attendees a cycle needs before the Champion Console trend page treats '
   || 'it as a real session. Cycles below the bar are still listed, clearly '
   || 'marked, and named in a note — they are left out of the week-over-week '
   || 'comparisons and the summary only, never silently dropped. Two cycles '
   || '(2026-07-02 and 2026-06-25) have exactly one attendee, where every rate '
   || 'is forced to 0% or 100%. The page falls back to 2 if this row is missing.',
   '2'::jsonb, 'int', 1)
ON CONFLICT (config_key) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 3. Assert the intended end state (fails loudly rather than reporting success)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'ai_pulse_domain_starters'
      AND policyname = 'ai_pulse_domain_starters_select'
  ) THEN
    RAISE EXCEPTION 'ai_pulse_domain_starters_select policy is MISSING after this migration';
  END IF;

  IF has_table_privilege('anon', 'public.ai_pulse_domain_starters', 'SELECT') THEN
    RAISE EXCEPTION 'anon STILL has SELECT on ai_pulse_domain_starters';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ai_pulse_policies
    WHERE config_key = 'trend_min_session_attendees'
  ) THEN
    RAISE EXCEPTION 'trend_min_session_attendees policy row is MISSING after this migration';
  END IF;
END
$$;
