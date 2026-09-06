-- ============================================================================
-- AI COMMITTEE ASSISTANT — takes the desk work out of committee sittings.
-- Created: 2026-07-26.
--
-- WHY (the live gap, measured on prod 2026-07-26):
--   The meeting engine (PRs #1940/#1943/#1942, live since 10 July) already
--   pre-fills minutes structurally and rolls minuted meetings up into NAAC 7.3
--   evidence. What it does NOT do is take the DESK work off a convener: the
--   agenda is typed by hand, the sitting is scheduled from memory, and the
--   minutes prose is written from scratch.
--   The ai_job_types row 'accreditation.cac_brief' (#2402, applied + DARK) was
--   meant to cover the drafting half — but it has NO PRODUCER. `git grep
--   cac_brief` across jicate/main returns only SQL_FILE_INDEX.md, its own
--   migration, and two comments: no cron, no enqueue, no storage table. The row
--   is inert even if the Director flips enabled=true. This migration builds the
--   missing half: the store + the human-gate state machine.
--
-- WHAT this adds
--   1. accreditation_meeting_drafts    — AI agenda draft + AI minutes prose,
--                                        one row per (meeting, kind), with the
--                                        grounding verdict, the doctrine-gate
--                                        hits, and the omitted-resolution list.
--   2. accreditation_meeting_proposals — a proposed sitting (date + advisory
--                                        attendee list) that a convener must
--                                        CONFIRM before any meeting row exists.
--   3. Six SECURITY DEFINER RPCs: cron writers are service_role ONLY, human
--      transitions are authenticated (called with the SESSION client so
--      auth.uid() is the real actor). Every one REVOKEs anon + PUBLIC.
--   4. Three platform_policies config rows (cadence + lead days + proposal
--      switch) — no hardcoded constants (config-table-pattern standing rule).
--   5. One ai_routine_schedules row (dispatcher-driven; vercel.json already
--      carries 94 crons and the plan ceiling is 100 — a scarce slot is not spent
--      on this).
--   6. Re-points the DARK cac_brief row at the proven `{{prompt}}` glue template
--      and widens it from cluster-only to "CAC or IQAC" (ONE job type
--      parameterised by committee kind, not a near-duplicate row).
--   7. One new DARK job type for the minutes prose polish.
--
-- SCOPE (b) SAFETY — nothing may notify or invite a real person.
--   Verified three ways on prod: (i) pg_trigger across all four committee tables
--   shows ONLY `set_updated_at BEFORE UPDATE`; there is no INSERT trigger at
--   all. (ii) the committee services + hooks contain zero notification write
--   paths. (iii) only two files in jicate/main touch
--   accreditation_committee_meetings (the service + the read-only Control
--   Tower). So creating a committee meeting today sends nothing to anyone.
--   The containment rule is therefore: a proposal NEVER touches the Universal
--   Booking engine (meeting_bookings / meeting_agendas / the webhook
--   dispatcher / calendar sync), which DOES invite real people.
--   fn_accreditation_meeting_proposal_confirm writes
--   accreditation_committee_meetings and nothing else.
--
-- SCOPE (d) DOCTRINE — a number readable from the platform is FORBIDDEN on an
--   agenda. The prompt says so; the deterministic gate in
--   lib/services/accreditation/agenda-doctrine-gate.ts makes it unbypassable;
--   and fn_accreditation_meeting_draft_transition REFUSES to advance an agenda
--   whose forbidden_number_hits is non-empty. Three layers, one rule.
--
-- Ships DARK: both job types are enabled=false. fn_ai_enqueue_system gates on
-- enabled=true, so zero jobs can be queued until the Director flips them — the
-- kill switch is the flip, no deploy needed. Mirrors the narrative drafter
-- (20260725071500) and the note-safety judge (20260719054000).
--
-- House rules honoured: INSERT ... WHERE NOT EXISTS (platform_policies carries
-- an EXPRESSION unique index — ON CONFLICT fails 42P10); every new function
-- REVOKEs EXECUTE from anon, PUBLIC (Supabase's default
-- ALTER DEFAULT PRIVILEGES grants anon EXECUTE separately from PUBLIC).
--
-- NOT APPLIED. Validated on prod inside ONE BEGIN..ROLLBACK batch only.
-- Apply is Director-gated. Deploy ships CODE, not migrations.
-- ============================================================================

-- ── 1) The AI draft (agenda prose OR minutes prose) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.accreditation_meeting_drafts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id         uuid NOT NULL REFERENCES public.accreditation_committees(id) ON DELETE CASCADE,
  institution_id       uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  meeting_id           uuid NOT NULL REFERENCES public.accreditation_committee_meetings(id) ON DELETE CASCADE,
  draft_kind           text NOT NULL CHECK (draft_kind IN ('agenda','minutes')),
  body_md              text,
  -- the EXACT fact block the prompt was handed: the audit trail the human-gate
  -- re-check replays, so "what was this grounded on" is answerable months later.
  source_facts         jsonb NOT NULL DEFAULT '{}'::jsonb,
  grounding_verdict    text CHECK (grounding_verdict IN ('grounded','ungrounded')),
  ungrounded_tokens    jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- scope (d): platform-readable figures found on an AGENDA draft. Non-empty
  -- blocks the okay transition. Always '[]' for a minutes draft (numbers are
  -- legitimate in a minute).
  forbidden_number_hits jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- scope (c): resolutions the polished prose silently DROPPED. The grounding
  -- validator catches tokens the model ADDED; it is blind to omission, and an
  -- omitted resolution would become NAAC 7.3.e evidence via the nightly rollup.
  omitted_resolution_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  model                text,
  ai_job_id            uuid,
  generated_at         timestamptz,
  -- nothing is final without a person: ai_drafted → convener_okayed | discarded
  status               text NOT NULL DEFAULT 'ai_drafted'
                         CHECK (status IN ('ai_drafted','convener_okayed','discarded')),
  okayed_at            timestamptz,
  okayed_by            uuid,
  revision_note        text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, draft_kind)
);
CREATE INDEX IF NOT EXISTS idx_accred_meeting_drafts_committee
  ON public.accreditation_meeting_drafts(committee_id, draft_kind, status);

ALTER TABLE public.accreditation_meeting_drafts ENABLE ROW LEVEL SECURITY;

-- SELECT only. Writes go through the SECDEF RPCs below, which own the state
-- machine + the three refusal gates (ungrounded / forbidden number / omission).
CREATE POLICY accred_meeting_drafts_select ON public.accreditation_meeting_drafts
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('accreditation.naac.committees.view')
        AND role_has_institution_access(institution_id))
  );

-- ── 2) The proposed sitting (scope b) ───────────────────────────────────────
-- proposed_for + proposed_member_ids are computed DETERMINISTICALLY by the cron
-- (last sitting + cadence days; the committee's own active members). A date or
-- an attendee is never model output — there is nothing here for a model to
-- hallucinate, and no attendance substrate exists to imply one either.
CREATE TABLE IF NOT EXISTS public.accreditation_meeting_proposals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id       uuid NOT NULL REFERENCES public.accreditation_committees(id) ON DELETE CASCADE,
  institution_id     uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  proposed_for       date NOT NULL,
  proposed_member_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  rationale          text,
  status             text NOT NULL DEFAULT 'ai_proposed'
                       CHECK (status IN ('ai_proposed','convener_confirmed','declined')),
  -- stamped ONLY by fn_accreditation_meeting_proposal_confirm. NULL here means
  -- no meeting exists: an unconfirmed proposal is invisible to everyone outside
  -- this committee's own page and reaches nobody.
  created_meeting_id uuid REFERENCES public.accreditation_committee_meetings(id) ON DELETE SET NULL,
  decided_at         timestamptz,
  decided_by         uuid,
  decline_note       text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
-- At most ONE pending proposal per committee (so a nightly re-run cannot pile up
-- suggestions the convener has to dismiss one by one).
CREATE UNIQUE INDEX IF NOT EXISTS uq_accred_meeting_proposal_pending
  ON public.accreditation_meeting_proposals(committee_id) WHERE status = 'ai_proposed';

ALTER TABLE public.accreditation_meeting_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY accred_meeting_proposals_select ON public.accreditation_meeting_proposals
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('accreditation.naac.committees.view')
        AND role_has_institution_access(institution_id))
  );

-- Keep updated_at honest on both new tables (same helper the meeting tables use).
DROP TRIGGER IF EXISTS set_updated_at ON public.accreditation_meeting_drafts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.accreditation_meeting_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at ON public.accreditation_meeting_proposals;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.accreditation_meeting_proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 3) Config rows (no hardcoded constants) ─────────────────────────────────
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system, ui_widget, ui_category)
SELECT 'accreditation.meeting.agenda_lead_days', 'global', NULL, '3'::jsonb,
       'How many days before a scheduled committee sitting the AI agenda draft is prepared.',
       'number', false, 'number', 'accreditation'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
   WHERE policy_key = 'accreditation.meeting.agenda_lead_days' AND scope_type = 'global' AND scope_id IS NULL
);

INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system, ui_widget, ui_category)
SELECT 'accreditation.meeting.cadence_days', 'global', NULL, '90'::jsonb,
       'Expected gap between committee sittings. A committee quiet for longer gets a proposed sitting the convener may confirm or decline.',
       'number', false, 'number', 'accreditation'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
   WHERE policy_key = 'accreditation.meeting.cadence_days' AND scope_type = 'global' AND scope_id IS NULL
);

INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system, ui_widget, ui_category)
SELECT 'accreditation.meeting.proposal_enabled', 'global', NULL, 'false'::jsonb,
       'Master switch for proposing committee sittings. OFF by default: a proposal is a draft only and never notifies anyone, but the Director owns turning the suggestion on.',
       'boolean', false, 'switch', 'accreditation'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
   WHERE policy_key = 'accreditation.meeting.proposal_enabled' AND scope_type = 'global' AND scope_id IS NULL
);

-- ── 4) Work-list: meetings awaiting an AI draft (service_role ONLY) ─────────
-- kind='agenda'  : status='scheduled', sitting within the lead window, no draft.
-- kind='minutes' : status='held' with at least one reviewed-or-passed
--                  resolution (something to write up), no draft.
CREATE OR REPLACE FUNCTION public.fn_accreditation_meeting_draft_awaiting(
  p_kind text, p_limit int DEFAULT 25
) RETURNS TABLE(meeting_id uuid, committee_id uuid, institution_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_lead int;
BEGIN
  IF p_kind NOT IN ('agenda','minutes') THEN
    RAISE EXCEPTION 'meeting_draft_awaiting: bad kind %', p_kind;
  END IF;
  v_lead := public.fn_get_policy_int('accreditation.meeting.agenda_lead_days', 3, NULL);

  RETURN QUERY
    SELECT m.id, m.committee_id, m.institution_id
      FROM public.accreditation_committee_meetings m
      JOIN public.accreditation_committees c ON c.id = m.committee_id AND c.is_active
     WHERE NOT EXISTS (
             SELECT 1 FROM public.accreditation_meeting_drafts d
              WHERE d.meeting_id = m.id AND d.draft_kind = p_kind
           )
       AND (
         (p_kind = 'agenda'
          AND m.status = 'scheduled'
          AND m.scheduled_for IS NOT NULL
          AND m.scheduled_for <= (CURRENT_DATE + v_lead)
          AND m.scheduled_for >= CURRENT_DATE)
         OR
         (p_kind = 'minutes'
          AND m.status = 'held'
          AND EXISTS (
            SELECT 1 FROM public.accreditation_committee_resolutions r
             WHERE r.meeting_id = m.id OR r.reviewed_in_meeting_id = m.id
          ))
       )
     ORDER BY m.scheduled_for NULLS LAST, m.created_at
     LIMIT GREATEST(1, LEAST(200, p_limit));
END; $$;
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_meeting_draft_awaiting(text,int) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_meeting_draft_awaiting(text,int) TO service_role;

-- ── 5) Record an AI draft (service_role ONLY, idempotent) ───────────────────
-- Refreshes ONLY while status='ai_drafted' — a draft a human has already okayed
-- or discarded is never clobbered by a later run.
CREATE OR REPLACE FUNCTION public.fn_accreditation_record_meeting_draft(
  p_meeting_id uuid, p_draft_kind text, p_body_md text, p_source_facts jsonb,
  p_grounding_verdict text, p_ungrounded_tokens jsonb,
  p_forbidden_number_hits jsonb, p_omitted_resolution_ids jsonb,
  p_model text, p_ai_job_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_id uuid; v_committee uuid; v_institution uuid;
BEGIN
  IF p_draft_kind NOT IN ('agenda','minutes') THEN
    RAISE EXCEPTION 'record_meeting_draft: bad kind %', p_draft_kind;
  END IF;
  IF p_grounding_verdict NOT IN ('grounded','ungrounded') THEN
    RAISE EXCEPTION 'record_meeting_draft: bad verdict %', p_grounding_verdict;
  END IF;

  SELECT committee_id, institution_id INTO v_committee, v_institution
    FROM public.accreditation_committee_meetings WHERE id = p_meeting_id;
  IF v_committee IS NULL THEN
    RAISE EXCEPTION 'record_meeting_draft: meeting % not found', p_meeting_id;
  END IF;

  INSERT INTO public.accreditation_meeting_drafts (
    committee_id, institution_id, meeting_id, draft_kind, body_md, source_facts,
    grounding_verdict, ungrounded_tokens, forbidden_number_hits,
    omitted_resolution_ids, model, ai_job_id, generated_at, status
  ) VALUES (
    v_committee, v_institution, p_meeting_id, p_draft_kind, p_body_md,
    COALESCE(p_source_facts,'{}'::jsonb), p_grounding_verdict,
    COALESCE(p_ungrounded_tokens,'[]'::jsonb), COALESCE(p_forbidden_number_hits,'[]'::jsonb),
    COALESCE(p_omitted_resolution_ids,'[]'::jsonb), p_model, p_ai_job_id, now(), 'ai_drafted'
  )
  ON CONFLICT (meeting_id, draft_kind) DO UPDATE SET
    body_md               = CASE WHEN accreditation_meeting_drafts.status = 'ai_drafted'
                                 THEN EXCLUDED.body_md ELSE accreditation_meeting_drafts.body_md END,
    source_facts          = CASE WHEN accreditation_meeting_drafts.status = 'ai_drafted'
                                 THEN EXCLUDED.source_facts ELSE accreditation_meeting_drafts.source_facts END,
    grounding_verdict     = CASE WHEN accreditation_meeting_drafts.status = 'ai_drafted'
                                 THEN EXCLUDED.grounding_verdict ELSE accreditation_meeting_drafts.grounding_verdict END,
    ungrounded_tokens     = CASE WHEN accreditation_meeting_drafts.status = 'ai_drafted'
                                 THEN EXCLUDED.ungrounded_tokens ELSE accreditation_meeting_drafts.ungrounded_tokens END,
    forbidden_number_hits = CASE WHEN accreditation_meeting_drafts.status = 'ai_drafted'
                                 THEN EXCLUDED.forbidden_number_hits ELSE accreditation_meeting_drafts.forbidden_number_hits END,
    omitted_resolution_ids= CASE WHEN accreditation_meeting_drafts.status = 'ai_drafted'
                                 THEN EXCLUDED.omitted_resolution_ids ELSE accreditation_meeting_drafts.omitted_resolution_ids END,
    model                 = CASE WHEN accreditation_meeting_drafts.status = 'ai_drafted'
                                 THEN EXCLUDED.model ELSE accreditation_meeting_drafts.model END,
    generated_at          = CASE WHEN accreditation_meeting_drafts.status = 'ai_drafted'
                                 THEN EXCLUDED.generated_at ELSE accreditation_meeting_drafts.generated_at END,
    updated_at            = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_record_meeting_draft(uuid,text,text,jsonb,text,jsonb,jsonb,jsonb,text,uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_record_meeting_draft(uuid,text,text,jsonb,text,jsonb,jsonb,jsonb,text,uuid) TO service_role;

-- ── 6) The human gate (authenticated; SESSION client so auth.uid() resolves) ─
-- THREE REFUSALS, all enforced here so no UI path can skip them:
--   * an ungrounded draft can never be okayed (fabricated fact),
--   * an agenda carrying a platform-readable number can never be okayed (the
--     Director's forbidden-agenda doctrine),
--   * a minute that dropped a resolution can never be okayed (silent omission
--     would still flow into NAAC 7.3.e evidence).
-- The API layer re-runs the same three checks on the HUMAN-EDITED text before
-- calling this, so an edit cannot smuggle past a verdict computed pre-edit.
CREATE OR REPLACE FUNCTION public.fn_accreditation_meeting_draft_transition(
  p_id uuid, p_action text, p_edited_md text DEFAULT NULL, p_note text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_row public.accreditation_meeting_drafts; v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO v_row FROM public.accreditation_meeting_drafts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'meeting draft % not found', p_id; END IF;
  IF NOT (is_super_admin()
          OR (user_has_permission('accreditation.naac.committees.meetings.manage')
              AND role_has_institution_access(v_row.institution_id))) THEN
    RAISE EXCEPTION 'you do not have permission to okay committee drafts for this institution';
  END IF;

  IF p_action = 'okay' THEN
    IF v_row.status <> 'ai_drafted' THEN
      RAISE EXCEPTION 'cannot okay from status %', v_row.status;
    END IF;
    IF v_row.grounding_verdict IS DISTINCT FROM 'grounded' THEN
      RAISE EXCEPTION 'ungrounded draft cannot be okayed';
    END IF;
    IF v_row.draft_kind = 'agenda'
       AND jsonb_array_length(COALESCE(v_row.forbidden_number_hits,'[]'::jsonb)) > 0 THEN
      RAISE EXCEPTION 'agenda carries platform-readable figures — they belong in the brief, not the agenda';
    END IF;
    IF v_row.draft_kind = 'minutes'
       AND jsonb_array_length(COALESCE(v_row.omitted_resolution_ids,'[]'::jsonb)) > 0 THEN
      RAISE EXCEPTION 'minutes draft omits a resolution recorded in this meeting';
    END IF;
    UPDATE public.accreditation_meeting_drafts SET
      body_md = COALESCE(p_edited_md, body_md),
      status = 'convener_okayed', okayed_at = now(), okayed_by = v_uid, updated_at = now()
     WHERE id = p_id;

  ELSIF p_action = 'discard' THEN
    IF v_row.status <> 'ai_drafted' THEN
      RAISE EXCEPTION 'cannot discard from status %', v_row.status;
    END IF;
    UPDATE public.accreditation_meeting_drafts SET
      status = 'discarded', revision_note = p_note, updated_at = now()
     WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'unknown action %', p_action;
  END IF;

  RETURN p_action;
END; $$;
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_meeting_draft_transition(uuid,text,text,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_meeting_draft_transition(uuid,text,text,text) TO authenticated;

-- ── 7) Work-list: committees due a proposed sitting (service_role ONLY) ─────
-- Gated on the config switch, so the Director owns whether the suggestion runs
-- at all. Returns the computed date + the committee's own active member ids —
-- deterministic, so no date or attendee is ever model-invented.
CREATE OR REPLACE FUNCTION public.fn_accreditation_meeting_proposal_awaiting(
  p_limit int DEFAULT 25
) RETURNS TABLE(committee_id uuid, institution_id uuid, proposed_for date,
                member_ids uuid[], last_sitting date, cadence_days int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_cadence int;
BEGIN
  IF NOT public.fn_get_policy_bool('accreditation.meeting.proposal_enabled', false, NULL) THEN
    RETURN;  -- switch off → no proposals at all
  END IF;
  v_cadence := public.fn_get_policy_int('accreditation.meeting.cadence_days', 90, NULL);

  RETURN QUERY
    WITH last_sit AS (
      SELECT m.committee_id,
             max(COALESCE(m.held_at::date, m.scheduled_for)) AS last_on
        FROM public.accreditation_committee_meetings m
       WHERE m.status <> 'cancelled'
       GROUP BY m.committee_id
    )
    SELECT c.id, c.institution_id,
           (COALESCE(ls.last_on, c.formed_at) + v_cadence)::date,
           COALESCE(
             (SELECT array_agg(mem.user_id)
                FROM public.accreditation_committee_members mem
               WHERE mem.committee_id = c.id AND mem.is_active
                 AND mem.user_id IS NOT NULL),
             '{}'::uuid[]),
           ls.last_on,
           v_cadence
      FROM public.accreditation_committees c
      LEFT JOIN last_sit ls ON ls.committee_id = c.id
     WHERE c.is_active
       -- overdue: the next expected sitting date has arrived
       AND (COALESCE(ls.last_on, c.formed_at) + v_cadence) <= CURRENT_DATE
       -- nothing already on the calendar
       AND NOT EXISTS (
             SELECT 1 FROM public.accreditation_committee_meetings m2
              WHERE m2.committee_id = c.id AND m2.status IN ('scheduled','held')
           )
       -- and no proposal already waiting on the convener
       AND NOT EXISTS (
             SELECT 1 FROM public.accreditation_meeting_proposals p
              WHERE p.committee_id = c.id AND p.status = 'ai_proposed'
           )
     ORDER BY (COALESCE(ls.last_on, c.formed_at) + v_cadence)
     LIMIT GREATEST(1, LEAST(200, p_limit));
END; $$;
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_meeting_proposal_awaiting(int) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_meeting_proposal_awaiting(int) TO service_role;

-- ── 8) Record a proposed sitting (service_role ONLY) ────────────────────────
CREATE OR REPLACE FUNCTION public.fn_accreditation_record_meeting_proposal(
  p_committee_id uuid, p_proposed_for date, p_member_ids uuid[], p_rationale text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_id uuid; v_institution uuid;
BEGIN
  SELECT institution_id INTO v_institution
    FROM public.accreditation_committees WHERE id = p_committee_id AND is_active;
  IF v_institution IS NULL THEN
    RAISE EXCEPTION 'record_meeting_proposal: committee % not found or inactive', p_committee_id;
  END IF;
  INSERT INTO public.accreditation_meeting_proposals
    (committee_id, institution_id, proposed_for, proposed_member_ids, rationale, status)
  VALUES (p_committee_id, v_institution, p_proposed_for,
          COALESCE(p_member_ids,'{}'::uuid[]), p_rationale, 'ai_proposed')
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_record_meeting_proposal(uuid,date,uuid[],text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_record_meeting_proposal(uuid,date,uuid[],text) TO service_role;

-- ── 9) THE ONLY PATH THAT CREATES A REAL SITTING (authenticated) ────────────
-- Writes accreditation_committee_meetings and NOTHING else. It deliberately
-- does not touch meeting_bookings / meeting_agendas / meeting_agenda_items /
-- the webhook dispatcher / calendar sync — that engine invites real people, and
-- a proposal must never become an invitation without a human pressing Confirm.
CREATE OR REPLACE FUNCTION public.fn_accreditation_meeting_proposal_confirm(
  p_id uuid, p_action text, p_scheduled_for date DEFAULT NULL, p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_row public.accreditation_meeting_proposals;
  v_uid uuid := auth.uid();
  v_no  int;
  v_meeting uuid;
BEGIN
  SELECT * INTO v_row FROM public.accreditation_meeting_proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal % not found', p_id; END IF;
  IF NOT (is_super_admin()
          OR (user_has_permission('accreditation.naac.committees.meetings.manage')
              AND role_has_institution_access(v_row.institution_id))) THEN
    RAISE EXCEPTION 'you do not have permission to confirm sittings for this institution';
  END IF;
  IF v_row.status <> 'ai_proposed' THEN
    RAISE EXCEPTION 'proposal already %', v_row.status;
  END IF;

  IF p_action = 'decline' THEN
    UPDATE public.accreditation_meeting_proposals SET
      status = 'declined', decided_at = now(), decided_by = v_uid, decline_note = p_note
     WHERE id = p_id;
    RETURN NULL;
  ELSIF p_action <> 'confirm' THEN
    RAISE EXCEPTION 'unknown action %', p_action;
  END IF;

  SELECT COALESCE(max(meeting_no), 0) + 1 INTO v_no
    FROM public.accreditation_committee_meetings WHERE committee_id = v_row.committee_id;

  INSERT INTO public.accreditation_committee_meetings
    (committee_id, institution_id, meeting_no, scheduled_for, status, created_by)
  VALUES (v_row.committee_id, v_row.institution_id, v_no,
          COALESCE(p_scheduled_for, v_row.proposed_for), 'scheduled', v_uid)
  RETURNING id INTO v_meeting;

  UPDATE public.accreditation_meeting_proposals SET
    status = 'convener_confirmed', created_meeting_id = v_meeting,
    decided_at = now(), decided_by = v_uid
   WHERE id = p_id;

  RETURN v_meeting;
END; $$;
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_meeting_proposal_confirm(uuid,text,date,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_meeting_proposal_confirm(uuid,text,date,text) TO authenticated;

-- ── 10) Re-point the DARK cac_brief row at the proven glue template ─────────
-- ONE job type parameterised by committee kind (CAC cluster council OR a college
-- IQAC), not a near-duplicate row. The prompt itself moves to
-- lib/services/accreditation/meeting-draft-service.ts where it is
-- version-controlled and unit-testable, and the row carries the `{{prompt}}`
-- glue template — the SAME contract enqueueJobsLane + the Max-lane drain already
-- run in production for the narrative drafter. The previous 8-placeholder
-- template relied on out-of-repo mustache substitution that nothing in
-- jicate/main exercises; the row has no producer today (verified by git grep),
-- so re-pointing it cannot regress any live behaviour.
-- `enabled` is deliberately NOT touched — the Director owns the flip.
UPDATE public.ai_job_types SET
  title = 'CAC / IQAC · Pre-meeting brief + agenda',
  description = 'Pre-sitting brief + proposed agenda for a committee sitting — a Cluster Academic Council OR a college IQAC (the committee kind is carried in the prompt). Covers loop deltas vs the committee''s own baseline, below-target items, carried resolutions with strike counts (2+ strikes flagged for Director escalation), and evidence landed. Enforces the forbidden-agenda rule: platform-readable numbers stay in the brief, never on the agenda — checked deterministically by agenda-doctrine-gate.ts, not left to the prompt. The convener okays the draft; the AI never decides. DARK: enabled=false until the Director flips it.',
  prompt_template = '{{prompt}}',
  input_schema = '[{"key":"prompt","label":"Assembled prompt","type":"textarea","required":true}]'::jsonb,
  updated_at = now()
WHERE job_type = 'accreditation.cac_brief';

-- ── 11) The minutes-prose polish job (NEW, DARK) ────────────────────────────
-- Earns its own row: a different fact block and a different forbidden output
-- ("you may not add a decision, an attendee, or a date") from the brief.
INSERT INTO public.ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target, interactive,
   lane, allow_rule, max_inflight, schedulable, enabled, input_schema, expected_seconds,
   provider, model_id, external_allowed, loop_key)
SELECT
  'accreditation.meeting_minutes_polish',
  'Committee · Minutes prose polish',
  'Turns the structurally pre-filled Action-Taken-Report minutes into the formal write-up. Prose polish ONLY: it may not add a decision, an attendee, or a date, and it may not drop a resolution. The deterministic grounding validator catches added facts and an omission check catches dropped resolutions; the polished prose is offered to the convener as an accept/reject alternative and NEVER overwrites the structural minutes. DARK: enabled=false until the Director flips it.',
  '{{prompt}}', 'none', 'job.result',
  false,          -- interactive: scheduled types must be false (chat drain would starve it)
  'max', 'seat_owner', 1, true,
  false,          -- enabled: DARK
  '[{"key":"prompt","label":"Assembled prompt","type":"textarea","required":true}]'::jsonb,
  45, 'anthropic', 'sonnet',
  false,          -- external_allowed: internal governance document
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_job_types WHERE job_type = 'accreditation.meeting_minutes_polish'
);

-- ── 12) Dispatcher schedule (not an extra vercel.json cron) ─────────────────
-- 253 min = 04:13 IST. Verified clear of the existing 221/231/247/263/277 cluster.
INSERT INTO public.ai_routine_schedules (routine_id, enabled, minute_of_day, managed)
SELECT 'accreditation-committee-ai-drafts', true, 253, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_routine_schedules WHERE routine_id = 'accreditation-committee-ai-drafts'
);
