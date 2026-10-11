-- =====================================================================
-- Bug AI automatic producer — pacing controls
-- Date: 2026-10-10 (written). Version prefix 20271011090000.
-- The version is NOT the calendar date. This repo's migration versions run a
-- year ahead of the clock: every migration added in the last ten days is
-- 2027-dated and the applied ledger tops out at 20271010100000, so a 2026
-- version would sort BEHIND 309 already-applied migrations and be refused by
-- the Supabase CLI's ordering. Renamed from 20261010120000 on 2026-10-11,
-- before this file was ever applied (ledger checked: no row for either version).
-- =====================================================================
-- /api/cron/bug-ai-auto creates the bug.triage and bug.duplicate_check jobs
-- that, until now, only existed when an admin clicked a card. These five rows
-- are the knobs for how fast it goes, so pace can change without a deploy.
--
-- Every value here equals the route's own code default, so the route behaves
-- identically before and after this migration is applied. The route treats a
-- missing, inactive or malformed row as "use the default" — it never stalls on
-- an unreadable policy.
--
-- Director decisions encoded (2026-10-10):
--   • DRIP-FEED: a small batch per hour, clearing the backlog over a day or two.
--     Explicitly NOT all at once, NOT nights-only, and the old reports are NOT
--     skipped. 15 reports/hour x 2 job types = 30 jobs/hour, sized from a
--     MEASURED run on 2026-10-10 (a triage job finished in 19s, a duplicate
--     check in 9s), so roughly 7 minutes of lane time per hour against 2
--     reliable Windows workers (a third exists but a rate-limit tripwire can
--     disable it, so it is not counted on). That clears the 187-report approved
--     backlog in ~13 hours and all 603 open reports in under two days.
--   • Background bug jobs can never slow the live AI chat: fn_ai_claim serves
--     interactive and non-interactive work in separate passes, and all bug.*
--     types are non-interactive.
--
-- The sibling_app_allowlist row ships EMPTY on purpose. The five other college
-- apps file into this same table carrying application_id, and the Director's
-- instruction was that those rows get text-only triage and NEVER reach the Mac
-- runners that read the MyJKKN checkout. The producer honours both, but on
-- 2026-10-10 production held ZERO such rows (the intake and backfill PRs are
-- still drafts), so that path has never run against a real one. Empty keeps it
-- inert until somebody exercises it for real and then names an app here.
--
-- Scope: global. No institution override — the bug queue is cluster-wide.

-- The natural key is a UNIQUE INDEX on an EXPRESSION
--   (policy_key, scope_type, COALESCE(scope_id, '0000...0000'))
-- so ON CONFLICT cannot name it portably. The house convention for this table
-- is WHERE NOT EXISTS, which is also re-runnable and never overwrites a value
-- the Director has already tuned by hand.
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   is_system, is_active, classification, publication_state)
SELECT v.policy_key, 'global', NULL, v.value, v.description, v.data_type,
       false, true, 'major', 'published'
FROM (VALUES
  ('bug_reports.ai_auto.enabled',
   'true'::jsonb,
   'Master switch for automatic bug AI. On: every new bug report gets an AI briefing and a duplicate check without anyone clicking, and the open backlog is caught up a few per hour. Off: nothing new is queued, but answers already being worked on still reach their bug card. Admins can always still click a card by hand.',
   'boolean'),

  ('bug_reports.ai_auto.batch_per_tick',
   '15'::jsonb,
   'How many bug reports the hourly run picks up. Each one costs two AI jobs (a briefing and a duplicate check), so 15 means about 30 jobs an hour, which measured at roughly 7 minutes of AI time. Raise it to clear the backlog faster; lower it if the AI machines feel busy. 0 pauses new work without turning the feature off.',
   'number'),

  ('bug_reports.ai_auto.backlog_since',
   '"2026-08-14"'::jsonb,
   'How far back the catch-up reaches. Reports filed before this date are left alone. 14 Aug 2026 is when the AI help stopped, which is the backlog the Director approved catching up (187 open reports). Move the date earlier to include the older ones - there are about 416 open reports before it, the oldest from Sep 2025.',
   'string'),

  ('bug_reports.ai_auto.sibling_app_allowlist',
   '[]'::jsonb,
   'Which OTHER college apps (Mentor, TMS, COE, Library, Event Forms) may have their bug reports read by the AI for a plain-text summary. EMPTY means none, which is how this ships - nothing about another product is looked at until an app is named here. Add an app code to switch it on for that app only; no release needed. Those reports only ever get the text summary, never the "can one fix solve this group" check, because that one reads MyJKKN''s own code and would be looking at the wrong product.',
   'array'),

  ('bug_reports.ai_auto.fixability_per_run',
   '10'::jsonb,
   'How many bug GROUPS the nightly group scan may send for an automatic "can one fix solve all of these?" check. Each check takes about four minutes and they run one at a time, so 10 occupies that machine for roughly 40 minutes a night. 0 switches the automatic check off and goes back to clicking.',
   'number')
) AS v(policy_key, value, description, data_type)
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies p
   WHERE p.policy_key = v.policy_key
     AND p.scope_type = 'global'
     AND p.scope_id IS NULL
);

-- Verification (read-only, safe to re-run):
--   SELECT policy_key, value, is_active FROM public.platform_policies
--    WHERE policy_key LIKE 'bug_reports.ai_auto.%' ORDER BY policy_key;
