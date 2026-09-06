-- Migration: Exam IA Audit — dated verdict snapshot + EXAM_IA_AUDIT catalog parameter
-- Date: 2026-07-14
-- Why: The Exam Internal-Assessment audit verdicts live only in memory —
--      lib/services/exam-audit/compute.ts is pure and persists nothing, so the
--      self-improving audit has no dated verdict it can cite. This is exactly the
--      gap LOOP_HEALTH already solved for loops (loop_audits → audit_parameter_catalog).
--      Mirror that pattern for exam IA:
--        1. a small append-only snapshot table the weekly cron writes to, and
--        2. an EXAM_IA_AUDIT system parameter whose discovery query cites the snapshot.
--
-- Applied to prod via the Supabase Management API (show-SQL-first). Additive only.

-- 1. Snapshot table --------------------------------------------------------------------
-- Written weekly by /api/cron/exam-audit-alerts (service-role). Append-only; the
-- discovery query takes the latest verdict per program inside the cycle window, so
-- duplicate weekly rows are harmless (same shape loop_audits uses).
CREATE TABLE IF NOT EXISTS public.exam_ia_audit_verdicts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id      uuid,            -- MyJKKN institution id (nullable: unmapped COE college)
  institution_code    text,
  institution_name    text,
  session_code        text NOT NULL,
  program_code        text NOT NULL,
  program_name        text,
  verdict             text NOT NULL,   -- ExamAuditVerdict (compute.ts): missing | operator_bulk | ...
  rubric_verdict      text NOT NULL,   -- ExamAuditRubricVerdict (compute.ts): no_rubric | partial | ...
  registered_students integer,
  cia_rows            integer,
  faculty_entered_pct numeric,
  flagged             boolean NOT NULL DEFAULT false,  -- did the cron's flagOf() flag it this run
  problem             text,            -- flagOf() problem string when flagged, else null
  computed_at         timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.exam_ia_audit_verdicts IS
  'Dated snapshots of Exam Internal-Assessment audit verdicts, written weekly by /api/cron/exam-audit-alerts. Cited by the EXAM_IA_AUDIT audit_parameter_catalog parameter (LOOP_HEALTH pattern). Append-only; latest-in-cycle-window wins.';

CREATE INDEX IF NOT EXISTS idx_exam_ia_audit_verdicts_window
  ON public.exam_ia_audit_verdicts (computed_at);
CREATE INDEX IF NOT EXISTS idx_exam_ia_audit_verdicts_program
  ON public.exam_ia_audit_verdicts (institution_code, session_code, program_code, computed_at DESC);

-- RLS: the cron writes via service_role (bypasses RLS) and the discovery runner
-- (audit_execute_discovery_query) is SECURITY DEFINER (bypasses RLS). This policy
-- only governs any direct authenticated read. anon gets nothing.
ALTER TABLE public.exam_ia_audit_verdicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_ia_audit_verdicts_select ON public.exam_ia_audit_verdicts;
CREATE POLICY exam_ia_audit_verdicts_select ON public.exam_ia_audit_verdicts
  FOR SELECT USING (
    is_super_admin() OR is_admin() OR user_has_permission('audit.parameter.view')
  );

REVOKE ALL    ON public.exam_ia_audit_verdicts FROM anon, PUBLIC;
GRANT  SELECT ON public.exam_ia_audit_verdicts TO authenticated;

-- 2. EXAM_IA_AUDIT parameter -----------------------------------------------------------
-- Mirrors LOOP_HEALTH (id 8ed84250). The discovery query is bound with
-- $1=institution_id, $2=cycle_start, $3=cycle_end by audit_execute_discovery_query;
-- like LOOP_HEALTH it windows on $2/$3 and (deliberately) shows every college's
-- flagged programs so the Lead Auditor — who audits all colleges — sees them at once.
-- Idempotent seed: guarded by NOT EXISTS on the (code, system) identity.
INSERT INTO public.audit_parameter_catalog
  (code, name, parameter_group, description, framework_mapping,
   discovery_query_sql, default_owner_role, p1_sla_days, p2_sla_days,
   evidence_required, institution_id, is_system, is_active)
SELECT
  'EXAM_IA_AUDIT',
  'Internal-assessment integrity — verdict on record',
  1,
  'Cites exam_ia_audit_verdicts: each program with an upcoming exam should carry a fresh internal-assessment verdict this cycle. Operator bulk-entry, missing CIA, or an unfollowed rubric is an evaluation-integrity gap (NAAC 2.5 / IQAC). Runs automatically from the weekly exam-audit watchdog.',
  '{"NAAC": "2.5", "IQAC": "internal_assessment"}'::jsonb,
  'SELECT institution_code,
       session_code,
       program_code,
       program_name,
       (array_agg(verdict ORDER BY computed_at DESC))[1]        AS latest_verdict,
       (array_agg(rubric_verdict ORDER BY computed_at DESC))[1] AS latest_rubric_verdict,
       bool_or(flagged)                                         AS flagged_in_window,
       max(computed_at)::date                                   AS last_computed,
       count(*)                                                 AS snapshots
FROM exam_ia_audit_verdicts
WHERE computed_at::date BETWEEN $2 AND $3
GROUP BY institution_code, session_code, program_code, program_name
ORDER BY flagged_in_window DESC, institution_code, session_code, program_code',
  'lead_auditor',
  14, 30,
  '[]'::jsonb,
  NULL, true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.audit_parameter_catalog
   WHERE code = 'EXAM_IA_AUDIT' AND institution_id IS NULL
);
