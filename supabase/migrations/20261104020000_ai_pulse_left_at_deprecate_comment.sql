-- ============================================================================
-- AI Pulse — mark ai_pulse_live_attendance.left_at as never-written
-- Created: 2026-08-21
--
-- RENAME-SAFE: 20260922010000 -> 20261104020000 — this file has never run. It is
--   marked FILE ONLY / NOT APPLIED (Director-gated) in supabase/SQL_FILE_INDEX.md
--   and was renumbered only because the REBASE onto jicate/main introduced a
--   version collision that did not exist when this branch was cut: main gained
--   20260922010000_revoke_anon_hr_payroll_directories.sql (#3167) after the merge
--   base. Per the collision guard's own remedy, the APPLIED file in the pair keeps
--   its version and the UNAPPLIED one — this file — moves. 20261104020000 is one
--   tick past main's newest (20261104010000) and is claimed by no other open PR
--   (cross-PR sweep, 67 PRs, 2026-09-05).
--
--   NOTE FOR THE REVIEWER: this attestation cannot make the rename gate pass. That
--   gate has production credentials in CI, so it reaches its `nothing-parsed`
--   verdict — this migration is COMMENT ON COLUMN only and declares no object, so
--   object existence cannot decide whether it ran. The gate is asking a human the
--   question this comment answers: it has not run, and a COMMENT is idempotent and
--   reversible (`COMMENT ... IS NULL`) even if it somehow did.
--
-- WHY THIS MIGRATION EXISTS
--   `ai_pulse_live_attendance.left_at` has been written ZERO times since the
--   table was created on 2026-06-11. Measured on production 2026-08-21:
--     total rows                          3,631
--     rows with left_at NOT NULL              0
--     rows with joined_at NOT NULL        3,228
--     rows with engagement_signals->'stayed_until'   2,568
--
--   The only code that ever wrote the column was
--   `app/api/ai-pulse/meet/webhook`, which targeted `event_team_attendance` —
--   a per-TEAM table (keyed by registration_id) that has no `left_at`, no
--   `joined_at` and no `learner_id` column. Every call failed with 42703 on
--   its first SELECT and returned 500 before reaching this table. The route is
--   repointed at this table in the same PR as this file, and it now writes the
--   leave signal into `engagement_signals` rather than into this column.
--
--   The danger this addresses is NOT a crash. `left_at` is a nullable
--   TIMESTAMPTZ on a well-populated table, so any query that reaches for it —
--   an ad-hoc report in Studio, a duration calculation, a "how long did they
--   stay" dashboard — returns a confident zero/NULL that is indistinguishable
--   from a real measurement of "never left". A reader of the schema alone
--   cannot tell. This comment is the only warning such a reader will ever see,
--   because the code-side guardrails live in TypeScript files they are not
--   reading.
--
-- WHERE LEAVE TIME ACTUALLY LIVES
--   `engagement_signals` (JSONB), as a pair written together:
--     last_heartbeat_at — ISO 8601, the last moment the learner was observed
--     stayed_until      — that same instant rendered IST "HH:MM" (e.g. "19:28")
--   Verified on production 2026-08-21: the two keys co-occur on exactly the
--   same 2,568 rows (0 rows carry one without the other), and
--   `stayed_until` = to_char(last_heartbeat_at AT TIME ZONE 'Asia/Kolkata',
--   'HH24:MI') on 2,568 of 2,568 — so `stayed_until` is a rendering of
--   `last_heartbeat_at`, not an independent fact.
--
--   NOTE FOR ANYONE TEMPTED TO BACKFILL left_at FROM stayed_until: you cannot.
--   `stayed_until` is a wall-clock "HH:MM" string with no date component. The
--   only ISO-typed source is `last_heartbeat_at`, and that is a HEARTBEAT (a
--   last-observed moment), not a leave event — copying it into a column named
--   `left_at` would manufacture a precise-looking claim the data does not
--   support. No backfill is performed here, deliberately.
--
-- WHY NOT DROP THE COLUMN
--   A DROP is destructive, forces a `types/supabase.ts` regeneration, and
--   would have to be sequenced against a deploy. It buys nothing this comment
--   does not: after the accompanying PR there are zero reads of the column in
--   application code, zero views and zero functions referencing it (verified
--   against pg_proc / information_schema.views on 2026-08-21). Dropping it
--   remains available later as a separate, separately-gated decision.
--
-- SAFETY: COMMENT ON COLUMN only. Adds no object, alters no column type or
--         nullability, drops nothing, backfills nothing, touches no policy,
--         function, trigger or grant. Idempotent and instantly reversible
--         (COMMENT ON ... IS NULL). Takes no rewrite lock.
-- ============================================================================

COMMENT ON COLUMN public.ai_pulse_live_attendance.left_at IS
  'DEPRECATED / NEVER WRITTEN — do not read this column. 0 of 3,631 rows carry '
  'a value (measured 2026-08-21); it reads NULL for every learner, which in a '
  'report looks identical to a real "never left" measurement. Leave time lives '
  'in engagement_signals: last_heartbeat_at (ISO, last observed moment) and '
  'stayed_until (that instant as IST "HH:MM"). The 4-AND engagement gate '
  'consumes stayed_until; the trends and participation surfaces test it for '
  'PRESENCE. Cannot be backfilled from stayed_until (a dateless "HH:MM" '
  'string). See supabase/migrations/20261104020000_ai_pulse_left_at_deprecate_comment.sql.';

COMMENT ON COLUMN public.ai_pulse_live_attendance.engagement_signals IS
  'Canonical per-learner engagement signal store for the AI Pulse 4-AND gate. '
  'Keys in production use (2026-08-21): joined_at, joined_within_5min, '
  'stayed_until, last_heartbeat_at, quiz_passed, quiz_score, quiz_async_makeup, '
  'polls_responded, feedback_text. Writers merge by spread so unknown keys from '
  'other writers survive. This — not left_at — is where leave time is recorded.';
