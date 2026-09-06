-- 20260925000000_revoke_anon_hr_attendance_leave.sql
--
-- The morning anon-exposure sweep on 2026-08-24 found NINE unapproved
-- anon-executable SECURITY DEFINER functions, up from four on 21 Aug. Six were
-- new, all from HR work merged in the preceding four days (staff-wise leave
-- balances, HR academic-year re-basing, attendance periods).
--
-- All six were EXECUTE-able by `anon` — the key printed into every page of the
-- site — and all six are SECURITY DEFINER, so they run as owner and bypass RLS
-- entirely.
--
--   fn_hr_compute_attendance_period_summary(uuid)          WRITES · NO GUARD
--   fn_hr_lock_attendance_period(uuid, integer, integer)   WRITES · guarded
--   fn_hr_reopen_attendance_period(uuid, text)             WRITES · guarded
--   hr_leave_balance_adjust(uuid,uuid,uuid,text,numeric,text) WRITES · guarded
--   hr_leave_balance_staff_detail(uuid, uuid)              WRITES · guarded
--   hr_attendance_period_console(integer, integer)         reads  · guarded
--
-- ── THE ONE THAT MATTERS ────────────────────────────────────────────────────
--
-- fn_hr_compute_attendance_period_summary takes a caller-supplied p_period_id,
-- WRITES, and performs no permission check. It does contain a RAISE, but that
-- is a not-found check on the period row — validation, not authorisation. The
-- distinction is the same one that caused the 2026-08-19 incident: a predicate
-- that VALIDATES is not a predicate that GATES.
--
-- So an unauthenticated caller holding the public anon key could pass any
-- period id and cause a write to payroll attendance data.
--
-- ── WHY CLOSING ALL SIX BREAKS NOTHING ──────────────────────────────────────
--
-- Verified 2026-08-24: fn_hr_compute_attendance_period_summary has ZERO callers
-- anywhere under app/ or lib/ — not merely no public callers. None of the six is
-- reachable from a page under app/(public)/. HR attendance and leave
-- administration is signed-in work by definition; there is no public payroll
-- surface for anon EXECUTE to serve.
--
-- authenticated and service_role are retained on all six, so every legitimate
-- caller is untouched and each function's own guard keeps doing its job.
--
-- ── THE REAL FINDING ────────────────────────────────────────────────────────
--
-- This is the THIRD consecutive sweep run to catch new drift: 4 unapproved on
-- 21 Aug, 2 more hours later (payroll directories, closed in 20260922010000),
-- 6 more on 24 Aug. The gate is not clearing a backlog of old sins — it is
-- catching a live habit.
--
-- CLAUDE.md already requires every new SECURITY DEFINER RPC migration to carry
-- an explicit `REVOKE EXECUTE ... FROM anon, PUBLIC`, precisely because
-- Supabase's default ALTER DEFAULT PRIVILEGES grants anon EXECUTE on every new
-- function. Six shipped without it in one week. Why the secdef-anon-revoke CI
-- gate did not stop them is being investigated separately; closing the doors
-- comes first.
--
-- Director ruling 2026-08-24: "Close all six now."
--
-- Reversible per function: GRANT EXECUTE ON FUNCTION public.<fn>(<args>) TO anon;
--
-- Updated: 2026-08-24 - Close six HR functions to the public anon key.

REVOKE EXECUTE ON FUNCTION public.fn_hr_compute_attendance_period_summary(uuid)                              FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_hr_lock_attendance_period(uuid, integer, integer)                       FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_hr_reopen_attendance_period(uuid, text)                                 FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.hr_attendance_period_console(integer, integer)                             FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.hr_leave_balance_adjust(uuid, uuid, uuid, text, numeric, text)             FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.hr_leave_balance_staff_detail(uuid, uuid)                                  FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_hr_compute_attendance_period_summary(uuid)                               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_hr_lock_attendance_period(uuid, integer, integer)                        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_hr_reopen_attendance_period(uuid, text)                                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_attendance_period_console(integer, integer)                              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_leave_balance_adjust(uuid, uuid, uuid, text, numeric, text)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_leave_balance_staff_detail(uuid, uuid)                                   TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_hr_compute_attendance_period_summary(uuid) IS
  'WRITES payroll attendance summary for a caller-supplied period id. Its RAISE '
  'is a not-found check, NOT an authorisation check. EXECUTE revoked from anon '
  'on 2026-08-24 after the exposure sweep found it reachable by the public key '
  'with no permission gate and no caller anywhere in the app.';
