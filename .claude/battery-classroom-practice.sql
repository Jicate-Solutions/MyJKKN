-- ============================================================================
-- battery-classroom-practice.sql
-- ============================================================================
-- Rolled-back rehearsal for supabase/migrations/20260729190000_classroom_practice_catalog_and_compare.sql
-- Run the WHOLE file in one Mgmt-API call. It opens a transaction and NEVER
-- commits, so the catalog seed, the cycle, the self-scores and every synthetic
-- impression roll back.
--
-- REQUIRES public.carre_micro_impressions (sibling migration
-- 20260729184500_classroom_practice_l2_micro.sql) to exist first — either
-- already applied, or inlined ahead of this file in the same transaction.
-- ============================================================================
BEGIN;

-- ============================================================================
-- Classroom Practice — 13-item catalog + the owner-side compare
-- 2026-07-29 · Director-ratified design, as revised by the 2026-07-29 pivot.
--
-- WHAT THIS IS
--   CARRE (25 items) audits an INITIATIVE. Classroom Practice (13 items) audits
--   ONE team member's own practice. This migration ships the TEACHER SIDE only:
--   the catalog, the semester container, and the compare.
--
-- THE PIVOT (supersedes the earlier design in this lane)
--   There is NO learner-facing semester sheet. All learner input rides the SCF
--   DRIP built by the sibling lane (20260729184500_classroom_practice_l2_micro):
--   one sealed micro-item attached to a post-session feedback submission,
--   rotating per (learner, team member). Consequences enforced below:
--     · a Classroom Practice cycle is created with participant_scoring_open
--       FALSE, always. The sealed participant lane is not its input path.
--     · the three fn_carre_participant_* RPCs are NOT touched by this
--       migration. That lane stays byte-for-byte as it shipped on 2026-07-25.
--
-- THE THREE INVARIANTS, ENFORCED IN THE DATABASE (not the UI)
--   1. SELF-SCORE FIRST — until the owner has scored all 13 items themselves,
--      the compare returns {locked:true}. Otherwise the medians are an answer
--      key rather than a comparison.
--   2. BATCH REVEAL BY COMPLETED WEEK — only impressions offered before
--      date_trunc('week', now()) count. A median that moves as answers arrive
--      is a live scoreboard, and a live scoreboard is what turns an honest
--      instrument into a performance to be managed.
--   3. k >= 3 PER ITEM — an item with fewer than 3 answered voices reports its
--      voice count but a NULL median, so a single learner can never be
--      identified by elimination.
--   The compare returns AGGREGATES ONLY: never an identity, never a comment,
--   never a single learner's answer. A hand-made REST call obeys all of this.
--
-- ORDERING / DEPENDENCY
--   Timestamped AFTER 20260729184500 deliberately: fn_classroom_practice_compare
--   reads public.carre_micro_impressions, which that migration creates. Apply
--   the L2 migration first.
--
-- THE JOIN THAT IS EASY TO GET WRONG
--   carre_micro_impressions has teacher_email (text), NOT a profiles.id — it is
--   copied from the attendance blob's assigned_faculty.faculty_email, and the
--   sibling's faculty_id is a STAFF id, not a profiles.id (ground truth:
--   20260615233000_session_feedback_substrate.sql).
--
--   profiles.email IS the canonical join to that value. Two production
--   migrations already rely on it:
--     · 20260720060000_scf_note_source_signal.sql — LEFT JOIN profiles p
--       ON p.email = t.faculty_email
--     · 20260722160000_att_reconcile_v2_multisignal_engine.sql — "by
--       faculty_email -> profiles.email (session_feedback.faculty_id does NOT
--       equal ...)"
--
--   So the email is RESOLVED ONCE, at cycle creation, and FROZEN into the
--   snapshot as teacher_email (lower-cased). The compare then reads
--   snapshot->>'teacher_email' directly — no runtime identity mapping, and a
--   later change to someone's profile email cannot silently re-point a running
--   cycle at a different person's voices.
--
--   MEASURED COVERAGE (live, 30d window, 2026-07-29): of 198 distinct
--   session_feedback.faculty_email values, 189 match profiles.email
--   case-insensitively (~95%) and only 134 match staff.email (~68%). So
--   profiles.email is the correct source, by a wide margin — but ~5% of
--   addresses still do not reconcile, and a Senior Learner in that tail reads
--   ZERO drip voices until their email identities are reconciled.
--
--   That tail is visible BEFORE a cycle is opened rather than after: the
--   creation form's picker computes sessions_90d with this same email join, so
--   an unreconciled person shows as "0 sessions / 90d" at the moment of
--   choosing them.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Catalog seed — 13 Classroom Practice items (CP-*), system rows.
--
--    parameter_group mirrors the CARRE pillar convention:
--      1 = Clarity · 2 = Appreciation · 4 = Respect · 5 = Empowerment
--    Group 3 (Recognition) is deliberately EMPTY: recognition surfaces are
--    institutional (award cycles, showcases), not something one team member
--    controls inside their own sessions. Scoring them on it would measure the
--    institution and blame the individual.
--
--    `name` is the short label; `description` is the LEARNER-WORDED QUESTION —
--    the learner reads the description, not the label, both on the drip prompt
--    and on the owner's own sheet. Wording is ratified and reproduced verbatim.
--
--    Scale is 0-4 on every item (0 never … 4 always, and evidenced), identical
--    to the CARE/CARRE catalogs, so the shared score sheet renders unchanged.
--
--    Guarded by NOT EXISTS on 'CP-%' so re-runs are idempotent. The sibling L2
--    migration reads these rows and tolerates their absence, so apply order
--    between the two is safe in either direction for the SEED specifically.
-- ----------------------------------------------------------------------------
INSERT INTO public.audit_parameter_catalog
  (code, name, parameter_group, description, framework_mapping,
   default_owner_role, escalation_role, evidence_required, is_system, is_active)
SELECT v.code, v.name, v.grp, v.description, v.mapping,
       'hod', 'principal', v.evidence, true, true
FROM (
  VALUES
  -- Clarity (group 1) — can a learner predict how this person decides?
  ('CP-C1','Leave decided by clear rules',1::smallint,
   'When someone asks for leave or OD, the decision follows stated rules — not mood or favourites.',
   '{"classroom_practice":"CP-C1"}'::jsonb,
   '[{"setting":"ACAD","label":"OD/leave decisions on this person''s sessions: how many pending, and for how long"}]'::jsonb),
  ('CP-C2','Good work is defined upfront',1,
   'This Senior Learner tells us what good work looks like before we start — marks never feel like a surprise.',
   '{"classroom_practice":"CP-C2"}',
   '[{"setting":"ACAD","label":"Rubric or success criteria published before the assessment window opens"}]'),
  ('CP-C3','Rules come with reasons',1,
   'When this Senior Learner sets a rule or says no, we are told the reason.',
   '{"classroom_practice":"CP-C3"}',
   '[{"setting":"ACAD","label":"Session-feedback free-text: do learners report being told why?"}]'),
  -- Appreciation (group 2) — is effort noticed, and does noticing reach anyone?
  ('CP-A1','Permissions answered fast',2,
   'Requests and permissions get an answer quickly — we are not left waiting or chasing.',
   '{"classroom_practice":"CP-A1"}',
   '[{"setting":"ACAD","label":"Time from request to first answer on this person''s approvals queue"}]'),
  ('CP-A2','Struggling learners get follow-up',2,
   'When someone struggles in a session, this Senior Learner follows up with them afterwards.',
   '{"classroom_practice":"CP-A2"}',
   '[{"setting":"ACAD","label":"Low-understanding session-feedback rows and what happened next"}]'),
  ('CP-A3','Quiet learners re-engaged',2,
   'This Senior Learner notices quiet classmates and draws them back in, without embarrassing them.',
   '{"classroom_practice":"CP-A3"}',
   '[{"setting":"ACAD","label":"Spread of participation across the register, not just the usual voices"}]'),
  -- Respect (group 4) — dignity. Never machine-scored; the sealed drip is the
  -- only honest source, which is why this pillar carries the most items.
  ('CP-RS1','No public punishment',4,
   'Mistakes are corrected privately — nobody is shamed in front of the class.',
   '{"classroom_practice":"CP-RS1"}',
   '[{"setting":"ACAD","label":"Human-observed only — the sealed learner drip is the sole source"}]'),
  ('CP-RS2','Everyone treated the same',4,
   'This Senior Learner treats every learner the same, whoever they are.',
   '{"classroom_practice":"CP-RS2"}',
   '[{"setting":"ACAD","label":"Human-observed only — the sealed learner drip is the sole source"}]'),
  ('CP-RS3','Questions never cost marks',4,
   'Asking a question or admitting confusion never costs marks or goodwill with this Senior Learner.',
   '{"classroom_practice":"CP-RS3"}',
   '[{"setting":"ACAD","label":"Human-observed only — the sealed learner drip is the sole source"}]'),
  ('CP-RS4','Easy to ask in class',4,
   'It feels safe and easy to ask questions during this Senior Learner''s class.',
   '{"classroom_practice":"CP-RS4"}',
   '[{"setting":"ACAD","label":"Session-feedback checklist: doubts addressed, per session"}]'),
  ('CP-RS5','No running around for signatures',4,
   'Getting a signature or a no-dues clearance from this Senior Learner does not take repeated trips.',
   '{"classroom_practice":"CP-RS5"}',
   '[{"setting":"ACAD","label":"Clearance/no-dues turnaround attributable to this person"}]'),
  -- Empowerment (group 5) — does the session belong to the learners in it?
  ('CP-E1','Sessions are engaging',5,
   'This Senior Learner''s sessions keep me engaged — I am not just copying notes.',
   '{"classroom_practice":"CP-E1"}',
   '[{"setting":"ACAD","label":"Session-feedback understanding band across this person''s sessions"}]'),
  ('CP-E2','Feedback causes change',5,
   'When we give feedback about this class, something actually changes.',
   '{"classroom_practice":"CP-E2"}',
   '[{"setting":"ACAD","label":"Improvement suggestions raised from these sessions that received a human verdict"}]')
) AS v(code, name, grp, description, mapping, evidence)
WHERE NOT EXISTS (
  SELECT 1 FROM public.audit_parameter_catalog WHERE code LIKE 'CP-%'
);

-- ----------------------------------------------------------------------------
-- 2. Reveal index on the sibling's table.
--
--    idx_carre_micro_reveal is (teacher_email, parameter_code) on the RAW
--    column, so a case-insensitive predicate cannot use it. The compare below
--    must be case-insensitive (attendance-blob email vs profiles.email), so it
--    gets a matching expression index. Additive and IF NOT EXISTS — it does not
--    alter the sibling's table definition.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_carre_micro_reveal_lower
  ON public.carre_micro_impressions (lower(teacher_email), parameter_code);

-- ----------------------------------------------------------------------------
-- 3. fn_carre_create_classroom_audit — open a 13-item Classroom Practice cycle.
--
--    Any team member may open one on THEMSELVES. Opening one on someone ELSE
--    requires audit leadership — a peer cannot open an audit on a peer.
--
--    NO p_open_scoring PARAMETER (deliberate, and a change from the earlier
--    draft of this lane): learner input arrives through the SCF drip, so
--    participant_scoring_open is FALSE for every Classroom Practice cycle. A
--    parameter that can only ever take one value is a lie in the signature.
--
--    module_key is 'classroom-practice', deliberately ABSENT from
--    CARRE_AUDITABLE_MODULES: per-Senior-Learner cycles must not appear on the
--    module coverage map, which tracks platform modules.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_carre_create_classroom_audit(
  p_name          text,
  p_teacher_id    uuid DEFAULT NULL,
  p_re_audit_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_caller_role  text;
  v_owner        uuid;
  v_owner_role   text;
  v_institution  uuid;
  v_re_audit     date;
  v_owner_email  text;
  v_params       jsonb;
  v_cycle_id     uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  -- Caller must be a team member. 'student' is an existing DB role value, kept
  -- verbatim alongside 'learner' exactly as the sealed lane checks it.
  v_caller_role := COALESCE(get_current_user_role(), '');
  IF v_caller_role = '' OR v_caller_role IN ('student', 'learner') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'staff_only',
      'detail', 'Classroom Practice cycles are opened by team members.');
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) < 4 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_name');
  END IF;

  v_owner := COALESCE(p_teacher_id, v_uid);

  -- Opening a cycle on someone else is a leadership act. COALESCE keeps the
  -- guard NULL-safe: a NULL from any helper must read as "no", never fall
  -- through the IF.
  IF v_owner <> v_uid THEN
    IF NOT (COALESCE(is_super_admin(), false)
            OR COALESCE(is_admin(), false)
            OR COALESCE(user_has_permission('audit.cycle.manage'), false)) THEN
      RETURN jsonb_build_object('success', false, 'reason', 'not_allowed_for_other_teacher',
        'detail', 'Only audit leadership can open a Classroom Practice cycle on someone else.');
    END IF;
  END IF;

  SELECT p.role, p.institution_id, lower(nullif(trim(p.email), ''))
    INTO v_owner_role, v_institution, v_owner_email
  FROM public.profiles p WHERE p.id = v_owner;

  IF v_owner_role IS NULL OR v_owner_role IN ('student', 'learner') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'teacher_not_staff',
      'detail', 'A Classroom Practice cycle can only be opened on a team member.');
  END IF;

  -- The drip attributes every learner answer by email. Without one, no voice
  -- could ever reach this cycle, so refuse at creation rather than shipping a
  -- container that can only ever stay empty.
  IF v_owner_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'teacher_email_missing',
      'detail', 'This team member has no email on their profile, so learner answers could never be attributed to them.');
  END IF;

  -- Semester end is not knowable from here, so the default re-audit horizon is
  -- +120 days (roughly one teaching term). The caller can always override it.
  v_re_audit := COALESCE(p_re_audit_date, CURRENT_DATE + 120);
  IF v_re_audit < CURRENT_DATE THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_re_audit_date',
      'detail', 'Re-audit date must be today or later.');
  END IF;

  -- Freeze the 13 CP items into the cycle. The sheet reads ONLY the snapshot,
  -- so later catalog edits never rewrite a cycle already in flight.
  SELECT jsonb_agg(jsonb_build_object(
           'code', code,
           'name', name,
           'description', description,
           'parameter_group', parameter_group,
           'framework_mapping', framework_mapping,
           'evidence_required', evidence_required
         ) ORDER BY parameter_group, code)
    INTO v_params
  FROM public.audit_parameter_catalog
  WHERE code LIKE 'CP-%' AND is_system = true AND is_active = true;

  IF v_params IS NULL OR jsonb_array_length(v_params) <> 13 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'catalog_incomplete',
      'detail', 'Expected 13 Classroom Practice parameters in the catalog.');
  END IF;

  INSERT INTO public.audit_cycles
    (name, description, frameworks, start_date, end_date, lead_auditor_id,
     cosigner_roles, institution_ids, phase, module_key,
     participant_scoring_open, parameter_catalog_snapshot, created_by)
  VALUES
    (trim(p_name),
     NULL,
     ARRAY['CARRE'],
     CURRENT_DATE,
     v_re_audit,
     v_owner,
     ARRAY['hod','principal'],
     CASE WHEN v_institution IS NULL THEN NULL ELSE ARRAY[v_institution] END,
     'in-progress',
     'classroom-practice',
     false,          -- learner input is the SCF drip, never the sealed lane
     jsonb_build_object(
       'frozen_at', now(),
       'framework', 'CARRE',
       'catalog', 'CLASSROOM_PRACTICE',
       'version', '1.0',
       'setting_code', 'ACAD',
       'teacher_profile_id', v_owner,
       'teacher_email', v_owner_email,   -- frozen: the drip's attribution key
       'parameters', v_params
     ),
     v_uid)
  RETURNING id INTO v_cycle_id;

  RETURN jsonb_build_object('success', true, 'cycle_id', v_cycle_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_carre_create_classroom_audit(text, uuid, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_carre_create_classroom_audit(text, uuid, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_carre_create_classroom_audit IS
  'Classroom Practice: opens a 13-item CP cycle owned by one team member. Self-open is open to any team member; opening on someone else needs audit leadership. Freezes the CP catalog into parameter_catalog_snapshot with catalog=CLASSROOM_PRACTICE + teacher_profile_id, sets module_key=classroom-practice (deliberately off the module coverage map), and sets participant_scoring_open=false — learner input arrives through the SCF drip, not the sealed participant lane.';

-- ----------------------------------------------------------------------------
-- 4. fn_carre_search_teachers — the team-member picker behind the CP form.
--
--    Returns profiles.id (audit_cycles.lead_auditor_id references auth.users,
--    and profiles.id == auth.users.id 1:1). The staff table is NOT usable here:
--    staff.id is a different identifier space.
--
--    TENANT-SCOPED. profiles' RLS SELECT policy is not institution-scoped, so an
--    unscoped search would let any team member enumerate names and emails across
--    every institution. Cross-institution search is a super admin / admin
--    privilege; everyone else is pinned to their own institution, and a caller
--    with no institution on file gets an empty result rather than an unscoped
--    one. (Same reasoning as the schools-network staff search, PR #1745.)
--
--    sessions_90d reports the session-feedback exhaust for this person: it is
--    the drip's carrier, so a candidate with zero has no learners being asked
--    about them and their compare would stay empty.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_carre_search_teachers(p_q text)
RETURNS TABLE (
  profile_id   uuid,
  full_name    text,
  email        text,
  role         text,
  sessions_90d int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '8s'
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_role        text;
  v_institution uuid;
  v_cross       boolean;
  v_q           text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  v_role := COALESCE(get_current_user_role(), '');
  IF v_role = '' OR v_role IN ('student', 'learner') THEN
    RETURN;   -- the picker is a team-member surface
  END IF;

  v_q := trim(COALESCE(p_q, ''));
  IF length(v_q) < 2 THEN
    RETURN;   -- do not enumerate the directory on an empty query
  END IF;
  -- Neutralise LIKE wildcards so a typed query cannot widen its own scope.
  v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');

  v_cross := COALESCE(is_super_admin(), false) OR COALESCE(is_admin(), false);

  SELECT p.institution_id INTO v_institution
  FROM public.profiles p WHERE p.id = v_uid;

  IF NOT v_cross AND v_institution IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id,
         p.full_name,
         p.email,
         p.role,
         (SELECT count(*)::int
            FROM public.session_feedback sf
           WHERE sf.faculty_email IS NOT NULL
             AND lower(sf.faculty_email) = lower(p.email)
             AND sf.attendance_date >= CURRENT_DATE - 90)
  FROM public.profiles p
  WHERE COALESCE(p.role, '') NOT IN ('', 'student', 'learner')
    AND (p.full_name ILIKE '%' || v_q || '%' ESCAPE '\'
         OR p.email  ILIKE '%' || v_q || '%' ESCAPE '\')
    AND (v_cross OR p.institution_id = v_institution)
  ORDER BY p.full_name
  LIMIT 10;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_carre_search_teachers(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_carre_search_teachers(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_carre_search_teachers IS
  'Team-member picker for the Classroom Practice form. Returns profiles.id (NOT staff.id — audit_cycles.lead_auditor_id references auth.users). Institution-scoped unless super admin/admin; min 2-char query; max 10 rows. sessions_90d reports session-feedback exhaust, the drip''s carrier.';

-- ----------------------------------------------------------------------------
-- 5. fn_classroom_practice_compare — the owner-side reveal.
--
--    Returns the owner's own score beside the sealed learner median for the
--    same item, and NOTHING ELSE: no identities, no comments, no per-learner
--    answers, no rows below the k-floor.
--
--    Three gates, all server-side (see the header). The self-score gate returns
--    a NAMED reason rather than an empty result, so the UI can say which lock
--    is holding instead of showing an unexplained blank (rule #27).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_classroom_practice_compare(p_cycle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '8s'
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_cycle       record;
  v_owner_email text;
  v_item_count  int;
  v_self_count  int;
  v_cutoff      timestamptz := date_trunc('week', now());
  v_items       jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('locked', true, 'reason', 'not_authenticated');
  END IF;

  SELECT c.id, c.lead_auditor_id, c.start_date, c.parameter_catalog_snapshot
    INTO v_cycle
  FROM public.audit_cycles c
  WHERE c.id = p_cycle_id
    AND c.frameworks @> ARRAY['CARRE']::text[]
    AND c.parameter_catalog_snapshot ->> 'catalog' = 'CLASSROOM_PRACTICE';

  IF v_cycle.id IS NULL THEN
    RETURN jsonb_build_object('locked', true, 'reason', 'not_found');
  END IF;

  -- The cycle's owner, or audit leadership. NULL-safe on every helper.
  IF NOT (v_cycle.lead_auditor_id = v_uid
          OR COALESCE(is_super_admin(), false)
          OR COALESCE(is_admin(), false)
          OR COALESCE(user_has_permission('audit.cycle.view'), false)) THEN
    RETURN jsonb_build_object('locked', true, 'reason', 'forbidden');
  END IF;

  -- Frozen at cycle creation, so a later profile-email change cannot re-point a
  -- running cycle at someone else's voices. Already lower-cased when frozen.
  v_owner_email := v_cycle.parameter_catalog_snapshot ->> 'teacher_email';

  v_item_count := jsonb_array_length(
    COALESCE(v_cycle.parameter_catalog_snapshot -> 'parameters', '[]'::jsonb));

  SELECT count(*)::int INTO v_self_count
  FROM public.care_audit_scores s
  WHERE s.cycle_id = p_cycle_id
    AND s.scorer_role = 'owner';

  -- GATE 1 — self-score first. Without the owner's own reading on record, the
  -- learner medians are an answer key, not a comparison.
  IF v_item_count = 0 OR v_self_count < v_item_count THEN
    RETURN jsonb_build_object(
      'locked', true,
      'reason', 'self_score_incomplete',
      'item_count', v_item_count,
      'self_scored', v_self_count);
  END IF;

  -- GATES 2 and 3 — completed weeks only, and k >= 3 per item.
  WITH params AS (
    SELECT e ->> 'code' AS code, ord
    FROM jsonb_array_elements(v_cycle.parameter_catalog_snapshot -> 'parameters')
         WITH ORDINALITY AS t(e, ord)
  ),
  self AS (
    SELECT s.parameter_code, s.score
    FROM public.care_audit_scores s
    WHERE s.cycle_id = p_cycle_id AND s.scorer_role = 'owner'
  ),
  voice AS (
    SELECT mi.parameter_code,
           count(*)::int AS voices,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY mi.score)::numeric AS med
    FROM public.carre_micro_impressions mi
    WHERE v_owner_email IS NOT NULL
      AND lower(mi.teacher_email) = v_owner_email
      AND mi.score IS NOT NULL                      -- skips and unanswered offers never count
      AND mi.offered_at >= v_cycle.start_date::timestamptz
      AND mi.offered_at <  v_cutoff                 -- completed calendar weeks only
    GROUP BY mi.parameter_code
  )
  SELECT jsonb_agg(jsonb_build_object(
           'code', p.code,
           'self_score', s.score,
           'voices', COALESCE(v.voices, 0),
           'learner_median',
             CASE WHEN COALESCE(v.voices, 0) >= 3 THEN v.med ELSE NULL END
         ) ORDER BY p.ord)
    INTO v_items
  FROM params p
  LEFT JOIN self  s ON s.parameter_code = p.code
  LEFT JOIN voice v ON v.parameter_code = p.code;

  RETURN jsonb_build_object(
    'locked', false,
    'item_count', v_item_count,
    'self_scored', v_self_count,
    'week_cutoff', v_cutoff,
    'items', COALESCE(v_items, '[]'::jsonb));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_classroom_practice_compare(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_classroom_practice_compare(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_classroom_practice_compare IS
  'Classroom Practice owner-side reveal: the owner''s own score beside the sealed learner median per item, read from carre_micro_impressions (the SCF drip). Gated to the cycle owner or audit leadership. Three server-side invariants: self-score-first (locked until all items are self-scored), completed-calendar-weeks-only (offered_at < date_trunc(week, now()) — no live-updating medians), and k>=3 per item (below 3 voices the count is returned but the median is NULL). Aggregates only — never an identity, a comment, or a single answer.';

-- PostgREST schema-cache reload (new functions invisible to REST until this).
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- ASSERTS — Classroom Practice (catalog + teacher-side compare)
-- ============================================================================
-- Everything above this line is the migration itself. Everything below seeds
-- synthetic in-transaction fixtures, exercises every gate, and reports one row
-- per assertion. There is NO COMMIT anywhere in this file: the coordinator's
-- rolled-back session discards the catalog seed, the cycle, the self-scores and
-- every synthetic impression.
--
-- DEPENDENCY: public.carre_micro_impressions must exist — it is created by the
-- sibling migration 20260729184500_classroom_practice_l2_micro.sql, which the
-- coordinator applies (or rehearses in the same BEGIN..ROLLBACK) first.
--
-- Identity simulation is the pattern already proven in this project
-- (.claude/battery-lane-d.sql): set request.jwt.claims + SET LOCAL role, call
-- the function, RESET ROLE.
--
-- Every learner voice below is SYNTHETIC (gen_random_uuid learner ids against
-- the owner's own email). No real impression is read, written or disturbed.
-- ============================================================================

CREATE TEMP TABLE _r (test text, pass boolean, detail text);

DO $do$
DECLARE
  v_lead        uuid;   -- leadership identity
  v_owner       uuid;   -- team member whose practice is audited
  v_owner_email text;
  v_learner     uuid;   -- any learner profile (negative-path identity)
  v_cycle       uuid;
  v_snap        jsonb;
  v_codes       text[];
  v             jsonb;
  n             int;
  i             int;
  v_anon_locked boolean;
  v_last_week   timestamptz := date_trunc('week', now()) - interval '2 days';
  v_this_week   timestamptz := date_trunc('week', now()) + interval '1 hour';
BEGIN
  -- ── preflight ───────────────────────────────────────────────────────────
  IF to_regclass('public.carre_micro_impressions') IS NULL THEN
    RAISE EXCEPTION 'battery preflight: carre_micro_impressions missing — apply the L2 sibling migration first';
  END IF;

  SELECT id INTO v_lead FROM profiles WHERE email = 'test.superadmin@jkkn.ac.in';
  IF v_lead IS NULL THEN
    RAISE EXCEPTION 'battery preflight: test.superadmin@jkkn.ac.in missing';
  END IF;

  -- A non-leadership team member with an email (the compare joins on it).
  SELECT id, email INTO v_owner, v_owner_email
  FROM profiles
  WHERE COALESCE(role,'') NOT IN ('', 'student', 'learner',
                                  'super_admin', 'admin', 'administrator')
    AND COALESCE(is_super_admin, false) = false
    AND email IS NOT NULL
  LIMIT 1;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'battery preflight: no non-leadership team member with an email';
  END IF;

  SELECT id INTO v_learner FROM profiles
   WHERE COALESCE(role,'') IN ('student','learner') LIMIT 1;

  -- ── b01/b02: the catalog seeded exactly 13 CP items, right pillar spread ─
  SELECT count(*)::int INTO n FROM audit_parameter_catalog
   WHERE code LIKE 'CP-%' AND is_system AND is_active;
  INSERT INTO _r VALUES ('b01_catalog_is_13', n = 13, format('rows=%s', n));

  INSERT INTO _r VALUES ('b02_pillar_spread',
    (SELECT count(*) FILTER (WHERE parameter_group = 1) = 3
        AND count(*) FILTER (WHERE parameter_group = 2) = 3
        AND count(*) FILTER (WHERE parameter_group = 3) = 0
        AND count(*) FILTER (WHERE parameter_group = 4) = 5
        AND count(*) FILTER (WHERE parameter_group = 5) = 2
       FROM audit_parameter_catalog WHERE code LIKE 'CP-%'),
    'C=3 A=3 R=0 RS=5 E=2');

  -- ── b03-b05: create on SELF; the window is CLOSED by construction ───────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v := fn_carre_create_classroom_audit('[BATTERY] Classroom Practice self-open');
  EXECUTE 'RESET ROLE';
  v_cycle := (v ->> 'cycle_id')::uuid;
  INSERT INTO _r VALUES ('b03_create_self', (v ->> 'success')::boolean IS TRUE, v::text);

  SELECT parameter_catalog_snapshot INTO v_snap FROM audit_cycles WHERE id = v_cycle;
  INSERT INTO _r VALUES ('b04_snapshot_shape',
    v_snap ->> 'catalog' = 'CLASSROOM_PRACTICE'
      AND v_snap ->> 'framework' = 'CARRE'
      AND v_snap ->> 'version' = '1.0'
      AND (v_snap ->> 'teacher_profile_id')::uuid = v_owner
      AND v_snap ->> 'teacher_email' = lower(v_owner_email)
      AND jsonb_array_length(v_snap -> 'parameters') = 13,
    format('catalog=%s email=%s params=%s', v_snap ->> 'catalog',
           v_snap ->> 'teacher_email', jsonb_array_length(v_snap -> 'parameters')));

  -- b04b: the compare must read the FROZEN email, not re-resolve it. Change the
  -- owner's profile email and the running cycle must still find its voices.
  UPDATE profiles SET email = 'rotated-' || email WHERE id = v_owner;

  INSERT INTO _r VALUES ('b05_window_always_closed',
    (SELECT participant_scoring_open = false AND module_key = 'classroom-practice'
       FROM audit_cycles WHERE id = v_cycle),
    'participant_scoring_open=false, module_key=classroom-practice');

  -- ── b06: a peer cannot open a cycle on another team member ──────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v := fn_carre_create_classroom_audit('[BATTERY] on someone else', v_lead);
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('b06_peer_cannot_open_for_other',
    v ->> 'reason' = 'not_allowed_for_other_teacher', v::text);

  -- ── b07: a learner target is refused even for leadership ────────────────
  IF v_learner IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_lead, 'role','authenticated')::text, true);
    PERFORM set_config('role', 'authenticated', true);
    v := fn_carre_create_classroom_audit('[BATTERY] on a learner', v_learner);
    EXECUTE 'RESET ROLE';
    INSERT INTO _r VALUES ('b07_teacher_not_staff', v ->> 'reason' = 'teacher_not_staff', v::text);
  ELSE
    INSERT INTO _r VALUES ('b07_teacher_not_staff', NULL, 'SKIP: no learner profile found');
  END IF;

  -- ── synthetic drip voices, all against the owner's own email ────────────
  SELECT array_agg(e ->> 'code' ORDER BY ord) INTO v_codes
  FROM jsonb_array_elements(v_snap -> 'parameters') WITH ORDINALITY AS t(e, ord);

  -- CP-RS3: 3 answered voices LAST week -> reveals (median of 1,2,3 = 2)
  INSERT INTO carre_micro_impressions
    (learner_id, teacher_email, parameter_code, attendance_date, timetable_id,
     period_id, offered_at, answered_at, score)
  SELECT gen_random_uuid(), v_owner_email, 'CP-RS3', current_date - 7,
         gen_random_uuid(), 'p' || g, v_last_week, v_last_week, g
  FROM generate_series(1, 3) g;

  -- CP-C1: only 2 answered voices last week -> count shown, median withheld
  INSERT INTO carre_micro_impressions
    (learner_id, teacher_email, parameter_code, attendance_date, timetable_id,
     period_id, offered_at, answered_at, score)
  SELECT gen_random_uuid(), v_owner_email, 'CP-C1', current_date - 7,
         gen_random_uuid(), 'q' || g, v_last_week, v_last_week, 4
  FROM generate_series(1, 2) g;

  -- CP-C2: 5 answered voices but THIS week -> excluded entirely
  INSERT INTO carre_micro_impressions
    (learner_id, teacher_email, parameter_code, attendance_date, timetable_id,
     period_id, offered_at, answered_at, score)
  SELECT gen_random_uuid(), v_owner_email, 'CP-C2', current_date,
         gen_random_uuid(), 'r' || g, v_this_week, v_this_week, 0
  FROM generate_series(1, 5) g;

  -- CP-A1: 4 SKIPPED (score NULL) last week -> never counted
  INSERT INTO carre_micro_impressions
    (learner_id, teacher_email, parameter_code, attendance_date, timetable_id,
     period_id, offered_at, answered_at, score, skipped)
  SELECT gen_random_uuid(), v_owner_email, 'CP-A1', current_date - 7,
         gen_random_uuid(), 's' || g, v_last_week, v_last_week, NULL, true
  FROM generate_series(1, 4) g;

  -- ── b08/b09: locked until all 13 self-scores exist ──────────────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v := fn_classroom_practice_compare(v_cycle);
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('b08_locked_before_any_self_score',
    (v ->> 'locked')::boolean IS TRUE AND v ->> 'reason' = 'self_score_incomplete',
    v::text);

  FOR i IN 1..12 LOOP
    INSERT INTO care_audit_scores (cycle_id, parameter_code, scorer_id, scorer_role, score)
    VALUES (v_cycle, v_codes[i], v_owner, 'owner', 3);
  END LOOP;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v := fn_classroom_practice_compare(v_cycle);
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('b09_locked_at_12_of_13',
    (v ->> 'locked')::boolean IS TRUE AND (v ->> 'self_scored')::int = 12,
    v::text);

  -- ── b10: the 13th self-score unlocks the compare ────────────────────────
  INSERT INTO care_audit_scores (cycle_id, parameter_code, scorer_id, scorer_role, score)
  VALUES (v_cycle, v_codes[13], v_owner, 'owner', 4);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v := fn_classroom_practice_compare(v_cycle);
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('b10_unlocked_after_13',
    (v ->> 'locked')::boolean IS FALSE AND jsonb_array_length(v -> 'items') = 13,
    format('locked=%s items=%s', v ->> 'locked', jsonb_array_length(v -> 'items')));

  -- ── b10b: impressions offered BEFORE the cycle started never count ──────
  -- The cycle was created today, so every synthetic voice above predates it.
  -- A cycle reports on its own window, not on history that preceded it.
  INSERT INTO _r VALUES ('b10b_pre_cycle_impressions_excluded',
    (SELECT bool_and((it ->> 'voices')::int = 0)
       FROM jsonb_array_elements(v -> 'items') it),
    'every item reads 0 while the cycle starts today and all voices predate it');

  -- Now age the cycle so the completed-week assertions below have a window to
  -- read. Synthetic and in-transaction: this simulates a cycle that has been
  -- running for a month, which is the only state in which a compare is
  -- meaningful in the first place.
  UPDATE audit_cycles SET start_date = current_date - 30 WHERE id = v_cycle;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v := fn_classroom_practice_compare(v_cycle);
  EXECUTE 'RESET ROLE';

  -- ── b11/b12: k-floor — 3 voices reveal a median, 2 voices do not ───────
  INSERT INTO _r VALUES ('b11_k3_reveals_median',
    (SELECT (it ->> 'voices')::int = 3 AND (it ->> 'learner_median')::numeric = 2
       FROM jsonb_array_elements(v -> 'items') it
      WHERE it ->> 'code' = 'CP-RS3'),
    (SELECT it::text FROM jsonb_array_elements(v -> 'items') it
      WHERE it ->> 'code' = 'CP-RS3'));

  INSERT INTO _r VALUES ('b12_k2_withholds_median',
    (SELECT (it ->> 'voices')::int = 2 AND it ->> 'learner_median' IS NULL
       FROM jsonb_array_elements(v -> 'items') it
      WHERE it ->> 'code' = 'CP-C1'),
    (SELECT it::text FROM jsonb_array_elements(v -> 'items') it
      WHERE it ->> 'code' = 'CP-C1'));

  -- ── b13: the CURRENT week is excluded even at 5 voices ─────────────────
  INSERT INTO _r VALUES ('b13_current_week_excluded',
    (SELECT (it ->> 'voices')::int = 0 AND it ->> 'learner_median' IS NULL
       FROM jsonb_array_elements(v -> 'items') it
      WHERE it ->> 'code' = 'CP-C2'),
    (SELECT it::text FROM jsonb_array_elements(v -> 'items') it
      WHERE it ->> 'code' = 'CP-C2'));

  -- ── b14: skipped impressions never count ───────────────────────────────
  INSERT INTO _r VALUES ('b14_skips_never_count',
    (SELECT (it ->> 'voices')::int = 0
       FROM jsonb_array_elements(v -> 'items') it
      WHERE it ->> 'code' = 'CP-A1'),
    (SELECT it::text FROM jsonb_array_elements(v -> 'items') it
      WHERE it ->> 'code' = 'CP-A1'));

  -- ── b15: the owner's own score rides along for the gap calculation ─────
  INSERT INTO _r VALUES ('b15_self_score_returned',
    (SELECT (it ->> 'self_score')::int = 3
       FROM jsonb_array_elements(v -> 'items') it
      WHERE it ->> 'code' = v_codes[1]),
    'self_score present on the first item');

  -- ── b16: leadership can read the compare ───────────────────────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_lead, 'role','authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v := fn_classroom_practice_compare(v_cycle);
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('b16_leadership_path_works',
    (v ->> 'locked')::boolean IS FALSE AND jsonb_array_length(v -> 'items') = 13,
    format('locked=%s items=%s', v ->> 'locked', jsonb_array_length(v -> 'items')));

  -- ── b17: a stranger gets an explicit refusal, not data ─────────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role','authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v := fn_classroom_practice_compare(v_cycle);
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('b17_stranger_forbidden',
    (v ->> 'locked')::boolean IS TRUE AND v ->> 'reason' = 'forbidden', v::text);

  -- ── b18: the payload carries no identity and no free text ──────────────
  INSERT INTO _r VALUES ('b18_no_identity_leak',
    v::text NOT ILIKE '%learner_id%'
      AND v::text NOT ILIKE '%teacher_email%'
      AND v::text NOT ILIKE '%comment%',
    'payload carries only code/self_score/voices/learner_median');

  -- ── b19: the sealed participant lane is untouched by this migration ────
  INSERT INTO _r VALUES ('b19_participant_lane_untouched',
    (SELECT count(*)::int FROM pg_proc p
       JOIN pg_namespace ns ON ns.oid = p.pronamespace
      WHERE ns.nspname = 'public'
        AND p.proname IN ('fn_carre_participant_score','fn_carre_participant_context',
                          'fn_carre_participant_rollup')
        AND p.prosrc ILIKE '%CLASSROOM_PRACTICE%') = 0,
    'no participant RPC mentions CLASSROOM_PRACTICE');

  -- ── b20-b22: anon EXECUTE is locked on every function shipped here ─────
  BEGIN
    PERFORM set_config('role', 'anon', true);
    PERFORM fn_classroom_practice_compare(v_cycle);
    RAISE EXCEPTION 'ANON_NOT_LOCKED';
  EXCEPTION
    WHEN insufficient_privilege THEN v_anon_locked := true;
    WHEN raise_exception       THEN v_anon_locked := false;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('b20_anon_locked_compare', v_anon_locked,
    CASE WHEN v_anon_locked THEN 'permission denied as expected'
         ELSE 'LEAK: anon read the compare' END);

  BEGIN
    PERFORM set_config('role', 'anon', true);
    PERFORM fn_carre_create_classroom_audit('[BATTERY] anon');
    RAISE EXCEPTION 'ANON_NOT_LOCKED';
  EXCEPTION
    WHEN insufficient_privilege THEN v_anon_locked := true;
    WHEN raise_exception       THEN v_anon_locked := false;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('b21_anon_locked_create', v_anon_locked,
    CASE WHEN v_anon_locked THEN 'permission denied as expected'
         ELSE 'LEAK: anon opened a cycle' END);

  BEGIN
    PERFORM set_config('role', 'anon', true);
    PERFORM fn_carre_search_teachers('ab');
    RAISE EXCEPTION 'ANON_NOT_LOCKED';
  EXCEPTION
    WHEN insufficient_privilege THEN v_anon_locked := true;
    WHEN raise_exception       THEN v_anon_locked := false;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('b22_anon_locked_picker', v_anon_locked,
    CASE WHEN v_anon_locked THEN 'permission denied as expected'
         ELSE 'LEAK: anon searched the directory' END);

  -- ── b23: the picker refuses to enumerate the directory ─────────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO n FROM fn_carre_search_teachers('%');
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('b23_picker_wildcard_neutralised', n = 0, format('rows=%s', n));
END $do$;

-- Every function this migration ships must have anon EXECUTE revoked.
INSERT INTO _r
SELECT 'b24_no_anon_execute_' || p.proname,
       NOT has_function_privilege('anon', p.oid, 'EXECUTE'),
       'anon EXECUTE must be false'
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('fn_carre_create_classroom_audit',
                    'fn_carre_search_teachers',
                    'fn_classroom_practice_compare');

SELECT test,
       CASE WHEN pass IS NULL THEN 'SKIP' WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result,
       detail
FROM _r ORDER BY test;

SELECT count(*) FILTER (WHERE pass)          AS passed,
       count(*) FILTER (WHERE pass IS FALSE) AS failed,
       count(*) FILTER (WHERE pass IS NULL)  AS skipped,
       count(*)                              AS total
FROM _r;

-- NO COMMIT — the coordinator's rolled-back session discards everything above.
