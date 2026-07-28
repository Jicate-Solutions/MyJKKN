-- ============================================================================
-- Accreditation — COE Pass-Percentage Mirror (Wave 3, NAAC 8.2.2)
-- File: 20260726053000_coe_result_naac_snapshots.sql | Date: 2026-07-26
-- Framework: NAAC Reforms 2024 — Binary Accreditation Framework.
--
-- WHAT THIS ADDS
--   The COE exam system (separate Supabase project, ref qtsuqhduiuagjjtlalbh)
--   holds the declared university-exam results (final_marks: 29,144 rows,
--   29,140 result_status='Published' on 2026-07-26) — but emitted NOTHING
--   into the MyJKKN accreditation evidence junction. This migration adds the
--   MyJKKN-side substrate for a nightly TypeScript mirror:
--
--   8.2.2 ("Pass percentage in university examinations (Affiliated colleges)"
--          — catalog row EXISTS + active on prod, verified 2026-07-26;
--          asserted below, NOT re-seeded):
--     pass percentage per MyJKKN institution per examination session,
--     aggregated from COE's final_marks_summary_view (per course × session;
--     COE PostgREST aggregates are disabled — PGRST123 — so the pre-built
--     summary view is the honest source). Sample computed live 2026-07-26:
--     CAS × APRIL-MAY-2025 → 4,536 published learner-course entries,
--     3,677 passed → 81.06%.
--
--   CROSS-DB MECHANISM — WHY THERE IS NO REFRESH FN HERE:
--     No Postgres fn in this project can reach into the COE project's
--     database. The computation lives in the Next.js cron route
--     app/api/cron/coe-result-naac-snapshots/route.ts (TypeScript), which
--     reads COE via lib/services/coe/coe-db-client (COE_SUPABASE_URL +
--     COE_SUPABASE_SERVICE_ROLE_KEY, server-only; route 503s fail-closed when
--     absent), computes per institution × session, writes coe_naac_evidence
--     rows with the MyJKKN service-role client, and fans out to
--     quality_evidence_mappings on the junction's natural key (source_table,
--     source_id, body_code, metric_code), is_auto=true. Manually-curated
--     (is_auto=false) mappings are never clobbered (route pre-excludes them —
--     PostgREST upserts carry no conditional ON CONFLICT). Identity bridge:
--     COE institutions.myjkkn_institution_ids[] (CAS fans out to 2 MyJKKN
--     institutions — Aided + Self; campus-level numbers recorded on each,
--     flagged in row metadata).
--
--   METRIC 5.7 (exam-calendar↔result-declaration day counts) is deliberately
--   ABSENT: final_marks.published_date is NULL on ALL 29,144 rows and
--   examination_sessions.result_declaration_date is a backfill artifact
--   (3 of 4 populated values stamped 2026-06-05 — one implies declaration
--   552 days after the exam). Not honestly computable → not computed.
--
-- MECHANISM (canonical evidence spine — NOT a parallel mechanism):
--   snapshot table row → quality_evidence_mappings upsert (route-side).
--   Registered in quality_evidence_source_registry (source_kind
--   'coe_result_snapshot' — verified non-colliding with live prod kinds and
--   tonight's sibling wave claims: institution_collaboration, ss_grant,
--   event, hr_snapshot, facility_teaching_snapshot, learner_exit_outcome,
--   learner_achievement, bos_meeting, cdc_drive, cdc_training,
--   procurement_po, audit_cycle). Scheduled via ai_routine_schedules row
--   'coe-result-naac-snapshots' (daily 04:51 IST, minute 291 — clear of the
--   live 263 slot and Wave 2B's 277), fired by the AI-routine dispatcher,
--   NOT a raw vercel.json cron.
--
-- SECURITY
--   No new RPC (nothing to REVOKE at fn level — the cross-DB compute cannot
--   live in SQL). Snapshot table: RLS enabled; SELECT mirrors
--   quality_evidence_mappings' qem_select (accreditation.evidence.view +
--   role_has_institution_access, admin bypass); INSERT / UPDATE / DELETE are
--   explicit admin-only policies (the nightly writer is the service-role
--   client, which bypasses RLS — an UPDATE policy still exists so any future
--   admin-UI edit is not a silent 0-row no-op). Belt-and-braces: direct table
--   grants REVOKEd from anon.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Assert the NAAC 8.2.2 catalog row exists (live on prod 2026-07-26:
--    "Pass percentage in university examinations (Affiliated colleges)").
--    Assert, don't seed — this migration must fail loudly if the catalog
--    drifted rather than silently minting a duplicate meaning.
-- ----------------------------------------------------------------------------
DO $assert_metric$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.sh_accreditation_metrics
    WHERE metric_type = 'NAAC' AND metric_code = '8.2.2' AND is_active
  ) THEN
    RAISE EXCEPTION 'sh_accreditation_metrics is missing an active NAAC/8.2.2 row — the COE pass-percentage mirror maps to it';
  END IF;
END $assert_metric$;

-- ----------------------------------------------------------------------------
-- 1. Snapshot table — one row per MyJKKN institution × metric × COE
--    examination session, refreshed nightly by the cron route.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coe_naac_evidence (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  metric_code    text NOT NULL CHECK (metric_code IN ('8.2.2')),
  session_code   text NOT NULL,
  ay_label       text,
  computed       jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at    timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coe_naac_evidence_natural_key
    UNIQUE (institution_id, metric_code, session_code)
);

COMMENT ON TABLE public.coe_naac_evidence IS
  'COE result mirror — NAAC evidence snapshots computed nightly from the COE exam project''s final_marks_summary_view (cross-DB, TypeScript cron app/api/cron/coe-result-naac-snapshots). One row per MyJKKN institution × metric × COE examination session (8.2.2 = pass percentage in university examinations). Fans out to quality_evidence_mappings on the junction''s natural key; is_auto=false mappings never clobbered. Aggregate counts only — no learner identities (Wave 3, 2026-07-26).';

COMMENT ON COLUMN public.coe_naac_evidence.session_code IS
  'COE examination session code (e.g. APRIL-MAY-2025) — the natural period of a declared result set.';
COMMENT ON COLUMN public.coe_naac_evidence.ay_label IS
  'AY YYYY-YY (June cutoff) derived from the session''s exam window; NULL when no window is derivable — period_label then falls back to session_code.';

ALTER TABLE public.coe_naac_evidence ENABLE ROW LEVEL SECURITY;

-- Read: same shape as quality_evidence_mappings' qem_select (verified live).
DROP POLICY IF EXISTS "cne_select" ON public.coe_naac_evidence;
CREATE POLICY "cne_select" ON public.coe_naac_evidence FOR SELECT
USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.evidence.view')
      AND role_has_institution_access(institution_id))
);

-- Writes: admin-only, as EXPLICIT per-command policies (not FOR ALL) so the
-- UPDATE path is visibly covered — a SELECT+INSERT-only table makes every
-- admin UPDATE a silent 0-row no-op (#2380 lesson). The nightly writer is the
-- service-role cron client, which bypasses RLS entirely.
DROP POLICY IF EXISTS "cne_insert_admin" ON public.coe_naac_evidence;
CREATE POLICY "cne_insert_admin" ON public.coe_naac_evidence FOR INSERT
WITH CHECK (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS "cne_update_admin" ON public.coe_naac_evidence;
CREATE POLICY "cne_update_admin" ON public.coe_naac_evidence FOR UPDATE
USING (is_super_admin() OR is_admin())
WITH CHECK (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS "cne_delete_admin" ON public.coe_naac_evidence;
CREATE POLICY "cne_delete_admin" ON public.coe_naac_evidence FOR DELETE
USING (is_super_admin() OR is_admin());

-- Belt-and-braces: anon gets no direct table grant at all (RLS already denies
-- — no anon policy — but the default PostgREST grant is revoked too).
REVOKE ALL ON public.coe_naac_evidence FROM anon;

-- ----------------------------------------------------------------------------
-- 2. Registry row — canonical source-kind declaration (advisory registry).
--    source_kind 'coe_result_snapshot' verified non-colliding with live prod
--    kinds (2026-07-26) and tonight's sibling wave claims. WHERE NOT EXISTS
--    on the PK (platform 42P10 lesson — never ON CONFLICT an expression index).
-- ----------------------------------------------------------------------------
INSERT INTO public.quality_evidence_source_registry
  (source_kind, source_table, display_name, description, is_system)
SELECT
  'coe_result_snapshot', 'coe_naac_evidence',
  'COE Result Mirror (Pass Percentage)',
  'Nightly per-institution per-examination-session snapshots mirrored from the COE exam system: pass percentage in university examinations (NAAC 8.2.2), aggregated from COE''s final_marks_summary_view.',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.quality_evidence_source_registry
  WHERE source_kind = 'coe_result_snapshot'
);

-- ----------------------------------------------------------------------------
-- 3. Dispatcher schedule seed — daily at 04:51 IST (minute_of_day 291; the
--    live 04:23/263 slot is accreditation-loop-evidence, Wave 2B claimed
--    04:37/277). Fired by the AI-routine dispatcher; day/time editable in
--    /admin/ai-routines.
-- ----------------------------------------------------------------------------
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES ('coe-result-naac-snapshots', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 291)
ON CONFLICT (routine_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. Assert the mappings ON CONFLICT arbiter at APPLY time (same guard as
--    20260709023000 / 20260726031500) — fail loudly here rather than silently
--    every night in the route.
-- ----------------------------------------------------------------------------
DO $assert$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.quality_evidence_mappings'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%source_table, source_id, body_code, metric_code%'
  ) THEN
    RAISE EXCEPTION 'quality_evidence_mappings is missing UNIQUE (source_table, source_id, body_code, metric_code) — the snapshot fan-out depends on it';
  END IF;
END $assert$;

-- Reload PostgREST's schema cache so the new table resolves immediately after
-- a raw Management-API apply (which does NOT auto-reload) — the cron route
-- writes to it through PostgREST.
NOTIFY pgrst, 'reload schema';
