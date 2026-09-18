-- ============================================================================
-- 20261226010000_loop_graph_rows_and_edges.sql
-- ----------------------------------------------------------------------------
-- THE LOOP GRAPH — the missing registry rows, and the edges between them.
-- Spec: specs/2026-09-18-loop-graph-and-two-top-numbers.md
-- (Director 2026-09-18 06:24 "are we combining the loops and creating a graph
--  of loops?" · ruling 06:27: two top numbers, side by side.)
--
-- The loops were already a graph — each one's output is another's input — but
-- five of the nodes existed only in prose and NINE of the edges existed
-- nowhere at all. /admin/loops draws loop_registry + loop_edges literally, so
-- a node that is not a row is a node nobody can see. This file is the rows.
--
-- ADD-ONLY. Every statement is ON CONFLICT DO NOTHING on an identity key
-- (loop_key; (from_key, to_key, what_flows) — the UNIQUE from 20260710233000),
-- so a re-run changes nothing and a row the Director has since retuned is
-- never clobbered. NO DDL: no table, column, constraint or function is
-- touched, so there is no SECURITY DEFINER grant to re-assert here.
--
-- STACK TIER IS 3 FOR EVERY NEW ROW, DELIBERATELY. loop-wiring.tsx renders
-- tier 3 as the band of loop cards but resolves tier 4 and tier 5 with
-- `registry.find(...)` — a SINGLE row each (the MetaLoop, the Director). A new
-- tier-4 or tier-5 row could therefore displace one of those two nodes off the
-- diagram depending on row order. Tier 3 is the only safe tier for an addition.
--
-- ⛔ NOT APPLIED by merging — prod apply is a separate, Director-gated step.
--    No BEGIN;/COMMIT; (rollback-rehearsal safe).
-- ============================================================================

-- ── 1. The missing nodes ────────────────────────────────────────────────────
-- owner_email is NOT NULL on production and is trigger-checked against
-- profiles (20260917175144): it must resolve to exactly one active,
-- non-pre-registered person. director@jkkn.ac.in is the address the merged
-- feature-adoption seed (#3844) already uses, and these five are his desks'
-- loops; reassignable on /admin/loops with no deploy.
--
-- gates are the honest G·A·M·F reading TODAY, not the intended one:
--   g Generate · a Act · m Measure against a baseline · f Feed it forward.

INSERT INTO public.loop_registry
  (loop_key, name, stack_tier, loop_class, domain, description, gates, owner_email)
VALUES
  ('w12-ship', 'W12 Ship Loop', 3, 'cadence', 'platform',
   'The ship desk''s drain: ready PRs are reviewed, gated and merged, and every merged PR arrives at the adoption loop labelled — for whom, and what counts as using it (feature_registry.source_pr). It generates and acts; it does not measure its own effect, so gate M is honestly off.',
   '{"g":"on","a":"on","m":"off","f":"off"}'::jsonb,
   'director@jkkn.ac.in'),

  ('sentry-intake', 'Sentry Intake — production errors nobody reported', 3, 'intake', 'platform',
   'Sentry''s user-facing production errors are pulled every six hours and filed as bug_reports (category sentry-silent, deduped on metadata.sentry_issue_id) so the most expensive bug class — the one nobody complains about — reaches the triage loop. An intake adapter: it senses, it does not measure or decide.',
   '{"g":"on","a":"off","m":"off","f":"off"}'::jsonb,
   'director@jkkn.ac.in'),

  ('loop-bars', 'Loop Bars — one concrete bar per loop', 3, 'infrastructure', 'platform',
   'Every operational loop carries ONE bar its verdict is judged against: the machine proposes the bar from the charter legs, a super admin approves it, each run records a measurement against it, and four misses in a row raise a "the bar may be wrong" card for the Director. Infrastructure — it judges other loops rather than running a cycle of its own.',
   '{"g":"on","a":"on","m":"on","f":"off"}'::jsonb,
   'director@jkkn.ac.in'),

  ('top-defect-hours', 'T1 — Weekly hours real users lose to defects', 3, 'accountability', 'platform',
   'The first of the two top numbers (ruling 06:27). Per ISO week: unresolved user-facing Sentry groups on vercel-production (level error or fatal, cron routes excluded) counted as users_affected x 2 min, plus open bug_reports at least a day old counted as reporters x 5 min, expressed in hours. It falls when defects are fixed AND stay fixed; it cannot be lowered by closing tickets, because a Sentry group that still fires still counts.',
   '{"g":"off","a":"off","m":"on","f":"off"}'::jsonb,
   'director@jkkn.ac.in'),

  ('top-adoption-share', 'T2 — Share of shipped features actually used', 3, 'accountability', 'platform',
   'The second top number. Per ISO week: of the labelled features that are live, shipped at least 14 days ago and actually wired for usage, the share whose weekly core-action reach is at least 20% of an intended role. It rises when people use what was built and falls when we ship things nobody uses.',
   '{"g":"off","a":"off","m":"on","f":"off"}'::jsonb,
   'director@jkkn.ac.in')
ON CONFLICT (loop_key) DO NOTHING;

-- ── 2. The edges ────────────────────────────────────────────────────────────
-- what_flows is CHECK-constrained to exactly four values by 20260710233000:
-- measured_outcomes | decisions | fuel | escalations. The spec's "what flows"
-- column is prose; each line below maps it to one of those four and keeps the
-- prose (plus the evidence field the spec names) in `note`, which the wiring
-- view shows on the arrow.
--
-- is_draft = true means "we believe this flows but the evidence field does not
-- exist yet" — the wiring view draws it dashed. Only ONE edge is a draft: the
-- adoption "why not" answers do not yet land as bug_reports rows with
-- source = 'adoption_why' (no such column on bug_reports today), so claiming
-- that edge as real would be the fabricated-wiring bug class.

INSERT INTO public.loop_edges (from_key, to_key, what_flows, note, is_draft)
VALUES
  ('w12-ship', 'feature-adoption', 'fuel',
   'Every merged PR arrives labelled (for whom · core action). Evidence: feature_registry.source_pr.',
   false),

  ('feature-adoption', 'bug-triage', 'fuel',
   'DRAFT: "tried it, too hard" answers are meant to become bug reports. Evidence field bug_reports.source = ''adoption_why'' does not exist yet — the answers live in notification_answers only.',
   true),

  ('sentry-intake', 'bug-triage', 'fuel',
   'Unreported production errors, and the stayed-fixed verdict. Evidence: bug_reports.metadata.sentry_issue_id, written every six hours by /api/cron/sentry-lane-2.',
   false),

  ('bug-triage', 'w12-ship', 'fuel',
   'Fix PRs: a cluster''s fix state carries the PR number the ship desk drains.',
   false),

  ('loop-bars', 'w12-ship', 'decisions',
   'One approved bar; four misses in a row raise a "the bar may be wrong" card. Evidence: loop_charter_proposals.kind = ''bar-review''.',
   false),

  ('loop-bars', 'bug-triage', 'decisions',
   'One approved bar; four misses in a row raise a "the bar may be wrong" card. Evidence: loop_charter_proposals.kind = ''bar-review''.',
   false),

  ('loop-bars', 'feature-adoption', 'decisions',
   'One approved bar; four misses in a row raise a "the bar may be wrong" card. Evidence: loop_charter_proposals.kind = ''bar-review''.',
   false),

  ('bug-triage', 'top-defect-hours', 'measured_outcomes',
   'Resolved groups that stay resolved reduce T1; a return adds the hours straight back. Evidence: the weekly loop_measurements row for top-defect-hours.',
   false),

  ('feature-adoption', 'top-adoption-share', 'measured_outcomes',
   'Weekly usage share per feature feeds T2. Evidence: the weekly loop_measurements row for top-adoption-share.',
   false)
ON CONFLICT (from_key, to_key, what_flows) DO NOTHING;

-- ── 3. Guard ────────────────────────────────────────────────────────────────
-- RAISE EXCEPTION, never RAISE NOTICE: a NOTICE-only miss path writes nothing
-- and still reads as success
-- (ref feedback_a_raise_notice_guard_reads_as_success). The counts are
-- >= checks on the five keys and nine edges this file is responsible for, so a
-- row that already existed (ON CONFLICT DO NOTHING) still satisfies the guard.
DO $$
DECLARE
  v_rows  int;
  v_edges int;
BEGIN
  SELECT count(*) INTO v_rows
    FROM public.loop_registry
   WHERE loop_key IN ('w12-ship','sentry-intake','loop-bars','top-defect-hours','top-adoption-share');
  IF v_rows <> 5 THEN
    RAISE EXCEPTION 'loop graph: expected 5 registry rows after seed, found %', v_rows;
  END IF;

  SELECT count(*) INTO v_edges
    FROM public.loop_edges
   WHERE (from_key, to_key) IN (
     ('w12-ship','feature-adoption'),
     ('feature-adoption','bug-triage'),
     ('sentry-intake','bug-triage'),
     ('bug-triage','w12-ship'),
     ('loop-bars','w12-ship'),
     ('loop-bars','bug-triage'),
     ('loop-bars','feature-adoption'),
     ('bug-triage','top-defect-hours'),
     ('feature-adoption','top-adoption-share')
   );
  IF v_edges < 9 THEN
    RAISE EXCEPTION 'loop graph: expected at least 9 edges after seed, found %', v_edges;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
