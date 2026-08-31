-- =============================================================================
-- 20260824200000_hr_on_duty_leave_uncapped.sql
--
-- On-Duty Leave stops being capped at 6 days a year.
--
-- WHY
-- ---
-- On-Duty is not really leave. It records a day the staff member WAS working,
-- somewhere other than their seat -- a conference, an exam duty, an inspection,
-- an official errand -- and every one of them is approved against a document.
-- The document is the control. An annual quota on top of it caps how much
-- official duty a person is allowed to perform in a year, which is not a rule
-- anyone intended: it just came along with the leave-type shape, where
-- default_entitled_days is NOT NULL and every other type has a real quota.
--
-- Six was low enough to bite. Staff hit it mid-year and then had to file
-- genuine duty as Casual Leave -- spending a real quota, and corrupting the
-- attendance record of a day they worked.
--
-- WHY 365 AND NOT "UNLIMITED"
-- ---------------------------
-- There is no unlimited. hr_leave_types.default_entitled_days is
-- `numeric NOT NULL DEFAULT 0`, and the balance view computes
--     available := entitled + carried_forward - used
-- with no branch for a null or sentinel entitlement. 365 is the smallest number
-- that cannot be reached inside one 12-month HR year (Jun 1 -> May 31), so it
-- is a cap in name only, and it keeps every downstream sum finite -- an
-- entitlement of NULL or -1 would have to be special-cased in the view, the
-- analytics RPC, the staff-balances tab and the export.
--
-- WHY THIS ONE UPDATE IS THE WHOLE CHANGE
-- ---------------------------------------
-- v_hr_leave_balance_src resolves an entitlement in three tiers:
--
--     COALESCE(o.entitled_days,          -- 'override' : per-staff, per-year
--              b.entitled,               -- 'frozen'   : literal on the ledger
--              t.default_entitled_days)  -- 'policy'   : this column
--
-- Checked before writing this, for leave_type_code = 'OD':
--   *   0 rows in hr_leave_entitlement_overrides  -> no override outranks it
--   * 683 balance rows in 2026-2027 (OPEN) have entitled IS NULL -> 'policy',
--         so they follow this change with no ledger write at all
--   * 393 balance rows carry a literal -- and every one of them is in a FROZEN
--         year (389 in 2024-2025, 4 in 2025-2026, frozen 2026-08-11). Those
--         SHOULD keep 6. Freezing a year exists to stop history moving, and
--         clearing those literals to follow the new policy would retroactively
--         hand closed years an entitlement nobody had at the time.
--   * staff with no ledger row at all still resolve through the view's
--         CROSS JOIN branch, which coalesces to this same column
--   * SUM(used) = 0 across every OD row, so raising the entitlement cannot
--         strand anyone in the used > entitled anomaly state
--
-- So: open years and everyone yet to be generated pick up 365; closed years
-- keep the 6 they were closed with. Nothing else needs touching, and
-- deliberately nothing else is touched.
--
-- SCOPE
-- -----
-- The 11 HR organisations that HAVE an On-Duty type. Three do not -- JKKN
-- Matric Higher Secondary School (55 staff), Nattraja Vidhyalya CBSE (44) and
-- Nattraja Incubation Forum (0) run on Casual Leave + Permission only. Creating
-- the type for them would GRANT 365 days of a new entitlement to 99 staff who
-- have none today, which is a policy decision and not this migration's job.
--
-- No other cap applies: max_continuous_days (single request) and
-- leave_max_days_per_period (rolling cap) are both NULL on every OD row, so the
-- annual entitlement was the only ceiling in force.
--
-- Idempotent: the guard makes a re-run a no-op.
-- =============================================================================

UPDATE public.hr_leave_types
   SET default_entitled_days = 365,
       updated_at            = now()
 WHERE leave_type_code       = 'OD'
   AND default_entitled_days IS DISTINCT FROM 365;

COMMENT ON COLUMN public.hr_leave_types.default_entitled_days IS
  'Annual entitlement for this leave type, in days. The LAST tier of the three the balance view resolves: an hr_leave_entitlement_overrides row beats it, and a literal hr_leave_balances.entitled beats it for that one staff-year (which is what freezing a year leaves behind). On-Duty carries 365 -- unreachable inside a 12-month HR year -- because it records documented official duty rather than absence, and the document is the control, not a quota.';
