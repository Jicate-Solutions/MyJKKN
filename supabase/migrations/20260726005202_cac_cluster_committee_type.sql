-- 20260726005202_cac_cluster_committee_type.sql
-- ============================================================================
-- CAC (Cluster Academic Council) engine — C1 + C7 (2026-07-26).
--
-- C1: widen accreditation_committees.committee_type CHECK with 'cluster' —
--     the cross-college Cluster Academic Council sits alongside the seven
--     existing per-college committee types.
-- C7: accreditation_committee_resolutions.affected_institution_ids uuid[] —
--     routing tag of the two-spine weave; a cluster (CAC) resolution names
--     the colleges it touches, and those colleges' IQAC briefs pick it up.
--
-- DB apply is Director-gated: validated on prod via BEGIN..ROLLBACK only.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- C1 — drop + recreate the committee_type CHECK with 'cluster' added.
-- The constraint name is found dynamically so the migration is robust to
-- environment naming drift; it is recreated under the SAME name.
-- Live prod CHECK (verified 2026-07-26):
--   committee_type = ANY (ARRAY['main','icc','anti_ragging','grievance',
--                               'coordinator','inspection','statutory'])
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname
    INTO v_conname
    FROM pg_constraint
   WHERE conrelid = 'public.accreditation_committees'::regclass
     AND contype = 'c'
     AND (conname ILIKE '%committee_type%'
          OR pg_get_constraintdef(oid) ILIKE '%committee_type%')
   ORDER BY (conname ILIKE '%committee_type%') DESC
   LIMIT 1;

  IF v_conname IS NULL THEN
    RAISE EXCEPTION 'committee_type CHECK constraint not found on public.accreditation_committees';
  END IF;

  EXECUTE format(
    'ALTER TABLE public.accreditation_committees DROP CONSTRAINT %I',
    v_conname
  );

  EXECUTE format(
    'ALTER TABLE public.accreditation_committees ADD CONSTRAINT %I '
    || 'CHECK (committee_type = ANY (ARRAY['
    || '''main'',''icc'',''anti_ragging'',''grievance'',''coordinator'','
    || '''inspection'',''statutory'',''cluster'']))',
    v_conname
  );

  RAISE NOTICE 'committee_type CHECK % recreated with ''cluster'' added', v_conname;
END $$;

-- ----------------------------------------------------------------------------
-- C7 — affected-colleges routing tag on resolutions.
-- ----------------------------------------------------------------------------
ALTER TABLE public.accreditation_committee_resolutions
  ADD COLUMN IF NOT EXISTS affected_institution_ids uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.accreditation_committee_resolutions.affected_institution_ids IS
  'Routing tag of the two-spine weave: a cluster (CAC) resolution names the colleges it touches; those colleges'' IQAC briefs pick it up. Empty for ordinary per-college resolutions.';
