-- ============================================================================
-- Accreditation — Employer + Alumni course feedback (the missing half of 1.2)
-- File: 20260726181500_stakeholder_course_feedback_surveys.sql
-- Date: 2026-07-26
--
-- WHY
--   NAAC 1.2 is "Stakeholder participation in curriculum design & review".
--   Live today (2026-07-26) that metric carries 13 auto evidence rows and ALL
--   13 come from ONE source: bos_meetings (minuted Board of Studies meetings —
--   PR #2412). That is the INTERNAL half. The EXTERNAL half — employers and
--   alumni being asked what they think of the learning framework — has no
--   substrate at all:
--     * zero files in jicate/main named *stakeholder-survey* / *employer-survey*
--       / *alumni-survey*; zero PRs (open or closed) for one
--     * app/api/b2a/stakeholder-nps/route.ts is a hard-coded stub returning
--       data:[] with _stub_reason 'NPS survey schema not finalized'
--     * accreditation_survey_consents = 0 rows (the DPDPA consent leg exists
--       but nothing has ever written to it)
--   So the people who hire our learners, and the learners who already left,
--   are never asked. This migration builds that half and wires it into the
--   SAME metric as a SECOND source.
--
-- SHAPE (director-chosen): ONE short form per audience per academic year,
--   opened BEFORE the syllabus-review meetings so answers can actually feed
--   those decisions, with a per-recipient roster so someone can chase the
--   people who have not replied. Deliberately not a survey builder.
--
-- HONEST GATING: a cycle emits evidence ONLY when it is closed AND at least
--   one response landed. No responses => no evidence row. Reopening withdraws.
--
-- METRIC PLACEMENT — 1.2 ONLY, and why 7.3.f is deliberately left unwired:
--   Live NAAC 7.3.f reads "Quality Assurance System — periodic stakeholder
--   satisfaction survey WITH FEEDBACK PROVIDED (facet f)". This lane collects
--   opinions but does not report anything back to the respondents, so mapping
--   it would fabricate evidence for a facet we do not satisfy. Same call
--   PR #2412 made when it refused to wire audit_cycles to 4.4.1.
--
-- EXISTING-STATE SURVEY (parallel-mechanism prevention, all verified live):
--   REUSED, not rebuilt:
--     * accreditation_survey_consents — the DPDPA 2023 consent table already
--       carries a NULLABLE alumni_email column, i.e. a slot for a respondent
--       with no profiles row. The public form writes a consent row there with
--       consent_version '1.0-2026-04-19' (the version the existing consent
--       page already issues), purpose 'accreditation_surveys',
--       legal_basis 'consent'. No consent schema change, no second consent UI.
--       Side effect worth knowing: the "alumni" stream of
--       /accreditation/naac/surveys/8.4-export keys on alumni_email and has
--       therefore always returned 0 rows — after this lands it will return
--       rows for the first time.
--     * quality_evidence_source_registry + quality_evidence_mappings — the
--       evidence spine (21 registry rows live). Trigger fan-out mirrored from
--       fn_sync_bos_meeting_evidence (PR #2412).
--     * public.fn_accreditation_ay_label(timestamptz) for period_label.
--     * ENUMS stakeholder_type (parent|learner|alumni|industry|staff) and
--       survey_status (draft|active|closed|archived) already exist — reused
--       instead of minting new types.
--     * fn_ops_evidence_cleanup_on_delete() (PR #2412) for AFTER DELETE.
--   AUDIENCE SOURCES (reused, no parallel contact list):
--     * alumni  -> learners_profiles WHERE lifecycle_status = 'graduated'
--       (1,106 live rows, all 1,106 have an email, across 7 institutions).
--       NOT alumni_outcomes: that table is empty (0 rows) but ALREADY has its
--       own registry row (learner_exit_outcome) and emitter
--       (emit_learner_exit_outcome_evidence) — sourcing from it would set up a
--       double-count. Chosen source recorded here so a later backfill of
--       alumni_outcomes does not silently create a second alumni roster.
--     * industry -> cdc_recruiters (5 live, 5 active, 0 blacklisted, only 2
--       with a primary_contact_email) + cdc_employer_requirements (3 live).
--       NOTE cdc_recruiters has NO institution_id — only is_internal +
--       internal_institution_id — so employer contacts are group-wide and an
--       employer roster is not institution-filtered. Documented, not "fixed".
--   NOT ADOPTED — nps_surveys / nps_responses / nps_analytics. They are
--     referenced by types/supabase.ts and NOTHING else (no page, service,
--     hook, API, function or migration in jicate/main), all three are empty,
--     and adopting them would import: EXECUTE-style table grants to anon, an
--     nps_analytics policy that is FOR ALL USING(true) with polroles={}
--     (= PUBLIC, includes anon), policies that hardcode profiles.role instead
--     of user_has_permission(), and a NOT NULL nps_score that forces an
--     NPS 0-10 shape plus respondent_email/name/ip on the answer row. Their
--     two enums are reused above; the tables are left alone. The anon grant
--     hole is PRE-EXISTING and needs its own security PR — not this lane.
--
-- PRIVACY (load-bearing — these are opinions from people OUTSIDE the
-- institution). Three tables instead of two, and the split IS the design:
--   * identity (email, name) lives ONLY on the invite row
--   * the answer row holds answers + a nullable invite_id and NOTHING else —
--     no email, no name, no IP, no user-agent
--   * therefore deleting an invite anonymises its answers permanently while
--     the counts that make up the evidence survive
--   * evidence metadata carries COUNTS AND MEANS ONLY. Free text never leaves
--     the permissioned admin view. Per-question means are SUPPRESSED entirely
--     below 5 responses (aggregate_suppressed=true) because a mean over 1-4
--     external respondents is simply that person's opinion, re-identifiable
--     from a roster of two employers.
--
-- PERIOD LABEL — verified live: fn_accreditation_ay_label(now()) returns
--   'AY 2026-27' and every existing NAAC 1.2 period_label is in that format
--   ('AY 2025-26', 'AY 2026-27'), whereas bos_meetings.academic_year text is
--   '2026-2027'. Emitting the cycle's own academic_year string would create a
--   THIRD label format on the same metric and break period grouping, so
--   period_label is derived via the function and academic_year is kept in
--   metadata. Consequence, measured during validation and intentional: the AY
--   cutover is June (fn(2027-05-01)='AY 2026-27', fn(2027-06-01)='AY 2027-28'),
--   so a cycle labelled academic_year '2027-2028' that closes in May 2027 lands
--   in period 'AY 2026-27'. That is correct for an evidence spine —
--   period_label answers "when did this evidence happen", while academic_year
--   answers "which year's review does it feed". The whole point of the shape is
--   that the survey runs BEFORE the meetings it informs, so the two differ by
--   design.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. One row per annual cycle. institution_id is NOT NULL because
--    quality_evidence_mappings.institution_id is NOT NULL — a cycle with no
--    institution could never emit (same contract PR #2412 used when it skipped
--    institution-less cdc_training_programmes rows). One cycle per
--    institution + body + audience + academic year.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accreditation_stakeholder_surveys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  body_code       text NOT NULL DEFAULT 'NAAC',
  audience        public.stakeholder_type NOT NULL,
  academic_year   text NOT NULL,
  title           text NOT NULL,
  questions       jsonb NOT NULL,
  status          public.survey_status NOT NULL DEFAULT 'draft',
  opens_at        timestamptz,
  closes_at       timestamptz,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accreditation_stakeholder_surveys_audience_chk
    CHECK (audience IN ('alumni', 'industry')),
  CONSTRAINT accreditation_stakeholder_surveys_window_chk
    CHECK (closes_at IS NULL OR opens_at IS NULL OR closes_at > opens_at),
  CONSTRAINT accreditation_stakeholder_surveys_unique_cycle
    UNIQUE (institution_id, body_code, audience, academic_year)
);

COMMENT ON TABLE public.accreditation_stakeholder_surveys IS
  'One short annual course-feedback cycle per institution x body x audience (alumni | industry). Emits NAAC 1.2 evidence once closed with >=1 response — the external half of stakeholder participation in the learning framework, complementing bos_meetings (the internal half).';
COMMENT ON COLUMN public.accreditation_stakeholder_surveys.questions IS
  'Frozen question set for this cycle: [{key,type:scale|text,label,min,max}]. Snapshotted at creation so later wording changes never retro-alter answered cycles.';
COMMENT ON COLUMN public.accreditation_stakeholder_surveys.academic_year IS
  'Human label for the cycle (e.g. 2027-2028). NOT used as evidence period_label — see fn_sync_stakeholder_survey_evidence, which derives the spine-consistent AY label via fn_accreditation_ay_label.';

CREATE INDEX IF NOT EXISTS idx_stakeholder_surveys_institution
  ON public.accreditation_stakeholder_surveys (institution_id, status);

-- ----------------------------------------------------------------------------
-- 2. The roster — the ONLY place personal data lives. Mirrors
--    care_scorer_invites (token + invited_email + expiry + created_by).
--    responded_at is both the chase view and the single-use guard.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accreditation_stakeholder_invites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id     uuid NOT NULL REFERENCES public.accreditation_stakeholder_surveys(id) ON DELETE CASCADE,
  token         text NOT NULL UNIQUE,
  invited_email text NOT NULL,
  invited_name  text,
  source_table  text,
  source_id     uuid,
  sent_at       timestamptz,
  responded_at  timestamptz,
  expires_at    timestamptz NOT NULL,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accreditation_stakeholder_invites_unique_email
    UNIQUE (survey_id, invited_email)
);

COMMENT ON TABLE public.accreditation_stakeholder_invites IS
  'Per-recipient roster for one stakeholder feedback cycle. Holds the ONLY copy of respondent identity (email/name) — the answer row does not. Deleting an invite permanently anonymises its response while preserving the counts the evidence row is built from. source_table/source_id record where the contact came from (learners_profiles | cdc_recruiters | cdc_employer_requirements) so no parallel contact list is created.';

CREATE INDEX IF NOT EXISTS idx_stakeholder_invites_survey
  ON public.accreditation_stakeholder_invites (survey_id, responded_at);

-- ----------------------------------------------------------------------------
-- 3. Answers only. No email, no name, no IP, no user-agent. invite_id is
--    ON DELETE SET NULL so removing the person keeps the count.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accreditation_stakeholder_responses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id    uuid NOT NULL REFERENCES public.accreditation_stakeholder_surveys(id) ON DELETE CASCADE,
  invite_id    uuid REFERENCES public.accreditation_stakeholder_invites(id) ON DELETE SET NULL,
  answers      jsonb NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.accreditation_stakeholder_responses IS
  'Answers to one stakeholder feedback cycle. Deliberately carries NO personal data — identity reaches these answers only through invite_id, so deleting the invite anonymises the answer permanently. Free text stays here behind the permissioned admin view and NEVER enters evidence metadata.';

CREATE INDEX IF NOT EXISTS idx_stakeholder_responses_survey
  ON public.accreditation_stakeholder_responses (survey_id);

-- ----------------------------------------------------------------------------
-- 4. RLS. Dynamic permissions only — no hardcoded role names. Zero anon
--    grants: every public read/write goes through the service-role API route.
--    Child tables scope through the parent cycle's institution.
-- ----------------------------------------------------------------------------
ALTER TABLE public.accreditation_stakeholder_surveys   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accreditation_stakeholder_invites   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accreditation_stakeholder_responses ENABLE ROW LEVEL SECURITY;

-- MANDATORY explicit revoke — this is the TABLE-level twin of the 2026-06-06
-- RPC anon-EXECUTE lockdown. Supabase ships
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon`, so a
-- freshly created table silently hands anon SELECT/INSERT/UPDATE/DELETE/
-- TRUNCATE/REFERENCES/TRIGGER (21 grants across these three tables, measured on
-- prod during the rolled-back validation of this very file). RLS alone is not
-- the whole answer: that inherited grant plus one careless permissive policy is
-- exactly the live hole nps_analytics has today (FOR ALL USING(true) with
-- polroles={}). These three tables hold opinions from people outside the
-- institution, and the public form reaches them via the service-role route
-- only, so anon needs nothing at all.
REVOKE ALL ON TABLE public.accreditation_stakeholder_surveys   FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.accreditation_stakeholder_invites   FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.accreditation_stakeholder_responses FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.accreditation_stakeholder_surveys   TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.accreditation_stakeholder_invites   TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.accreditation_stakeholder_responses TO authenticated, service_role;

DROP POLICY IF EXISTS stakeholder_surveys_select ON public.accreditation_stakeholder_surveys;
CREATE POLICY stakeholder_surveys_select ON public.accreditation_stakeholder_surveys
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.naac.surveys.stakeholder.view')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS stakeholder_surveys_insert ON public.accreditation_stakeholder_surveys;
CREATE POLICY stakeholder_surveys_insert ON public.accreditation_stakeholder_surveys
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.naac.surveys.stakeholder.manage')
      AND role_has_institution_access(institution_id))
);

-- Explicit UPDATE policy: without one, every UPDATE silently affects 0 rows.
DROP POLICY IF EXISTS stakeholder_surveys_update ON public.accreditation_stakeholder_surveys;
CREATE POLICY stakeholder_surveys_update ON public.accreditation_stakeholder_surveys
FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.naac.surveys.stakeholder.manage')
      AND role_has_institution_access(institution_id))
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.naac.surveys.stakeholder.manage')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS stakeholder_surveys_delete ON public.accreditation_stakeholder_surveys;
CREATE POLICY stakeholder_surveys_delete ON public.accreditation_stakeholder_surveys
FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.naac.surveys.stakeholder.manage')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS stakeholder_invites_select ON public.accreditation_stakeholder_invites;
CREATE POLICY stakeholder_invites_select ON public.accreditation_stakeholder_invites
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.naac.surveys.stakeholder.view')
      AND EXISTS (
        SELECT 1 FROM public.accreditation_stakeholder_surveys s
        WHERE s.id = survey_id AND role_has_institution_access(s.institution_id)
      ))
);

DROP POLICY IF EXISTS stakeholder_invites_insert ON public.accreditation_stakeholder_invites;
CREATE POLICY stakeholder_invites_insert ON public.accreditation_stakeholder_invites
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.naac.surveys.stakeholder.manage')
      AND EXISTS (
        SELECT 1 FROM public.accreditation_stakeholder_surveys s
        WHERE s.id = survey_id AND role_has_institution_access(s.institution_id)
      ))
);

DROP POLICY IF EXISTS stakeholder_invites_update ON public.accreditation_stakeholder_invites;
CREATE POLICY stakeholder_invites_update ON public.accreditation_stakeholder_invites
FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.naac.surveys.stakeholder.manage')
      AND EXISTS (
        SELECT 1 FROM public.accreditation_stakeholder_surveys s
        WHERE s.id = survey_id AND role_has_institution_access(s.institution_id)
      ))
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.naac.surveys.stakeholder.manage')
      AND EXISTS (
        SELECT 1 FROM public.accreditation_stakeholder_surveys s
        WHERE s.id = survey_id AND role_has_institution_access(s.institution_id)
      ))
);

-- Deleting an invite is the privacy lever (anonymise a respondent on request).
DROP POLICY IF EXISTS stakeholder_invites_delete ON public.accreditation_stakeholder_invites;
CREATE POLICY stakeholder_invites_delete ON public.accreditation_stakeholder_invites
FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.naac.surveys.stakeholder.manage')
      AND EXISTS (
        SELECT 1 FROM public.accreditation_stakeholder_surveys s
        WHERE s.id = survey_id AND role_has_institution_access(s.institution_id)
      ))
);

DROP POLICY IF EXISTS stakeholder_responses_select ON public.accreditation_stakeholder_responses;
CREATE POLICY stakeholder_responses_select ON public.accreditation_stakeholder_responses
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.naac.surveys.stakeholder.view')
      AND EXISTS (
        SELECT 1 FROM public.accreditation_stakeholder_surveys s
        WHERE s.id = survey_id AND role_has_institution_access(s.institution_id)
      ))
);

DROP POLICY IF EXISTS stakeholder_responses_insert ON public.accreditation_stakeholder_responses;
CREATE POLICY stakeholder_responses_insert ON public.accreditation_stakeholder_responses
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.naac.surveys.stakeholder.manage')
      AND EXISTS (
        SELECT 1 FROM public.accreditation_stakeholder_surveys s
        WHERE s.id = survey_id AND role_has_institution_access(s.institution_id)
      ))
);

DROP POLICY IF EXISTS stakeholder_responses_delete ON public.accreditation_stakeholder_responses;
CREATE POLICY stakeholder_responses_delete ON public.accreditation_stakeholder_responses
FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.naac.surveys.stakeholder.manage')
      AND EXISTS (
        SELECT 1 FROM public.accreditation_stakeholder_surveys s
        WHERE s.id = survey_id AND role_has_institution_access(s.institution_id)
      ))
);

-- ----------------------------------------------------------------------------
-- 5. Evidence source registry row — CONFIG, seeded WHERE NOT EXISTS
--    (ON CONFLICT fails 42P10 against this table's expression unique index).
-- ----------------------------------------------------------------------------
INSERT INTO public.quality_evidence_source_registry
  (source_kind, source_table, display_name, description, is_system)
SELECT 'stakeholder_survey', 'accreditation_stakeholder_surveys',
       'Employer & Alumni Course Feedback',
       'Closed annual employer/alumni feedback cycles with at least one response emit NAAC 1.2 evidence — the EXTERNAL half of stakeholder participation in the learning framework (bos_meetings supplies the internal half). Metadata carries counts, response rate and per-question means ONLY; means are suppressed below 5 responses and free text never leaves the permissioned admin view. Draft/active/archived cycles and closed cycles with zero responses emit nothing.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.quality_evidence_source_registry
  WHERE source_kind = 'stakeholder_survey'
     OR source_table = 'accreditation_stakeholder_surveys'
);

-- ----------------------------------------------------------------------------
-- 6. Emitter — mirrors fn_sync_bos_meeting_evidence (PR #2412) exactly.
--    Withdraws ONLY its own (body_code, metric_code) key: NAAC 1.2 already
--    carries 13 auto rows from bos_meetings, and a blanket "withdraw all auto
--    for 1.2" would delete the internal half of the very metric this lane
--    completes.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sync_stakeholder_survey_evidence(p_survey_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.accreditation_stakeholder_surveys%ROWTYPE;
  v_found     boolean;
  v_invited   integer := 0;
  v_responded integer := 0;
  v_means     jsonb;
  -- k-anonymity floor: a mean over 1-4 external respondents IS that person's
  -- opinion, and the employer roster is small enough to re-identify from.
  c_min_for_means constant integer := 5;
BEGIN
  SELECT * INTO s FROM public.accreditation_stakeholder_surveys WHERE id = p_survey_id;
  -- Capture FOUND immediately: every later SELECT INTO overwrites it (a
  -- count(*) always returns a row, so it always sets FOUND true).
  v_found := FOUND;

  -- Count ONLY for a cycle that could possibly emit. A draft or active cycle
  -- stops here, which is what makes the child-row triggers cheap: building a
  -- roster of 1,100 alumni fires 1,100 syncs that each do one indexed row read
  -- and no counting at all.
  IF v_found
     AND s.status = 'closed'
     AND EXISTS (SELECT 1 FROM public.institutions i WHERE i.id = s.institution_id) THEN
    SELECT count(*) INTO v_invited
    FROM public.accreditation_stakeholder_invites WHERE survey_id = s.id;

    SELECT count(*) INTO v_responded
    FROM public.accreditation_stakeholder_responses WHERE survey_id = s.id;
  END IF;

  -- Honest gating, in ONE test: v_responded is still 0 for a missing row, a
  -- non-closed cycle, a cycle whose institution does not exist, AND a closed
  -- cycle nobody answered. No responses means no evidence row.
  IF v_responded < 1 THEN
    -- Withdraw ONLY this emitter's key. source_table already scopes this to
    -- rows this emitter wrote (bos_meetings rows carry source_table
    -- 'bos_meetings' and can never match), and metric_code is pinned so a
    -- future second emitter on the same table is not clobbered. body_code is
    -- deliberately NOT pinned: when the row is missing, s.body_code is NULL
    -- and pinning it would make the withdraw a silent no-op.
    DELETE FROM public.quality_evidence_mappings
    WHERE source_table = 'accreditation_stakeholder_surveys'
      AND source_id = p_survey_id AND is_auto
      AND metric_code = '1.2';
    RETURN;
  END IF;

  -- Per-question means over the cycle's OWN frozen scale questions. Counts and
  -- means only — free text is never read into metadata.
  IF v_responded >= c_min_for_means THEN
    SELECT jsonb_object_agg(t.qk, t.mean) INTO v_means
    FROM (
      SELECT q.value->>'key' AS qk,
             round(avg((r.answers->>(q.value->>'key'))::numeric), 2) AS mean
      FROM jsonb_array_elements(s.questions) q
      JOIN public.accreditation_stakeholder_responses r ON r.survey_id = s.id
      WHERE q.value->>'type' = 'scale'
        AND jsonb_typeof(r.answers->(q.value->>'key')) = 'number'
      GROUP BY q.value->>'key'
    ) t;
  END IF;

  INSERT INTO public.quality_evidence_mappings (
    source_table, source_id, institution_id,
    body_code, metric_code, period_label,
    mapped_by, is_auto, metadata, mapped_at
  ) VALUES (
    'accreditation_stakeholder_surveys', s.id, s.institution_id,
    s.body_code, '1.2',
    public.fn_accreditation_ay_label(
      COALESCE(s.closes_at, s.opens_at, s.updated_at, s.created_at)
    ),
    NULL, true,
    jsonb_build_object(
      'audience',             s.audience::text,
      'academic_year',        s.academic_year,
      'title',                s.title,
      'invited_count',        v_invited,
      'responded_count',      v_responded,
      'response_rate_pct',    CASE WHEN v_invited > 0
                                   THEN round((v_responded::numeric * 100) / v_invited, 1)
                              END,
      'closed_at',            s.closes_at,
      'question_means',       COALESCE(v_means, '{}'::jsonb),
      'aggregate_suppressed', v_responded < c_min_for_means,
      'source_trigger',       'fn_sync_stakeholder_survey_evidence'
    ),
    now()
  )
  ON CONFLICT (source_table, source_id, body_code, metric_code) DO UPDATE
    SET institution_id = EXCLUDED.institution_id,
        period_label   = EXCLUDED.period_label,
        metadata       = EXCLUDED.metadata,
        is_auto        = true,
        mapped_at      = now()
    WHERE public.quality_evidence_mappings.is_auto;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_sync_stakeholder_survey_evidence(uuid) FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.fn_sync_stakeholder_survey_evidence(uuid) IS
  'Syncs one accreditation_stakeholder_surveys row into quality_evidence_mappings as the EXTERNAL half of NAAC 1.2. Qualifies only when status=closed AND >=1 response AND the institution exists; otherwise withdraws ONLY its own (body_code, 1.2) key so the bos_meetings half of the same metric is never clobbered. Metadata is counts + response rate + per-question means, with means suppressed entirely below 5 responses; respondent identity and free text never enter it. Manual (is_auto=false) mappings are never touched.';

CREATE OR REPLACE FUNCTION public.emit_stakeholder_survey_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_sync_stakeholder_survey_evidence(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.emit_stakeholder_survey_evidence() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_stakeholder_surveys_evidence_fanout ON public.accreditation_stakeholder_surveys;
CREATE TRIGGER trg_stakeholder_surveys_evidence_fanout
AFTER INSERT OR UPDATE ON public.accreditation_stakeholder_surveys
FOR EACH ROW
EXECUTE FUNCTION public.emit_stakeholder_survey_evidence();

DROP TRIGGER IF EXISTS trg_stakeholder_surveys_evidence_cleanup ON public.accreditation_stakeholder_surveys;
CREATE TRIGGER trg_stakeholder_surveys_evidence_cleanup
AFTER DELETE ON public.accreditation_stakeholder_surveys
FOR EACH ROW
EXECUTE FUNCTION public.fn_ops_evidence_cleanup_on_delete();

-- ----------------------------------------------------------------------------
-- 7. updated_at touch (so period_label/metadata refresh has a stable anchor).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_touch_stakeholder_survey_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_touch_stakeholder_survey_updated_at() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_stakeholder_surveys_touch ON public.accreditation_stakeholder_surveys;
CREATE TRIGGER trg_stakeholder_surveys_touch
BEFORE UPDATE ON public.accreditation_stakeholder_surveys
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_stakeholder_survey_updated_at();

-- ----------------------------------------------------------------------------
-- 8. Child-row re-sync. Without this the evidence row freezes at the counts it
--    held the moment the cycle was closed, and two promises this file makes
--    would be false:
--      * "deleting an invite is the privacy lever" — removing the last
--        respondent's answer row would leave an evidence row still claiming
--        responded_count = 1, i.e. evidence for responses that no longer
--        exist. Honest gating has to survive a deletion, not just an insert.
--      * "counts and means refresh" — a late response arriving in a reopened
--        cycle would never reach the metadata.
--    Cheap by construction: while a cycle is draft/active the sync fn returns
--    on its first guard, so the common path (a respondent submitting) costs one
--    guarded call and writes nothing.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emit_stakeholder_child_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_survey_id uuid;
BEGIN
  -- Branch on TG_OP: in a DELETE trigger NEW is unassigned and touching it
  -- raises, so COALESCE(NEW.x, OLD.x) is not safe here.
  IF TG_OP = 'DELETE' THEN
    v_survey_id := OLD.survey_id;
  ELSE
    v_survey_id := NEW.survey_id;
  END IF;

  PERFORM public.fn_sync_stakeholder_survey_evidence(v_survey_id);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.emit_stakeholder_child_evidence() FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.emit_stakeholder_child_evidence() IS
  'Re-syncs the parent cycle''s NAAC 1.2 evidence row when an invite or response is added or removed, so invited_count / responded_count / response_rate / means can never outlive the rows they were counted from. Writes only to quality_evidence_mappings (no recursion). Cascade-deleting the parent cycle also lands here — the sync then finds no cycle and withdraws, which is the same outcome as the parent AFTER DELETE cleanup.';

DROP TRIGGER IF EXISTS trg_stakeholder_invites_evidence_resync ON public.accreditation_stakeholder_invites;
CREATE TRIGGER trg_stakeholder_invites_evidence_resync
AFTER INSERT OR DELETE ON public.accreditation_stakeholder_invites
FOR EACH ROW
EXECUTE FUNCTION public.emit_stakeholder_child_evidence();

DROP TRIGGER IF EXISTS trg_stakeholder_responses_evidence_resync ON public.accreditation_stakeholder_responses;
CREATE TRIGGER trg_stakeholder_responses_evidence_resync
AFTER INSERT OR DELETE ON public.accreditation_stakeholder_responses
FOR EACH ROW
EXECUTE FUNCTION public.emit_stakeholder_child_evidence();
