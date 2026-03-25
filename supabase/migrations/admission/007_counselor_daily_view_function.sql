-- ============================================================================
-- ADMISSION MODULE: Counselor Daily View RPC Function
-- Created: 2026-02-27
-- Purpose: Single-query daily dashboard for counselors and managers.
--          Called by CounselorDailyViewService.getDailyView() via
--          supabase.rpc('get_counselor_daily_view', { p_user_id, p_institution_id })
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_counselor_daily_view(
  p_user_id        uuid,
  p_institution_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counselor_id     uuid;
  v_is_manager       boolean := false;
  v_role             text;
  v_is_super_admin   boolean;
  v_today_start      timestamptz;
  v_today_end        timestamptz;
  v_month_start      timestamptz;
  v_kpis             jsonb;
  v_followups        jsonb;
  v_pipeline         jsonb;
  v_today_activities jsonb;
  v_unassigned_count integer := 0;
BEGIN
  -- ── Time boundaries (UTC) ────────────────────────────────────────────────
  v_today_start := date_trunc('day', now());
  v_today_end   := v_today_start + interval '1 day';
  v_month_start := date_trunc('month', now());

  -- ── 1. Determine role: manager or regular counselor ───────────────────────
  SELECT p.role, p.is_super_admin
  INTO   v_role, v_is_super_admin
  FROM   profiles p
  WHERE  p.id = p_user_id;

  v_is_manager := (
    v_is_super_admin IS TRUE OR
    v_role IN ('super_admin', 'admin', 'institution_admin', 'manager', 'hod', 'principal', 'dean')
  );

  -- ── 2. For non-managers: resolve their admission_counselors.id ────────────
  IF NOT v_is_manager THEN
    SELECT id INTO v_counselor_id
    FROM   admission_counselors
    WHERE  user_id        = p_user_id
      AND  institution_id = p_institution_id
      AND  is_active      = true
    LIMIT 1;

    -- User is neither a manager nor an active counselor in this institution
    IF v_counselor_id IS NULL THEN
      RETURN jsonb_build_object('error', 'not_a_counselor');
    END IF;
  END IF;

  -- ── 3. KPIs ──────────────────────────────────────────────────────────────
  -- funnel_stage is a USER-DEFINED enum; cast to text for IN/NOT IN comparisons
  SELECT jsonb_build_object(
    'my_leads_today', COUNT(*) FILTER (
      WHERE created_at >= v_today_start
        AND created_at  < v_today_end
        AND (v_is_manager OR counselor_id = v_counselor_id)
    ),
    'followups_due', COUNT(*) FILTER (
      WHERE next_followup_at IS NOT NULL
        AND next_followup_at  < v_today_end
        AND funnel_stage::text NOT IN (
              'enrolled','confirmed','declined','withdrew','expired','lost','dormant')
        AND (v_is_manager OR counselor_id = v_counselor_id)
    ),
    'overdue_followups', COUNT(*) FILTER (
      WHERE next_followup_at IS NOT NULL
        AND next_followup_at  < v_today_start
        AND funnel_stage::text NOT IN (
              'enrolled','confirmed','declined','withdrew','expired','lost','dormant')
        AND (v_is_manager OR counselor_id = v_counselor_id)
    ),
    'hot_leads', COUNT(*) FILTER (
      WHERE is_hot_lead = true
        AND funnel_stage::text NOT IN (
              'enrolled','confirmed','declined','withdrew','expired','lost','dormant')
        AND (v_is_manager OR counselor_id = v_counselor_id)
    ),
    'total_active', COUNT(*) FILTER (
      WHERE funnel_stage::text NOT IN (
              'enrolled','confirmed','declined','withdrew','expired','lost','dormant')
        AND (v_is_manager OR counselor_id = v_counselor_id)
    ),
    'enrolled_this_month', COUNT(*) FILTER (
      WHERE funnel_stage::text IN ('enrolled','confirmed')
        AND stage_changed_at >= v_month_start
        AND (v_is_manager OR counselor_id = v_counselor_id)
    ),
    'total_this_month', COUNT(*) FILTER (
      WHERE created_at >= v_month_start
        AND (v_is_manager OR counselor_id = v_counselor_id)
    )
  )
  INTO  v_kpis
  FROM  admission_leads
  WHERE institution_id = p_institution_id;

  -- ── 4. Follow-ups: overdue + today + upcoming 7 days ─────────────────────
  SELECT COALESCE(jsonb_agg(f ORDER BY (f->>'next_followup_at')), '[]'::jsonb)
  INTO   v_followups
  FROM (
    SELECT jsonb_build_object(
      'id',                     l.id,
      'full_name',              l.full_name,
      'phone',                  l.phone,
      'email',                  l.email,
      'interested_programs',    l.interested_programs,
      'funnel_stage',           l.funnel_stage::text,
      'is_hot_lead',            COALESCE(l.is_hot_lead, false),
      'is_priority',            COALESCE(l.is_priority, false),
      'score',                  l.score,
      'next_followup_at',       l.next_followup_at,
      'urgency', CASE
        WHEN l.next_followup_at < v_today_start THEN 'overdue'
        WHEN l.next_followup_at < v_today_end   THEN 'today'
        ELSE 'upcoming'
      END,
      'counselor_id',           l.counselor_id,
      'counselor_name',         c.name,
      'source',                 l.source::text,
      'student_interest_level', l.student_interest_level,
      'parent_decision_status', l.parent_decision_status,
      'academic_year',          l.academic_year,
      'last_activity', (
        SELECT jsonb_build_object(
          'type',        a.activity_type,
          'description', a.description,
          'created_at',  a.created_at
        )
        FROM  admission_lead_activities a
        WHERE a.lead_id = l.id
        ORDER BY a.created_at DESC
        LIMIT 1
      )
    ) AS f
    FROM  admission_leads      l
    LEFT  JOIN admission_counselors c ON c.id = l.counselor_id
    WHERE l.institution_id = p_institution_id
      AND l.next_followup_at IS NOT NULL
      AND l.next_followup_at  < (v_today_start + interval '8 days')
      AND l.funnel_stage::text NOT IN (
            'enrolled','confirmed','declined','withdrew','expired','lost','dormant')
      AND (v_is_manager OR l.counselor_id = v_counselor_id)
    ORDER BY l.next_followup_at
    LIMIT 50
  ) AS subq;

  -- ── 5. Pipeline by funnel stage ───────────────────────────────────────────
  SELECT COALESCE(jsonb_agg(p ORDER BY (p->>'count')::int DESC), '[]'::jsonb)
  INTO   v_pipeline
  FROM (
    SELECT jsonb_build_object(
      'stage', l.funnel_stage::text,
      'count', COUNT(*)::int
    ) AS p
    FROM  admission_leads l
    WHERE l.institution_id = p_institution_id
      AND l.funnel_stage::text NOT IN (
            'enrolled','confirmed','declined','withdrew','expired','lost','dormant')
      AND (v_is_manager OR l.counselor_id = v_counselor_id)
    GROUP BY l.funnel_stage
  ) AS stages;

  -- ── 6. Today's activities (join through leads — activities has no institution_id) ─
  SELECT COALESCE(jsonb_agg(ta ORDER BY (ta->>'created_at') DESC), '[]'::jsonb)
  INTO   v_today_activities
  FROM (
    SELECT jsonb_build_object(
      'activity_type', a.activity_type,
      'subject',       a.subject,
      'description',   a.description,
      'created_at',    a.created_at,
      'lead_name',     l.full_name,
      'lead_id',       l.id
    ) AS ta
    FROM  admission_lead_activities a
    JOIN  admission_leads           l ON l.id = a.lead_id
    WHERE l.institution_id = p_institution_id
      AND a.created_at >= v_today_start
      AND a.created_at  < v_today_end
      AND (v_is_manager OR l.counselor_id = v_counselor_id)
    ORDER BY a.created_at DESC
    LIMIT 20
  ) AS activities;

  -- ── 7. Unassigned count (managers only) ───────────────────────────────────
  IF v_is_manager THEN
    SELECT COUNT(*)
    INTO   v_unassigned_count
    FROM   admission_leads
    WHERE  institution_id = p_institution_id
      AND  counselor_id IS NULL
      AND  funnel_stage::text NOT IN (
             'enrolled','confirmed','declined','withdrew','expired','lost','dormant');
  END IF;

  -- ── 8. Return composite result ────────────────────────────────────────────
  RETURN jsonb_build_object(
    'counselor_id',     v_counselor_id,
    'is_manager',       v_is_manager,
    'kpis',             v_kpis,
    'followups',        v_followups,
    'pipeline',         v_pipeline,
    'today_activities', v_today_activities,
    'unassigned_count', v_unassigned_count
  );
END;
$$;

-- Grant execute to authenticated users (RLS on underlying tables still applies
-- for data they can see via the service layer, but this function runs as definer
-- so it bypasses RLS — which is intentional for the daily view aggregation)
GRANT EXECUTE ON FUNCTION public.get_counselor_daily_view(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_counselor_daily_view(uuid, uuid) TO anon;
