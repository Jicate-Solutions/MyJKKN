-- 20260922000000_revoke_anon_induction_assert_live.sql
--
-- The live anon-exposure sweep ran on 2026-08-21 for the first time since
-- 18 August — it had been failing on a missing secret, so nothing was watching
-- for four days. Tables came back clean (10 approved, 0 unapproved). Functions
-- came back with 58 anon-executable, 54 approved, and 4 nobody had ever ruled on.
--
-- Director triage 2026-08-21: "Shut off the unguarded one, approve the rest."
--
-- ── THE ONE BEING SHUT OFF ──────────────────────────────────────────────────
--
--   fn_induction_assert_live(p_event_id uuid)   [reads, NO guard]
--
-- It takes a caller-supplied event id and has no permission check — the exact
-- shape that made 49 learners' names and emails readable on 2026-07-30. It is
-- milder than that case (it RETURNS void; a caller learns only whether the call
-- raises, i.e. whether an event id is live) but "milder" is not a reason to
-- leave it open to a key printed in every page of the site.
--
-- ── WHY THIS DOES NOT BREAK PUBLIC INDUCTION CAPTURE ───────────────────────
--
-- This mattered, because anon genuinely CAN insert into all four tables the
-- function guards — freshers submit attendance and feedback without signing in:
--
--   event_session_attendance   anon INSERT = true
--   event_session_feedback     anon INSERT = true
--   event_day_feedback         anon INSERT = true
--   event_program_feedback     anon INSERT = true
--
-- The function is reached from those inserts via two trigger functions,
-- trg_induction_require_live_by_session and trg_induction_require_live_by_event.
-- BOTH are themselves SECURITY DEFINER, so they run as their owner and the
-- inner call is made with the OWNER's privilege, not anon's.
--
-- Verified against production before committing, inside BEGIN…ROLLBACK — the
-- revoke was applied and the privileges re-read:
--
--   anon  EXECUTE on fn_induction_assert_live  → false   (closed)
--   owner EXECUTE on fn_induction_assert_live  → true    (trigger path intact)
--
-- So public induction attendance and feedback keep working. Reasoning alone
-- would not have been enough here; the trigger chain was simulated.
--
-- Reversible: GRANT EXECUTE ON FUNCTION public.fn_induction_assert_live(uuid) TO anon;
--
-- Updated: 2026-08-21 - Close the one unguarded anon-executable SECDEF function.

REVOKE EXECUTE ON FUNCTION public.fn_induction_assert_live(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_assert_live(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_induction_assert_live(uuid) IS
  'Induction guard: raises unless the event is live. Reached from '
  'event_session_attendance / event_session_feedback / event_day_feedback / '
  'event_program_feedback inserts through two SECURITY DEFINER trigger '
  'functions, which call it as OWNER — so unauthenticated fresher submissions '
  'still work. EXECUTE revoked from anon on 2026-08-21: it takes a '
  'caller-supplied event id and has no permission check of its own.';
