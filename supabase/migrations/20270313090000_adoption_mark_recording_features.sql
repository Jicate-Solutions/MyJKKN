-- Adoption loop — mark three features as recording, now that real people have used them.
--
-- usage_wired is a LABEL, not a switch: fn_feature_used never reads it, so these keys have
-- been recording since the deploy of #3966 on the morning of 2026-09-24. The label controls
-- one thing only — whether the adoption pages present the feature as MEASURED rather than
-- "awaiting recording". The desk's rule is to flip it only after the feature has real,
-- non-test uses on production, so that a measured zero is never a wiring gap in disguise.
--
-- Evidence, read from production at 12:08 IST on 2026-09-24 (distinct people, excluding
-- test.* accounts and super admins):
--   service_requests.raise   28 people
--   hr.leave_apply           20 people
--   hr.leave_decide           2 people
--
-- NOT flipped, and why:
--   users.assign_role                — its one row so far is a super admin, which proves the
--                                      plumbing and nothing about adoption.
--   campus_living.leave_apply,
--   campus_living.gate_pass_request,
--   cdc.declare_interest,
--   cdc.answer_willingness           — no rows yet. They are when-needed actions ('event'
--                                      cadence), so a morning without one is not evidence of
--                                      anything; each is flipped once it has a real use.
--
-- These three are DIRECTLY wired (recorded server-side after the write succeeds), unlike the
-- eleven bridged features already on the chart (recorded from a browser beacon, so they count
-- attempts). Their shares mean "did it", not "tried it", and should not be compared with the
-- bridged ones unlabelled.
--
-- Idempotent: only rows still unflagged are touched.

UPDATE public.feature_registry
   SET usage_wired = true, updated_at = now()
 WHERE feature_key IN ('service_requests.raise', 'hr.leave_apply', 'hr.leave_decide')
   AND usage_wired = false;
