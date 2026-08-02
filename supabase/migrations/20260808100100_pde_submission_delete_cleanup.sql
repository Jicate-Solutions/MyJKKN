-- ============================================================================
-- Migration: 20260808100100_pde_submission_delete_cleanup
-- Date: 2026-08-08
-- NOT APPLIED to any database — Director-gated apply.
-- ============================================================================
-- WHAT IS BROKEN
--   app/api/pde/clinical-reasoning/score/route.ts writes two downstream effects
--   for every scored attempt, and NEITHER is linked to the submission by a
--   foreign key:
--     side effect 2: UPSERT pde_learner_capabilities  (best-score-wins)
--     side effect 3: INSERT pde_engagement_events     (clinical_case_completed)
--   Deleting a pde_submissions row therefore leaves both behind, and the
--   capability row keeps propping up a learner skill record that no surviving
--   attempt earned. Hit for real during the 2026-07-27 walk; two orphan rows had
--   to be deleted by hand.
--
-- KEY DISCOVERY — the link already exists, just not as a column
--   Both dependent tables already carry the submission id inside JSONB:
--     pde_engagement_events.metadata           ->> 'submission_id'
--     pde_learner_capabilities.demonstration_evidence ->> 'submission_id'
--   So this migration needs no change to any route. It owns migrations only.
--
-- TWO DIFFERENT MECHANISMS, because the two dependent tables differ in cardinality
--
--   1. pde_engagement_events — GENUINE FK + ON DELETE CASCADE (the preference)
--      One event row per completed attempt: a true child. A real declarative FK
--      is strictly better than a trigger — Postgres enforces it, it survives any
--      future writer, and the relationship becomes visible in the schema.
--      The column is populated without touching app code: backfilled here, and
--      kept current by a BEFORE INSERT/UPDATE trigger that mirrors
--      metadata->>'submission_id' into it. The trigger only sets the column when
--      the referenced submission actually EXISTS, so the new FK can never reject
--      a write that succeeds today (side effect 3 is non-fatal in the route — a
--      rejection would silently drop engagement telemetry instead of erroring).
--
--   2. pde_learner_capabilities — AFTER DELETE RECOMPUTE, deliberately NOT a FK
--      This table is UNIQUE(learner_id, capability_id): ONE row per learner per
--      capability, upserted across MANY attempts, holding max(score) — an
--      aggregate, not a child. A FK with ON DELETE CASCADE would be actively
--      DESTRUCTIVE here:
--        attempt 1 = 50%, attempt 2 = 80% -> score 80, evidence points at the
--        most recently scored attempt. Cascade-deleting on that pointer wipes
--        the whole row, destroying the record the OTHER surviving attempt
--        legitimately earned.
--      Keying off the evidence pointer alone is also insufficient in the reverse
--      ordering: attempt 1 = 80%, attempt 2 = 50% leaves score 80 with the
--      pointer on attempt 2, so deleting attempt 1 (the one that actually earned
--      the 80) would not match at all and the inflated score would survive.
--      The only correct behaviour is to RECOMPUTE from the attempts that remain,
--      and to delete the row only when none remain.
--
-- CONCURRENCY: the recompute takes a FOR UPDATE lock on the capability row
--   before computing the surviving best. Without it, two attempts for the same
--   learner deleted concurrently would each still see the other's soon-deleted
--   row on a READ COMMITTED snapshot, and the later UPDATE would write a best
--   score pointing at an already-deleted attempt — reintroducing the very
--   inflated, dangling score this trigger removes.
--
-- SAFETY: the cleanup trigger can never block a delete. Its body is wrapped in
--   an exception handler that raises a WARNING and lets the DELETE stand. A
--   cleanup failure must not make a submission undeletable. This is a conscious
--   trade: a failed recompute (lock timeout, unexpected data) leaves the stale
--   capability row in place and reports it only as a WARNING in the Postgres
--   log. Blocking the DELETE instead would make an attempt permanently
--   undeletable, which is strictly worse; the verification query in the PR body
--   detects any row that did survive.
--
-- ON DELETE CASCADE on pde_engagement_events is intentional, not an oversight:
--   removing what a deleted attempt spawned is the stated purpose of this
--   change. It does mean an admin correcting an attempt also erases that
--   attempt's clinical_case_completed telemetry. SET NULL would preserve the
--   event as an unattributed row, but that contradicts the requirement and
--   leaves exactly the orphan this migration exists to eliminate.
--
-- The passing threshold is read straight from platform_policies, mirroring
--   fn_get_policy_clinical_reasoning('scoring.passing_threshold_pct', 60)
--   predicate-for-predicate, rather than calling that RPC: if the function were
--   ever absent the call would RAISE inside the trigger and block the delete.
--   Falls back to 60, exactly as the route does.
--
-- Contains NO BEGIN/COMMIT of its own, so wrapping the file in BEGIN..ROLLBACK
-- stays a genuine dry run.
--
-- Idempotent. Re-running changes nothing.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. pde_engagement_events: real FK to the submission that spawned the event
-- ----------------------------------------------------------------------------

ALTER TABLE public.pde_engagement_events
  ADD COLUMN IF NOT EXISTS source_submission_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pde_engagement_events_source_submission_id_fkey'
      AND conrelid = 'public.pde_engagement_events'::regclass
  ) THEN
    ALTER TABLE public.pde_engagement_events
      ADD CONSTRAINT pde_engagement_events_source_submission_id_fkey
      FOREIGN KEY (source_submission_id)
      REFERENCES public.pde_submissions(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON COLUMN public.pde_engagement_events.source_submission_id IS
  'The pde_submissions attempt that spawned this event, when one did. ON DELETE CASCADE: deleting an attempt removes the events it produced. Mirrored automatically from metadata->>''submission_id'' by trg_pde_engagement_events_link_submission, so no route change is required. NULL for events not produced by an attempt.';

-- A FK column needs its own index: without one, every DELETE on pde_submissions
-- has to sequentially scan pde_engagement_events to enforce the cascade.
CREATE INDEX IF NOT EXISTS idx_pde_engagement_events_source_submission
  ON public.pde_engagement_events (source_submission_id)
  WHERE source_submission_id IS NOT NULL;

-- Backfill. Shape-guarded, then cast to uuid so it normalises exactly the way
-- the runtime trigger does. Comparing against s.id::text instead would match
-- only the lowercase canonical spelling, so a pre-existing event holding an
-- upper-case or otherwise non-canonical uuid would never link — and would then
-- never be cascade-cleaned, leaving precisely the orphan this migration exists
-- to remove. The regex runs first so no invalid text ever reaches the cast
-- (that is how 22P02 gets raised); Postgres does not guarantee WHERE-clause
-- ordering, so the guard is a CASE, not a sibling predicate.
UPDATE public.pde_engagement_events e
   SET source_submission_id = s.id
  FROM public.pde_submissions s
 WHERE e.source_submission_id IS NULL
   AND s.id = CASE
                WHEN e.metadata ->> 'submission_id' ~
                     '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                THEN (e.metadata ->> 'submission_id')::uuid
              END;

-- SECURITY DEFINER, deliberately. The lookup asks "does this submission EXIST",
-- which is not the same question as "can the current writer SEE it". As
-- SECURITY INVOKER the SELECT ran under caller RLS, so any writer without a
-- read path to the submission — anything other than the owning learner, whose
-- pde_sub_own_read policy is what makes the route path work today — would fail
-- to resolve the link, leave source_submission_id NULL, and thereby let that
-- event ESCAPE the cascade cleanup this migration exists to guarantee. The
-- orphan would come back silently. Reading existence with definer rights makes
-- the link independent of who is writing.
--
-- This leaks nothing: the function returns no data to the caller, and writes
-- only an id the caller already supplied inside metadata.
CREATE OR REPLACE FUNCTION public.fn_pde_engagement_link_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_raw  text;
  v_link uuid;
BEGIN
  v_raw := NEW.metadata ->> 'submission_id';

  -- Shape-check BEFORE casting. plpgsql IF guarantees the ordering that a SQL
  -- WHERE clause does not, and casting first is how 22P02 gets raised on a
  -- metadata blob that happens to carry a non-uuid submission_id.
  IF v_raw IS NOT NULL
     AND v_raw ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  THEN
    -- Only link to a submission that exists, so the FK can never reject a write
    -- that succeeds today — AND only to one belonging to the same learner this
    -- event is about.
    --
    -- That second predicate is what keeps definer rights safe. Without it the
    -- lookup would resolve ANY submission on the platform, which turns the
    -- trigger into a cross-tenant existence oracle (a caller learns whether a
    -- guessed uuid is a submission by watching the column populate) and couples
    -- the cascade across tenants: naming a foreign submission would let that
    -- tenant's delete cascade away this event. Scoping to NEW.learner_id closes
    -- both without giving back what INVOKER cost us — the link no longer depends
    -- on whether the WRITER can see the row, only on whether the event and the
    -- attempt describe the same learner, which is the only case the FK is
    -- meaningful for anyway.
    SELECT s.id INTO v_link
      FROM public.pde_submissions s
     WHERE s.id = v_raw::uuid
       AND s.learner_id = NEW.learner_id;
  END IF;

  -- The column is STRICTLY DERIVED: after this trigger it is always exactly
  -- what metadata->>'submission_id' resolves to, and nothing else. One
  -- assignment, no conditions, on both INSERT and UPDATE.
  --
  -- Every weaker version leaked. Only setting it when it was still NULL left a
  -- stale link behind when metadata was repointed, so a later delete could
  -- cascade away an event that by then named a different submission. Clearing
  -- it only when metadata had CHANGED still let a caller write the column
  -- directly, alongside metadata that does not support it, and have that value
  -- survive — a forged FK that CASCADE-deletes this event when the wrong
  -- attempt is removed. Assigning unconditionally is both simpler and the only
  -- form in which "derived, never trusted from caller input" is actually true.
  --
  -- It also keeps the FK's other guarantee absolute: because v_link is only
  -- ever the id of a submission that was just confirmed to exist, the FK can
  -- never reject a write that succeeds today.
  NEW.source_submission_id := v_link;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.fn_pde_engagement_link_submission() IS
  'BEFORE INSERT/UPDATE on pde_engagement_events: sets source_submission_id to whatever metadata->>''submission_id'' resolves to, and to NULL otherwise, so the FK cascade works without any route change. SECURITY DEFINER because it asks whether the submission EXISTS, not whether the writer can see it — under caller RLS any writer other than the owning learner would fail to link and that event would escape the cascade cleanup. The column is strictly derived and never trusted from caller input. Never raises.';

-- Trigger function: not reachable as a PostgREST RPC (RETURNS trigger), locked
-- anyway because Supabase default privileges hand anon EXECUTE on every new
-- function and this repo locks new functions unconditionally.
REVOKE EXECUTE ON FUNCTION public.fn_pde_engagement_link_submission() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_pde_engagement_link_submission() TO authenticated;

DROP TRIGGER IF EXISTS trg_pde_engagement_events_link_submission ON public.pde_engagement_events;
CREATE TRIGGER trg_pde_engagement_events_link_submission
  BEFORE INSERT OR UPDATE OF metadata, source_submission_id
  ON public.pde_engagement_events
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_pde_engagement_link_submission();

-- ----------------------------------------------------------------------------
-- 2. pde_learner_capabilities: recompute from surviving attempts on delete
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_pde_submission_deleted_recompute_capability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_capability_id  uuid;
  v_threshold      numeric := 60;
  v_threshold_raw  text;
  v_owns_row       boolean := false;
  v_lc_id          uuid;
  v_best_id        uuid;
  v_best_attempt   integer;
  v_best_score     numeric;
  v_best_osce      jsonb;
  v_status         text;
BEGIN
  -- The clinical-reasoning capability is the only one this scoring path writes.
  SELECT c.id INTO v_capability_id
    FROM public.pde_capabilities c
   WHERE c.slug = 'clinical_reasoning';
  IF v_capability_id IS NULL THEN
    RETURN OLD;
  END IF;

  -- FOR UPDATE, not a bare EXISTS: two attempts for the same learner deleted
  -- concurrently would each, on a READ COMMITTED snapshot, still see the other's
  -- soon-to-be-deleted row, and the later UPDATE would write a best score
  -- pointing at an already-deleted attempt — reintroducing the exact inflated,
  -- dangling score this trigger exists to remove. Taking the row lock first
  -- serialises the two recomputes; the loser's best-attempt query then runs
  -- against a fresh snapshot that already excludes the winner's deleted row.
  SELECT lc.id INTO v_lc_id
    FROM public.pde_learner_capabilities lc
   WHERE lc.learner_id = OLD.learner_id
     AND lc.capability_id = v_capability_id
     FOR UPDATE;
  IF v_lc_id IS NULL THEN
    RETURN OLD;
  END IF;

  -- PROVENANCE GATE. Only touch a row this scoring path actually produced —
  -- i.e. one whose evidence carries a submission_id. A capability demonstrated
  -- some other way (import, manual award, a future writer) carries no such
  -- pointer and is left completely alone, so this trigger can never destroy a
  -- record it did not create. Deciding by provenance rather than by assumed
  -- sole ownership of the row is what makes the DELETE below safe.
  SELECT EXISTS (
    SELECT 1 FROM public.pde_learner_capabilities lc
     WHERE lc.id = v_lc_id
       AND lc.demonstration_evidence ->> 'submission_id' IS NOT NULL
  ) INTO v_owns_row;

  IF NOT v_owns_row THEN
    RETURN OLD;
  END IF;

  -- Deliberately NO "was the deleted attempt a clinical case" test, and no
  -- "does the evidence point at the deleted attempt" test. Both were skip
  -- conditions, and both could skip a recompute that was needed: the first
  -- fails if the attempt's pde_assessments row is already gone, and the second
  -- misses whenever the pointer names a different surviving attempt — exactly
  -- the reverse-ordering case (80 then 50, delete the 80) where the inflated
  -- score must still be recomputed away. It also compared a uuid as raw text,
  -- so a non-canonical spelling would have missed. Recomputing unconditionally
  -- for an owned row is both simpler and strictly safer; the best-attempt query
  -- below already restricts itself to clinical_case attempts, so a delete on an
  -- unrelated submission type simply recomputes to the same value.

  -- Mirrors fn_get_policy_clinical_reasoning('scoring.passing_threshold_pct', 60)
  -- predicate-for-predicate. Read directly so a missing function can never raise
  -- inside this trigger and make the submission undeletable.
  SELECT p.value #>> '{}' INTO v_threshold_raw
    FROM public.platform_policies p
   WHERE p.policy_key = 'clinical_reasoning.scoring.passing_threshold_pct'
     AND p.scope_type = 'global'
     AND p.is_active = true
   LIMIT 1;
  IF v_threshold_raw ~ '^[0-9]+(\.[0-9]+)?$' THEN
    v_threshold := v_threshold_raw::numeric;
  END IF;

  -- Best remaining attempt. OLD is already gone in an AFTER DELETE, so it is
  -- excluded without needing an id predicate. final_score is what the scoring
  -- route writes the percentage to.
  --
  -- Deliberately NOT scoped by course or institution. pde_learner_capabilities
  -- is UNIQUE(learner_id, capability_id) — one row per learner per capability,
  -- learner-global by the table's own shape — and the scoring route's upsert is
  -- equally learner-global (it takes max(existing, this attempt) with no course
  -- or institution predicate). Scoping the recompute while the route stays
  -- global would make the two disagree, which is worse than either behaviour:
  -- the recompute must mirror the writer it is correcting.
  SELECT s.id, s.attempt_number, s.final_score, s.answers -> 'osce_score'
    INTO v_best_id, v_best_attempt, v_best_score, v_best_osce
    FROM public.pde_submissions s
    JOIN public.pde_assessments a ON a.id = s.assessment_id
   WHERE s.learner_id = OLD.learner_id
     AND a.assessment_type = 'clinical_case'
     AND s.final_score IS NOT NULL
   ORDER BY s.final_score DESC, s.attempt_number DESC
   LIMIT 1;

  IF v_best_id IS NULL THEN
    -- Nothing demonstrates this capability any more.
    DELETE FROM public.pde_learner_capabilities lc
     WHERE lc.learner_id = OLD.learner_id
       AND lc.capability_id = v_capability_id;
    RETURN OLD;
  END IF;

  v_status := CASE WHEN v_best_score >= v_threshold
                   THEN 'demonstrated' ELSE 'in_progress' END;

  -- NO-OP GUARD. This trigger fires on every pde_submissions delete, not just
  -- clinical-case ones, because every skip condition that could narrow it was
  -- also able to skip a recompute that was needed. Writing unconditionally would
  -- therefore churn the row on unrelated deletes — rewriting evidence and
  -- stamping recomputed_after_deleted_submission with, say, an MCQ attempt id
  -- that had nothing to do with this capability. So the write is skipped when the
  -- recomputed result is identical to what is already stored. Correctness is
  -- unchanged (the recompute still runs for every delete, so it can never be
  -- missed); only the pointless write disappears.
  -- The predicate covers EVERY column the UPDATE below writes, not just the
  -- headline score: a row that agrees on score/status but carries a stale
  -- attempt_number, or claims 'demonstrated' with a NULL demonstrated_at, is NOT
  -- identical and must still be repaired. IS NOT DISTINCT FROM throughout so a
  -- NULL on either side compares equal instead of collapsing the whole predicate
  -- to NULL and skipping the guard.
  IF EXISTS (
    SELECT 1 FROM public.pde_learner_capabilities lc
     WHERE lc.id = v_lc_id
       AND lc.demonstration_score IS NOT DISTINCT FROM v_best_score
       AND lc.status IS NOT DISTINCT FROM v_status
       AND (lc.demonstration_evidence ->> 'submission_id')
             IS NOT DISTINCT FROM v_best_id::text
       AND (lc.demonstration_evidence ->> 'attempt_number')
             IS NOT DISTINCT FROM v_best_attempt::text
       AND (lc.demonstrated_at IS NOT NULL) = (v_status = 'demonstrated')
  ) THEN
    RETURN OLD;
  END IF;

  UPDATE public.pde_learner_capabilities lc
     SET demonstration_score = v_best_score,
         status              = v_status,
         demonstrated_at     = CASE WHEN v_status = 'demonstrated'
                                    THEN COALESCE(lc.demonstrated_at, now())
                                    ELSE NULL END,
         -- MERGED onto the existing evidence, not built fresh. A wholesale
         -- jsonb_build_object would silently drop any key the scoring route
         -- writes that this trigger does not know about.
         --
         -- Merging can only add or overwrite, never remove, so the question is
         -- whether an attempt-specific key could go stale. It cannot for
         -- anything written today: the route's evidence object is exactly
         -- {submission_id, attempt_number, domain_scores, total_score,
         -- max_score, percentage, scored_at} (see side effect 2 in
         -- app/api/pde/clinical-reasoning/score/route.ts) and all seven are
         -- overwritten right here. A key neither the route nor this trigger
         -- writes cannot be attempt-scoped by construction, so preserving it is
         -- the safer default than deleting data whose meaning is unknown.
         demonstration_evidence = COALESCE(lc.demonstration_evidence, '{}'::jsonb)
           || jsonb_build_object(
           'submission_id',  v_best_id,
           'attempt_number', v_best_attempt,
           'domain_scores',  v_best_osce -> 'domain_scores',
           'total_score',    v_best_osce -> 'total_score',
           'max_score',      v_best_osce -> 'max_score',
           'percentage',     COALESCE(v_best_osce -> 'percentage', to_jsonb(v_best_score)),
           'scored_at',      COALESCE(v_best_osce ->> 'scored_at', now()::text),
           'recomputed_at',  now(),
           'recomputed_after_deleted_submission', OLD.id
         )
   WHERE lc.learner_id = OLD.learner_id
     AND lc.capability_id = v_capability_id;

  RETURN OLD;

EXCEPTION WHEN OTHERS THEN
  -- Cleanup must never make a submission undeletable. The handler's implicit
  -- subtransaction rolls back only this function's own partial work; the DELETE
  -- itself stands.
  RAISE WARNING 'fn_pde_submission_deleted_recompute_capability failed for submission % (learner %): % (%)',
    OLD.id, OLD.learner_id, SQLERRM, SQLSTATE;
  RETURN OLD;
END;
$fn$;

COMMENT ON FUNCTION public.fn_pde_submission_deleted_recompute_capability() IS
  'AFTER DELETE on pde_submissions: recomputes the clinical_reasoning row in pde_learner_capabilities from the learner''s surviving clinical-case attempts, and deletes the row when none survive. A recompute, not a cascade, because pde_learner_capabilities is UNIQUE(learner_id, capability_id) best-score-wins aggregate spanning many attempts — a cascade would destroy a record other surviving attempts earned. Never blocks the delete.';

REVOKE EXECUTE ON FUNCTION public.fn_pde_submission_deleted_recompute_capability() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_pde_submission_deleted_recompute_capability() TO authenticated;

DROP TRIGGER IF EXISTS trg_pde_submission_deleted_recompute_capability ON public.pde_submissions;
CREATE TRIGGER trg_pde_submission_deleted_recompute_capability
  AFTER DELETE ON public.pde_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_pde_submission_deleted_recompute_capability();
