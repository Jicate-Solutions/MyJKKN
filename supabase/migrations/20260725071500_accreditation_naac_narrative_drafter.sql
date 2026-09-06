-- ============================================================================
-- AI NAAC narrative drafter — DARK substrate (spec:
-- specs/accreditation-narrative-drafter-plan-2026-07-25.md)
--
-- Grounded, human-verified per-metric accreditation narratives. A ₹0 Max-lane
-- job drafts prose from cited real evidence (quality_evidence_mappings); the
-- owning Senior Learner edits + okays it, then principal → director approve.
-- Nothing auto-submits; an ungrounded draft can never advance.
--
-- Ships DARK: the ai_job_types row is enabled=false. Because fn_ai_enqueue_system
-- gates on enabled=true, zero jobs can be queued until the Director flips it —
-- a sufficient kill-switch for a not-yet-launched type (verified: the claim path
-- has nothing to claim). Go-live = flip ai_job_types.enabled → true (no deploy).
--
-- Mirrors the proven scf.note_safety_judge pattern (20260719054000):
--   * system/cron RPCs are SECURITY DEFINER + service_role ONLY
--   * every new function REVOKEs EXECUTE from anon, PUBLIC (Supabase default grant)
--   * a dedicated table (not an overloaded existing one) at the natural grain
--
-- Apply via mgmt API after review (Director owns apply). Validated in a
-- BEGIN..ROLLBACK txn before proposing. Deploy ships CODE not migrations.
-- ============================================================================

-- ── 1) Owner mapping (institution × metric → the Senior Learner who owns it) ──
CREATE TABLE IF NOT EXISTS public.accreditation_metric_owners (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  body_code      text NOT NULL,
  metric_code    text NOT NULL,
  owner_user_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid,
  UNIQUE (institution_id, body_code, metric_code)
);
ALTER TABLE public.accreditation_metric_owners ENABLE ROW LEVEL SECURITY;

CREATE POLICY accred_metric_owners_select ON public.accreditation_metric_owners
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('accreditation.naac.narrative.view')
        AND role_has_institution_access(institution_id))
  );
CREATE POLICY accred_metric_owners_manage ON public.accreditation_metric_owners
  FOR ALL USING (
    is_super_admin()
    OR (user_has_permission('accreditation.naac.narrative.manage')
        AND role_has_institution_access(institution_id))
  ) WITH CHECK (
    is_super_admin()
    OR (user_has_permission('accreditation.naac.narrative.manage')
        AND role_has_institution_access(institution_id))
  );

-- ── 2) The per-metric narrative (draft + grounding verdict + approval chain) ──
CREATE TABLE IF NOT EXISTS public.accreditation_metric_narratives (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id     uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  body_code          text NOT NULL,
  metric_code        text NOT NULL,
  period_label       text NOT NULL,
  -- AI output + grounding audit
  narrative_md       text,
  citations          jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{paragraph, source_ids[]}]
  grounding_verdict  text CHECK (grounding_verdict IN ('grounded','ungrounded')),
  ungrounded_tokens  jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_row_count int  NOT NULL DEFAULT 0,
  model              text,
  ai_job_id          uuid,
  generated_at       timestamptz,
  -- workflow (nothing auto-submits): ai_drafted → owner_okayed → principal_approved → director_submitted
  status             text NOT NULL DEFAULT 'ai_drafted'
                       CHECK (status IN ('ai_drafted','owner_okayed','principal_approved',
                                         'director_submitted','revision_requested')),
  owner_user_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,  -- NULL = IQAC/admin queue
  owner_okayed_at    timestamptz, owner_okayed_by    uuid,
  principal_approved_at timestamptz, principal_approved_by uuid,
  director_submitted_at timestamptz, director_submitted_by uuid,
  revision_requested_at timestamptz, revision_note text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, body_code, metric_code, period_label)
);
CREATE INDEX IF NOT EXISTS idx_accred_narratives_owner
  ON public.accreditation_metric_narratives(owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accred_narratives_inst_status
  ON public.accreditation_metric_narratives(institution_id, status);

ALTER TABLE public.accreditation_metric_narratives ENABLE ROW LEVEL SECURITY;

-- SELECT: owner sees own; permission+institution scope sees the rest; admins all.
-- Writes are NOT open to session clients — they go through the SECDEF RPCs below,
-- which enforce the state machine + the ungrounded-can-never-advance fraud gate.
CREATE POLICY accred_narratives_select ON public.accreditation_metric_narratives
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR owner_user_id = auth.uid()
    OR (user_has_permission('accreditation.naac.narrative.view')
        AND role_has_institution_access(institution_id))
  );

-- ── 3) Owner resolution (never-orphan): configured → committee chair → NULL ───
-- NULL owner is not a dead-end — the UI surfaces owner_user_id IS NULL rows in
-- the IQAC/admin queue (rule 27: an unassigned draft is visible, never lost).
CREATE OR REPLACE FUNCTION public.fn_accreditation_resolve_metric_owner(
  p_institution_id uuid, p_body_code text, p_metric_code text
) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_owner uuid;
BEGIN
  SELECT owner_user_id INTO v_owner FROM public.accreditation_metric_owners
   WHERE institution_id = p_institution_id AND body_code = p_body_code AND metric_code = p_metric_code;
  IF v_owner IS NOT NULL THEN RETURN v_owner; END IF;
  SELECT chair_user_id INTO v_owner FROM public.accreditation_committees
   WHERE institution_id = p_institution_id AND body_code = p_body_code
     AND is_active = true AND chair_user_id IS NOT NULL
   ORDER BY formed_at DESC NULLS LAST LIMIT 1;
  RETURN v_owner;  -- may be NULL → admin queue
END; $$;
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_resolve_metric_owner(uuid,text,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_resolve_metric_owner(uuid,text,text) TO authenticated, service_role;

-- ── 4) Work-list: evidence-backed (institution, metric) pairs lacking a draft ─
-- Service-role ONLY: called by the nightly cron. Returns the pairs to draft for
-- p_period; the cron then reads the evidence + builds the grounded prompt.
CREATE OR REPLACE FUNCTION public.fn_accreditation_narrative_awaiting(
  p_body_code text, p_period_label text, p_limit int DEFAULT 50
) RETURNS TABLE(institution_id uuid, metric_code text, evidence_rows bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
    SELECT qem.institution_id, qem.metric_code, count(*) AS evidence_rows
    FROM public.quality_evidence_mappings qem
    WHERE qem.body_code = p_body_code
      AND qem.institution_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.accreditation_metric_narratives n
        WHERE n.institution_id = qem.institution_id
          AND n.body_code = p_body_code
          AND n.metric_code = qem.metric_code
          AND n.period_label = p_period_label
      )
    GROUP BY qem.institution_id, qem.metric_code
    ORDER BY count(*) DESC
    LIMIT GREATEST(1, LEAST(500, p_limit));
END; $$;
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_narrative_awaiting(text,text,int) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_narrative_awaiting(text,text,int) TO service_role;

-- ── 5) Record the AI draft (idempotent upsert on the natural key) ─────────────
-- Service-role ONLY: the cron persists the model output + the deterministic
-- grounding verdict computed in the route. Resolves + stamps the owner.
CREATE OR REPLACE FUNCTION public.fn_accreditation_record_narrative_draft(
  p_institution_id uuid, p_body_code text, p_metric_code text, p_period_label text,
  p_narrative_md text, p_citations jsonb, p_grounding_verdict text,
  p_ungrounded_tokens jsonb, p_evidence_row_count int, p_model text, p_ai_job_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_id uuid; v_owner uuid;
BEGIN
  IF p_grounding_verdict NOT IN ('grounded','ungrounded') THEN
    RAISE EXCEPTION 'record_narrative_draft: bad verdict %', p_grounding_verdict;
  END IF;
  v_owner := public.fn_accreditation_resolve_metric_owner(p_institution_id, p_body_code, p_metric_code);
  INSERT INTO public.accreditation_metric_narratives (
    institution_id, body_code, metric_code, period_label, narrative_md, citations,
    grounding_verdict, ungrounded_tokens, evidence_row_count, model, ai_job_id,
    generated_at, status, owner_user_id
  ) VALUES (
    p_institution_id, p_body_code, p_metric_code, p_period_label, p_narrative_md,
    COALESCE(p_citations,'[]'::jsonb), p_grounding_verdict, COALESCE(p_ungrounded_tokens,'[]'::jsonb),
    GREATEST(0, p_evidence_row_count), p_model, p_ai_job_id, now(), 'ai_drafted', v_owner
  )
  ON CONFLICT (institution_id, body_code, metric_code, period_label) DO UPDATE SET
    -- only refresh drafts still in the AI stage; never clobber human-touched rows
    narrative_md      = CASE WHEN accreditation_metric_narratives.status = 'ai_drafted'
                             THEN EXCLUDED.narrative_md ELSE accreditation_metric_narratives.narrative_md END,
    citations         = CASE WHEN accreditation_metric_narratives.status = 'ai_drafted'
                             THEN EXCLUDED.citations ELSE accreditation_metric_narratives.citations END,
    grounding_verdict = CASE WHEN accreditation_metric_narratives.status = 'ai_drafted'
                             THEN EXCLUDED.grounding_verdict ELSE accreditation_metric_narratives.grounding_verdict END,
    ungrounded_tokens = CASE WHEN accreditation_metric_narratives.status = 'ai_drafted'
                             THEN EXCLUDED.ungrounded_tokens ELSE accreditation_metric_narratives.ungrounded_tokens END,
    evidence_row_count= CASE WHEN accreditation_metric_narratives.status = 'ai_drafted'
                             THEN EXCLUDED.evidence_row_count ELSE accreditation_metric_narratives.evidence_row_count END,
    model             = CASE WHEN accreditation_metric_narratives.status = 'ai_drafted'
                             THEN EXCLUDED.model ELSE accreditation_metric_narratives.model END,
    generated_at      = CASE WHEN accreditation_metric_narratives.status = 'ai_drafted'
                             THEN EXCLUDED.generated_at ELSE accreditation_metric_narratives.generated_at END,
    updated_at        = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_record_narrative_draft(uuid,text,text,text,text,jsonb,text,jsonb,int,text,uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_record_narrative_draft(uuid,text,text,text,text,jsonb,text,jsonb,int,text,uuid) TO service_role;

-- ── 6) The human approval state machine (authenticated; permission + state) ───
-- One RPC dispatches every transition so there is a single anon-lock + one place
-- the state machine + fraud gate live. p_edited_md (owner_okay only) lets the
-- owner save edits; the API layer re-runs the grounding validator before calling.
CREATE OR REPLACE FUNCTION public.fn_accreditation_narrative_transition(
  p_id uuid, p_action text, p_note text DEFAULT NULL, p_edited_md text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_row public.accreditation_metric_narratives; v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO v_row FROM public.accreditation_metric_narratives WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'narrative % not found', p_id; END IF;
  IF NOT (is_super_admin() OR role_has_institution_access(v_row.institution_id)) THEN
    RAISE EXCEPTION 'not authorized for this institution';
  END IF;

  IF p_action = 'owner_okay' THEN
    IF NOT (v_uid = v_row.owner_user_id OR is_super_admin()
            OR user_has_permission('accreditation.naac.narrative.edit')) THEN
      RAISE EXCEPTION 'not the owner / lacks edit permission';
    END IF;
    IF v_row.status NOT IN ('ai_drafted','revision_requested') THEN
      RAISE EXCEPTION 'cannot okay from status %', v_row.status;
    END IF;
    IF v_row.grounding_verdict IS DISTINCT FROM 'grounded' THEN
      RAISE EXCEPTION 'ungrounded draft cannot be okayed';  -- FRAUD GATE at the transition
    END IF;
    UPDATE public.accreditation_metric_narratives SET
      narrative_md = COALESCE(p_edited_md, narrative_md),
      status = 'owner_okayed', owner_okayed_at = now(), owner_okayed_by = v_uid, updated_at = now()
     WHERE id = p_id;

  ELSIF p_action = 'principal_approve' THEN
    IF NOT (is_super_admin() OR user_has_permission('accreditation.naac.narrative.approve')) THEN
      RAISE EXCEPTION 'lacks approve permission'; END IF;
    IF v_row.status <> 'owner_okayed' THEN RAISE EXCEPTION 'cannot approve from status %', v_row.status; END IF;
    UPDATE public.accreditation_metric_narratives SET
      status = 'principal_approved', principal_approved_at = now(), principal_approved_by = v_uid, updated_at = now()
     WHERE id = p_id;

  ELSIF p_action = 'director_submit' THEN
    IF NOT (is_super_admin() OR user_has_permission('accreditation.naac.narrative.approve')) THEN
      RAISE EXCEPTION 'lacks approve permission'; END IF;
    IF v_row.status <> 'principal_approved' THEN RAISE EXCEPTION 'cannot submit from status %', v_row.status; END IF;
    UPDATE public.accreditation_metric_narratives SET
      status = 'director_submitted', director_submitted_at = now(), director_submitted_by = v_uid, updated_at = now()
     WHERE id = p_id;

  ELSIF p_action = 'request_revision' THEN
    IF NOT (is_super_admin() OR user_has_permission('accreditation.naac.narrative.approve')) THEN
      RAISE EXCEPTION 'lacks approve permission'; END IF;
    IF v_row.status NOT IN ('owner_okayed','principal_approved') THEN
      RAISE EXCEPTION 'cannot request revision from status %', v_row.status; END IF;
    UPDATE public.accreditation_metric_narratives SET
      status = 'revision_requested', revision_requested_at = now(), revision_note = p_note, updated_at = now()
     WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'unknown action %', p_action;
  END IF;

  RETURN p_action;
END; $$;
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_narrative_transition(uuid,text,text,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_narrative_transition(uuid,text,text,text) TO authenticated;

-- ── 7) The AI job type (₹0 Max lane, DARK) — copy of the note-judge seed shape ─
INSERT INTO public.ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target, interactive,
   lane, allow_rule, max_inflight, schedulable, enabled, input_schema, expected_seconds, external_allowed)
VALUES
  ('accreditation.naac_narrative_draft',
   'Accreditation — NAAC criteria narrative drafter (grounded, dark)',
   'Grounded per-metric NAAC narrative drafter. Synthesises the assessor-facing criteria narrative from ONLY the cited quality_evidence_mappings rows for one (institution, metric, period). Output is validated by the deterministic grounding gate; ungrounded drafts cannot be approved. Human-gated: owning Senior Learner okays, then principal → director. Never auto-submits. DARK: enabled=false until the Director flips it.',
   '{{prompt}}', 'none', 'job.result', false,
   'max', 'seat_owner', 3, true, false,
   '[{"key":"prompt","label":"Assembled prompt","type":"textarea","required":true}]'::jsonb, 45, false)
ON CONFLICT (job_type) DO UPDATE SET
  title=EXCLUDED.title, description=EXCLUDED.description, prompt_template=EXCLUDED.prompt_template,
  tool_set=EXCLUDED.tool_set, output_target=EXCLUDED.output_target, interactive=EXCLUDED.interactive,
  lane=EXCLUDED.lane, allow_rule=EXCLUDED.allow_rule, max_inflight=EXCLUDED.max_inflight,
  schedulable=EXCLUDED.schedulable, input_schema=EXCLUDED.input_schema,
  expected_seconds=EXCLUDED.expected_seconds, external_allowed=EXCLUDED.external_allowed, updated_at=now();
-- NOTE: ON CONFLICT deliberately does NOT touch `enabled` — re-running this
-- migration must never silently re-enable a type the Director has flipped live.
