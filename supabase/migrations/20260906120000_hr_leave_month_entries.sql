-- ============================================================================
-- MANUAL PER-MONTH "TAKEN" ENTRIES FOR LEAVE (2026-09-06)
--
-- WHY A TABLE. hr_leave_balances.used is ONE number for the whole year, so
-- there has never been anywhere to say "she took a day in July". The month-wise
-- ledger added on 2026-09-05 could only infer months from leave APPLICATIONS,
-- and 232 of 775 Casual Leave rows have used > 0 with no application at all
-- (the June 2026 legacy backfill). Those days were attributed to the earliest
-- months as an undifferentiated "opening adjustment" because nothing recorded
-- where they actually belonged. This is that record.
--
-- WHY NOT A BACKDATED LEAVE APPLICATION. It was considered and rejected:
-- hr_leave_applications carries SIXTEEN triggers, and an INSERT of an approved
-- row for a past month runs into trg_hla_block_locked_period (attendance
-- periods for past months are routinely locked), trg_hla_block_approval_without
-- _biometric, three approval-chain gates, and
-- tr_recompute_attendance_on_leave_approval, which STAMPS ATTENDANCE. A
-- correction to a leave balance must not silently rewrite attendance history,
-- and for most past months it would simply have been refused with an error that
-- looks like a bug. These entries are balance-only, by decision.
--
-- CONSEQUENCE, STATED PLAINLY: for days recorded here the leave ledger and the
-- attendance records will disagree. That is intended, not an oversight.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.hr_leave_month_entries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         uuid NOT NULL REFERENCES public.staff(id)              ON DELETE CASCADE,
  leave_type_id       uuid NOT NULL REFERENCES public.hr_leave_types(id)     ON DELETE CASCADE,
  hr_academic_year_id uuid NOT NULL REFERENCES public.hr_academic_years(id)  ON DELETE CASCADE,
  hr_organization_id  uuid NOT NULL REFERENCES public.hr_organizations(id),
  -- Always the first of the month. The ledger positions the entry here in the
  -- FIFO walk, so a half-month date would sort unpredictably against requests.
  month_start         date    NOT NULL,
  -- Zero is not storable: the RPC deletes the row instead, so "no entry" has
  -- exactly one representation rather than two that must be kept in step.
  days                numeric NOT NULL CHECK (days > 0),
  reason              text    NOT NULL CHECK (btrim(reason) <> ''),
  created_by          uuid REFERENCES public.profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_leave_month_entries_month_start_is_first
    CHECK (month_start = date_trunc('month', month_start)::date)
);

-- One entry per month per cell: edits replace, they do not accumulate. Without
-- this an admin correcting a typo would add a second row and double the month.
CREATE UNIQUE INDEX IF NOT EXISTS hr_leave_month_entries_cell_month_uq
  ON public.hr_leave_month_entries (employee_id, leave_type_id, hr_academic_year_id, month_start);

-- Every FK gets an index: the RLS predicate filters on hr_organization_id, and
-- an unindexed FK turns each policy evaluation into a sequential scan.
CREATE INDEX IF NOT EXISTS hr_leave_month_entries_org_idx  ON public.hr_leave_month_entries (hr_organization_id);
CREATE INDEX IF NOT EXISTS hr_leave_month_entries_type_idx ON public.hr_leave_month_entries (leave_type_id);
CREATE INDEX IF NOT EXISTS hr_leave_month_entries_year_idx ON public.hr_leave_month_entries (hr_academic_year_id);

-- PostgREST publishes every table the moment it exists. RLS goes on in the same
-- migration that creates the table, never in a follow-up.
ALTER TABLE public.hr_leave_month_entries ENABLE ROW LEVEL SECURITY;

-- Read: byte-for-byte the hlba_select predicate on hr_leave_balance_adjustments,
-- so anyone who can already read the ledger and its audit trail can read these,
-- and nobody else gains a row.
DROP POLICY IF EXISTS hlme_select ON public.hr_leave_month_entries;
CREATE POLICY hlme_select ON public.hr_leave_month_entries
  FOR SELECT USING (
    (SELECT public.is_super_admin())
    OR employee_id IN (SELECT unnest(public.fn_my_staff_ids()))
    OR ((SELECT public.user_has_permission('hr.leave.balance.manage'::text))
        AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids())))
  );

-- Write: byte-for-byte hlb_write on hr_leave_balances. These entries move
-- `used`, so they are gated by the same key that already guards writing it
-- directly -- 2 roles, not the 7 that merely open the dialog.
DROP POLICY IF EXISTS hlme_write ON public.hr_leave_month_entries;
CREATE POLICY hlme_write ON public.hr_leave_month_entries
  FOR ALL USING (
    (SELECT public.is_super_admin())
    OR ((SELECT public.user_has_permission('hr.leave.policies.write'::text))
        AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids())))
  ) WITH CHECK (
    (SELECT public.is_super_admin())
    OR ((SELECT public.user_has_permission('hr.leave.policies.write'::text))
        AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids())))
  );

REVOKE ALL ON TABLE public.hr_leave_month_entries FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hr_leave_month_entries TO authenticated;
GRANT ALL ON TABLE public.hr_leave_month_entries TO service_role;

COMMENT ON TABLE public.hr_leave_month_entries IS
  'Admin-recorded leave days for a month that has no application behind it. Balance-only: deliberately does NOT stamp attendance, because a backdated approved application would be refused by the locked-period and biometric triggers and would rewrite attendance history.';

-- ---------------------------------------------------------------------------
-- The audit table must accept the new action.
--
-- Its action column carries a three-value CHECK. Without widening it the audit
-- INSERT inside the new RPC fails with 23514 -- and because the whole RPC is one
-- transaction, the balance write would roll back too, so the feature would
-- appear to "silently do nothing".
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_leave_balance_adjustments
  DROP CONSTRAINT IF EXISTS hr_leave_balance_adjustments_action_check;

ALTER TABLE public.hr_leave_balance_adjustments
  ADD CONSTRAINT hr_leave_balance_adjustments_action_check
  CHECK (action = ANY (ARRAY[
    'set_used'::text, 'set_entitlement'::text, 'clear_entitlement'::text,
    'set_month_entry'::text, 'clear_month_entry'::text
  ]));
