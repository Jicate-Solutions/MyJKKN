-- ============================================================================
-- CARRE Audit Framework v2.0 — additive upgrade of the CARE audit module
-- Framework doc: JKKN-CARRE-Audit-Framework.md (v2.0, July 2026)
-- Spec: specs/carre-v2-upgrade-spec-2026-07-05.md
--
-- ADDITIVE-ONLY. This migration NEVER edits, DROPs, or CREATE OR REPLACEs any
-- v1 CARE function or table. The v1 CARE family (its 20 CARE-* catalog rows,
-- its math module, every historical CARE audit) is left byte-for-byte intact.
-- A NEW parallel family of fn_carre_* functions is created beside it.
--
-- The two score-storage tables (care_audit_scores, care_scorer_invites) are
-- already framework-agnostic (they key on cycle_id + parameter_code and
-- validate parameter_code against the frozen snapshot, not a CARE-% prefix),
-- so they are REUSED unchanged. The token-gated participant RPCs
-- (invite-context / submit-participant-scores) are likewise framework-agnostic
-- — they resolve the cycle via the invite and never filter on `frameworks` —
-- so the CARRE participant flow reuses them directly with no new function.
--
-- What this migration does:
--   1. Widen audit_parameter_catalog.parameter_group CHECK (1..4) -> (1..5)
--      for the Respect pillar. Backward-compatible: all existing rows valid.
--   2. Seed 25 CARRE-* catalog rows (5 pillars incl. Respect); evidence
--      anchors carry the four setting codes (ACAD/CLIN/ADMIN/EVENT).
--   3. Six NEW fn_carre_* SECURITY DEFINER RPCs (create/is-owner/list/get/
--      upsert-score/create-invite) — exact mirrors of the CARE-family bodies
--      with the framework gate flipped to CARRE.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Widen the pillar CHECK to admit pillar 5 (Respect).
--    The original CHECK (parameter_group IN (1,2,3,4)) was defined in
--    20260422_audit_workflow_substrate.sql; its exact constraint name is not
--    assumed here. This DO block finds whatever CHECK constraint on the table
--    references parameter_group, drops it, and adds the widened one under a
--    canonical name. Idempotent: a re-run drops the just-added constraint (it
--    also references parameter_group) and re-adds it.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_conname text;
BEGIN
  FOR v_conname IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'audit_parameter_catalog'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%parameter_group%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.audit_parameter_catalog DROP CONSTRAINT %I', v_conname);
  END LOOP;

  ALTER TABLE public.audit_parameter_catalog
    ADD CONSTRAINT audit_parameter_catalog_parameter_group_check
    CHECK (parameter_group IN (1, 2, 3, 4, 5));
END $$;

-- ----------------------------------------------------------------------------
-- 2. Catalog seed — 25 CARRE items (institution_id NULL, system rows).
--    parameter_group: C=1 A=2 R=3 RS=4(Respect) E=5   (pillar derives from the
--    CODE PREFIX in the math module; parameter_group is stored for the catalog
--    UI/coverage badges only). evidence_required carries a per-setting anchor
--    array: [{"setting":"ACAD","label":"…"}, …].
--    Guarded by NOT EXISTS so re-runs are idempotent.
-- ----------------------------------------------------------------------------
INSERT INTO public.audit_parameter_catalog
  (code, name, parameter_group, description, framework_mapping,
   default_owner_role, escalation_role, evidence_required, is_system, is_active)
SELECT v.code, v.name, v.grp, v.description, v.mapping,
       'hod', 'principal', v.evidence, true, true
FROM (
  VALUES
  -- Pillar C — Clarity (group 1)
  ('CARRE-C1','One-sentence purpose',1::smallint,
   'A first-time participant can state what this initiative is for after a single exposure.',
   '{"carre":"C1"}'::jsonb,
   '[{"setting":"ACAD","label":"Course purpose statement"},{"setting":"CLIN","label":"Rotation objectives card"},{"setting":"ADMIN","label":"Process one-liner in MyJKKN"},{"setting":"EVENT","label":"Event brief"}]'::jsonb),
  ('CARRE-C2','Explicit success criteria',1,
   'Expected outcomes, rubrics, or completion standards are published before participation begins.',
   '{"carre":"C2"}',
   '[{"setting":"ACAD","label":"Rubric in CAMU"},{"setting":"CLIN","label":"Competency checklist / quota sheet"},{"setting":"ADMIN","label":"SLA"},{"setting":"EVENT","label":"Judging criteria published pre-event"}]'),
  ('CARRE-C3','Unambiguous roles',1,
   'Every participant knows what they do, what others do, and who decides.',
   '{"carre":"C3"}',
   '[{"setting":"ACAD","label":"Supervision hierarchy stated"},{"setting":"CLIN","label":"Supervision hierarchy stated"},{"setting":"ADMIN","label":"RACI"},{"setting":"EVENT","label":"Org chart; absence of who-handles-this in Chat"}]'),
  ('CARRE-C4','Visible "why it matters"',1,
   'The link to the participant''s own stake — exam, license, career, placement, mission — is communicated, not assumed.',
   '{"carre":"C4"}',
   '[{"setting":"ACAD","label":"Outcome->NEET/placement map"},{"setting":"CLIN","label":"Case->competency->license map"},{"setting":"ADMIN","label":"Process->audit/NAAC link"},{"setting":"EVENT","label":"Participation->portfolio link"}]'),
  ('CARRE-C5','Current timelines and next actions',1,
   'Steps, deadlines, and what-happens-next are published and up to date.',
   '{"carre":"C5"}',
   '[{"setting":"ACAD","label":"Live schedule, last-updated within cycle"},{"setting":"CLIN","label":"Live schedule, last-updated within cycle"},{"setting":"ADMIN","label":"Live schedule, last-updated within cycle"},{"setting":"EVENT","label":"Live schedule, last-updated within cycle"}]'),
  -- Pillar A — Appreciation (group 2)
  ('CARRE-A1','Frequent informal acknowledgment',2,
   'Effort is noticed at a defined cadence (weekly or per-milestone), not only at endpoints.',
   '{"carre":"A1"}',
   '[{"setting":"ACAD","label":"Studio spotlights"},{"setting":"CLIN","label":"End-of-clinic debrief includes one acknowledgment"},{"setting":"ADMIN","label":"Weekly team shout-out"},{"setting":"EVENT","label":"Volunteer recognition ritual"}]'),
  ('CARRE-A2','Process-specific feedback',2,
   'Praise names the behavior or approach ("your isolation technique was meticulous"), not the person ("you''re brilliant").',
   '{"carre":"A2"}',
   '[{"setting":"ACAD","label":"Sample of actual feedback messages"},{"setting":"CLIN","label":"Sample of actual feedback messages"},{"setting":"ADMIN","label":"Sample of actual feedback messages"},{"setting":"EVENT","label":"Sample of actual feedback messages"}]'),
  ('CARRE-A3','Fast feedback loops',2,
   'Time from submission/contribution to first acknowledgment is days, not weeks.',
   '{"carre":"A3"}',
   '[{"setting":"ACAD","label":"Assessment turnaround"},{"setting":"CLIN","label":"Same-session case feedback"},{"setting":"ADMIN","label":"Proposal response time"},{"setting":"EVENT","label":"Post-event thanks within 48h"}]'),
  ('CARRE-A4','Coverage of the median',2,
   'Appreciation reaches typical participants, not only top performers.',
   '{"carre":"A4"}',
   '[{"setting":"ACAD","label":"% of participants acknowledged this cycle"},{"setting":"CLIN","label":"% of participants acknowledged this cycle"},{"setting":"ADMIN","label":"% of participants acknowledged this cycle"},{"setting":"EVENT","label":"% of participants acknowledged this cycle"}]'),
  ('CARRE-A5','Two-way appreciation',2,
   'Participants have a sanctioned channel to appreciate facilitators/organizers, and it is used.',
   '{"carre":"A5"}',
   '[{"setting":"ACAD","label":"Appreciation field in feedback forms; peer-shoutout"},{"setting":"CLIN","label":"Appreciation field in feedback forms; peer-shoutout"},{"setting":"ADMIN","label":"Appreciation field in feedback forms; peer-shoutout"},{"setting":"EVENT","label":"Appreciation field in feedback forms; peer-shoutout"}]'),
  -- Pillar R — Recognition (group 3)
  ('CARRE-R1','Defined recognition surfaces',3,
   'Named, scheduled mechanisms exist (showcases, tiers, badges, awards, certificates).',
   '{"carre":"R1"}',
   '[{"setting":"ACAD","label":"Showcase calendar"},{"setting":"CLIN","label":"Case-of-the-month"},{"setting":"ADMIN","label":"Staff recognition cycle"},{"setting":"EVENT","label":"Award categories"}]'),
  ('CARRE-R2','Progress recognition, not just peaks',3,
   'Improvement and consistency are recognized, not only wins and toppers.',
   '{"carre":"R2"}',
   '[{"setting":"ACAD","label":"Most-improved categories, adoption tiers, streaks"},{"setting":"CLIN","label":"Most-improved categories, adoption tiers, streaks"},{"setting":"ADMIN","label":"Most-improved categories, adoption tiers, streaks"},{"setting":"EVENT","label":"Most-improved categories, adoption tiers, streaks"}]'),
  ('CARRE-R3','Distribution beyond the top decile',3,
   'Recognition reaches a broad base; not tournament-only.',
   '{"carre":"R3"}',
   '[{"setting":"ACAD","label":"% recognized per cycle (target >25%)"},{"setting":"CLIN","label":"% recognized per cycle (target >25%)"},{"setting":"ADMIN","label":"% recognized per cycle (target >25%)"},{"setting":"EVENT","label":"% recognized per cycle (target >25%)"}]'),
  ('CARRE-R4','Public and attributable',3,
   'Recognition is visible to peers and names the person and the specific contribution.',
   '{"carre":"R4"}',
   '[{"setting":"ACAD","label":"Public channels / boards / #JKKN100 naming individuals"},{"setting":"CLIN","label":"Public channels / boards / #JKKN100 naming individuals"},{"setting":"ADMIN","label":"Public channels / boards / #JKKN100 naming individuals"},{"setting":"EVENT","label":"Public channels / boards / #JKKN100 naming individuals"}]'),
  ('CARRE-R5','Recognition feeds forward',3,
   'Being recognized leads somewhere — portfolio, LinkedIn artifact, NIF pipeline, role advancement, Good Teacher Award trail.',
   '{"carre":"R5"}',
   '[{"setting":"ACAD","label":"Documented pathway recognition->opportunity"},{"setting":"CLIN","label":"Documented pathway recognition->opportunity"},{"setting":"ADMIN","label":"Documented pathway recognition->opportunity"},{"setting":"EVENT","label":"Documented pathway recognition->opportunity"}]'),
  -- Pillar RS — Respect (group 4)  [NEW in v2.0]
  ('CARRE-RS1','Dignity in correction',4,
   'Errors are corrected privately or constructively; never by public humiliation. A stated norm exists and is followed.',
   '{"carre":"RS1"}',
   '[{"setting":"ACAD","label":"Correction norms in Studio charter"},{"setting":"CLIN","label":"No correction of Learners in front of patients; chairside norms stated"},{"setting":"ADMIN","label":"Performance feedback in private"},{"setting":"EVENT","label":"Mistakes handled offstage"}]'),
  ('CARRE-RS2','Psychological safety to speak',4,
   'Participants can ask questions, admit uncertainty, and report problems without penalty — and do so.',
   '{"carre":"RS2"}',
   '[{"setting":"ACAD","label":"Question rate in sessions"},{"setting":"CLIN","label":"Learners voice doubts before procedures; near-miss reporting exists"},{"setting":"ADMIN","label":"Staff raise process flaws"},{"setting":"EVENT","label":"Volunteers flag issues early"}]'),
  ('CARRE-RS3','Respectful address and tone',4,
   'Participants are addressed by name, without demeaning language, sarcasm as discipline, or status-based dismissiveness — across hierarchy.',
   '{"carre":"RS3"}',
   '[{"setting":"ACAD","label":"Observed interactions; Chat tone; no derogatory nicknames"},{"setting":"CLIN","label":"Observed interactions; Chat tone; no derogatory nicknames"},{"setting":"ADMIN","label":"Observed interactions; Chat tone; no derogatory nicknames"},{"setting":"EVENT","label":"Observed interactions; Chat tone; no derogatory nicknames"}]'),
  ('CARRE-RS4','Respect for time and boundaries',4,
   'Schedules are honored, waiting is minimized and explained, personal time and reasonable limits are protected.',
   '{"carre":"RS4"}',
   '[{"setting":"ACAD","label":"Sessions start/end on time"},{"setting":"CLIN","label":"Duty rosters honored, breaks protected"},{"setting":"ADMIN","label":"Meetings scheduled with notice"},{"setting":"EVENT","label":"Rehearsal/volunteer hours bounded"}]'),
  ('CARRE-RS5','Working channel for disrespect',4,
   'A known, safe, responsive mechanism exists to report disrespect, and it demonstrably resolves cases.',
   '{"carre":"RS5"}',
   '[{"setting":"ACAD","label":"Named channel (Learners Council/grievance/anon form); >=1 resolved case/cycle with outcome communicated"},{"setting":"CLIN","label":"Named channel; >=1 resolved case/cycle with outcome communicated"},{"setting":"ADMIN","label":"Named channel; >=1 resolved case/cycle with outcome communicated"},{"setting":"EVENT","label":"Named channel; >=1 resolved case/cycle with outcome communicated"}]'),
  -- Pillar E — Empowerment (group 5)
  ('CARRE-E1','Meaningful choice',5,
   'Participants choose at least one substantive dimension: topic, format, pacing, team, or tool.',
   '{"carre":"E1"}',
   '[{"setting":"ACAD","label":"Choice-based assessment"},{"setting":"CLIN","label":"Case selection within competency bounds"},{"setting":"ADMIN","label":"Method autonomy"},{"setting":"EVENT","label":"Role self-selection"}]'),
  ('CARRE-E2','Ownership of real output',5,
   'Participants produce something with their name on it that exists beyond the initiative.',
   '{"carre":"E2"}',
   '[{"setting":"ACAD","label":"AI Production House outputs"},{"setting":"CLIN","label":"Case reports, presentations"},{"setting":"ADMIN","label":"Process improvements credited"},{"setting":"EVENT","label":"Deliverables attributed"}]'),
  ('CARRE-E3','Decision authority',5,
   'Some decisions are genuinely delegated — participants decide without approval, within stated bounds.',
   '{"carre":"E3"}',
   '[{"setting":"ACAD","label":"Delegation matrix; participant decisions that stood"},{"setting":"CLIN","label":"Delegation matrix; participant decisions that stood"},{"setting":"ADMIN","label":"Delegation matrix; participant decisions that stood"},{"setting":"EVENT","label":"Delegation matrix; participant decisions that stood"}]'),
  ('CARRE-E4','Tools as agents',5,
   'Participants are given capable tools (AI, platforms, budgets) and trusted to operate them as Principals.',
   '{"carre":"E4"}',
   '[{"setting":"ACAD","label":"Gemini/NotebookLM creation rights; sandbox; micro-budgets"},{"setting":"CLIN","label":"Gemini/NotebookLM creation rights; sandbox; micro-budgets"},{"setting":"ADMIN","label":"Gemini/NotebookLM creation rights; sandbox; micro-budgets"},{"setting":"EVENT","label":"Gemini/NotebookLM creation rights; sandbox; micro-budgets"}]'),
  ('CARRE-E5','Voice changes the system',5,
   'Participant feedback has visibly altered the initiative at least once per cycle, announced as such.',
   '{"carre":"E5"}',
   '[{"setting":"ACAD","label":"You said, we changed log; Learners Council closed-loop"},{"setting":"CLIN","label":"You said, we changed log; Learners Council closed-loop"},{"setting":"ADMIN","label":"You said, we changed log; Learners Council closed-loop"},{"setting":"EVENT","label":"You said, we changed log; Learners Council closed-loop"}]')
) AS v(code, name, grp, description, mapping, evidence)
WHERE NOT EXISTS (
  SELECT 1 FROM public.audit_parameter_catalog WHERE code LIKE 'CARRE-%'
);

-- ----------------------------------------------------------------------------
-- 3. RPCs (all SECURITY DEFINER; anon EXECUTE explicitly revoked per the
--    mandatory template). These are NEW parallel functions — they do not
--    touch any v1 CARE function. The only structural differences from the
--    CARE-family bodies are: the framework gate is CARRE, create validates a
--    setting code + a 25-item catalog and freezes version 2.0.
-- ----------------------------------------------------------------------------

-- Helper: is the caller the lead auditor (owner) of this CARRE cycle?
CREATE OR REPLACE FUNCTION public.fn_carre_is_cycle_owner(p_cycle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.audit_cycles c
    WHERE c.id = p_cycle_id
      AND c.frameworks @> ARRAY['CARRE']::text[]
      AND c.lead_auditor_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_carre_is_cycle_owner(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_carre_is_cycle_owner(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- fn_carre_create_audit — any STAFF member opens a CARRE audit on their own
-- initiative. Freezes the 25 CARRE parameters + the setting code into a
-- version 2.0 snapshot (framework versioning — catalog edits never rewrite
-- old audits).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_carre_create_audit(
  p_name text,
  p_audience text,
  p_setting_code text,          -- 'ACAD' | 'CLIN' | 'ADMIN' | 'EVENT'
  p_re_audit_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
  v_institution uuid;
  v_params jsonb;
  v_cycle_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  SELECT role, institution_id INTO v_role, v_institution
  FROM public.profiles WHERE id = auth.uid();

  IF v_role IS NULL OR v_role = 'student' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'staff_only',
      'detail', 'CARRE audits are opened by staff initiative owners.');
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) < 4 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_name');
  END IF;

  IF p_setting_code IS NULL OR p_setting_code NOT IN ('ACAD','CLIN','ADMIN','EVENT') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_setting',
      'detail', 'Setting must be ACAD, CLIN, ADMIN, or EVENT.');
  END IF;

  IF p_re_audit_date IS NULL OR p_re_audit_date < CURRENT_DATE THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_re_audit_date',
      'detail', 'Re-audit date must be today or later.');
  END IF;

  -- Freeze the 25 CARRE items (full definitions — the scoring UI reads ONLY
  -- the snapshot, so scorers never need audit.parameter.view permission).
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
  WHERE code LIKE 'CARRE-%' AND is_system = true AND is_active = true;

  IF v_params IS NULL OR jsonb_array_length(v_params) <> 25 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'catalog_incomplete',
      'detail', 'Expected 25 CARRE parameters in the catalog.');
  END IF;

  INSERT INTO public.audit_cycles
    (name, description, frameworks, start_date, end_date, lead_auditor_id,
     cosigner_roles, institution_ids, phase, parameter_catalog_snapshot, created_by)
  VALUES
    (trim(p_name), nullif(trim(coalesce(p_audience, '')), ''), ARRAY['CARRE'],
     CURRENT_DATE, p_re_audit_date, auth.uid(),
     ARRAY['cao','ceo'],
     CASE WHEN v_institution IS NULL THEN NULL ELSE ARRAY[v_institution] END,
     'in-progress',
     jsonb_build_object(
       'frozen_at', now(),
       'framework', 'CARRE',
       'version', '2.0',
       'setting_code', p_setting_code,
       'parameters', v_params
     ),
     auth.uid())
  RETURNING id INTO v_cycle_id;

  RETURN jsonb_build_object('success', true, 'cycle_id', v_cycle_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_carre_create_audit(text, text, text, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_carre_create_audit(text, text, text, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_carre_create_audit IS
  'CARRE Audit v2: staff opens a 25-item CARRE audit (frameworks=[CARRE], v2.0 snapshot incl. Respect pillar + setting code). Spec: specs/carre-v2-upgrade-spec-2026-07-05.md';

-- ---------------------------------------------------------------------------
-- fn_carre_list_audits — owner sees own audits; leadership (audit.cycle.view /
-- admin / super_admin) sees every CARRE audit. Feeds the dashboard section.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_carre_list_audits()
RETURNS TABLE (
  cycle_id uuid,
  name text,
  audience text,
  phase text,
  re_audit_date date,
  created_at timestamptz,
  owner_id uuid,
  owner_name text,
  owner_scores jsonb,
  participant_submitted boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    c.id,
    c.name,
    c.description,
    c.phase,
    c.end_date,
    c.created_at,
    c.lead_auditor_id,
    p.full_name,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('parameter_code', s.parameter_code, 'score', s.score))
      FROM public.care_audit_scores s
      WHERE s.cycle_id = c.id AND s.scorer_role = 'owner'
    ), '[]'::jsonb),
    EXISTS (
      SELECT 1 FROM public.care_audit_scores s
      WHERE s.cycle_id = c.id AND s.scorer_role = 'participant'
    )
  FROM public.audit_cycles c
  LEFT JOIN public.profiles p ON p.id = c.lead_auditor_id
  WHERE c.frameworks @> ARRAY['CARRE']::text[]
    AND auth.uid() IS NOT NULL
    AND (
      c.lead_auditor_id = auth.uid()
      OR c.created_by = auth.uid()
      OR is_super_admin() OR is_admin()
      OR user_has_permission('audit.cycle.view')
    )
  ORDER BY c.end_date ASC, c.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_carre_list_audits() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_carre_list_audits() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- fn_carre_get_audit — full audit view for the OWNER / leadership: cycle,
-- snapshot (framework/version/setting_code), all scores, active invite.
-- Participants use the token-gated context fn instead (blind scoring).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_carre_get_audit(p_cycle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cycle record;
  v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  SELECT c.*, p.full_name AS owner_name INTO v_cycle
  FROM public.audit_cycles c
  LEFT JOIN public.profiles p ON p.id = c.lead_auditor_id
  WHERE c.id = p_cycle_id AND c.frameworks @> ARRAY['CARRE']::text[];

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found');
  END IF;

  v_allowed := v_cycle.lead_auditor_id = auth.uid()
    OR v_cycle.created_by = auth.uid()
    OR is_super_admin() OR is_admin()
    OR user_has_permission('audit.cycle.view');

  IF NOT v_allowed THEN
    RETURN jsonb_build_object('success', false, 'reason', 'forbidden');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'is_owner', v_cycle.lead_auditor_id = auth.uid(),
    'cycle', jsonb_build_object(
      'id', v_cycle.id,
      'name', v_cycle.name,
      'audience', v_cycle.description,
      'phase', v_cycle.phase,
      'start_date', v_cycle.start_date,
      're_audit_date', v_cycle.end_date,
      'owner_id', v_cycle.lead_auditor_id,
      'owner_name', v_cycle.owner_name,
      'created_at', v_cycle.created_at
    ),
    'snapshot', v_cycle.parameter_catalog_snapshot,
    'scores', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'parameter_code', s.parameter_code,
        'scorer_role', s.scorer_role,
        'scorer_id', s.scorer_id,
        'score', s.score,
        'evidence_note', s.evidence_note,
        'updated_at', s.updated_at
      ) ORDER BY s.parameter_code)
      FROM public.care_audit_scores s WHERE s.cycle_id = p_cycle_id
    ), '[]'::jsonb),
    'invite', (
      SELECT jsonb_build_object(
        'token', i.token,
        'invited_email', i.invited_email,
        'expires_at', i.expires_at,
        'accepted_by', i.accepted_by
      )
      FROM public.care_scorer_invites i
      WHERE i.cycle_id = p_cycle_id AND i.expires_at > now()
      ORDER BY i.created_at DESC
      LIMIT 1
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_carre_get_audit(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_carre_get_audit(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- fn_carre_upsert_score — owner scores one CARRE item (0–4 + evidence note).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_carre_upsert_score(
  p_cycle_id uuid,
  p_parameter_code text,
  p_score smallint,
  p_evidence_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cycle record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  SELECT id, phase, parameter_catalog_snapshot INTO v_cycle
  FROM public.audit_cycles
  WHERE id = p_cycle_id
    AND frameworks @> ARRAY['CARRE']::text[]
    AND lead_auditor_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_owner');
  END IF;

  IF v_cycle.phase = 'closed' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'cycle_closed');
  END IF;

  IF p_score IS NULL OR p_score < 0 OR p_score > 4 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_score');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_cycle.parameter_catalog_snapshot -> 'parameters') e
    WHERE e ->> 'code' = p_parameter_code
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unknown_parameter');
  END IF;

  INSERT INTO public.care_audit_scores
    (cycle_id, parameter_code, scorer_id, scorer_role, score, evidence_note)
  VALUES
    (p_cycle_id, p_parameter_code, auth.uid(), 'owner', p_score, nullif(trim(coalesce(p_evidence_note,'')), ''))
  ON CONFLICT (cycle_id, parameter_code, scorer_id)
  DO UPDATE SET score = EXCLUDED.score,
                evidence_note = EXCLUDED.evidence_note,
                updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_carre_upsert_score(uuid, text, smallint, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_carre_upsert_score(uuid, text, smallint, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- fn_carre_create_invite — owner generates the second-scorer link. ONE
-- participant per audit: an unexpired invite is returned as-is (idempotent);
-- a new token is minted only when none is live. Rows land in the shared
-- care_scorer_invites table so the framework-agnostic participant RPCs pick
-- them up unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_carre_create_invite(
  p_cycle_id uuid,
  p_invited_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invite record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  IF NOT public.fn_carre_is_cycle_owner(p_cycle_id) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_owner');
  END IF;

  SELECT token, expires_at, invited_email INTO v_invite
  FROM public.care_scorer_invites
  WHERE cycle_id = p_cycle_id AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'token', v_invite.token,
      'expires_at', v_invite.expires_at, 'existing', true);
  END IF;

  INSERT INTO public.care_scorer_invites (cycle_id, invited_email, expires_at, created_by)
  VALUES (p_cycle_id, nullif(trim(coalesce(p_invited_email,'')), ''), now() + interval '14 days', auth.uid())
  RETURNING token, expires_at INTO v_invite;

  RETURN jsonb_build_object('success', true, 'token', v_invite.token,
    'expires_at', v_invite.expires_at, 'existing', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_carre_create_invite(uuid, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_carre_create_invite(uuid, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Reuse note (no DDL): the token-gated participant read/submit RPCs shipped
-- with CARE v1 are framework-agnostic (they resolve the cycle through the
-- invite in care_scorer_invites and validate parameter_code against the frozen
-- snapshot, never filtering on `frameworks`). The CARRE participant flow calls
-- them directly — this migration deliberately does NOT redefine them.
-- ----------------------------------------------------------------------------

-- PostgREST schema-cache reload (new functions invisible to REST until this)
NOTIFY pgrst, 'reload schema';
