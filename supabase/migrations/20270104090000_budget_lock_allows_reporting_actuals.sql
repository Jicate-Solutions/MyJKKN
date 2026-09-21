-- ─── The budget lock protects the PLAN, not the reporting of what was spent ──
-- 2026-09-21 · follows 20270101090000 / 20270102090000 / 20270103090000
--
-- fn_guard_event_budget_locked refuses ANY write to a budget line once the
-- approval status is 'approved' or 'locked', unless the caller is a super
-- admin, an admin, or holds events.budget.approve.
--
-- The plan is signed off BEFORE the event. The money is spent DURING it. So at
-- the exact moment there is something real to report, the person who knows what
-- it cost is locked out, and only a finance approver can type the figures in.
--
-- Proved on production, rolled back (2026-09-21), as POOMIGA G — an event
-- in-charge on the JKKN100 tournament, role hod, no approve or manage rights:
--
--   budget still a draft   -> she CAN record what was spent
--   plan signed off        -> "This budget is approved and locked."
--
-- That is how the "Actual (₹)" box stayed empty for 41 lines across 15 events.
-- Closing the books (20270102090000) would have shipped unusable by anyone but
-- finance, which is the group furthest from the spending.
--
-- ── The distinction this migration draws ───────────────────────────────────
-- Rewriting the PLAN after sign-off is exactly what the lock should stop.
-- Recording what a line ACTUALLY cost is reporting, not rewriting.
--
--   status 'approved'  plan frozen; actual_amount, status and receipt_url stay
--                      open to the event in-charge and events.budget.manage.
--                      Everything else — the estimate, the category, the
--                      description, the quantity, the rate, the parent, the
--                      committee, the vendor, the notes, and any insert or
--                      delete — refuses exactly as it does today.
--   status 'locked'    books closed. NOTHING moves without an approver. This
--                      is STRICTER than today, where an approver-less write
--                      was refused but the two states were not distinguished.
--
-- Anyone who could write before can still write. Nobody gains the ability to
-- change a single planned figure. The only thing that opens is the true-cost
-- box, to the people who know the true cost.
--
-- Depends on 20270101090000 for quantity, unit_rate, parent_id, committee_id
-- and category_id, which this function now names.
--
-- ci:allow-secdef-authenticated SELF-SCOPED: a row trigger on one table,
-- deciding whether THIS caller may make THIS change. It grants nothing.
--
-- No BEGIN/COMMIT: applied through exec_sql. Idempotent.

CREATE OR REPLACE FUNCTION public.fn_guard_event_budget_locked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status   text;
  v_event    uuid;
  v_reporter boolean;
  plan_changed boolean;
BEGIN
  v_event := COALESCE(NEW.event_id, OLD.event_id);
  SELECT status INTO v_status FROM public.event_budget_approvals WHERE event_id = v_event;

  -- Draft or awaiting sign-off: untouched, as before.
  IF v_status IS NULL OR v_status NOT IN ('approved', 'locked') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Approvers keep exactly the authority they have today.
  IF is_super_admin() OR is_admin() OR user_has_permission('events.budget.approve') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Books closed means closed. Nothing moves.
  IF v_status = 'locked' THEN
    RAISE EXCEPTION 'These books are closed. Ask an approver to reopen them before changing anything.';
  END IF;

  -- Plan approved, books still open.
  v_reporter := public.fn_is_event_incharge(v_event)
             OR public.user_has_permission('events.budget.manage');

  IF TG_OP = 'UPDATE' AND v_reporter THEN
    -- Everything that IS the plan. If none of it moved, the write is a report
    -- of what happened, and the remaining columns — actual_amount, status,
    -- receipt_url, updated_at — are exactly the reporting ones.
    plan_changed :=
         NEW.estimated_amount IS DISTINCT FROM OLD.estimated_amount
      OR NEW.type             IS DISTINCT FROM OLD.type
      OR NEW.category         IS DISTINCT FROM OLD.category
      OR NEW.category_id      IS DISTINCT FROM OLD.category_id
      OR NEW.description      IS DISTINCT FROM OLD.description
      OR NEW.quantity         IS DISTINCT FROM OLD.quantity
      OR NEW.unit_rate        IS DISTINCT FROM OLD.unit_rate
      OR NEW.parent_id        IS DISTINCT FROM OLD.parent_id
      OR NEW.committee_id     IS DISTINCT FROM OLD.committee_id
      OR NEW.event_id         IS DISTINCT FROM OLD.event_id
      OR NEW.vendor           IS DISTINCT FROM OLD.vendor
      OR NEW.notes            IS DISTINCT FROM OLD.notes;

    IF NOT plan_changed THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'This budget is approved. You can record what was actually spent, but the plan itself can only be changed by an approver.';
  END IF;

  -- Inserting or deleting a line after sign-off IS changing the plan.
  RAISE EXCEPTION 'This budget is approved and locked. Ask an approver to reopen it before editing.';
END;
$$;

COMMENT ON FUNCTION public.fn_guard_event_budget_locked() IS
  'Protects an approved budget''s PLAN while leaving the reporting of actuals open to the event in-charge and budget managers. Once the books are locked, nothing changes without an approver. Narrowed 2026-09-21 — the old rule locked the people who know what was spent out of saying so.';

NOTIFY pgrst, 'reload schema';
