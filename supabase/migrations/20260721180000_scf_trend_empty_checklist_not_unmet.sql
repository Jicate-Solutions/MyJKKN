-- Migration: 20260721180000_scf_trend_empty_checklist_not_unmet.sql
-- Purpose: An UNFILLED checklist must not read as "the learner flagged everything".
--
-- fn_scf_downward_trend_all already intends this — its own comment says a blank
-- blob "must not mark every label unmet and make the note cite struggles the
-- learner never flagged" — but the guard only excludes NULL. In production ZERO
-- rows are NULL: all 14,052 unfilled checklists in the last 30 days are '{}',
-- a non-null blob whose keys are all absent, so every label scores unmet. The
-- guard protects a case that never occurs while the real one passes straight
-- through (15.5% of all feedback rows).
--
-- Observed 2026-07-21 in a note that had ALREADY auto-published to a learner:
-- it told them "you noted the pace was hard to follow" for a 20 Jul class where
-- they had actually ticked could_follow = true; the same day's other row carried
-- an empty '{}' blob, which manufactured all five complaints.
--
-- Fix: one added predicate, matching the function's documented intent. The r2
-- disposition is preserved — an absent key inside a GENUINELY FILLED blob still
-- counts as unmet; only wholly-empty blobs are now skipped. Function body is
-- otherwise byte-identical to the live definition (pg_get_functiondef verbatim).

CREATE OR REPLACE FUNCTION public.fn_scf_downward_trend_all(p_recent_within_days integer DEFAULT 30)
 RETURNS TABLE(learner_id uuid, institution_id uuid, course_code text, course_name text, ratings smallint[], rated_on date[], net_decline smallint, unmet_items text[], faculty_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH per_date AS (
    -- One understood value per (learner, course, class-date): same-day async+live_poll
    -- rows must not supply 2 of the "3 in a row". Keep the lowest (most-flagged), earliest.
    SELECT DISTINCT ON (f.student_id, f.course_code, f.attendance_date)
           f.student_id, f.course_code, f.course_name, f.institution_id,
           f.understood, f.attendance_date, f.created_at,
           f.checklist, lower(NULLIF(btrim(f.faculty_email), '')) AS faculty_email
    FROM public.session_feedback f
    WHERE f.course_code IS NOT NULL
      AND f.understood IS NOT NULL
    ORDER BY f.student_id, f.course_code, f.attendance_date, f.understood ASC, f.created_at ASC
  ),
  ranked AS (
    SELECT pd.student_id, pd.course_code, pd.course_name, pd.institution_id,
           pd.understood, pd.attendance_date, pd.checklist, pd.faculty_email,
           ROW_NUMBER() OVER (PARTITION BY pd.student_id, pd.course_code
                              ORDER BY pd.attendance_date DESC, pd.created_at DESC) AS rn
    FROM per_date pd
  ),
  last3 AS (
    -- latest 3 rated class-dates per (learner, course); arrays oldest->newest.
    -- Qualify every column with `r` — unqualified course_code/course_name would
    -- collide with this fn's RETURNS TABLE output columns (a plpgsql ambiguity that
    -- only surfaces at execution). institution_id = the institution of the MOST
    -- RECENT rated session (rn=1) for that course.
    SELECT r.student_id,
           r.course_code,
           max(r.course_name)                                  AS course_name,
           (array_agg(r.institution_id ORDER BY r.rn ASC))[1]  AS institution_id,
           array_agg(r.understood      ORDER BY r.attendance_date ASC, r.rn DESC) AS ratings,
           array_agg(r.attendance_date ORDER BY r.attendance_date ASC, r.rn DESC) AS rated_on,
           -- the same 3 rows' checklist blobs, kept for the unmet-item scan below
           array_agg(r.checklist       ORDER BY r.attendance_date ASC, r.rn DESC) AS checklists,
           -- facilitator of the MOST RECENT class (rn=1) — the person to approach
           (array_agg(r.faculty_email  ORDER BY r.rn ASC))[1]  AS faculty_email
    FROM ranked r
    WHERE r.rn <= 3
    GROUP BY r.student_id, r.course_code
    HAVING count(*) = 3
  )
  SELECT l.student_id AS learner_id,
         l.institution_id,
         l.course_code,
         l.course_name,
         l.ratings::smallint[],
         l.rated_on::date[],
         (l.ratings[1] - l.ratings[3])::smallint AS net_decline,
         -- Recurring unmet checklist items: the ACTIVE config labels this learner
         -- left false/missing on at least 2 of the 3 sliding classes. Labels (not
         -- keys) so the generator can quote them to the learner verbatim.
         ARRAY(
           SELECT c.label
           FROM public.session_feedback_checklist_config c
           WHERE c.is_active = true
             AND (c.institution_id IS NULL OR c.institution_id = l.institution_id)
             -- Config-drift guard (deep-review #1902 r2, bound corrected r3):
             -- a cited item must have existed BEFORE ALL THREE classes — bound on
             -- the OLDEST (rated_on[1]). Bounding on the newest let an item added
             -- mid-window count absent-as-unmet for the earlier classes.
             AND c.created_at::date <= l.rated_on[1]
             AND (
               SELECT count(*)
               FROM unnest(l.checklists) AS cl(checklist)
               -- Only classes where the learner actually FILLED a checklist count
               -- toward "unmet" — a NULL/absent blob must not mark every label
               -- unmet and make the note cite struggles the learner never flagged
               -- (deep-review #1902 r1 consensus MEDIUM).
               -- DISPOSITION (r2): an ABSENT key in a non-null blob stays "unmet"
               -- BY DESIGN — the dialog only writes keys the learner toggles, so
               -- requiring an explicit false would return zero items forever
               -- (verified against feedback-dialog.tsx onCheckedChange). Absent =
               -- shown-but-not-ticked, the same semantic fn_scf_loop_closure_for_learner
               -- and fn_scf_carryforward_for_learner already use.
               -- Text compare, NOT a ::boolean cast: a learner-controlled non-boolean
               -- checklist value must not raise and take down the whole generator
               -- run (deep-review #1902 r2 LOW — cast-poisoning).
               WHERE cl.checklist IS NOT NULL
                 AND cl.checklist <> '{}'::jsonb
                 AND (cl.checklist ->> c.item_key) IS DISTINCT FROM 'true'
             ) >= 2
           ORDER BY c.sort_order
         )::text[] AS unmet_items,
         -- Facilitator display name via the LOGIN identity (staff.institution_email,
         -- is_active — staff.email is the PERSONAL address and must not be joined).
         (SELECT NULLIF(btrim(coalesce(s.first_name,'') || ' ' || coalesce(s.last_name,'')), '')
          FROM public.staff s
          WHERE lower(s.institution_email) = l.faculty_email
            AND s.is_active = true
            -- Tenant-bound: a duplicated institution_email across tenants must not
            -- surface another institution's staff name (deep-review #1902 LOW).
            AND s.institution_id = l.institution_id
          LIMIT 1) AS faculty_name
  FROM last3 l
  WHERE l.ratings[1] >= l.ratings[2]       -- non-increasing across the 3
    AND l.ratings[2] >= l.ratings[3]
    AND l.ratings[1] >  l.ratings[3]       -- a genuine net drop
    AND l.ratings[3] <= 3                  -- most-recent was OK-or-worse (honesty floor)
    AND l.rated_on[3] >= (CURRENT_DATE - p_recent_within_days)  -- currently sliding
  ORDER BY (l.ratings[1] - l.ratings[3]) DESC, l.student_id, l.course_code;
END;
$function$
;
