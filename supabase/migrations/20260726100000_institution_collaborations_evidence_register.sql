-- ============================================================================
-- Accreditation — MoU / Grants register wired into the quality evidence spine
-- File: 20260726100000_institution_collaborations_evidence_register.sql (C6)
-- Date: 2026-07-26
--
-- WHY
--   NAAC-2024 Binary Framework metrics for collaborations (Attribute 7) and
--   external research grants (9.1) both sit at ZERO evidence rows in
--   quality_evidence_mappings — there is no institutional register feeding
--   them. Serves CAC Metric 5 internally; the NAAC rows are the body exhaust.
--
-- EXISTING-TABLE SURVEY (parallel-mechanism prevention, decided 2026-07-26):
--   - sh_solution_mous     → commercial per-solution deal documents (deal_value,
--                            AMC, payment_terms, signatories) tied to
--                            sh_solutions→sh_clients. NO institution linkage.
--                            Genuinely too narrow — NOT an institutional MoU
--                            register. Not wired. (0 rows live.)
--   - ss_grants            → DOES model institutional grants (institution_id,
--                            funder, sanctioned_amount, sanction/start/end
--                            dates, purpose). WIRED into 9.1 below via trigger
--                            — no parallel grants table for startup-studio
--                            money. (0 rows live today; evidence appears the
--                            day finance records a grant.)
--   - program_partner_grants → tied to program_partner_id only (no direct
--                            institution linkage); operational partner funding.
--                            Skipped; can be wired later via its partner join.
--
-- WHAT THIS ADDS
--   1. Seed NAAC metric 7.9 (Collaborations) — 9.1 already exists live
--      ('External research grants — count + amount of funded research
--      projects', verified 2026-07-26). Idempotent ON CONFLICT
--      (metric_type, metric_code) DO NOTHING — same style as 20260709030000.
--   2. ONE minimal register table institution_collaborations for what has no
--      home today: institutional MoUs, industry collaborations, and
--      non-startup-studio grants. RLS with explicit SELECT / INSERT / UPDATE /
--      DELETE policies (a missing UPDATE policy silently no-ops every UPDATE —
--      known incident, PR #2380).
--   3. Trigger-based evidence fan-out — the CANONICAL mechanism for
--      human-entered records (same as anti-ragging 20260417000002 and
--      grievance 20260422 fan-outs; the nightly rollup fn is for measured
--      loop cycles, its loop_key contract stays untouched):
--        institution_collaborations kind mou/industry_collaboration → NAAC 7.9
--        institution_collaborations kind grant                      → NAAC 9.1
--        ss_grants (institution-linked rows)                        → NAAC 9.1
--      Upserts on the junction's natural key (source_table, source_id,
--      body_code, metric_code); refreshes metadata on edit; never clobbers a
--      manually-curated (is_auto=false) mapping (same guard as the rollup fn);
--      AFTER DELETE cleanup removes auto rows so evidence never dangles.
--   4. quality_evidence_source_registry rows for both sources — CONFIG rows,
--      seeded with INSERT ... WHERE NOT EXISTS (never ON CONFLICT).
--
-- SECURITY
--   Trigger functions are SECURITY DEFINER SET search_path = public (same as
--   emit_grievance_evidence). They RETURN trigger — not callable via
--   PostgREST — but EXECUTE is still revoked from anon, authenticated and
--   PUBLIC per the mandatory RPC lockdown template (2026-06-06); trigger
--   fire-time does not require caller EXECUTE, so nothing breaks.
--   fn_accreditation_ay_label is called INSIDE the SECDEF fns: the inner
--   privilege check runs against the definer (migration owner), which owns
--   that helper — consistent 'AY 2026-27' period labels with the rollup.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Seed NAAC metric 7.9 — Collaborations (Attribute 7). 9.1 exists live.
-- ----------------------------------------------------------------------------
INSERT INTO public.sh_accreditation_metrics
  (metric_type, metric_code, metric_name, category, is_active, is_system, notes)
VALUES
  ('NAAC', '7.9',
   'Collaborations — functional MoUs / linkages with national & international institutions and industry (count + activities)',
   'Attribute 7: Governance', true, true,
   'Evidence auto-emitted from the institution_collaborations register (kind mou / industry_collaboration) by emit_institution_collaboration_evidence — one row per active collaboration, refreshed on edit. Grants in the same register + ss_grants emit to 9.1. Seeded 2026-07-26 (C6 MoU/grants evidence wiring). Serves CAC Metric 5 internally.')
ON CONFLICT (metric_type, metric_code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Register table — institution_collaborations.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.institution_collaborations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind           text NOT NULL CHECK (kind IN ('mou', 'grant', 'industry_collaboration')),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  title          text NOT NULL,
  partner_name   text NOT NULL,
  scope          text CHECK (scope IN ('national', 'international')),
  signed_on      date NOT NULL,
  valid_till     date,
  amount_inr     numeric CHECK (amount_inr >= 0),
  status         text NOT NULL DEFAULT 'active'
                 CHECK (status IN ('draft', 'active', 'expired', 'terminated')),
  document_url   text,
  notes          text,
  created_by     uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ic_valid_till_after_signed CHECK (valid_till IS NULL OR valid_till >= signed_on)
);

COMMENT ON TABLE public.institution_collaborations IS
  'Institutional MoU / grants / industry-collaboration register (C6). Rows with status <> draft auto-emit quality_evidence_mappings evidence: mou/industry_collaboration → NAAC 7.9, grant → NAAC 9.1 (trigger emit_institution_collaboration_evidence). Managed at /accreditation/manage/collaborations. Startup-studio grant money stays in ss_grants (wired separately) — this register is for institution-level records that have no other home.';

CREATE INDEX IF NOT EXISTS idx_ic_institution_kind
  ON public.institution_collaborations (institution_id, kind);

DROP TRIGGER IF EXISTS set_updated_at ON public.institution_collaborations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.institution_collaborations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 3. RLS — explicit SELECT / INSERT / UPDATE / DELETE (never FOR ALL only;
--    a missing UPDATE policy makes every UPDATE silently affect 0 rows).
--    Keys seeded in lib/constants/permissions.ts in the same PR.
-- ----------------------------------------------------------------------------
ALTER TABLE public.institution_collaborations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ic_select" ON public.institution_collaborations;
CREATE POLICY "ic_select" ON public.institution_collaborations FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.collaborations.view')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS "ic_insert" ON public.institution_collaborations;
CREATE POLICY "ic_insert" ON public.institution_collaborations FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.collaborations.manage')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS "ic_update" ON public.institution_collaborations;
CREATE POLICY "ic_update" ON public.institution_collaborations FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.collaborations.manage')
      AND role_has_institution_access(institution_id))
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.collaborations.manage')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS "ic_delete" ON public.institution_collaborations;
CREATE POLICY "ic_delete" ON public.institution_collaborations FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.collaborations.manage')
      AND role_has_institution_access(institution_id))
);

-- ----------------------------------------------------------------------------
-- 4. Evidence source registry rows — CONFIG, seeded WHERE NOT EXISTS
--    (never ON CONFLICT, per registry seeding rule).
-- ----------------------------------------------------------------------------
INSERT INTO public.quality_evidence_source_registry
  (source_kind, source_table, display_name, description, is_system)
SELECT 'institution_collaboration', 'institution_collaborations',
       'Institution Collaborations (MoU & Grants Register)',
       'Institutional MoUs / industry collaborations emit NAAC 7.9; register grants emit NAAC 9.1. Trigger-emitted on save (emit_institution_collaboration_evidence), refreshed on edit, withdrawn on draft/delete.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.quality_evidence_source_registry
  WHERE source_kind = 'institution_collaboration'
     OR source_table = 'institution_collaborations'
);

INSERT INTO public.quality_evidence_source_registry
  (source_kind, source_table, display_name, description, is_system)
SELECT 'ss_grant', 'ss_grants',
       'Startup Studio Grants',
       'Institution-linked startup-studio grant records emit NAAC 9.1 (external research grants) evidence. Trigger-emitted on save (emit_ss_grant_evidence); rows without an institution are skipped until one is set.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.quality_evidence_source_registry
  WHERE source_kind = 'ss_grant'
     OR source_table = 'ss_grants'
);

-- ----------------------------------------------------------------------------
-- 5. Fan-out trigger — institution_collaborations → NAAC 7.9 / 9.1.
--    Upsert refreshes metadata on edit (register rows are hand-edited; a
--    title/amount fix must propagate) but never clobbers a manually-curated
--    is_auto=false mapping — same guard as fn_accreditation_rollup_loop_evidence.
--    Stale-key hygiene: if kind changes (mou→grant moves 7.9→9.1) or status
--    returns to draft, the now-wrong AUTO rows for this source are removed.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emit_institution_collaboration_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metric text;
BEGIN
  v_metric := CASE WHEN NEW.kind = 'grant' THEN '9.1' ELSE '7.9' END;

  -- Withdraw AUTO evidence that no longer matches this row (kind flip or
  -- back-to-draft). Manual (is_auto=false) mappings are never touched.
  DELETE FROM public.quality_evidence_mappings
  WHERE source_table = 'institution_collaborations'
    AND source_id = NEW.id
    AND is_auto
    AND (NEW.status = 'draft' OR metric_code <> v_metric OR body_code <> 'NAAC');

  IF NEW.status <> 'draft' THEN
    INSERT INTO public.quality_evidence_mappings (
      source_table, source_id, institution_id,
      body_code, metric_code, period_label,
      mapped_by, is_auto, metadata, mapped_at
    ) VALUES (
      'institution_collaborations', NEW.id, NEW.institution_id,
      'NAAC', v_metric,
      public.fn_accreditation_ay_label(NEW.signed_on::timestamptz),
      NEW.created_by, true,
      jsonb_build_object(
        'kind',           NEW.kind,
        'title',          NEW.title,
        'partner_name',   NEW.partner_name,
        'scope',          NEW.scope,
        'signed_on',      NEW.signed_on,
        'valid_till',     NEW.valid_till,
        'amount_inr',     NEW.amount_inr,
        'status',         NEW.status,
        'document_url',   NEW.document_url,
        'source_trigger', 'emit_institution_collaboration_evidence'
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
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.emit_institution_collaboration_evidence() FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.emit_institution_collaboration_evidence() IS
  'C6: fans institution_collaborations rows (status <> draft) into quality_evidence_mappings — kind mou/industry_collaboration → NAAC 7.9, kind grant → NAAC 9.1. Refreshes on edit, withdraws stale auto rows on kind change / back-to-draft, never clobbers manual (is_auto=false) mappings.';

DROP TRIGGER IF EXISTS trg_ic_evidence_fanout ON public.institution_collaborations;
CREATE TRIGGER trg_ic_evidence_fanout
AFTER INSERT OR UPDATE ON public.institution_collaborations
FOR EACH ROW
EXECUTE FUNCTION public.emit_institution_collaboration_evidence();

-- ----------------------------------------------------------------------------
-- 6. Fan-out trigger — ss_grants → NAAC 9.1 (wiring the EXISTING grants table,
--    not duplicating it). Rows without institution_id are skipped (the
--    junction's institution_id is NOT NULL); if the institution is later
--    nulled, the auto row is withdrawn.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emit_ss_grant_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.institution_id IS NULL THEN
    DELETE FROM public.quality_evidence_mappings
    WHERE source_table = 'ss_grants' AND source_id = NEW.id AND is_auto;
    RETURN NEW;
  END IF;

  INSERT INTO public.quality_evidence_mappings (
    source_table, source_id, institution_id,
    body_code, metric_code, period_label,
    mapped_by, is_auto, metadata, mapped_at
  ) VALUES (
    'ss_grants', NEW.id, NEW.institution_id,
    'NAAC', '9.1',
    public.fn_accreditation_ay_label(
      COALESCE(NEW.sanction_date::timestamptz, NEW.start_date::timestamptz, NEW.created_at)
    ),
    NULL, true,
    jsonb_build_object(
      'name',              NEW.name,
      'funder',            NEW.funder,
      'grant_number',      NEW.grant_number,
      'sanctioned_amount', NEW.sanctioned_amount,
      'received_amount',   NEW.received_amount,
      'currency',          NEW.currency,
      'sanction_date',     NEW.sanction_date,
      'start_date',        NEW.start_date,
      'end_date',          NEW.end_date,
      'purpose',           NEW.purpose,
      'source_trigger',    'emit_ss_grant_evidence'
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

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.emit_ss_grant_evidence() FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.emit_ss_grant_evidence() IS
  'C6: fans institution-linked ss_grants rows into quality_evidence_mappings as NAAC 9.1 (external research grants) evidence. Refreshes on edit; withdraws the auto row if institution_id is nulled; never clobbers manual (is_auto=false) mappings.';

DROP TRIGGER IF EXISTS trg_ss_grants_evidence_fanout ON public.ss_grants;
CREATE TRIGGER trg_ss_grants_evidence_fanout
AFTER INSERT OR UPDATE ON public.ss_grants
FOR EACH ROW
EXECUTE FUNCTION public.emit_ss_grant_evidence();

-- ----------------------------------------------------------------------------
-- 7. Delete hygiene — an editable register can lose rows; auto-emitted
--    evidence must not dangle at a deleted source. Manual mappings survive
--    (an auditor may have deliberately pinned them).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_collab_evidence_cleanup_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.quality_evidence_mappings
  WHERE source_table = TG_TABLE_NAME
    AND source_id = OLD.id
    AND is_auto;
  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_collab_evidence_cleanup_on_delete() FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.fn_collab_evidence_cleanup_on_delete() IS
  'C6: AFTER DELETE cleanup for evidence-emitting source tables — removes AUTO quality_evidence_mappings rows (source_table = TG_TABLE_NAME) so evidence never points at a deleted register/grant row. Manual (is_auto=false) mappings survive.';

DROP TRIGGER IF EXISTS trg_ic_evidence_cleanup ON public.institution_collaborations;
CREATE TRIGGER trg_ic_evidence_cleanup
AFTER DELETE ON public.institution_collaborations
FOR EACH ROW
EXECUTE FUNCTION public.fn_collab_evidence_cleanup_on_delete();

DROP TRIGGER IF EXISTS trg_ss_grants_evidence_cleanup ON public.ss_grants;
CREATE TRIGGER trg_ss_grants_evidence_cleanup
AFTER DELETE ON public.ss_grants
FOR EACH ROW
EXECUTE FUNCTION public.fn_collab_evidence_cleanup_on_delete();

-- ----------------------------------------------------------------------------
-- 8. Apply-time asserts — fail loudly here rather than the triggers failing
--    silently forever (same discipline as 20260709023000).
-- ----------------------------------------------------------------------------
DO $assert$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.quality_evidence_mappings'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%source_table, source_id, body_code, metric_code%'
  ) THEN
    RAISE EXCEPTION 'quality_evidence_mappings is missing UNIQUE (source_table, source_id, body_code, metric_code) — the fan-out upserts depend on it';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sh_accreditation_metrics
    WHERE metric_type = 'NAAC' AND metric_code = '9.1'
  ) THEN
    RAISE EXCEPTION 'NAAC metric 9.1 missing from sh_accreditation_metrics — grants evidence would target a nonexistent metric';
  END IF;
END $assert$;

-- Reload PostgREST's schema cache so the new table resolves immediately after
-- a raw Management-API apply (which does NOT auto-reload).
NOTIFY pgrst, 'reload schema';
