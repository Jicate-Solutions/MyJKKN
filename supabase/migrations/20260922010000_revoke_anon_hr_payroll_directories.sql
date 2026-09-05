-- 20260922010000_revoke_anon_hr_payroll_directories.sql
--
-- The anon-exposure sweep caught these on its SECOND run, hours after its
-- first. They did not exist in the morning pass. That is the gate working:
-- it went four days blind on a missing secret, was restored on 2026-08-21,
-- and immediately began catching new drift.
--
--   hr_staff_bank_directory()      → staff bank accounts
--   hr_staff_salary_directory()    → staff salaries
--
-- Both were EXECUTE-able by `anon` — the key printed into every page of the
-- site — and both are SECURITY DEFINER, so they run as owner and bypass RLS.
--
-- ── THEY DO DEFEND THEMSELVES TODAY ─────────────────────────────────────────
--
-- Each opens with a real raise-guard, not a recorded predicate:
--
--   IF NOT public.user_has_permission('hr.payroll.bank.view') THEN
--     RAISE EXCEPTION '…' USING ERRCODE = 'insufficient_privilege';
--
-- and `anon` holds EXECUTE on NEITHER overload of user_has_permission
-- (verified 2026-08-21), so an unauthenticated call errors before reaching a
-- row. Stated honestly: that was established by reading the privileges, not by
-- executing the call — an anon read of bank data is not something to run in
-- order to prove a point.
--
-- ── WHY REVOKE ANYWAY ───────────────────────────────────────────────────────
--
-- Director ruling 2026-08-21, asked specifically about these two: "Close them
-- off too." The earlier ruling that day — approve the guarded ones — was made
-- about a different set, before these existed, and did not contemplate payroll.
--
-- There is no public payroll page, so anon EXECUTE buys nothing. Removing it
-- costs nothing and adds a layer that does not depend on a line of code inside
-- the function staying correct through every future edit. If that guard is ever
-- weakened by a refactor, a stranger still cannot reach the function at all.
--
-- service_role is retained: server routes on a service-role client are
-- unaffected. authenticated is retained because the guard is what gates a
-- signed-in caller, exactly as before.
--
-- Reversible: GRANT EXECUTE ON FUNCTION public.hr_staff_bank_directory() TO anon;
--
-- Updated: 2026-08-21 - Close two payroll directories to the public key.

REVOKE EXECUTE ON FUNCTION public.hr_staff_bank_directory()   FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.hr_staff_salary_directory() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.hr_staff_bank_directory()   TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.hr_staff_salary_directory() TO authenticated, service_role;
