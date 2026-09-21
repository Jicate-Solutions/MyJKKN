-- ─── Measuring an expense against its outcome ───────────────────────────────
-- 2026-09-21 · follows 20270101090000 and 20270102090000
--
-- "Able to measure each expense and its outcome" was the ask. Until now there
-- was no field of any kind tying a spend to what it bought or who it served —
-- no quantity, no rate, no committee, no head count — so the question could not
-- be asked, let alone answered.
--
-- The three pieces that were missing are now in place, and this migration turns
-- them into the three figures worth looking at:
--
--   1. WHAT IT COST PER HEAD. Registrations are already counted. Dividing by
--      them needs no new data entry from anybody, which is the only reason it
--      will actually get used.
--   2. WHAT EACH COMMITTEE SPENT. A budget nobody owns is a budget nobody
--      answers for; committee_id made that answerable.
--   3. WHAT THIS CATEGORY USUALLY COSTS. The point of a fixed category list:
--      "refreshments" is one thing across events, so last time's real figure
--      can inform this time's estimate. Compared PER HEAD, because a 60-person
--      event and a 600-person event are not otherwise comparable — which is
--      exactly the mistake a raw total invites.
--
-- All three read only what is already recorded. Nothing new is asked of anyone.
--
-- Benchmarks deliberately count only events whose books are CLOSED. An open
-- event's actuals are mostly zero, and averaging those in would quietly drag
-- every benchmark toward nothing — a wrong number that looks like a real one.
--
-- ci:allow-secdef-authenticated SELF-SCOPED: each takes an event id and returns
-- that event's own figures. They are SECURITY DEFINER so the per-head divisor
-- is the true registration count rather than the slice the caller may read —
-- a cost-per-head that changes depending on who is looking is worse than none.
-- The caller must still be able to read the event's budget, which is checked.
--
-- No BEGIN/COMMIT: applied through exec_sql. Idempotent.

-- ── 1. What the event cost, and what it cost per head ───────────────────────
CREATE OR REPLACE FUNCTION public.fn_event_budget_outcome(p_event_id uuid)
RETURNS TABLE (
  estimated_income   numeric,
  actual_income      numeric,
  estimated_expense  numeric,
  actual_expense     numeric,
  registrations      bigint,
  estimated_per_head numeric,
  actual_per_head    numeric,
  books_closed       boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE heads bigint;
BEGIN
  IF NOT public.fn_can_read_event_tasks(p_event_id) THEN
    RAISE EXCEPTION 'You do not have access to this event';
  END IF;

  SELECT count(*) INTO heads
  FROM public.events_registrations r WHERE r.event_id = p_event_id;

  RETURN QUERY
  WITH leaves AS (
    -- Leaves only. An itemised line equals the sum of its items, so counting
    -- both would overstate the whole budget by its itemised part.
    SELECT b.* FROM public.event_budget_items b
    WHERE b.event_id = p_event_id
      AND b.status <> 'cancelled'
      AND NOT EXISTS (SELECT 1 FROM public.event_budget_items c WHERE c.parent_id = b.id)
  ), t AS (
    SELECT
      coalesce(sum(estimated_amount) FILTER (WHERE type = 'income'), 0)  AS ei,
      coalesce(sum(actual_amount)    FILTER (WHERE type = 'income'), 0)  AS ai,
      coalesce(sum(estimated_amount) FILTER (WHERE type = 'expense'), 0) AS ee,
      coalesce(sum(actual_amount)    FILTER (WHERE type = 'expense'), 0) AS ae
    FROM leaves
  )
  SELECT
    t.ei, t.ai, t.ee, t.ae,
    heads,
    -- NULL, not zero, when nobody registered. Dividing by nothing and calling
    -- the answer zero is how a made-up figure gets quoted back as fact.
    CASE WHEN heads > 0 THEN round(t.ee / heads, 2) END,
    CASE WHEN heads > 0 THEN round(t.ae / heads, 2) END,
    EXISTS (
      SELECT 1 FROM public.event_budget_approvals a
      WHERE a.event_id = p_event_id AND a.status = 'locked'
    )
  FROM t;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_event_budget_outcome(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_event_budget_outcome(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_event_budget_outcome(uuid) IS
  'What an event cost and what it cost per registered head, planned against actual. Per-head is NULL when nobody registered, never zero.';

-- ── 2. What each committee spent ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_event_budget_by_committee(p_event_id uuid)
RETURNS TABLE (
  committee_id   uuid,
  committee_name text,
  lines          bigint,
  estimated      numeric,
  actual         numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_can_read_event_tasks(p_event_id) THEN
    RAISE EXCEPTION 'You do not have access to this event';
  END IF;

  RETURN QUERY
  SELECT
    b.committee_id,
    -- Spend nobody has claimed is itself worth seeing, so it is a row rather
    -- than a silent omission.
    coalesce(c.name, 'No committee named') AS committee_name,
    count(*)::bigint,
    coalesce(sum(b.estimated_amount), 0),
    coalesce(sum(b.actual_amount), 0)
  FROM public.event_budget_items b
  LEFT JOIN public.event_committees c ON c.id = b.committee_id
  WHERE b.event_id = p_event_id
    AND b.type = 'expense'
    AND b.status <> 'cancelled'
    AND NOT EXISTS (SELECT 1 FROM public.event_budget_items x WHERE x.parent_id = b.id)
  GROUP BY b.committee_id, c.name
  ORDER BY coalesce(sum(b.estimated_amount), 0) DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_event_budget_by_committee(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_event_budget_by_committee(uuid) TO authenticated;

-- ── 3. What this category usually costs, per head ───────────────────────────
CREATE OR REPLACE FUNCTION public.fn_event_budget_category_benchmark(p_event_id uuid)
RETURNS TABLE (
  category_id       uuid,
  category_name     text,
  this_estimated    numeric,
  this_actual       numeric,
  other_events      bigint,
  typical_per_head  numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_can_read_event_tasks(p_event_id) THEN
    RAISE EXCEPTION 'You do not have access to this event';
  END IF;

  RETURN QUERY
  WITH mine AS (
    SELECT b.category_id, max(b.category) AS nm,
           sum(b.estimated_amount) AS est, sum(b.actual_amount) AS act
    FROM public.event_budget_items b
    WHERE b.event_id = p_event_id
      AND b.type = 'expense'
      AND b.status <> 'cancelled'
      AND b.category_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.event_budget_items x WHERE x.parent_id = b.id)
    GROUP BY b.category_id
  ),
  -- Only events whose books are CLOSED. An open event's actuals are mostly
  -- zero; averaging those in drags every benchmark toward nothing.
  closed AS (
    SELECT a.event_id FROM public.event_budget_approvals a
    WHERE a.status = 'locked' AND a.event_id <> p_event_id
  ),
  heads AS (
    SELECT r.event_id, count(*)::numeric AS n
    FROM public.events_registrations r
    JOIN closed ON closed.event_id = r.event_id
    GROUP BY r.event_id
  ),
  others AS (
    SELECT b.category_id, b.event_id, sum(b.actual_amount) AS act
    FROM public.event_budget_items b
    JOIN closed ON closed.event_id = b.event_id
    WHERE b.type = 'expense'
      AND b.status <> 'cancelled'
      AND b.category_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.event_budget_items x WHERE x.parent_id = b.id)
    GROUP BY b.category_id, b.event_id
  ),
  per_head AS (
    SELECT o.category_id, count(*)::bigint AS n_events,
           round(avg(o.act / h.n), 2) AS avg_ph
    FROM others o
    JOIN heads h ON h.event_id = o.event_id AND h.n > 0
    GROUP BY o.category_id
  )
  SELECT m.category_id, m.nm, coalesce(m.est,0), coalesce(m.act,0),
         coalesce(p.n_events, 0), p.avg_ph
  FROM mine m
  LEFT JOIN per_head p ON p.category_id = m.category_id
  ORDER BY coalesce(m.est,0) DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_event_budget_category_benchmark(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_event_budget_category_benchmark(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_event_budget_category_benchmark(uuid) IS
  'For each category this event budgets for: its own figures, plus what that category typically cost PER HEAD across other events whose books are closed. Per head, because a 60-person and a 600-person event are not otherwise comparable.';

NOTIFY pgrst, 'reload schema';
