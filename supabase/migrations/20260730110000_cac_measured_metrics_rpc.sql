-- ============================================================================
-- Updated: 2026-07-30 — CAC measured metrics: one guarded read for the whole grid.
--
-- The Cluster Academic Council page grew a measured metrics section. The CEO's
-- July 2026 framework names 48 metrics; the ones with real per-institution
-- substrate today are computed here. The rest have no source,
-- an empty source, or a cluster-wide-only source, and the page states that
-- rather than rendering a zero — a zero reads as a measured bad result.
--
-- WHY ONE FUNCTION RATHER THAN CLIENT QUERIES
-- Fourteen institutions across every wired metric is ~150 client round-trips, each
-- paying RLS on a different table. One read returns the whole grid.
--
-- WHY IT TAKES NO ARGUMENTS
-- Deliberate, and the most important line in this file. Five live leaks at JKKN
-- this month came from SECURITY DEFINER functions that accepted a caller-supplied
-- institution or user id and trusted it; one served 49 learners' names and emails
-- to an unauthenticated caller. This function derives everything internally and
-- offers no parameter to forge. The permission is the only key.
--
-- WHY IT RETURNS ALL FOURTEEN INSTITUTIONS RATHER THAN THE CALLER'S OWN
-- A cluster council exists precisely to look across institutions; a per-institution
-- view of a cluster body would be a contradiction. Access is therefore gated on
-- `accreditation.cac.view` — a CAC-specific permission granted to cluster-level
-- people — rather than on institution scope. Anyone without it gets 42501.
--
-- WHY THE ATTENDANCE FIGURE IS A 30-DAY WINDOW
-- `student_attendance.attendance_data` is a JSONB object keyed by period, each
-- holding a `students` array of {status, student_id}. A true all-history rate
-- therefore has to unnest ~1.1M elements: measured on production 2026-07-30 at
-- 15.7s warm / 29.1s cold, against the `authenticated` role's 8s
-- statement_timeout. It would time out on every page load. A 30-day window is
-- 3.8s and fits, so that is what is computed — and the label says so, because an
-- unlabelled window is a number nobody can reproduce. (The all-history figures
-- ARE real and worth having: ENGG 71.15%, ALHD 77.60%, ASSF 77.72%, PHAR 79.71%,
-- ASAI 82.78%, NURS 87.28%, DENT 87.73%, and both schools above 92%. Getting
-- them onto the page needs a nightly snapshot table, the same pattern
-- coe_naac_evidence already uses. That is a follow-up, not this migration.)
--
-- Read-only. Creates no table and writes nothing.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_cac_measured_metrics()
RETURNS TABLE (
  institution_id uuid,
  metric_key     text,
  value_numeric  numeric,
  value_label    text,
  detail         jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
-- Output column names deliberately match the source columns below. Without this
-- directive plpgsql resolves a bare `institution_id` to the OUT parameter and
-- every GROUP BY silently collapses to one row.
#variable_conflict use_column
DECLARE
  v_window_days constant int := 30;
BEGIN
  -- COALESCE on both guards: a SECURITY DEFINER check that can return NULL
  -- falls through to the else-branch and grants access. Never leave it bare.
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.user_has_permission('accreditation.cac.view'), false)
  ) THEN
    RAISE EXCEPTION
      'Not authorised to read Cluster Academic Council metrics'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  -- 1. Attendance — presence rate over the trailing window, plus how much was
  --    marked, so a high rate off three sessions cannot look like a high rate
  --    off three thousand.
  WITH bound AS (
    SELECT max(sa.attendance_date) AS latest FROM student_attendance sa
  ),
  attendance_marks AS (
    SELECT
      sa.institution_id                                            AS inst,
      count(*)                                                     AS marks,
      count(*) FILTER (WHERE entry->>'status' = 'Present')          AS present
    FROM student_attendance sa
    CROSS JOIN bound b
    CROSS JOIN LATERAL jsonb_each(sa.attendance_data) AS period(pkey, pval)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(period.pval -> 'students') = 'array'
           THEN period.pval -> 'students'
           ELSE '[]'::jsonb END
    ) AS entry
    WHERE sa.institution_id IS NOT NULL
      AND sa.attendance_date > b.latest - v_window_days
    GROUP BY sa.institution_id
  ),
  attendance_sessions AS (
    SELECT sa.institution_id AS inst, count(*) AS sessions
    FROM student_attendance sa
    WHERE sa.institution_id IS NOT NULL
    GROUP BY sa.institution_id
  )
  SELECT
    s.inst,
    'attendance'::text,
    round(100.0 * m.present / NULLIF(m.marks, 0), 2),
    CASE
      WHEN m.marks IS NULL OR m.marks = 0
        THEN s.sessions || ' sessions marked · no marks in the last '
             || v_window_days || ' days'
      ELSE round(100.0 * m.present / m.marks, 1) || '% present (last '
           || v_window_days || ' days)'
    END,
    jsonb_build_object(
      'source', 'student_attendance',
      'window_days', v_window_days,
      'marks_in_window', COALESCE(m.marks, 0),
      'present_in_window', COALESCE(m.present, 0),
      'sessions_all_time', s.sessions
    )
  FROM attendance_sessions s
  LEFT JOIN attendance_marks m ON m.inst = s.inst

  UNION ALL
  -- 2. Pass percentage — the most recent published session per institution,
  --    mirrored from the COE exam system. The mirror fans one COE campus out to
  --    two MyJKKN institutions, so the provenance travels with the number: the
  --    page must not present the same measurement twice as corroboration.
  -- The latest-per-institution pick sits in a subquery because an ORDER BY in a
  -- UNION branch binds to the whole union, not to the branch.
  SELECT
    e.institution_id,
    'pass-percentage'::text,
    (e.computed ->> 'pass_percentage')::numeric,
    -- The shared-campus note is APPENDED to the label, not merely stored in
    -- `detail`. The page renders value_label in the tooltip and never reads
    -- detail, so provenance kept only in detail is provenance nobody sees —
    -- and the two Arts and Science rows carry byte-identical figures, which
    -- read as two colleges corroborating each other unless the screen says
    -- otherwise. That illusion is the whole reason this field exists.
    (e.computed ->> 'pass_percentage') || '% · ' || e.session_code
      || COALESCE(' · ' || (e.computed ->> 'fan_out'), ''),
    jsonb_build_object(
      'source', 'coe_naac_evidence (mirrored from the COE exam system)',
      'session_code', e.session_code,
      'ay_label', e.ay_label,
      'published_entries', e.computed -> 'published_entries',
      'passed_entries', e.computed -> 'passed_entries',
      'shared_campus_note', e.computed -> 'fan_out'
    )
  FROM (
    SELECT DISTINCT ON (ce.institution_id)
      ce.institution_id, ce.session_code, ce.ay_label, ce.computed
    FROM coe_naac_evidence ce
    WHERE ce.institution_id IS NOT NULL
      AND ce.computed ? 'pass_percentage'
    -- The date cast is regex-guarded, and NOT because a bad row exists today
    -- (all 8 are well-formed, 0 nulls, verified 2026-07-30). It is because all
    -- wired metrics are one UNION inside one function: a single future row
    -- carrying exam_end_date = '' or 'TBD' would raise 22007 and take down the
    -- ENTIRE grid, not just pass percentage. A malformed date sorts last and
    -- costs one metric instead.
    -- session_code is the tiebreaker. Without it two sessions sharing an end
    -- date would pick a winner non-deterministically, so the same page could
    -- show a different pass percentage on two consecutive loads.
    ORDER BY ce.institution_id,
             CASE
               WHEN ce.computed ->> 'exam_end_date' ~ '^\d{4}-\d{2}-\d{2}$'
               THEN (ce.computed ->> 'exam_end_date')::date
             END DESC NULLS LAST,
             ce.session_code DESC
  ) e

  UNION ALL
  -- 3. Results analysis — how many sessions have been analysed at all.
  SELECT
    e.institution_id,
    'results-analysis'::text,
    count(DISTINCT e.session_code)::numeric,
    count(DISTINCT e.session_code) || ' exam sessions analysed',
    jsonb_build_object(
      'source', 'coe_naac_evidence',
      'sessions', jsonb_agg(DISTINCT e.session_code)
    )
  FROM coe_naac_evidence e
  WHERE e.institution_id IS NOT NULL
  GROUP BY e.institution_id

  UNION ALL
  -- 4. Curriculum planning and delivery — session records Senior Learners file
  --    against the learning framework.
  SELECT
    cl.institution_id,
    'curriculum-delivery'::text,
    count(*)::numeric,
    count(*) || ' session records',
    jsonb_build_object('source', 'curriculum_lesson')
  FROM curriculum_lesson cl
  WHERE cl.institution_id IS NOT NULL
  GROUP BY cl.institution_id

  UNION ALL
  -- 5. Outcome-based education monitoring.
  SELECT
    o.institution_id,
    'obe-monitoring'::text,
    count(*)::numeric,
    count(*) || ' course outcomes defined',
    jsonb_build_object('source', 'obe_course_outcomes')
  FROM obe_course_outcomes o
  WHERE o.institution_id IS NOT NULL
  GROUP BY o.institution_id

  UNION ALL
  -- 6. E-governance and digital transformation — actual platform use. The only
  --    metric with data for every institution.
  SELECT
    u.institution_id,
    'e-governance'::text,
    count(*)::numeric,
    count(*) || ' recorded actions',
    jsonb_build_object('source', 'usage_events')
  FROM usage_events u
  WHERE u.institution_id IS NOT NULL
  GROUP BY u.institution_id

  UNION ALL
  -- 7. Policy implementation — only policies actually scoped to an institution.
  --    The cluster-wide ones are real but belong to nobody in particular, and
  --    attributing them to each college would inflate all fourteen equally.
  SELECT
    p.scope_id,
    'policy-compliance'::text,
    count(*)::numeric,
    count(*) || ' policies set for this institution',
    jsonb_build_object(
      'source', 'platform_policies (scope_type = institution)',
      'active', count(*) FILTER (WHERE p.is_active)
    )
  FROM platform_policies p
  WHERE p.scope_type = 'institution' AND p.scope_id IS NOT NULL
  GROUP BY p.scope_id

  UNION ALL
  -- 8. AI adoption — prompts Senior Learners actually built in AI Pulse.
  SELECT
    b.institution_id,
    'ai-adoption'::text,
    count(*)::numeric,
    count(*) || ' prompts built',
    jsonb_build_object('source', 'ai_pulse_prompt_builds')
  FROM ai_pulse_prompt_builds b
  WHERE b.institution_id IS NOT NULL
  GROUP BY b.institution_id

  -- Parent engagement is NOT computed here, deliberately. pp_parent_accounts
  -- holds 590 rows across 2 institutions, and it is tempting to report that as
  -- the metric. Measured on production 2026-07-30: of those 590, the number that
  -- have EVER signed in is ZERO — last_login_at is null on all 590, as are
  -- mobile and email. (is_active is true on all 590, but that is a provisioning
  -- flag, not a sign of use.) Reporting 363 and 227 would put the second
  -- best-populated figure on the page under a label reading ENGAGEMENT, while
  -- measuring accounts created. The catalog therefore classifies this metric
  -- 'awaiting-entry' — the platform holds a place for it and nothing has been
  -- recorded yet — which is exactly true and renders as "not captured yet".

  UNION ALL
  -- 10 & 11. Sports and cultural activity, separated by the event's own type so
  --    the two CEO metrics are not both filled from one undifferentiated total.
  --
  --    The registrations table here is `events_registrations`, NOT the very
  --    similarly named `event_registrations`. They are different tables for
  --    different modules: `event_registrations.event_id` carries a foreign key
  --    to `startup_events`, so joining it to `events` matches nothing.
  --    Verified on production 2026-07-30: ALL 2,361 of its rows are orphans
  --    against `events` — zero matches, and no null event_ids either.
  --    `events_registrations` (FK to `events`) is the real one.
  --
  --    BE PRECISE ABOUT WHAT THE WRONG JOIN BROKE, because on this page a zero
  --    is a claim. It did NOT zero the displayed figure. `value_numeric` is
  --    count(DISTINCT ev.id) and this is a LEFT JOIN, so the event count was 20
  --    either way — confirmed by running both joins side by side. What came back
  --    empty was count(DISTINCT r.id): the registrations half of `value_label`
  --    and `detail.registrations`. The row read "20 events · 0 registrations"
  --    when the truth was 1,594, almost all of them one marathon. The damage was
  --    in the tooltip and the JSON, never in the cell.
  --
  --    Also note the institution count (7) is NOT downstream of this fix. `r`
  --    appears only on the right of the LEFT JOIN, and the GROUP BY reads only
  --    `ev`, so no change to the registrations table can move it.
  SELECT
    ev.institution_id,
    CASE WHEN ev.event_type IN ('sports', 'sports_tournament', 'marathon')
         THEN 'holistic-sports' ELSE 'holistic-cultural' END::text,
    count(DISTINCT ev.id)::numeric,
    count(DISTINCT ev.id) || ' events · '
      || count(DISTINCT r.id) || ' registrations',
    jsonb_build_object(
      'source', 'events joined to events_registrations',
      'event_types', jsonb_agg(DISTINCT ev.event_type),
      'registrations', count(DISTINCT r.id)
    )
  FROM events ev
  LEFT JOIN events_registrations r ON r.event_id = ev.id
  WHERE ev.institution_id IS NOT NULL
    AND ev.event_type IN
      ('sports', 'sports_tournament', 'marathon', 'cultural')
  GROUP BY
    ev.institution_id,
    CASE WHEN ev.event_type IN ('sports', 'sports_tournament', 'marathon')
         THEN 'holistic-sports' ELSE 'holistic-cultural' END;
END;
$$;

COMMENT ON FUNCTION public.fn_cac_measured_metrics() IS
  'Per-institution values for the CAC metrics with real substrate. Takes '
  'no arguments by design — identity and permission are derived internally, so '
  'there is nothing for a caller to forge. Gated on accreditation.cac.view.';

-- Both, not just anon. Supabase''s ALTER DEFAULT PRIVILEGES grants EXECUTE to
-- anon on every new function, AND anon inherits PUBLIC''s =X/postgres grant.
-- Revoking one and not the other leaves the function callable with the anon key
-- that ships in every browser bundle.
REVOKE EXECUTE ON FUNCTION public.fn_cac_measured_metrics() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cac_measured_metrics() TO authenticated;
