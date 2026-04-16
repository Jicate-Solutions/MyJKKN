-- ============================================================================
-- ADMISSION MODULE: admission_process_metrics TABLE
-- Created: 2026-04-16
-- Purpose: Materialized storage for TQM process metrics queried by
--          AdmissionTQMMetricsService. Replaces the view defined in
--          005_triggers_and_views.sql with a concrete table so that
--          RLS can be applied directly and PostgREST .from() works
--          with typed access.
--
-- The companion view in 005 can be kept as a compute source; a scheduled
-- job or trigger should periodically INSERT/UPSERT rows into this table
-- from the view query.
-- ============================================================================

-- 1. Create the table
CREATE TABLE IF NOT EXISTS admission_process_metrics (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id            uuid NOT NULL REFERENCES institutions(id),
  month                     date NOT NULL,
  total_leads               integer NOT NULL DEFAULT 0,
  enrolled_count            integer NOT NULL DEFAULT 0,
  avg_cycle_time_hours      numeric,
  avg_first_response_hours  numeric,
  first_contact_sla_pct     numeric,
  lost_rate_pct             numeric,
  conversion_rate_pct       numeric,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE admission_process_metrics IS
  'Monthly TQM process metrics per institution, consumed by the Process Excellence dashboard widget.';

-- 2. Enable RLS
ALTER TABLE admission_process_metrics ENABLE ROW LEVEL SECURITY;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_process_metrics_institution
  ON admission_process_metrics (institution_id);

CREATE INDEX IF NOT EXISTS idx_process_metrics_month
  ON admission_process_metrics (month DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_process_metrics_institution_month
  ON admission_process_metrics (institution_id, month);

-- 4. Updated_at trigger
CREATE TRIGGER trg_process_metrics_updated
  BEFORE UPDATE ON admission_process_metrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. RLS Policies (standard admission pattern from 004_rls_policies.sql)

-- SELECT
CREATE POLICY "process_metrics_select" ON admission_process_metrics FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);

-- INSERT
CREATE POLICY "process_metrics_insert" ON admission_process_metrics FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);

-- UPDATE
CREATE POLICY "process_metrics_update" ON admission_process_metrics FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);

-- DELETE
CREATE POLICY "process_metrics_delete" ON admission_process_metrics FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
