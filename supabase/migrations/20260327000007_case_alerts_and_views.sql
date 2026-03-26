-- 20260327000007_case_alerts_and_views.sql
-- Alert log + risk calculator view

CREATE TABLE IF NOT EXISTS case_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'welcome', 'track_available', 'behind_schedule',
    '90_day', '60_day', '30_day', '25_day_hard', 'completed'
  )),
  message TEXT NOT NULL,
  sent_via TEXT[] DEFAULT ARRAY['push'],
  sent_at TIMESTAMPTZ DEFAULT now(),
  read_at TIMESTAMPTZ,
  coordinator_id UUID
);

ALTER TABLE case_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_alerts_own" ON case_alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "case_alerts_admin" ON case_alerts FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('administrator', 'super_admin'))
);

-- Risk calculator view
CREATE OR REPLACE VIEW case_risk_calculator AS
SELECT
  clp.user_id,
  clp.programme_id,
  clp.institution_id,
  clp.current_semester,
  clp.tracks_completed,
  clp.graduation_ready,
  clp.estimated_exam_date,
  cgr.programme_duration_semesters,
  cgr.programme_duration_semesters - clp.current_semester AS semesters_remaining,
  6 - clp.tracks_completed AS tracks_remaining,
  CEIL((6 - clp.tracks_completed)::NUMERIC / GREATEST(cgr.programme_duration_semesters - clp.current_semester, 1)) AS tracks_per_semester_needed,
  clp.estimated_exam_date - CURRENT_DATE AS days_to_exam,
  CASE
    WHEN clp.tracks_completed >= 6 THEN 'completed'
    WHEN clp.estimated_exam_date IS NOT NULL
      AND clp.estimated_exam_date - CURRENT_DATE <= 25
      AND clp.tracks_completed < 6 THEN 'overdue'
    WHEN CEIL((6 - clp.tracks_completed)::NUMERIC / GREATEST(cgr.programme_duration_semesters - clp.current_semester, 1)) > 3 THEN 'critical'
    WHEN CEIL((6 - clp.tracks_completed)::NUMERIC / GREATEST(cgr.programme_duration_semesters - clp.current_semester, 1)) > 1 THEN 'at_risk'
    ELSE 'on_track'
  END AS calculated_risk_level
FROM case_learner_progress clp
JOIN case_graduation_requirements cgr
  ON clp.programme_id = cgr.programme_id
  AND clp.institution_id = cgr.institution_id
WHERE cgr.is_active = true;

-- Graduation readiness view (for MD dashboard)
CREATE OR REPLACE VIEW case_graduation_readiness AS
SELECT
  i.name AS institution_name,
  p.program_name,
  clp.current_semester,
  COUNT(*) AS total_learners,
  COUNT(*) FILTER (WHERE clp.tracks_completed >= 6) AS graduation_ready_count,
  COUNT(*) FILTER (WHERE clp.tracks_completed >= 6)::NUMERIC / GREATEST(COUNT(*), 1) * 100 AS readiness_percentage,
  COUNT(*) FILTER (WHERE rc.calculated_risk_level = 'at_risk') AS at_risk_count,
  COUNT(*) FILTER (WHERE rc.calculated_risk_level = 'critical') AS critical_count,
  COUNT(*) FILTER (WHERE rc.calculated_risk_level = 'overdue') AS overdue_count,
  ROUND(AVG(clp.tracks_completed), 1) AS avg_tracks_completed,
  ROUND(AVG(clp.total_hours_completed), 0) AS avg_hours_completed
FROM case_learner_progress clp
JOIN institutions i ON clp.institution_id = i.id
JOIN programs p ON clp.programme_id = p.id
LEFT JOIN case_risk_calculator rc ON clp.user_id = rc.user_id
GROUP BY i.name, p.program_name, clp.current_semester
ORDER BY readiness_percentage ASC;
