-- ============================================================================
-- Migration: Auto-accountability-meeting engine — PR2 (project triggers + RACI)
-- Date: 2026-06-23
-- Spec: specs/meeting-auto-trigger-engine-2026-06-22.md  (+ RACI wiring)
--
-- Extends the LIVE attendance engine spine to fire on PROJECT signals:
--   * task_overdue    — a task overdue by >= threshold days
--   * project_at_risk — a project whose rag_status reaches the risk level
--
-- WHO is summoned is resolved per-subject, not by a fixed notify_role:
--   * task_overdue    -> the task's RACI: Accountable + Responsible attend,
--                        Consulted are notified, Informed get the bell; the
--                        project institution's Principal/Director is the head
--                        (judge of the 24h explanation).
--   * project_at_risk -> the project's owner_staff_id + the same head.
-- The 24h explain-or-meet valve, cooldown, weekly-cap and auto-book are reused
-- unchanged from PR1a/PR1b.
--
-- Purely additive + INACTIVE. Nothing fires until the Director activates the two
-- new global rules in /meetings/triggers.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Subject dimension on the breach ledger (NULL = attendance / legacy).
-- ----------------------------------------------------------------------------
ALTER TABLE public.meeting_trigger_events
  ADD COLUMN IF NOT EXISTS subject_type     text
    CHECK (subject_type IS NULL OR subject_type IN ('task','project')),
  ADD COLUMN IF NOT EXISTS subject_id       uuid,
  ADD COLUMN IF NOT EXISTS subject_label    text,                          -- title snapshot for the console
  ADD COLUMN IF NOT EXISTS judge_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.meeting_trigger_events.subject_type IS
  'task | project for project-accountability triggers; NULL for attendance (institution-scoped).';
COMMENT ON COLUMN public.meeting_trigger_events.judge_profile_id IS
  'The reporting head (project institution Principal/Director) who judges the 24h explanation.';

-- ----------------------------------------------------------------------------
-- 2. Per-subject idempotency.
--    The original inline UNIQUE (rule_id, breach_date) cannot express the
--    subject dimension — one task_overdue rule fires for many tasks on the same
--    day, all sharing (rule_id, breach_date). Replace it with two PARTIAL unique
--    indexes: attendance stays unique per (rule, day); subject events unique per
--    (rule, day, subject).
--    Safe swap: the service inserts plainly and catches SQLSTATE 23505 — it never
--    names this constraint nor uses ON CONFLICT — so the live attendance cron is
--    unaffected (attendance rows have subject_id IS NULL and remain covered).
-- ----------------------------------------------------------------------------
ALTER TABLE public.meeting_trigger_events
  DROP CONSTRAINT IF EXISTS meeting_trigger_events_rule_id_breach_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS meeting_trigger_events_attendance_uniq
  ON public.meeting_trigger_events (rule_id, breach_date)
  WHERE subject_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS meeting_trigger_events_subject_uniq
  ON public.meeting_trigger_events (rule_id, breach_date, subject_id)
  WHERE subject_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meeting_trigger_events_subject
  ON public.meeting_trigger_events (subject_type, subject_id);

-- ----------------------------------------------------------------------------
-- 3. Two GLOBAL, INACTIVE project rules (Director activates in the console).
--    institution_id NULL = applies across every college; recipients resolved
--    per-subject. notify_role documents the resolution source ('accountable' =
--    the task's RACI Accountable; 'owner' = the project's owner_staff_id).
--    Guarded by NOT EXISTS (the UNIQUE (metric_key, institution_id) constraint
--    does not fire for NULL institution_id, so ON CONFLICT cannot be used here).
-- ----------------------------------------------------------------------------
INSERT INTO public.meeting_trigger_rules
  (metric_key, institution_id, comparator, threshold, cooldown_days, weekly_cap, notify_role, active, notes)
SELECT 'task_overdue', NULL, 'gte', 3, 7, 1, 'accountable', false,
       'Fires when a task is overdue by >= threshold days (completed_at IS NULL). '
       || 'Summons the task''s Accountable + Responsible + the project institution''s '
       || 'Principal/Director. Seeded INACTIVE.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.meeting_trigger_rules
  WHERE metric_key = 'task_overdue' AND institution_id IS NULL
);

INSERT INTO public.meeting_trigger_rules
  (metric_key, institution_id, comparator, threshold, cooldown_days, weekly_cap, notify_role, active, notes)
SELECT 'project_at_risk', NULL, 'gte', 2, 7, 1, 'owner', false,
       'Fires when a project rag_status reaches the risk level (green=0, amber=1, '
       || 'red=2; threshold 2 = red only, set 1 to include amber). Summons the '
       || 'project owner + the project institution''s Principal/Director. Seeded INACTIVE.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.meeting_trigger_rules
  WHERE metric_key = 'project_at_risk' AND institution_id IS NULL
);
