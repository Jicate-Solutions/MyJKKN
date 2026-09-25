-- supabase/migrations/20270402120000_meetings_note_draft_job.sql
--
-- ############################################################################
-- ## FILE ONLY — NOT APPLIED. The operator applies this at merge.           ##
-- ## Nothing in this file has been run against production.                  ##
-- ############################################################################
--
-- Updated: 2026-09-26 - AI draft of a meeting's summary, decisions and
-- follow-ups when Fireflies returns none. SHIPS SWITCHED OFF.
--
-- ── THE GAP ─────────────────────────────────────────────────────────────────
-- Measured live 2026-09-26: Fireflies returned summary = NULL for 115 of the
-- 152 meetings it recorded in the last 30 days (76%), and re-fetching does not
-- fill them. Of the 68 notes linked to a MyJKKN booking, 23 produced ZERO
-- follow-ups for that reason alone. The cron
-- app/api/cron/meeting-note-drafts/route.ts drafts one on the ₹0 Max lane for
-- LINKED notes only (booking_id IS NOT NULL), never for interviews.
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
--   1. ai_job_types row 'meetings.note_draft' — enabled = FALSE. While it is
--      false, fn_ai_enqueue_system refuses every enqueue, so no meeting text
--      can reach the Max seat. The Director flips it (no deploy).
--   2. meeting_notes.ai_drafted_at  — set once per note when a draft attempt
--      reached a final outcome, so a note is never sent twice.
--   3. meeting_notes.ai_draft       — the AI summary + decisions, kept APART
--      from meeting_notes.summary. Not a matter of taste: the Fireflies ingest
--      re-upserts `summary` AND `raw` on every 30-minute tick
--      (storeTranscript's `common` object), so a draft written into either
--      would be wiped by the next tick. This column is not touched by ingest.
--   4. meeting_action_items.source  — who wrote the follow-up: NULL (legacy /
--      typed by the host), 'fireflies', or 'ai_draft'. Lets the UI label an
--      AI-drafted task "AI draft — check before acting".
--   5. ai_routine_schedules row 'meeting-note-drafts' — enabled = FALSE too,
--      so the dispatcher never calls the route until somebody switches it on
--      in /admin/ai-routines.
--
-- ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────────
--   * NO write RLS policy on meeting_action_items. `authenticated` already
--     holds table-level write grants there; the ABSENCE of an INSERT/UPDATE/
--     DELETE policy is the only thing stopping a signed-in client writing.
--     Every write stays on the service role.
--   * NO new function, so no SECURITY DEFINER surface and nothing to REVOKE.
--   * NO grant changes. Both new columns inherit their table's existing RLS.
--
-- Version 20270402120000: above every file on jicate/main (max
-- 20270331090000 on 2026-09-26). No BEGIN/COMMIT of its own. Idempotent.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. The job type — DARK
-- ───────────────────────────────────────────────────────────────────────────
-- Column list copied from 'accreditation.meeting_minutes_polish'
-- (20260726181500_accreditation_committee_ai_assistant.sql §11).
INSERT INTO public.ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target, interactive,
   lane, allow_rule, max_inflight, schedulable, enabled, input_schema, expected_seconds,
   provider, model_id, external_allowed, loop_key)
VALUES (
  'meetings.note_draft',
  'Meetings · AI draft of summary, decisions and follow-ups',
  'When Fireflies returns no summary for a meeting linked to a MyJKKN booking, drafts a short summary, the decisions taken and the follow-ups (owner + due date) from the transcript. Every output is labelled AI draft; an owner is attached ONLY on an exact participant-email match, a due date only when it is an ISO date 0–180 days after the meeting. Interview bookings are never sent. DARK: enabled=false until the Director flips it.',
  '{{prompt}}', 'none', 'job.result',
  false,          -- interactive: scheduled types must be false (chat drain would starve it)
  'max', 'seat_owner', 1, true,
  false,          -- enabled: DARK — meeting text goes to the Director's Max seat only once he rules
  '[{"key":"prompt","label":"Assembled prompt","type":"textarea","required":true}]'::jsonb,
  60, 'anthropic', 'sonnet',
  false,          -- external_allowed: internal meeting content
  NULL
)
ON CONFLICT (job_type) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. meeting_notes — the draft stamp and the draft itself
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.meeting_notes
  ADD COLUMN IF NOT EXISTS ai_drafted_at timestamptz;

COMMENT ON COLUMN public.meeting_notes.ai_drafted_at IS
  'When the AI note-drafter (job meetings.note_draft) reached a final outcome for this note — drafted, skipped because follow-ups already existed, or unreadable. Set once; the cron never enqueues a note that carries it.';

ALTER TABLE public.meeting_notes
  ADD COLUMN IF NOT EXISTS ai_draft jsonb;

COMMENT ON COLUMN public.meeting_notes.ai_draft IS
  'AI DRAFT — check before acting. {label, status, summary, decisions[], job_id, drafted_at}. Kept apart from summary/raw because the Fireflies ingest rewrites both on every tick. NULL = never drafted.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3. meeting_action_items.source
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.meeting_action_items
  ADD COLUMN IF NOT EXISTS source text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'meeting_action_items_source_chk'
      AND conrelid = 'public.meeting_action_items'::regclass
  ) THEN
    ALTER TABLE public.meeting_action_items
      ADD CONSTRAINT meeting_action_items_source_chk
      CHECK (source IS NULL OR source IN ('fireflies', 'ai_draft'));
  END IF;
END
$$;

COMMENT ON COLUMN public.meeting_action_items.source IS
  'Who wrote this follow-up: NULL = legacy or typed by the host, ''fireflies'' = Fireflies action items, ''ai_draft'' = the AI note-drafter (label it "AI draft — check before acting").';

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Dispatcher schedule — DARK
-- ───────────────────────────────────────────────────────────────────────────
-- minute_of_day is IST. 1147 = 19:07 IST, floored by fn_ai_routine_claim_due to
-- the 19:00 slot. enabled = false: the dispatcher never calls the route until a
-- super admin turns it on in /admin/ai-routines.
INSERT INTO public.ai_routine_schedules (routine_id, enabled, minute_of_day, managed)
VALUES ('meeting-note-drafts', false, 1147, true)
ON CONFLICT (routine_id) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Apply-time assertions — fail closed
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_job_types
    WHERE job_type = 'meetings.note_draft' AND enabled = false AND lane = 'max'
  ) THEN
    -- A pre-existing ENABLED row would mean meeting text flows the moment this
    -- deploys. Refuse rather than let ON CONFLICT DO NOTHING hide it.
    RAISE EXCEPTION 'meetings.note_draft must exist, be on the max lane, and be DISABLED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'meeting_notes' AND column_name = 'ai_drafted_at'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'meeting_notes' AND column_name = 'ai_draft'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'meeting_action_items' AND column_name = 'source'
  ) THEN
    RAISE EXCEPTION 'meetings.note_draft columns missing after apply';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meeting_action_items'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) THEN
    RAISE EXCEPTION 'meeting_action_items must carry NO write policy — writes are service-role only';
  END IF;
END
$$;
