-- ─── Events Platform Promotion · PR2 — Budget + finance sign-off gate ───
-- 2026-06-23
-- Promotes the Marathon budget into the shared events layer, and adds the decision-#7 finance gate:
-- the organizer drafts/edits the budget; a finance-approved person signs off before it is final/locked.
--
-- Strategy mirrors PR1: rename marathon_budget_items → event_budget_items (data/columns/indexes/RLS ride
-- along), security_invoker compat VIEW at the old name, idempotent. The per-LINE status column
-- ('planned'/'approved'/'spent'/'cancelled') is untouched — the budget-LEVEL sign-off lives in a new
-- per-event event_budget_approvals row, enforced by a write-lock trigger so the lock is real (a direct
-- service call can't bypass it), not just a disabled button.

-- ── 1. Rename + compat view ─────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.marathon_budget_items') IS NOT NULL
     AND to_regclass('public.event_budget_items') IS NULL THEN
    EXECUTE 'ALTER TABLE public.marathon_budget_items RENAME TO event_budget_items';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.event_budget_items') IS NOT NULL THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.marathon_budget_items WITH (security_invoker = true) AS SELECT * FROM public.event_budget_items';
    EXECUTE 'GRANT SELECT ON public.marathon_budget_items TO authenticated, anon';
  END IF;
END $$;

-- ── 2. Per-event budget approval state (the finance gate) ────────────────────
CREATE TABLE IF NOT EXISTS public.event_budget_approvals (
  event_id      uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'submitted', 'approved', 'locked')),
  submitted_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at  timestamptz,
  approved_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at   timestamptz,
  institution_id uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_budget_approvals ENABLE ROW LEVEL SECURITY;

-- read by any authenticated user who can reach the event; writes happen ONLY via the SECURITY DEFINER
-- RPCs below (no direct write policy), so the workflow can't be short-circuited from the client.
DROP POLICY IF EXISTS event_budget_approvals_select ON public.event_budget_approvals;
CREATE POLICY event_budget_approvals_select ON public.event_budget_approvals
  FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.event_budget_approvals FROM anon;
GRANT SELECT ON public.event_budget_approvals TO authenticated;

-- ── 3. Workflow RPCs (SECURITY DEFINER; anon revoked) ───────────────────────
-- Organizer submits the budget for sign-off.
CREATE OR REPLACE FUNCTION public.fn_submit_event_budget(p_event_id uuid)
RETURNS public.event_budget_approvals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.event_budget_approvals;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_budget_approvals
             WHERE event_id = p_event_id AND status IN ('approved', 'locked')) THEN
    RAISE EXCEPTION 'Budget is already approved; ask an approver to reopen it before resubmitting';
  END IF;
  INSERT INTO public.event_budget_approvals (event_id, status, submitted_by, submitted_at)
  VALUES (p_event_id, 'submitted', auth.uid(), now())
  ON CONFLICT (event_id) DO UPDATE
    SET status = 'submitted', submitted_by = auth.uid(), submitted_at = now(), updated_at = now()
  RETURNING * INTO r;
  RETURN r;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_submit_event_budget(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_submit_event_budget(uuid) TO authenticated;

-- Finance-approved person signs off.
CREATE OR REPLACE FUNCTION public.fn_approve_event_budget(p_event_id uuid)
RETURNS public.event_budget_approvals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.event_budget_approvals;
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('events.budget.approve')) THEN
    RAISE EXCEPTION 'You do not have permission to approve budgets';
  END IF;
  INSERT INTO public.event_budget_approvals (event_id, status, approved_by, approved_at)
  VALUES (p_event_id, 'approved', auth.uid(), now())
  ON CONFLICT (event_id) DO UPDATE
    SET status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now()
  RETURNING * INTO r;
  RETURN r;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_approve_event_budget(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_approve_event_budget(uuid) TO authenticated;

-- Approver reopens an approved budget so the organizer can edit again.
CREATE OR REPLACE FUNCTION public.fn_reopen_event_budget(p_event_id uuid)
RETURNS public.event_budget_approvals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.event_budget_approvals;
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('events.budget.approve')) THEN
    RAISE EXCEPTION 'You do not have permission to reopen budgets';
  END IF;
  UPDATE public.event_budget_approvals
    SET status = 'draft', approved_by = NULL, approved_at = NULL, updated_at = now()
    WHERE event_id = p_event_id
  RETURNING * INTO r;
  RETURN r;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_reopen_event_budget(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_reopen_event_budget(uuid) TO authenticated;

-- ── 4. Write-lock: once approved, only an approver can edit budget lines ─────
CREATE OR REPLACE FUNCTION public.fn_guard_event_budget_locked()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text; v_event uuid;
BEGIN
  v_event := COALESCE(NEW.event_id, OLD.event_id);
  SELECT status INTO v_status FROM public.event_budget_approvals WHERE event_id = v_event;
  IF v_status IN ('approved', 'locked')
     AND NOT (is_super_admin() OR is_admin() OR user_has_permission('events.budget.approve')) THEN
    RAISE EXCEPTION 'This budget is approved and locked. Ask an approver to reopen it before editing.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_guard_event_budget_locked ON public.event_budget_items;
CREATE TRIGGER trg_guard_event_budget_locked
  BEFORE INSERT OR UPDATE OR DELETE ON public.event_budget_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_event_budget_locked();
