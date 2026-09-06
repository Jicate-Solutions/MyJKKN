-- ============================================================================
-- Cluster Academic Council — the cluster roster becomes data
-- Director decision, 2026-07-26 (evening)
--
-- WHY
-- The CAC is ONE council holding every JKKN college AND school together, so
-- academic planning is integrated, resources are shared instead of duplicated,
-- and quality improvement is coordinated across disciplinary silos — saving
-- time, money, energy and resources.
--
-- The committee engine could not express that. `institution_id` is NOT NULL and
-- single-valued, so a council spanning everything had to be filed under ONE
-- college, and the create dialog's picker (filtered to iqac_code IS NOT NULL)
-- offered only the 8 IQAC colleges — excluding JKKN Main Office and BOTH
-- schools (JKKN Matric Higher Secondary School, Nattraja Vidhyalya CBSE).
-- So the cluster's own membership was unrepresentable.
--
-- WHAT
-- `member_institution_ids` records the cluster roster. `institution_id` keeps
-- its meaning as the FILING location (the umbrella row the council is booked
-- under) and NOT as ownership — deliberately left NOT NULL so that every
-- existing RLS policy on the committee tables, all of which scope by
-- institution_id, keeps working unchanged. Making it nullable was considered
-- and rejected: role_has_institution_access(NULL) would hide the council from
-- everyone until every committee policy was rewritten.
--
-- Reach of a single DECISION is already modelled separately, by
-- accreditation_committee_resolutions.affected_institution_ids (C7). This
-- column is the standing membership; that one is the per-resolution routing.
-- ============================================================================

ALTER TABLE public.accreditation_committees
  ADD COLUMN IF NOT EXISTS member_institution_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

COMMENT ON COLUMN public.accreditation_committees.member_institution_ids IS
  'Standing roster of institutions this committee spans. Empty for ordinary per-college committees (their scope IS institution_id). For committee_type=''cluster'' (the Cluster Academic Council) this holds every clustered institution — all colleges AND schools under the JKKN Institutions umbrella — because the council exists to integrate academic planning and share resources across them. institution_id remains the FILING location only, never ownership. Per-decision reach is separate: see accreditation_committee_resolutions.affected_institution_ids.';

-- A cluster of one is not a cluster. Guarded so the constraint is only added
-- once and never fails on existing rows (zero cluster committees exist today —
-- verified live 2026-07-26).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.accreditation_committees'::regclass
      AND conname  = 'accreditation_committees_cluster_needs_members'
  ) THEN
    ALTER TABLE public.accreditation_committees
      ADD CONSTRAINT accreditation_committees_cluster_needs_members
      CHECK (
        committee_type <> 'cluster'
        OR coalesce(array_length(member_institution_ids, 1), 0) >= 2
      );
  END IF;
END $$;

COMMENT ON CONSTRAINT accreditation_committees_cluster_needs_members
  ON public.accreditation_committees IS
  'A cluster council must name at least two member institutions — the same birth-gate spirit as loop_registry.owner_email: a body whose whole purpose is spanning institutions cannot be created without saying which ones it spans.';

-- NOTE (deliberate, not an oversight): element-level referential integrity on a
-- uuid[] is not expressible as a foreign key. The write path is the committees
-- UI, which sources the ids from the institutions table itself, and the read
-- path resolves ids against institutions (an unresolvable id renders as absent,
-- never as a fabricated name). A junction table would buy FK enforcement at the
-- cost of a second write path for one row per council; revisit only if councils
-- start being created by something other than this UI.
