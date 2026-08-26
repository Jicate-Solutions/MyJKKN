-- ============================================================================
-- 20260927030000_loop_charter_insufficient_status.sql
-- ----------------------------------------------------------------------------
-- MetaLoop charter drafts — make honest abstention VISIBLE.
--
-- WHY: a draft self-reporting {insufficient:true} was console.warn'd and
-- dropped by the collect pass. 5 of the factory's first 6 drafts (08-16 and
-- 08-23 batches) were such abstentions, each carrying an actionable reason
-- ("gate 'm' is off — measurement never enabled", "11 flags raised, 0
-- interventions — stops at the flag"). With the reasons dying in server logs,
-- /admin/loops/charters showed an empty queue and the factory read as BROKEN —
-- it was actually waiting on humans. Same shape as CLAUDE.md rule #27 (an
-- explicit no-access panel, never a silent redirect), applied to a loop.
--
-- WHAT: widen the status CHECK to admit 'insufficient'. The collect pass
-- (lib/services/loops/metaloop-charter-collect.ts) now files abstentions as
-- rows: proposed = {"insufficient": true}, rationale = the machine's reason.
-- Display-only — no approve/reject; nothing ever reaches loop_registry from
-- an insufficient row.
--
-- Deliberately UNCHANGED:
--   · loop_charter_proposals_one_proposed_idx (WHERE status='proposed') — an
--     insufficient row must never block a later REAL draft for the same loop.
--     History accumulates one row per abstaining draft; the panel shows the
--     latest per loop.
--   · The enqueue pass's open-proposal guard (status='proposed' only) — an
--     insufficient loop is re-drafted next Sunday on purpose: ai-pulse-pde-
--     bridge went insufficient→full charter in exactly one week when its
--     evidence improved.
--
-- ⛔ NOT APPLIED by merging — prod apply is a separate, Director-gated step.
--    No BEGIN;/COMMIT; in this file, so a BEGIN..ROLLBACK rehearsal stays a
--    rehearsal (ref feedback_inner_commit_defeats_your_rollback_wrapper).
-- ============================================================================

ALTER TABLE public.loop_charter_proposals
  DROP CONSTRAINT IF EXISTS loop_charter_proposals_status_chk;

ALTER TABLE public.loop_charter_proposals
  ADD CONSTRAINT loop_charter_proposals_status_chk
  CHECK (status IN ('proposed', 'approved', 'rejected', 'insufficient'));

COMMENT ON COLUMN public.loop_charter_proposals.status IS
  'proposed = awaiting a human decision · approved/rejected = decided (decided_by/decided_at/decision_note stamped) · insufficient = the machine declined to draft (proposed = {"insufficient": true}, rationale = its reason) — display-only, never blocks a later real draft (the one-proposed partial index ignores it), never touches loop_registry.';

-- Guard: the constraint must exist and admit the new value. RAISE EXCEPTION,
-- never RAISE NOTICE (ref feedback_a_raise_notice_guard_reads_as_success).
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conname = 'loop_charter_proposals_status_chk'
     AND conrelid = 'public.loop_charter_proposals'::regclass;
  IF v_def IS NULL OR v_def NOT LIKE '%insufficient%' THEN
    RAISE EXCEPTION 'loop_charter_proposals_status_chk missing or does not admit ''insufficient'' (def=%)', v_def;
  END IF;
END $$;
