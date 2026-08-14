-- =============================================================================
-- 20260816024500_register_ai_pulse_thirteen_loops.sql
-- Register AI Pulse's thirteen inner loops in public.loop_registry.
--
-- NOT APPLIED AT PR TIME — prod apply is Director-gated (FILE ONLY).
--
-- WHY: verified on production 2026-08-08, loop_registry holds 22 rows and
-- exactly ONE of them matches '%pulse%' — the module-level row 'ai-pulse'
-- ('Daily tick -> rotation -> anomaly flags -> weekly digest'). The thirteen
-- loops that AI Pulse actually runs inside that spine are invisible to the
-- Loop Control Tower, to loop_edges, and to loops-regress coverage. A loop the
-- registry cannot see is a loop nobody is accountable for.
--
-- SOURCE OF TRUTH for the thirteen: artifacts/loop-engine-audit-2026-08-06.html
-- Part 6, "All thirteen loops, with tonight's live state" (read live 2026-08-06
-- 23:10 IST). Every name, return edge and evidence sentence below is quoted or
-- summarised from that table — no loop is invented, and none is omitted.
--
-- WIDEN-ONLY, by construction:
--   * INSERT ... ON CONFLICT (loop_key) DO NOTHING — the identity-keyed seed
--     pattern used by every prior registry seed (20260710233000,
--     20260714040713, 20260717150000). Immune to the mutable-column
--     seed-resurrection class, and safe to replay any number of times.
--   * ZERO UPDATE and ZERO DELETE statements. The existing 'ai-pulse' row is
--     read-only here: these thirteen are its children, not its replacement.
--
-- CONSTITUTION COMPLIANCE (docs/architecture/loop-constitution.md, 2026-07-26):
--   * Article 2 (birth-gate): owner_email is supplied on every row —
--     loop_registry.owner_email is NOT NULL with a non-empty CHECK since
--     migration 20260726012000, so an owner-less birth fails at INSERT.
--   * Article 3 (charter rule + RECEIPTS RULE): all five charter legs
--     (outcome_metric, baseline_window, intervention, verdict_owner,
--     remeasure_window) are deliberately LEFT NULL on all thirteen rows.
--     None of them has a receipt that the leg runs in prod data — the audit
--     found the opposite ("Self-improving - no, not yet"; outcome measurement
--     has produced 0 values on 177 rows in its lifetime). The Tower will
--     therefore label all thirteen METERS, without apology, which is the
--     honest starting state the constitution prescribes:
--       "a migration inserts the registry row (owner required by the
--        database), its charter legs stay NULL until each one runs with a
--        receipt, the Tower calls it a meter without apology".
--   * counter_metric stays NULL (unpaired, honest) — and because of the
--     2026-07-19 convention recorded on that column ("the m gate may not be
--     set 'on' unless counter_metric is named AND measured"), the m gate is
--     'off' on every row below. No row claims a measurement it cannot show.
--
-- routine_id: set ONLY where a real ai_routine_schedules.routine_id exists.
-- The four used below are receipted in 20260701210500_ai_routine_schedules_seed.sql
-- (ai-pulse-rotation-tick 08:00, ai-pulse-anomaly-scan 09:15,
--  ai-pulse-measure-verdict 10:15, ai-pulse-pde-bridge 10:30 — all daily,
--  all enabled). The remaining nine carry NULL rather than a guessed anchor.
-- 'ai-pulse-tick' and 'ai-pulse-weekly-digest' are the module-level spine and
-- are left to the parent 'ai-pulse' row, not double-claimed by a child.
--
-- gates are G(enerates) . A(cts) . M(easures) . F(eeds-forward), values
-- 'on' | 'off' | 'half' per app/(routes)/admin/loops/_components/types.ts.
-- =============================================================================

INSERT INTO public.loop_registry
  (loop_key, name, stack_tier, loop_class, domain, description, gates, routine_id, owner_email, is_active) VALUES

  -- 1. Runs, does not learn: the return edge carries exposure, not quality.
  ('ai-pulse-starter-prompt', 'AI Pulse . Starter prompt', 3, 'cadence', 'platform',
   'Generator writes weekly starter prompts per programme; views and copies return as prior_context into next week''s prompt. Live 2026-08-06: 177 authored, 1,107 views, 9 copies, outcome lift 0 of 177 - the return edge carries exposure, not quality. Runs, does not learn.',
   '{"g":"on","a":"on","m":"off","f":"off"}'::jsonb, NULL, 'aieee@jkkn.ac.in', true),

  -- 2. Return edge never fired: the library is written to, never read from.
  ('ai-pulse-build-your-own', 'AI Pulse . Build your own', 3, 'cadence', 'platform',
   'A learner builds a prompt, it is auto-graded every 10 minutes, and at a score of 80 or above it graduates into a shared library for peers to reuse. Live 2026-08-06: 52 built, 52 graded, 2 graduated, 0 reuses ever - the return edge has never fired.',
   '{"g":"on","a":"on","m":"off","f":"off"}'::jsonb, NULL, 'aieee@jkkn.ac.in', true),

  -- 3. Closed 2026-08-06 after the cadence fix.
  ('ai-pulse-announcement', 'AI Pulse . Announcement', 3, 'cadence', 'platform',
   'Session attendance decides who gets told about tonight''s cycle. Live 2026-08-06: 321 of 323 eligible learners told (up from 6% then 25%), and 130 phones reached for the first time, not just the in-app bell - closed.',
   '{"g":"on","a":"on","m":"off","f":"on"}'::jsonb, NULL, 'aieee@jkkn.ac.in', true),

  -- 4. Runs, narrow: only the 60-79 band is checked.
  ('ai-pulse-safety-check', 'AI Pulse . Safety check', 3, 'accountability', 'platform',
   'A prompt goes to a safety verdict before a champion releases it. Live 2026-08-06: 50 pending, 1 passed, 1 failed, and the check only covers the 60-79 score band - runs, but narrow.',
   '{"g":"on","a":"on","m":"off","f":"off"}'::jsonb, NULL, 'aieee@jkkn.ac.in', true),

  -- 5. Never triggered: built, but no learner has ever used it.
  ('ai-pulse-moderation', 'AI Pulse . Moderation', 3, 'intake', 'platform',
   'A learner reports a prompt and a champion decides on it. Live 2026-08-06: 0 reports ever filed - built, never triggered.',
   '{"g":"on","a":"off","m":"off","f":"off"}'::jsonb, NULL, 'aieee@jkkn.ac.in', true),

  -- 6. Off by decision: the flag is false.
  ('ai-pulse-classmates-feed', 'AI Pulse . Classmates feed', 3, 'cadence', 'platform',
   'Good prompts surface to classmates so peers go on to write more good prompts. Live 2026-08-06: the feature flag is false and only 1-2 prompts ever qualified - off by decision, not by failure.',
   '{"g":"off","a":"off","m":"off","f":"off"}'::jsonb, NULL, 'aieee@jkkn.ac.in', true),

  -- 7. Turning.
  ('ai-pulse-engagement', 'AI Pulse . Engagement', 3, 'cadence', 'platform',
   'Joining on time, staying, and passing the quiz combine into an engaged state. Live 2026-08-06: 179 of 301 learners earned the quiz signal last cycle - turning.',
   '{"g":"on","a":"on","m":"off","f":"on"}'::jsonb, NULL, 'aieee@jkkn.ac.in', true),

  -- 8. Turning, with the publish-reach arm still off.
  ('ai-pulse-leaderboard', 'AI Pulse . Leaderboard', 3, 'cadence', 'platform',
   'Points become rank, and rank becomes visible standing. Live 2026-08-06: learner and staff boards are on while the publish-reach arm is false - turning.',
   '{"g":"on","a":"on","m":"off","f":"on"}'::jsonb, NULL, 'aieee@jkkn.ac.in', true),

  -- 9. Turning: auto-generates on Friday.
  ('ai-pulse-team-rotation', 'AI Pulse . Team rotation', 3, 'cadence', 'platform',
   'Last week''s teams determine next week''s teams. Live 2026-08-06: 2,122 rotation rows, auto-generating on Friday - turning.',
   '{"g":"on","a":"on","m":"off","f":"on"}'::jsonb, 'ai-pulse-rotation-tick', 'aieee@jkkn.ac.in', true),

  -- 10. Turning: scored Tool Practice entries are visible on learner pages.
  ('ai-pulse-pde-bridge', 'AI Pulse . PDE bridge', 3, 'cadence', 'pde',
   'AI Pulse activity feeds the learner capability profile. Live 2026-08-06: on, with learner pages showing scored Tool Practice entries - turning.',
   '{"g":"on","a":"on","m":"off","f":"on"}'::jsonb, 'ai-pulse-pde-bridge', 'aieee@jkkn.ac.in', true),

  -- 11. Never produced a value in its lifetime.
  ('ai-pulse-outcome-measurement', 'AI Pulse . Outcome measurement', 3, 'cadence', 'platform',
   'A department outcome is supposed to grade prompt quality and feed it back to the generator. Live 2026-08-06: 0 values on 177 rows, and it structurally cannot reach the general fallback or roughly 65 programmes - never produced a value.',
   '{"g":"on","a":"off","m":"off","f":"off"}'::jsonb, 'ai-pulse-measure-verdict', 'aieee@jkkn.ac.in', true),

  -- 12. Stops at the flag: no human ever intervenes.
  ('ai-pulse-anomaly-intervention', 'AI Pulse . Anomaly to intervention', 3, 'accountability', 'platform',
   'An anomaly flag should become a nudge and then a behaviour change. Live 2026-08-06: 11 flags raised, 0 interventions - stops at the flag.',
   '{"g":"on","a":"on","m":"off","f":"off"}'::jsonb, 'ai-pulse-anomaly-scan', 'aieee@jkkn.ac.in', true),

  -- 13. Turning: a visible change on the cycle card.
  ('ai-pulse-you-said-we-changed', 'AI Pulse . You said, we changed', 3, 'accountability', 'platform',
   'Learner feedback returns as a visible configuration change on the cycle card. Live 2026-08-06: showing "Meeting Link Accessible" - turning.',
   '{"g":"on","a":"on","m":"off","f":"on"}'::jsonb, NULL, 'aieee@jkkn.ac.in', true)

ON CONFLICT (loop_key) DO NOTHING;
