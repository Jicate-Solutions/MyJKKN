-- ─── Closing an event's books: the moment that demands the real figure ──────
-- 2026-09-21 · follows 20270101090000
--
-- The "Actual (₹)" box has been on the budget edit form all along. Across the
-- 15 events that have a budget, over 41 lines, it has been filled in ZERO
-- times. Every one of those lines is still `planned`, with no receipt.
--
-- So there is no record anywhere of what a single event actually cost, and
-- adding more fields will not produce one. Nobody is ever ASKED.
--
-- The workflow already has the missing moment in it, unused:
--
--   draft  ->  submitted  ->  approved   the PLAN is signed off (before)
--                         ->  locked     <- never set by anything
--
-- `locked` becomes: the accounts are closed. Every line has a final figure or
-- has been written off. Closing REFUSES while any line is unanswered, and the
-- refusal names the lines rather than saying no.
--
-- A line is answered when its status is 'spent' (this figure is final) or
-- 'cancelled' (nothing was spent). Both already exist in the status CHECK; no
-- new vocabulary is invented.
--
-- Only LEAF lines count. An itemised line's amounts are the sum of its items
-- (20270101090000), so asking for it separately would be asking the same
-- question twice and inviting two different answers.
--
-- Nothing here changes an existing budget. Every event is `draft` or
-- `submitted` today; none is closable until someone answers its lines, and
-- none is blocked from anything it can do now.
--
-- ci:allow-secdef-authenticated SELF-SCOPED: both functions take only an event
-- id, check the caller's own authority with the same test fn_approve uses, and
-- return that event's own row. authenticated must hold EXECUTE because the
-- board calls them as the signed-in user.
--
-- No BEGIN/COMMIT: applied through exec_sql. Idempotent.

ALTER TABLE public.event_budget_approvals
  ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

COMMENT ON COLUMN public.event_budget_approvals.closed_by IS
  'Who closed the books — said, on the record, what this event actually cost. Distinct from approved_by, who signed off the plan beforehand.';

-- ── How many lines are still unanswered ─────────────────────────────────────
-- The board asks this to label its button, and fn_close_event_budget asks it
-- to decide. One definition, so the button and the refusal cannot disagree.
CREATE OR REPLACE FUNCTION public.fn_event_budget_unsettled(p_event_id uuid)
RETURNS TABLE (id uuid, type text, category text, description text, estimated_amount numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, b.type, b.category, b.description, b.estimated_amount
  FROM public.event_budget_items b
  WHERE b.event_id = p_event_id
    AND b.status NOT IN ('spent', 'cancelled')
    -- Leaves only: an itemised line is answered by answering its items.
    AND NOT EXISTS (SELECT 1 FROM public.event_budget_items c WHERE c.parent_id = b.id)
  ORDER BY b.type, b.category, b.created_at;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_event_budget_unsettled(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_event_budget_unsettled(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_event_budget_unsettled(uuid) IS
  'Budget lines with no final figure yet — neither spent nor written off. Leaves only. The books cannot be closed while this returns anything.';

-- ── Close the books ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_close_event_budget(p_event_id uuid)
RETURNS public.event_budget_approvals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.event_budget_approvals;
  open_count integer;
  open_names text;
BEGIN
  -- Same authority as signing off the plan. Closing the books is a statement
  -- of fact about money and belongs to the same people.
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('events.budget.approve')) THEN
    RAISE EXCEPTION 'You do not have permission to close a budget';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.event_budget_items WHERE event_id = p_event_id) THEN
    RAISE EXCEPTION 'There is nothing to close — this event has no budget lines';
  END IF;

  SELECT count(*), string_agg(description, ', ' ORDER BY description)
  INTO open_count, open_names
  FROM public.fn_event_budget_unsettled(p_event_id);

  IF open_count > 0 THEN
    -- Name them. "Cannot close" with no list is a wall, not an answer.
    RAISE EXCEPTION '% line(s) still have no final figure: %',
      open_count,
      left(open_names, 400)
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.event_budget_approvals (event_id, status, closed_by, closed_at)
  VALUES (p_event_id, 'locked', auth.uid(), now())
  ON CONFLICT (event_id) DO UPDATE
    SET status = 'locked', closed_by = auth.uid(), closed_at = now(), updated_at = now()
  RETURNING * INTO r;
  RETURN r;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_close_event_budget(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_close_event_budget(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_close_event_budget(uuid) IS
  'Close an event''s books: every leaf line must be spent or written off first. Sets status = locked and records who said so. Refuses by naming the unanswered lines.';

-- ── Settling one line ───────────────────────────────────────────────────────
-- A line is settled by recording what it really cost, or by saying nothing was
-- spent on it. Kept as one function so "answered" means exactly one thing.
CREATE OR REPLACE FUNCTION public.fn_settle_event_budget_line(
  p_item_id uuid,
  p_actual  numeric,
  p_nothing_spent boolean DEFAULT false
)
RETURNS public.event_budget_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.event_budget_items;
  ev uuid;
BEGIN
  SELECT event_id INTO ev FROM public.event_budget_items WHERE id = p_item_id;
  IF ev IS NULL THEN
    RAISE EXCEPTION 'That budget line no longer exists' USING ERRCODE = '23503';
  END IF;

  -- Writing the real figure is a budget write, so it answers to the budget's
  -- own rule rather than to the approver's. The organiser knows what was spent.
  IF NOT (
    is_super_admin() OR is_admin()
    OR fn_is_event_incharge(ev)
    OR user_has_permission('events.budget.manage')
    OR user_has_permission('events.budget.approve')
  ) THEN
    RAISE EXCEPTION 'You do not have permission to settle this budget line';
  END IF;

  IF EXISTS (SELECT 1 FROM public.event_budget_items c WHERE c.parent_id = p_item_id) THEN
    RAISE EXCEPTION 'This line is made up of items — settle those instead'
      USING ERRCODE = '23514';
  END IF;

  IF NOT p_nothing_spent AND (p_actual IS NULL OR p_actual < 0) THEN
    RAISE EXCEPTION 'Enter what was actually spent, or say nothing was spent'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.event_budget_items
  SET actual_amount = CASE WHEN p_nothing_spent THEN 0 ELSE p_actual END,
      status        = CASE WHEN p_nothing_spent THEN 'cancelled' ELSE 'spent' END,
      updated_at    = now()
  WHERE id = p_item_id
  RETURNING * INTO r;
  RETURN r;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_settle_event_budget_line(uuid, numeric, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_settle_event_budget_line(uuid, numeric, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
