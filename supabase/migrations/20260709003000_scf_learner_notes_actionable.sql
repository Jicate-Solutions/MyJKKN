-- =============================================================================
-- LEARNER SUPPORT NOTES — MAKE THEM ACTIONABLE (Director, 2026-07-09 02:32)
-- "why do we have this note? how actionable and personalised is it?" — the note
-- was personalised in TARGETING but generic in CONTENT because the generator was
-- only fed the course name + 3 ratings. This migration widens the data so the
-- note can cite the learner's OWN flagged items and dates, name the facilitator
-- to approach, and take a one-tap "I've reached out" follow-up.
--
-- 1. fn_scf_downward_trend_all       + unmet_items (recurring checklist labels
--                                      across the 3 sliding classes) + faculty_name
--                                      (changed RETURNS ⇒ DROP + CREATE)
-- 2. scf_learner_notes               + reached_out / reached_out_at (the note's
--                                      own outcome tap — turns comfort into a loop)
-- 3. fn_scf_my_struggling_note       + id / reached_out (card needs them for the tap)
--                                      (changed RETURNS ⇒ DROP + CREATE)
-- 4. fn_scf_learner_note_reached_out NEW — learner-own one-tap follow-up
-- 5. fn_induction_my_mentor          NEW — the caller's OWN senior peer mentor
--                                      (mentee side of induction_feedback_volunteer_group)
--                                      so the note can point at a real person
--
-- All learner data shown is the learner's OWN (no k-anonymity concern). The
-- no-shame / no-blame tone rules and the human approval gate are untouched.
-- =============================================================================


-- =============================================================================
-- 1. fn_scf_downward_trend_all — feed the generator what it needs to be specific
-- =============================================================================
DROP FUNCTION IF EXISTS public.fn_scf_downward_trend_all(integer);

CREATE FUNCTION public.fn_scf_downward_trend_all(p_recent_within_days integer DEFAULT 30)
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
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_downward_trend_all(integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_downward_trend_all(integer) TO service_role;


-- =============================================================================
-- 2. scf_learner_notes — the note's own outcome tap
-- =============================================================================
-- Updated: 2026-07-09 — one-tap "I've reached out" follow-up on support notes
ALTER TABLE public.scf_learner_notes
  ADD COLUMN IF NOT EXISTS reached_out boolean,
  ADD COLUMN IF NOT EXISTS reached_out_at timestamptz;


-- =============================================================================
-- 3. fn_scf_my_struggling_note — card needs id + reached_out for the tap
-- =============================================================================
DROP FUNCTION IF EXISTS public.fn_scf_my_struggling_note();

CREATE FUNCTION public.fn_scf_my_struggling_note()
 RETURNS TABLE(course_code text, course_name text, note text, generated_at timestamp with time zone, id uuid, reached_out boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lp uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_my_struggling_note: not authenticated';
  END IF;
  -- Identity chain: auth.uid() -> learners_profiles.profile_id -> lp.id
  -- (mirrors fn_scf_downward_trend_for_learner). The note.learner_id == lp.id.
  SELECT lp.id INTO v_lp
  FROM public.learners_profiles lp
  WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT n.course_code, n.course_name, n.note, n.generated_at, n.id, n.reached_out
  FROM public.scf_learner_notes n
  WHERE n.learner_id = v_lp
    AND n.status = 'approved'   -- approval queue (2026-07-03): drafts/rejected are NEVER learner-visible
  ORDER BY n.generated_at DESC
  LIMIT 1;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_my_struggling_note() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_my_struggling_note() TO authenticated;


-- =============================================================================
-- 4. fn_scf_learner_note_reached_out — the learner's one-tap follow-up
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_scf_learner_note_reached_out(p_note_id uuid, p_reached_out boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lp uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_learner_note_reached_out: not authenticated';
  END IF;
  -- p_reached_out NULL = CLEAR the answer (the card's Undo restores the
  -- unanswered state rather than silently flipping the signal to "No" — r3).
  SELECT lp.id INTO v_lp FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN
    RAISE EXCEPTION 'fn_scf_learner_note_reached_out: caller is not a learner';
  END IF;

  -- updated_at EXISTS on scf_learner_notes (verified against prod information_schema
  -- 2026-07-09 + the rolled-back tap test exercised this exact UPDATE) — deep-review
  -- r1/r2 flagged it as possibly missing; it is not.
  UPDATE public.scf_learner_notes n
  SET reached_out = p_reached_out,
      reached_out_at = CASE WHEN p_reached_out IS NULL THEN NULL ELSE now() END,
      updated_at = now()
  WHERE n.id = p_note_id
    AND n.learner_id = v_lp          -- own note only (SECDEF bypasses RLS — the gate lives here)
    AND n.status = 'approved';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_scf_learner_note_reached_out: note not found or not yours';
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_learner_note_reached_out(uuid, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_learner_note_reached_out(uuid, boolean) TO authenticated;


-- =============================================================================
-- 5. fn_induction_my_mentor — the caller's OWN senior peer mentor (mentee side)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_induction_my_mentor()
 RETURNS TABLE(mentor_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lp uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_induction_my_mentor: not authenticated';
  END IF;
  SELECT lp.id INTO v_lp FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN RETURN; END IF;

  RETURN QUERY
  -- Name only — no register number or other peer PII leaves the fn until a
  -- consumer actually needs it (deep-review #1902 LOW, data minimisation).
  -- Tenant-bound (r3): mentor and mentee must share an institution, mirroring
  -- the faculty_name join — defense-in-depth against a malformed group row.
  SELECT btrim(coalesce(mlp.first_name,'') || ' ' || coalesce(mlp.last_name,''))::text
  FROM public.induction_feedback_volunteer_group g
  JOIN public.induction_feedback_volunteers v ON v.id = g.volunteer_id AND v.is_active
  JOIN public.learners_profiles mlp ON mlp.id = v.learner_id
  JOIN public.learners_profiles me  ON me.id = v_lp
  WHERE g.learner_id = v_lp
    AND mlp.institution_id = me.institution_id
  ORDER BY g.created_at DESC
  LIMIT 1;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_my_mentor() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_my_mentor() TO authenticated;
