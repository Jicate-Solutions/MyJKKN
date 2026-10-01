-- ─── Accreditation: close every permission-key gap on the CEO role ──────────
-- 2026-09-18 — Director instruction: "if permission denied, assign the
-- all-institutions privilege". Investigation read live the same day.
--
-- ══ WHAT WAS FOUND ═══════════════════════════════════════════════════════════
-- `ceo` (Chief Executive Officer) already has institution_scope = 'all', so
-- role_has_institution_access() returns true for every college — reach was
-- never the problem. Every accreditation RLS policy is permission-key gated
-- (user_has_permission(...) AND role_has_institution_access(...)); none names
-- a role string. The CEO held 34 of the 55 catalogued accreditation.* keys, so
-- these surfaces refused the CEO across ALL institutions:
--   /accreditation/manage/bodies                     accreditation.bodies.view
--   /accreditation/naac/surveys/stakeholders         accreditation.naac.surveys.stakeholder.view
--   MoU & Grants rows (institution_collaborations)   accreditation.collaborations.view
--   Utility readings (sustainability_meter_readings) accreditation.sustainability_readings.view
--   Evidence ledger (quality_evidence_mappings, *_naac_evidence) accreditation.evidence.view
--   IQAC meeting/resolution writes                   accreditation.naac.committees.meetings.manage
--   Submissions register                             accreditation.submissions.*
--   Narrative approval                               accreditation.naac.narrative.approve
--
-- ══ WHAT THIS GRANTS (ceo only) ══════════════════════════════════════════════
-- Every catalogued accreditation.* key EXCEPT:
--   accreditation.naac.narrative.edit   — owner-only action (the owning learner);
--                                         .approve covers the CEO's step.
--   accreditation.consents.create / .withdraw — DPDPA consent is submitted by the
--                                         person themself; never on their behalf.
-- managing_director is NOT touched (separate decision, same shape if wanted).
--
-- Apply out-of-band (supabase db push does not work in this repo).

UPDATE public.custom_roles
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
  'accreditation.bodies.view', true,
  'accreditation.bodies.manage', true,
  'accreditation.collaborations.view', true,
  'accreditation.collaborations.manage', true,
  'accreditation.consents.view', true,
  'accreditation.evidence.view', true,
  'accreditation.evidence.create', true,
  'accreditation.evidence.manage', true,
  'accreditation.evidence.restamp', true,
  'accreditation.naac.committees.meetings.manage', true,
  'accreditation.naac.narrative.approve', true,
  'accreditation.naac.surveys.stakeholder.view', true,
  'accreditation.naac.surveys.stakeholder.manage', true,
  'accreditation.submissions.view', true,
  'accreditation.submissions.create', true,
  'accreditation.submissions.manage', true,
  'accreditation.sustainability_readings.view', true,
  'accreditation.sustainability_readings.manage', true
),
updated_at = now()
WHERE role_key = 'ceo';

-- Guard: end state.
DO $$
DECLARE missing text[];
BEGIN
  SELECT array_agg(k) INTO missing
  FROM unnest(ARRAY[
    'accreditation.bodies.view','accreditation.collaborations.view','accreditation.evidence.view',
    'accreditation.naac.surveys.stakeholder.view','accreditation.submissions.view',
    'accreditation.sustainability_readings.view','accreditation.naac.committees.meetings.manage',
    'accreditation.naac.narrative.approve']) k
  WHERE NOT EXISTS (
    SELECT 1 FROM public.custom_roles
    WHERE role_key = 'ceo' AND institution_scope = 'all'
      AND (permissions->>k)::boolean = true);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'ceo still missing: %', missing;
  END IF;
END $$;
