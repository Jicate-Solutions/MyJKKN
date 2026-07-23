-- ============================================================================
-- CARE Audit Framework v1.0 — digitized inside the /audit module
-- Spec: specs/care-audit-module-spec-2026-06-12.md
-- Canonical framework: docs/guides/2026-06-12-GUIDE-care-audit-framework.md
--
-- Additive only:
--   1. 20 system rows in audit_parameter_catalog (CARE-C1..CARE-E5)
--   2. care_audit_scores + care_scorer_invites (new tables)
--   3. 7 SECURITY DEFINER RPCs (all writes flow through these — audit_cycles
--      INSERT RLS requires audit.cycle.manage, but Director decision #2 says
--      ANY staff member can open a CARE audit, so the create path is an RPC,
--      not a policy change on the existing table)
--
-- Schema-reality notes (probed live 2026-06-12, spec §3 drift flagged in PR):
--   - parameter_group is smallint CHECK (1..4)  → pillar map C=1 A=2 R=3 E=4
--   - framework_mapping follows the existing body→criterion shape
--     ({"care":"C1"}) so coverage/attestation services render clean badges;
--     pillar derives from the code prefix, version is pinned in the cycle
--     snapshot (parameter_catalog_snapshot.version = '1.0')
--   - default_owner_role is NOT NULL → 'hod' (the framework's own corrective
--     moves name "pilot HOD" as the behavioural owner), escalation 'principal'
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Catalog seed — 20 CARE items, system rows (institution_id NULL)
--    Idempotent: (code, institution_id) unique index does not collide on NULL
--    institution_id, so guard with NOT EXISTS instead of ON CONFLICT.
-- ----------------------------------------------------------------------------
INSERT INTO public.audit_parameter_catalog
  (code, name, parameter_group, description, framework_mapping, default_owner_role, escalation_role, evidence_required, is_system, is_active)
SELECT v.code, v.name, v.grp, v.description, v.mapping, 'hod', 'principal', v.evidence, true, true
FROM (
  VALUES
  -- Pillar C — Clarity (parameter_group 1)
  ('CARE-C1', 'One-sentence purpose', 1::smallint,
   'A first-time participant can state what this initiative is for after a single exposure.',
   '{"care":"C1"}'::jsonb,
   '[{"label":"Written purpose statement; spot-check 3 participants","required":false}]'::jsonb),
  ('CARE-C2', 'Explicit success criteria', 1,
   'Expected outcomes, rubrics, or completion standards are published before participation begins.',
   '{"care":"C2"}',
   '[{"label":"Outcome contract, rubric, SLA, checklist","required":false}]'),
  ('CARE-C3', 'Unambiguous roles', 1,
   'Every participant knows what they do, what others do, and who decides.',
   '{"care":"C3"}',
   '[{"label":"RACI or role statements; absence of who-handles-this messages in Google Chat","required":false}]'),
  ('CARE-C4', 'Visible "why it matters"', 1,
   'The link to the participant''s own stake — placement, exam, career, recognition, mission — is communicated, not assumed.',
   '{"care":"C4"}',
   '[{"label":"Purpose-to-stake mapping in onboarding/launch material","required":false}]'),
  ('CARE-C5', 'Current timelines and next actions', 1,
   'Steps, deadlines, and what-happens-next are published and up to date.',
   '{"care":"C5"}',
   '[{"label":"Live schedule; last-updated date within current cycle","required":false}]'),
  -- Pillar A — Appreciation (parameter_group 2)
  ('CARE-A1', 'Frequent informal acknowledgment', 2,
   'Effort is noticed at a regular cadence (weekly or per-milestone), not only at endpoints.',
   '{"care":"A1"}',
   '[{"label":"Chat spotlights, verbal rituals, facilitator habits with a defined cadence","required":false}]'),
  ('CARE-A2', 'Process-specific feedback', 2,
   'Praise names the behavior or approach ("your sampling method was rigorous"), not the person ("you''re brilliant").',
   '{"care":"A2"}',
   '[{"label":"Sample of actual feedback messages","required":false}]'),
  ('CARE-A3', 'Fast feedback loops', 2,
   'Time from submission/contribution to first acknowledgment is days, not weeks.',
   '{"care":"A3"}',
   '[{"label":"Median response time on assessments, proposals, messages","required":false}]'),
  ('CARE-A4', 'Coverage of the median', 2,
   'Appreciation reaches typical participants, not only top performers.',
   '{"care":"A4"}',
   '[{"label":"Distribution check: what % of participants received any acknowledgment this cycle?","required":false}]'),
  ('CARE-A5', 'Two-way appreciation', 2,
   'Participants have a sanctioned channel to appreciate facilitators/organizers, and it is used.',
   '{"care":"A5"}',
   '[{"label":"Feedback forms with appreciation field; peer-shoutout mechanism","required":false}]'),
  -- Pillar R — Recognition (parameter_group 3)
  ('CARE-R1', 'Defined recognition surfaces', 3,
   'Named, scheduled mechanisms exist (showcases, tiers, badges, leaderboards, certificates).',
   '{"care":"R1"}',
   '[{"label":"Recognition calendar or tier definition document","required":false}]'),
  ('CARE-R2', 'Progress recognition, not just peaks', 3,
   'Improvement and consistency are recognized, not only wins and toppers.',
   '{"care":"R2"}',
   '[{"label":"Adoption tiers, streaks, most-improved categories","required":false}]'),
  ('CARE-R3', 'Distribution beyond the top decile', 3,
   'Recognition reaches a broad base; it is not tournament-only.',
   '{"care":"R3"}',
   '[{"label":"% of participants recognized per cycle (target: >25%)","required":false}]'),
  ('CARE-R4', 'Public and attributable', 3,
   'Recognition is visible to peers and names the person and the specific contribution.',
   '{"care":"R4"}',
   '[{"label":"Public channels, notice boards, #JKKN100 posts naming individuals","required":false}]'),
  ('CARE-R5', 'Recognition feeds forward', 3,
   'Being recognized leads somewhere — portfolio entry, LinkedIn artifact, NIF pipeline, role advancement.',
   '{"care":"R5"}',
   '[{"label":"Documented pathway from recognition to opportunity","required":false}]'),
  -- Pillar E — Empowerment (parameter_group 4)
  ('CARE-E1', 'Meaningful choice', 4,
   'Participants choose at least one substantive dimension: topic, format, pacing, team, or tool.',
   '{"care":"E1"}',
   '[{"label":"Documented choice points in the initiative design","required":false}]'),
  ('CARE-E2', 'Ownership of real output', 4,
   'Participants produce something with their name on it that exists beyond the initiative (product, publication, event, dataset).',
   '{"care":"E2"}',
   '[{"label":"AI Production House model; output inventory","required":false}]'),
  ('CARE-E3', 'Decision authority', 4,
   'Some decisions are genuinely delegated — participants can decide without approval, within stated bounds.',
   '{"care":"E3"}',
   '[{"label":"Delegation matrix; examples of participant decisions that stood","required":false}]'),
  ('CARE-E4', 'Tools as agents', 4,
   'Participants are given capable tools (AI, platforms, budgets) and trusted to operate them as Principals.',
   '{"care":"E4"}',
   '[{"label":"Gemini/NotebookLM access with creation rights, not just consumption","required":false}]'),
  ('CARE-E5', 'Voice changes the system', 4,
   'Participant feedback has visibly altered the initiative at least once per cycle, and the change was announced as such.',
   '{"care":"E5"}',
   '[{"label":"You-said-we-changed log","required":false}]')
) AS v(code, name, grp, description, mapping, evidence)
WHERE NOT EXISTS (
  SELECT 1 FROM public.audit_parameter_catalog WHERE code LIKE 'CARE-%'
);

-- ----------------------------------------------------------------------------
-- 2. New tables
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.care_audit_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.audit_cycles(id) ON DELETE CASCADE,
  parameter_code text NOT NULL,              -- 'CARE-C1' … 'CARE-E5'
  scorer_id uuid NOT NULL REFERENCES public.profiles(id),
  scorer_role text NOT NULL CHECK (scorer_role IN ('owner','participant')),
  score smallint NOT NULL CHECK (score BETWEEN 0 AND 4),
  evidence_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, parameter_code, scorer_id)
);

CREATE INDEX IF NOT EXISTS idx_care_scores_cycle ON public.care_audit_scores (cycle_id);
CREATE INDEX IF NOT EXISTS idx_care_scores_scorer ON public.care_audit_scores (scorer_id);

CREATE TABLE IF NOT EXISTS public.care_scorer_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.audit_cycles(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  invited_email text,
  accepted_by uuid REFERENCES public.profiles(id),
  expires_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_care_invites_cycle ON public.care_scorer_invites (cycle_id);

-- ----------------------------------------------------------------------------
-- 3. RLS — read-only direct access for leadership + own rows.
--    NO direct INSERT/UPDATE/DELETE policies: every write goes through the
--    SECURITY DEFINER RPCs below (owner identity / token validated there).
-- ----------------------------------------------------------------------------
ALTER TABLE public.care_audit_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.care_scorer_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "care_scores_select" ON public.care_audit_scores
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR user_has_permission('audit.cycle.view')
  OR scorer_id = auth.uid()
);

CREATE POLICY "care_invites_select" ON public.care_scorer_invites
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR user_has_permission('audit.cycle.view')
  OR created_by = auth.uid()
);

-- ----------------------------------------------------------------------------
-- 4. RPCs (all SECURITY DEFINER; anon EXECUTE explicitly revoked per the
--    mandatory template — Supabase default privileges grant anon EXECUTE on
--    every new public function)
-- ----------------------------------------------------------------------------

-- Helper: is the caller the lead auditor (owner) of this CARE cycle?
CREATE OR REPLACE FUNCTION public.fn_care_is_cycle_owner(p_cycle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.audit_cycles c
    WHERE c.id = p_cycle_id
      AND c.frameworks @> ARRAY['CARE']::text[]
      AND c.lead_auditor_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_care_is_cycle_owner(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_care_is_cycle_owner(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- fn_care_create_audit — any STAFF member opens a CARE audit on their own
-- initiative (Director decision #2). Cycle is created in-progress with the
-- 20 CARE parameters frozen into parameter_catalog_snapshot (framework
-- versioning per spec §6 — catalog edits never rewrite old audits).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_care_create_audit(
  p_name text,
  p_audience text,
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
      'detail', 'CARE audits are opened by staff initiative owners.');
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) < 4 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_name');
  END IF;

  IF p_re_audit_date IS NULL OR p_re_audit_date < CURRENT_DATE THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_re_audit_date',
      'detail', 'Re-audit date must be today or later.');
  END IF;

  -- Freeze the 20 CARE items (full definitions — the scoring UI reads ONLY
  -- the snapshot, so scorers never need audit.parameter.view permission)
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
  WHERE code LIKE 'CARE-%' AND is_system = true AND is_active = true;

  IF v_params IS NULL OR jsonb_array_length(v_params) <> 20 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'catalog_incomplete',
      'detail', 'Expected 20 CARE parameters in the catalog.');
  END IF;

  INSERT INTO public.audit_cycles
    (name, description, frameworks, start_date, end_date, lead_auditor_id,
     cosigner_roles, institution_ids, phase, parameter_catalog_snapshot, created_by)
  VALUES
    (trim(p_name), nullif(trim(coalesce(p_audience, '')), ''), ARRAY['CARE'],
     CURRENT_DATE, p_re_audit_date, auth.uid(),
     ARRAY['cao','ceo'],
     CASE WHEN v_institution IS NULL THEN NULL ELSE ARRAY[v_institution] END,
     'in-progress',
     jsonb_build_object(
       'frozen_at', now(),
       'framework', 'CARE',
       'version', '1.0',
       'parameters', v_params
     ),
     auth.uid())
  RETURNING id INTO v_cycle_id;

  RETURN jsonb_build_object('success', true, 'cycle_id', v_cycle_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_care_create_audit(text, text, date) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_care_create_audit(text, text, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_care_create_audit IS
  'CARE Audit v1: any staff member opens a CARE audit (cycle with frameworks=[CARE], phase=in-progress, 20-item snapshot frozen). Spec: specs/care-audit-module-spec-2026-06-12.md';

-- ---------------------------------------------------------------------------
-- fn_care_list_audits — owner sees own audits; leadership (audit.cycle.view /
-- admin / super_admin) sees every CARE audit. Feeds the dashboard CARE section.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_care_list_audits()
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
  WHERE c.frameworks @> ARRAY['CARE']::text[]
    AND auth.uid() IS NOT NULL
    AND (
      c.lead_auditor_id = auth.uid()
      OR c.created_by = auth.uid()
      OR is_super_admin() OR is_admin()
      OR user_has_permission('audit.cycle.view')
    )
  ORDER BY c.end_date ASC, c.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_care_list_audits() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_care_list_audits() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- fn_care_get_audit — full audit view for the OWNER / leadership: cycle,
-- snapshot, all scores (owner + participant), active invite.
-- Participants use the token-gated context fn instead (blind scoring).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_care_get_audit(p_cycle_id uuid)
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
  WHERE c.id = p_cycle_id AND c.frameworks @> ARRAY['CARE']::text[];

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

REVOKE EXECUTE ON FUNCTION public.fn_care_get_audit(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_care_get_audit(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- fn_care_upsert_score — owner scores one item (0–4 + evidence note).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_care_upsert_score(
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
    AND frameworks @> ARRAY['CARE']::text[]
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

REVOKE EXECUTE ON FUNCTION public.fn_care_upsert_score(uuid, text, smallint, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_care_upsert_score(uuid, text, smallint, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- fn_care_create_invite — owner generates the second-scorer link.
-- ONE participant per audit (Director decision #2): an unexpired invite is
-- returned as-is (idempotent); a new token is minted only when none is live.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_care_create_invite(
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

  IF NOT public.fn_care_is_cycle_owner(p_cycle_id) THEN
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

REVOKE EXECUTE ON FUNCTION public.fn_care_create_invite(uuid, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_care_create_invite(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- fn_care_get_invite_context — participant opens the scoring link.
-- Token + auth is the gate (NOT staff RLS — invitee may be a learner).
-- BLIND: returns the 20 items + the caller's own draft scores, NEVER the
-- owner's scores. First authenticated opener claims the invite.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_care_get_invite_context(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invite record;
  v_cycle record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  SELECT * INTO v_invite
  FROM public.care_scorer_invites
  WHERE token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invite_not_found');
  END IF;

  IF v_invite.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invite_expired');
  END IF;

  IF v_invite.accepted_by IS NOT NULL AND v_invite.accepted_by <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invite_claimed');
  END IF;

  IF v_invite.accepted_by IS NULL THEN
    UPDATE public.care_scorer_invites
    SET accepted_by = auth.uid()
    WHERE id = v_invite.id;
  END IF;

  SELECT id, name, description, phase, parameter_catalog_snapshot INTO v_cycle
  FROM public.audit_cycles
  WHERE id = v_invite.cycle_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'audit_not_found');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'cycle', jsonb_build_object(
      'id', v_cycle.id,
      'name', v_cycle.name,
      'audience', v_cycle.description,
      'phase', v_cycle.phase
    ),
    'snapshot', v_cycle.parameter_catalog_snapshot,
    -- own draft only — owner scores intentionally absent (blind scoring)
    'my_scores', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'parameter_code', s.parameter_code,
        'score', s.score,
        'evidence_note', s.evidence_note
      ) ORDER BY s.parameter_code)
      FROM public.care_audit_scores s
      WHERE s.cycle_id = v_cycle.id AND s.scorer_id = auth.uid() AND s.scorer_role = 'participant'
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_care_get_invite_context(text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_care_get_invite_context(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- fn_care_submit_participant_scores — participant submits all 20 in one call.
-- p_scores: [{"parameter_code":"CARE-C1","score":3,"evidence_note":"…"}, …]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_care_submit_participant_scores(
  p_token text,
  p_scores jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invite record;
  v_cycle record;
  v_entry jsonb;
  v_code text;
  v_score int;
  v_count int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  SELECT * INTO v_invite FROM public.care_scorer_invites WHERE token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invite_not_found');
  END IF;

  IF v_invite.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invite_expired');
  END IF;

  IF v_invite.accepted_by IS NOT NULL AND v_invite.accepted_by <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invite_claimed');
  END IF;

  SELECT id, phase, parameter_catalog_snapshot INTO v_cycle
  FROM public.audit_cycles WHERE id = v_invite.cycle_id;

  IF NOT FOUND OR v_cycle.phase = 'closed' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'cycle_closed');
  END IF;

  IF p_scores IS NULL OR jsonb_typeof(p_scores) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_payload');
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_scores) LOOP
    v_code := v_entry ->> 'parameter_code';
    v_score := (v_entry ->> 'score')::int;

    IF v_score IS NULL OR v_score < 0 OR v_score > 4 THEN
      RETURN jsonb_build_object('success', false, 'reason', 'invalid_score', 'detail', v_code);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_cycle.parameter_catalog_snapshot -> 'parameters') e
      WHERE e ->> 'code' = v_code
    ) THEN
      RETURN jsonb_build_object('success', false, 'reason', 'unknown_parameter', 'detail', v_code);
    END IF;

    INSERT INTO public.care_audit_scores
      (cycle_id, parameter_code, scorer_id, scorer_role, score, evidence_note)
    VALUES
      (v_cycle.id, v_code, auth.uid(), 'participant', v_score,
       nullif(trim(coalesce(v_entry ->> 'evidence_note','')), ''))
    ON CONFLICT (cycle_id, parameter_code, scorer_id)
    DO UPDATE SET score = EXCLUDED.score,
                  evidence_note = EXCLUDED.evidence_note,
                  updated_at = now();

    v_count := v_count + 1;
  END LOOP;

  IF v_invite.accepted_by IS NULL THEN
    UPDATE public.care_scorer_invites SET accepted_by = auth.uid() WHERE id = v_invite.id;
  END IF;

  RETURN jsonb_build_object('success', true, 'saved', v_count);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_care_submit_participant_scores(text, jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_care_submit_participant_scores(text, jsonb) TO authenticated, service_role;

-- PostgREST schema-cache reload (new tables + FKs invisible to REST until this)
NOTIFY pgrst, 'reload schema';
