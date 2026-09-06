-- ============================================================================
-- SCHOOL OF INFLUENCE — batches on the shared cohort spine (S3)
-- Created: 2026-07-30  (spec: specs/school-of-influence-batches-2026-07-30.md, §7 S3)
-- ============================================================================
-- Decisions implemented here (spec §2):
--   D1  Batches are PARALLEL groups sharing the programme period → one
--       public.cohorts row per batch, kind='school_of_influence', all pointing at
--       the same source event via config.source_event_id.
--   D10 One ACTIVE membership per person per programme — BLOCKED IN THE DATABASE,
--       not in app logic (mirrors YiFuture's uniq_delegate_per_edition design).
--   D13 Per-batch intake windows reuse the spine's existing cohorts.opens_at /
--       cohorts.closes_at columns — NO new columns are added.
--
-- NO NEW TABLE, NO NEW COLUMN, NO NEW RLS POLICY.
--   Batches are cohorts rows and batch members are cohort_memberships rows, so
--   they inherit the spine's existing RLS verbatim from
--   20260731040000_cohort_core_spine.sql: every policy leads with
--   is_super_admin() OR is_admin() and scopes through
--   role_has_institution_access(cohorts.institution_id) (memberships scope via
--   their parent cohort with EXISTS). Permission keys stay inside the four already
--   registered in lib/constants/permissions.ts — cohort.view/create/edit/manage —
--   so nothing here is ungrantable from Role Management.
--
-- Capacity is deliberately NOT a database constraint. Spec D5 says a full batch
-- either waitlists or points the applicant at a batch with room, decided at
-- runtime from platform_policies (soi.batch_capacity / soi.batch_full_behaviour).
-- A hard DB limit would make 'offer_another_batch' impossible.
--
-- THREE CHANGES, in order:
--   1. widen cohorts_kind_check to admit 'school_of_influence'
--   2. a trigger that stamps the programme claim key on SoI memberships
--   3. the partial UNIQUE index that enforces D10
--
-- NOT APPLIED TO ANY DATABASE — Director-gated apply. Validated on prod inside a
-- single Mgmt-API BEGIN..ROLLBACK batch (transcript in the PR body). This file
-- carries no BEGIN;/COMMIT; of its own precisely so that wrapping it stays a
-- dry run (ref feedback_inner_commit_defeats_begin_rollback_dryrun).
-- ============================================================================

-- ── 1. cohorts.kind vocabulary — admit 'school_of_influence' ──────────────────
-- MEASURED LIVE 2026-07-30, and the spec's §6 prerequisite list did NOT mention
-- it: cohorts_kind_check admits only sf100/foundations/cdc/trainer/mba_associate.
-- Without this widening, EVERY batch insert fails with 23514 and S4/S5 have
-- nothing to write into. The five existing values are preserved verbatim.
-- Idempotent (drop-if-exists then re-add), same shape as the precedent in
-- 20260724071217_mba_access_wiring.sql which added 'mba_associate'.
ALTER TABLE public.cohorts DROP CONSTRAINT IF EXISTS cohorts_kind_check;
ALTER TABLE public.cohorts ADD CONSTRAINT cohorts_kind_check
  CHECK (kind = ANY (ARRAY[
    'sf100'::text,
    'foundations'::text,
    'cdc'::text,
    'trainer'::text,
    'mba_associate'::text,
    'school_of_influence'::text
  ]));

-- ── 2. the programme claim key (D10, part 1 of 2) ─────────────────────────────
-- A partial UNIQUE index can only read columns of its OWN table, and
-- cohort_memberships has no programme column — the programme lives on the parent
-- cohorts row. So the claim key is derived ONTO the membership by this trigger and
-- indexed as an expression over the spine's existing `config` jsonb. That keeps
-- the shared table's SHAPE untouched: no new column, no other domain affected
-- (every one of the 62 live memberships keeps a NULL key and therefore sits
-- outside the index entirely).
--
-- Deriving the key in a TRIGGER rather than in the service is what makes D10
-- structural: the key cannot be forged or omitted by ANY writer (service, future
-- API route, psql, service-role script), so the unique index below cannot be
-- bypassed. A caller-supplied value is always recomputed and overwritten.
--
-- FAIL-CLOSED: a batch with no config.source_event_id keys to '…:unattributed',
-- so all unattributed SoI batches share ONE exclusivity namespace. That blocks
-- more than strictly required, which is the safe direction for a decision whose
-- answer is "BLOCKED".
CREATE OR REPLACE FUNCTION public.fn_soi_stamp_membership_programme_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kind text;
  v_src  text;
BEGIN
  -- Hot-path skip. On an UPDATE that neither re-points the membership at another
  -- cohort nor touches the claim key, nothing can change — so every other
  -- domain's membership updates (status changes, role edits, the spine's own
  -- updated_at churn) do no cohorts lookup at all.
  IF TG_OP = 'UPDATE'
     AND NEW.cohort_id = OLD.cohort_id
     AND (NEW.config ->> 'soi_programme_key')
         IS NOT DISTINCT FROM (OLD.config ->> 'soi_programme_key')
  THEN
    RETURN NEW;
  END IF;

  -- SECURITY DEFINER on purpose: the parent cohort must resolve deterministically
  -- even for a caller who cannot SELECT it under RLS (e.g. an applicant creating
  -- their own membership in S4). Reads one row by primary key and returns no data
  -- to the caller, so it leaks nothing.
  SELECT c.kind, NULLIF(btrim(c.config ->> 'source_event_id'), '')
    INTO v_kind, v_src
  FROM public.cohorts c
  WHERE c.id = NEW.cohort_id;

  IF v_kind = 'school_of_influence' THEN
    NEW.config := COALESCE(NEW.config, '{}'::jsonb)
      || jsonb_build_object(
           'soi_programme_key',
           'school_of_influence:' || COALESCE(v_src, 'unattributed')
         );
  ELSE
    -- Not a School of Influence batch — never leave a stale exclusivity claim
    -- behind. This is the path a membership takes when it is transferred OUT of
    -- SoI into another programme: keeping the key would silently reserve a slot
    -- in a programme the person is no longer in.
    NEW.config := COALESCE(NEW.config, '{}'::jsonb) - 'soi_programme_key';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_soi_stamp_membership_programme_key() IS
  'School of Influence D10: derives cohort_memberships.config.soi_programme_key '
  'from the parent cohort (kind + config.source_event_id) so the partial UNIQUE '
  'index uniq_soi_one_active_batch_per_person can enforce one active membership '
  'per person per programme. No-op for every non-SoI cohort.';

-- Hard rule (CLAUDE.md "Lock new RPCs from anon"): re-assert the anon lock in the
-- SAME file as the CREATE OR REPLACE. Supabase's ALTER DEFAULT PRIVILEGES grants
-- anon EXECUTE on every new function separately from PUBLIC, so both are revoked.
-- NO GRANT is issued: this is a trigger function (RETURNS trigger). PostgreSQL
-- does not check EXECUTE when a trigger fires, and PostgREST cannot expose it as
-- an RPC — so granting `authenticated` would add callable surface that nothing
-- needs. The revoke is the whole security story here.
REVOKE EXECUTE ON FUNCTION public.fn_soi_stamp_membership_programme_key()
  FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_cohort_memberships_soi_programme_key
  ON public.cohort_memberships;
CREATE TRIGGER trg_cohort_memberships_soi_programme_key
  BEFORE INSERT OR UPDATE ON public.cohort_memberships
  FOR EACH ROW EXECUTE FUNCTION public.fn_soi_stamp_membership_programme_key();

-- ── 3. D10 enforced — one active membership per person per programme ──────────
-- Scoped to NON-TERMINAL statuses only. 'graduated' and 'removed' are the spine's
-- two terminal membership statuses (lib/services/cohort-core/lifecycle.ts:
-- MEMBERSHIP_TRANSITIONS gives them no outgoing edges), so a person who finished
-- or left a round is free to join a LATER round — while invited / enrolled /
-- active / paused all still occupy the one slot. 'paused' is deliberately inside
-- the index: a paused member is still in the batch (paused → active is a legal
-- edge), so pausing must not free a slot for a second batch.
--
-- member_type is deliberately NOT part of the key. A person is one person; adding
-- member_type would let the same human hold a 'learner' slot AND a 'staff' slot in
-- the same programme. The service always resolves members to a profiles.id, so
-- member_ref is one-value-per-human and this key reads exactly as
-- "one active membership per person per programme".
--
-- config ->> text is IMMUTABLE, so it is index-safe as an expression.
--
-- PRE-FLIGHT, measured live on prod 2026-07-30 BEFORE writing this file:
--   memberships_total 62 · non_terminal_total 62 · would_violate_groups 0 ·
--   soi_non_terminal 0  → zero existing rows would violate this index.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_soi_one_active_batch_per_person
  ON public.cohort_memberships ((config ->> 'soi_programme_key'), member_ref)
  WHERE (config ->> 'soi_programme_key') IS NOT NULL
    AND status NOT IN ('graduated', 'removed');

COMMENT ON INDEX public.uniq_soi_one_active_batch_per_person IS
  'School of Influence D10: one ACTIVE membership per person per programme, '
  'enforced in the database. Non-terminal statuses only, so a person may rejoin '
  'a later round. Covers 0 non-SoI rows (their soi_programme_key is NULL).';

-- No backfill: 0 cohorts of kind school_of_influence exist (measured live
-- 2026-07-30), so there are no memberships to stamp. Existing SoI memberships,
-- once they exist, are re-stamped by the trigger on their next write; the trigger
-- deliberately does NOT re-key live memberships when a batch's source_event_id
-- changes, because that would silently reshuffle the exclusivity namespace under
-- people who are already enrolled.

NOTIFY pgrst, 'reload schema';
