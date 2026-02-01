-- Migration: Add Dashboard Optimization Functions
-- Created: 2026-02-01
-- Purpose: Create database functions to optimize dashboard queries and prevent N+1 problems
-- CRITICAL: Single-query aggregations instead of multiple round trips

-- ============================================================================
-- NPS DASHBOARD FUNCTION (Already exists, ensure it's optimized)
-- ============================================================================

-- Drop and recreate to ensure latest version
DROP FUNCTION IF EXISTS get_nps_dashboard(UUID);

CREATE OR REPLACE FUNCTION get_nps_dashboard(p_institution_id UUID)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  -- Single aggregation query for all NPS metrics
  SELECT json_build_object(
    'overall_nps', COALESCE(
      ROUND((
        (COUNT(CASE WHEN r.nps_category = 'promoter' THEN 1 END)::NUMERIC -
         COUNT(CASE WHEN r.nps_category = 'detractor' THEN 1 END)::NUMERIC) /
        NULLIF(COUNT(r.id), 0) * 100
      ), 2),
      0
    ),
    'total_responses', COUNT(r.id),
    'response_rate', 0, -- Would need survey invitation data
    'by_stakeholder', (
      SELECT json_object_agg(
        stakeholder_type,
        json_build_object(
          'score', COALESCE(ROUND((
            (COUNT(CASE WHEN nps_category = 'promoter' THEN 1 END)::NUMERIC -
             COUNT(CASE WHEN nps_category = 'detractor' THEN 1 END)::NUMERIC) /
            NULLIF(COUNT(id), 0) * 100
          ), 2), 0),
          'responses', COUNT(id),
          'promoters', COUNT(CASE WHEN nps_category = 'promoter' THEN 1 END),
          'passives', COUNT(CASE WHEN nps_category = 'passive' THEN 1 END),
          'detractors', COUNT(CASE WHEN nps_category = 'detractor' THEN 1 END)
        )
      )
      FROM (
        SELECT s.stakeholder_type, r2.id, r2.nps_category
        FROM nps_surveys s
        LEFT JOIN nps_responses r2 ON r2.survey_id = s.id
        WHERE s.institution_id = p_institution_id
      ) stakeholder_data
      GROUP BY stakeholder_type
    ),
    'by_department', '{}', -- Would need department join
    'trend', '[]', -- Would need time-series grouping
    'recent_feedback', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', r3.id,
          'nps_score', r3.nps_score,
          'feedback', r3.additional_feedback,
          'submitted_at', r3.submitted_at
        )
        ORDER BY r3.submitted_at DESC
      ), '[]')
      FROM nps_responses r3
      JOIN nps_surveys s3 ON s3.id = r3.survey_id
      WHERE s3.institution_id = p_institution_id
        AND r3.additional_feedback IS NOT NULL
        AND r3.additional_feedback != ''
      LIMIT 10
    )
  ) INTO v_result
  FROM nps_surveys s
  LEFT JOIN nps_responses r ON r.survey_id = s.id
  WHERE s.institution_id = p_institution_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION get_nps_dashboard IS 'Single-query NPS dashboard aggregation to prevent N+1 problems';

-- ============================================================================
-- BILLING COPQ DASHBOARD FUNCTION
-- ============================================================================

DROP FUNCTION IF EXISTS get_billing_copq_dashboard(UUID, INTEGER);

CREATE OR REPLACE FUNCTION get_billing_copq_dashboard(
  p_institution_id UUID,
  p_year INTEGER DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_year INTEGER;
  v_year_start DATE;
  v_year_end DATE;
  v_result JSON;
BEGIN
  -- Use current year if not specified
  v_year := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);
  v_year_start := make_date(v_year, 1, 1);
  v_year_end := make_date(v_year, 12, 31);

  -- Single aggregation query for all COPQ metrics
  SELECT json_build_object(
    'total_copq_ytd', COALESCE(SUM(visible_cost + COALESCE(hidden_cost_estimate, 0)), 0),
    'visible_vs_hidden', json_build_object(
      'visible', COALESCE(SUM(visible_cost), 0),
      'hidden', COALESCE(SUM(hidden_cost_estimate), 0)
    ),
    'by_category', (
      SELECT json_object_agg(
        category,
        COALESCE(SUM(visible_cost + COALESCE(hidden_cost_estimate, 0)), 0)
      )
      FROM billing_copq_incidents
      WHERE institution_id = p_institution_id
        AND incident_date BETWEEN v_year_start AND v_year_end
      GROUP BY category
    ),
    'trend', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'month', month_date,
          'copq', month_total,
          'visible', month_visible,
          'hidden', month_hidden
        )
        ORDER BY month_date
      ), '[]')
      FROM (
        SELECT
          DATE_TRUNC('month', incident_date)::DATE as month_date,
          SUM(visible_cost + COALESCE(hidden_cost_estimate, 0)) as month_total,
          SUM(visible_cost) as month_visible,
          SUM(hidden_cost_estimate) as month_hidden
        FROM billing_copq_incidents
        WHERE institution_id = p_institution_id
          AND incident_date BETWEEN v_year_start AND v_year_end
        GROUP BY DATE_TRUNC('month', incident_date)
      ) monthly
    ),
    'stats', json_build_object(
      'total_incidents', COUNT(*),
      'open_incidents', COUNT(CASE WHEN status IN ('logged', 'investigating') THEN 1 END),
      'resolved_incidents', COUNT(CASE WHEN status = 'resolved' THEN 1 END),
      'avg_resolution_time_days', COALESCE(ROUND(AVG(
        CASE
          WHEN resolved_at IS NOT NULL AND created_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (resolved_at - created_at)) / 86400
        END
      ), 1), 0)
    )
  ) INTO v_result
  FROM billing_copq_incidents
  WHERE institution_id = p_institution_id
    AND incident_date BETWEEN v_year_start AND v_year_end;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION get_billing_copq_dashboard IS 'Single-query COPQ dashboard aggregation with YTD metrics';

-- ============================================================================
-- GRIEVANCE DASHBOARD FUNCTION
-- ============================================================================

DROP FUNCTION IF EXISTS get_grievance_dashboard(UUID);

CREATE OR REPLACE FUNCTION get_grievance_dashboard(p_institution_id UUID)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'total_tickets', COUNT(*),
    'open_tickets', COUNT(CASE WHEN status = 'open' THEN 1 END),
    'in_progress_tickets', COUNT(CASE WHEN status = 'in_progress' THEN 1 END),
    'resolved_tickets', COUNT(CASE WHEN status = 'resolved' THEN 1 END),
    'closed_tickets', COUNT(CASE WHEN status = 'closed' THEN 1 END),
    'sla_compliance', json_build_object(
      'on_track', COUNT(CASE WHEN sla_status = 'on_track' THEN 1 END),
      'at_risk', COUNT(CASE WHEN sla_status = 'at_risk' THEN 1 END),
      'breached', COUNT(CASE WHEN sla_status = 'breached' THEN 1 END),
      'compliance_rate', COALESCE(ROUND(
        (COUNT(CASE WHEN sla_status != 'breached' AND resolved_at IS NOT NULL THEN 1 END)::NUMERIC /
         NULLIF(COUNT(CASE WHEN resolved_at IS NOT NULL THEN 1 END), 0)) * 100,
        1
      ), 100)
    ),
    'by_priority', json_build_object(
      'urgent', COUNT(CASE WHEN priority = 'urgent' THEN 1 END),
      'high', COUNT(CASE WHEN priority = 'high' THEN 1 END),
      'medium', COUNT(CASE WHEN priority = 'medium' THEN 1 END),
      'low', COUNT(CASE WHEN priority = 'low' THEN 1 END)
    ),
    'by_category', (
      SELECT json_object_agg(
        COALESCE(c.name, 'Uncategorized'),
        category_count
      )
      FROM (
        SELECT category_id, COUNT(*) as category_count
        FROM grievance_tickets
        WHERE institution_id = p_institution_id
        GROUP BY category_id
      ) cat_counts
      LEFT JOIN grievance_categories c ON c.id = cat_counts.category_id
    ),
    'avg_resolution_time_hours', COALESCE(ROUND(AVG(
      CASE
        WHEN resolved_at IS NOT NULL AND created_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600
      END
    ), 1), 0),
    'satisfaction_rating', COALESCE(ROUND(AVG(satisfaction_rating), 1), 0)
  ) INTO v_result
  FROM grievance_tickets
  WHERE institution_id = p_institution_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION get_grievance_dashboard IS 'Single-query grievance dashboard with SLA metrics';

-- ============================================================================
-- PROCESS EXCELLENCE DASHBOARD FUNCTION
-- ============================================================================

DROP FUNCTION IF EXISTS get_process_excellence_dashboard(UUID);

CREATE OR REPLACE FUNCTION get_process_excellence_dashboard(p_institution_id UUID)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'summary', (
      SELECT json_build_object(
        'total_processes', COUNT(DISTINCT pd.id),
        'active_instances', COUNT(CASE WHEN pi.completed_at IS NULL THEN 1 END),
        'sla_compliance_rate', COALESCE(ROUND(
          (COUNT(CASE WHEN pi.sla_status != 'breached' AND pi.completed_at IS NOT NULL THEN 1 END)::NUMERIC /
           NULLIF(COUNT(CASE WHEN pi.completed_at IS NOT NULL THEN 1 END), 0)) * 100,
          1
        ), 100),
        'avg_value_add_ratio', COALESCE(ROUND(AVG(CASE WHEN pi.completed_at IS NOT NULL THEN pi.value_add_ratio END), 1), 0),
        'total_waste_incidents', (SELECT COUNT(*) FROM process_waste WHERE institution_id = p_institution_id),
        'open_waste_incidents', (SELECT COUNT(*) FROM process_waste WHERE institution_id = p_institution_id AND status = 'open')
      )
      FROM process_definitions pd
      LEFT JOIN process_instances pi ON pi.definition_id = pd.id
      WHERE pd.institution_id = p_institution_id AND pd.is_active = true
    ),
    'sla_distribution', (
      SELECT json_build_object(
        'on_track', COUNT(CASE WHEN sla_status = 'on_track' THEN 1 END),
        'at_risk', COUNT(CASE WHEN sla_status = 'at_risk' THEN 1 END),
        'breached', COUNT(CASE WHEN sla_status = 'breached' THEN 1 END)
      )
      FROM process_instances pi
      JOIN process_definitions pd ON pd.id = pi.definition_id
      WHERE pd.institution_id = p_institution_id
        AND pi.completed_at IS NULL
    ),
    'waste_breakdown', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'category', waste_category,
          'label', CASE waste_category
            WHEN 'T' THEN 'Transportation'
            WHEN 'I' THEN 'Inventory'
            WHEN 'M' THEN 'Motion'
            WHEN 'W' THEN 'Waiting'
            WHEN 'O1' THEN 'Over-production'
            WHEN 'O2' THEN 'Over-processing'
            WHEN 'D' THEN 'Defects'
            WHEN 'TU' THEN 'Talent Under-utilization'
          END,
          'count', waste_count,
          'total_hours_lost', total_hours,
          'total_cost_impact', total_cost
        )
      ), '[]')
      FROM (
        SELECT
          waste_category,
          COUNT(*) as waste_count,
          SUM(COALESCE(estimated_time_lost_hours, 0)) as total_hours,
          SUM(COALESCE(estimated_cost_impact, 0)) as total_cost
        FROM process_waste
        WHERE institution_id = p_institution_id
        GROUP BY waste_category
      ) waste_agg
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION get_process_excellence_dashboard IS 'Single-query process excellence dashboard with waste analytics';

-- ============================================================================
-- PARENT PORTAL DASHBOARD FUNCTION
-- ============================================================================

DROP FUNCTION IF EXISTS get_parent_portal_dashboard(UUID);

CREATE OR REPLACE FUNCTION get_parent_portal_dashboard(p_parent_id UUID)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'linked_learners', (
      SELECT COUNT(*)
      FROM parent_learner_links
      WHERE parent_id = p_parent_id
    ),
    'unread_communications', (
      SELECT COUNT(*)
      FROM parent_communications
      WHERE parent_id = p_parent_id
        AND status != 'read'
    ),
    'recent_communications', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', id,
          'type', type,
          'subject', subject,
          'sent_at', sent_at,
          'status', status
        )
        ORDER BY sent_at DESC
      ), '[]')
      FROM (
        SELECT *
        FROM parent_communications
        WHERE parent_id = p_parent_id
        ORDER BY sent_at DESC
        LIMIT 10
      ) recent
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION get_parent_portal_dashboard IS 'Single-query parent portal dashboard';

-- ============================================================================
-- MATURITY ASSESSMENT DASHBOARD FUNCTION
-- ============================================================================

DROP FUNCTION IF EXISTS get_maturity_assessment_dashboard(UUID);

CREATE OR REPLACE FUNCTION get_maturity_assessment_dashboard(p_institution_id UUID)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'total_assessments', COUNT(*),
    'completed_assessments', COUNT(CASE WHEN status = 'completed' THEN 1 END),
    'in_progress_assessments', COUNT(CASE WHEN status = 'in_progress' THEN 1 END),
    'latest_assessment', (
      SELECT json_build_object(
        'id', id,
        'assessment_date', assessment_date,
        'overall_maturity_level', overall_maturity_level,
        'status', status
      )
      FROM maturity_assessments
      WHERE institution_id = p_institution_id
      ORDER BY assessment_date DESC
      LIMIT 1
    ),
    'maturity_trend', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'assessment_date', assessment_date,
          'overall_maturity_level', overall_maturity_level
        )
        ORDER BY assessment_date
      ), '[]')
      FROM (
        SELECT assessment_date, overall_maturity_level
        FROM maturity_assessments
        WHERE institution_id = p_institution_id
          AND status = 'completed'
        ORDER BY assessment_date DESC
        LIMIT 12
      ) trend
    )
  ) INTO v_result
  FROM maturity_assessments
  WHERE institution_id = p_institution_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION get_maturity_assessment_dashboard IS 'Single-query maturity assessment dashboard with trend';

-- ============================================================================
-- GRANT EXECUTE PERMISSIONS
-- ============================================================================

-- Grant execute to authenticated users (adjust based on your RLS setup)
GRANT EXECUTE ON FUNCTION get_nps_dashboard(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_billing_copq_dashboard(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_grievance_dashboard(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_process_excellence_dashboard(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_parent_portal_dashboard(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_maturity_assessment_dashboard(UUID) TO authenticated;
