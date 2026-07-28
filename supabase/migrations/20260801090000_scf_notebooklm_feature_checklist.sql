-- Migration: retire the saturated NotebookLM yes/no checklist item.
-- Rank 2 of the 2026-07-23/24 Director designs.
-- Spec: specs/session-feedback-notebooklm-feature-checklist-2026-07-24.md
--
-- The learner feedback form now captures WHICH NotebookLM materials were used
-- (audio overview, video overview, slide deck, mind map, report, flashcards, quiz,
-- infographic, chat, or a neutral "None"), stored under reserved checklist keys
-- `nblm:*`. Those reserved keys are NOT config item_keys, so they never enter the
-- carry-forward "unmet items" universe (fn_scf_carryforward_for_learner joins only
-- session_feedback_checklist_config rows WHERE is_active = true).
--
-- This migration deactivates the platform-default `notebooklm_used` config row so the
-- old yes/no stops rendering AND the carry-forward RPC stops treating an un-ticked
-- `notebooklm_used` as "unmet". Historical `checklist.notebooklm_used` values (49k rows)
-- remain fully readable — we deactivate the config item, we do not delete any data.
--
-- No RPC, no table, no new grants → no anon-revoke needed (nothing new is executable).
-- Idempotent: the WHERE is_active = true guard makes a re-run a no-op.
--
-- Ordering: MyJKKN deploy ships code before this applies (migrations are Director-
-- triggered one-click apply). The form already hides notebooklm_used client-side, so
-- the UX is clean pre-apply; apply this with the deploy to complete the cleanup.

UPDATE public.session_feedback_checklist_config
   SET is_active = false
 WHERE item_key = 'notebooklm_used'
   AND institution_id IS NULL
   AND is_active = true;
