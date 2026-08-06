-- Billing categories: "Once per learner" enforcement
--
-- WHY THIS IS A TRIGGER AND NOT APPLICATION CODE
-- ----------------------------------------------
-- Bills reach billing_student_bills from at least ten independent paths:
--   TypeScript : student-bill-service (single create), student-bill-service
--                (recurring), onboarding-service, bills/import route
--   SQL/RPC    : admission_account_transition_with_bills,
--                admission_approve_fee_change_event,
--                admission_fix_fee_mismatch_2026,
--                campus_living_generate_hostel_year_bills,
--                _cl_apply_category_bill_change, _cl_apply_upgrade_fee_bill
--                (+ the feesync cron)
-- A service-layer guard would be bypassed by six of those, which is precisely
-- how the existing tuition duplicates were created. The database is the only
-- chokepoint every path passes through.
--
-- WHY NOT REUSE billing_categories.frequency
-- ------------------------------------------
-- `frequency` is already 'one-time' for 22 of 23 categories but has never been
-- enforced anywhere — it is descriptive metadata written by the category form
-- and read only by filters and exports. Enforcing on it would immediately
-- block Transport Fee's legitimate Term 2 instalment for 1,011 learners with
-- no way to opt out. Hence a separate, explicitly opt-in flag defaulting false,
-- so nothing changes on deploy.
--
-- SCOPE: once per learner, EVER (not per academic year). Chosen deliberately —
-- see docs/superpowers/specs/2026-07-27-billing-category-once-per-learner-design.md

-- ---------------------------------------------------------------------------
-- 1. The flag
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_categories
  ADD COLUMN IF NOT EXISTS once_per_learner boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.billing_categories.once_per_learner IS
  'When true, a learner may hold at most ONE live bill for this category, ever. '
  'Enforced by trigger trg_billing_bills_once_per_learner on billing_student_bills. '
  'Cancelled and superseded bills do not count, so correcting a mistake never '
  'permanently locks a learner out of the category. Defaults false: enabling is '
  'always a deliberate per-category decision.';

-- ---------------------------------------------------------------------------
-- 2. Enforcement trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_enforce_once_per_learner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled       boolean;
  v_category_name text;
  v_existing_id   uuid;
BEGIN
  -- A bill with no category cannot be governed by a category rule.
  IF NEW.item_category_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Cancelled / superseded rows are not live bills. Writing one directly, or
  -- cancelling an existing one, must always be allowed.
  IF NEW.status IN ('cancelled', 'superseded') THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, only re-check when the row actually moves in a way that could
  -- create a violation: a different learner/category, or a status coming back
  -- from cancelled/superseded into a live state. Ordinary edits (amount,
  -- due date, payment status between live states) must not be blocked by the
  -- row's own pre-existing twin.
  IF TG_OP = 'UPDATE'
     AND NEW.student_id       IS NOT DISTINCT FROM OLD.student_id
     AND NEW.item_category_id IS NOT DISTINCT FROM OLD.item_category_id
     AND OLD.status NOT IN ('cancelled', 'superseded')
  THEN
    RETURN NEW;
  END IF;

  SELECT bc.once_per_learner, bc.category_name
    INTO v_enabled, v_category_name
  FROM public.billing_categories bc
  WHERE bc.id = NEW.item_category_id;

  IF NOT COALESCE(v_enabled, false) THEN
    RETURN NEW;
  END IF;

  -- Serialise concurrent writers for this learner+category pair. Without it,
  -- two simultaneous bulk runs could both read "no existing bill" and both
  -- insert. The lock is transaction-scoped and released automatically; it only
  -- ever contends between writes to the SAME pair, so it costs nothing in
  -- normal bulk generation across many learners.
  PERFORM pg_advisory_xact_lock(
    hashtext(NEW.student_id::text || ':' || NEW.item_category_id::text)
  );

  SELECT b.id INTO v_existing_id
  FROM public.billing_student_bills b
  WHERE b.student_id       = NEW.student_id
    AND b.item_category_id = NEW.item_category_id
    AND b.status NOT IN ('cancelled', 'superseded')
    AND b.id IS DISTINCT FROM NEW.id   -- ignore the row being updated
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION
      'Billing category "%" allows only one bill per learner, and this learner already has one (bill %).',
      COALESCE(v_category_name, '?'), v_existing_id
      USING ERRCODE = 'BL001',
            HINT    = 'Cancel the existing bill first, or turn off "Once per learner" on this billing category.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.billing_enforce_once_per_learner() IS
  'Rejects a second live bill for a learner when the billing category has '
  'once_per_learner = true. Raises SQLSTATE BL001 so callers can render a '
  'friendly per-row message instead of a raw database error.';

DROP TRIGGER IF EXISTS trg_billing_bills_once_per_learner ON public.billing_student_bills;

CREATE TRIGGER trg_billing_bills_once_per_learner
  BEFORE INSERT OR UPDATE ON public.billing_student_bills
  FOR EACH ROW
  EXECUTE FUNCTION public.billing_enforce_once_per_learner();

-- Supports the existence probe above. Partial, so it stays small: only live
-- bills are ever looked up.
CREATE INDEX IF NOT EXISTS idx_bsb_student_category_live
  ON public.billing_student_bills (student_id, item_category_id)
  WHERE status <> ALL (ARRAY['cancelled'::varchar, 'superseded'::varchar]);

-- ---------------------------------------------------------------------------
-- 3. Pre-flight conflict probe
-- ---------------------------------------------------------------------------
-- Powers the warning shown when enabling the flag: "87 learners already have
-- more than one bill for this category". SECURITY DEFINER on purpose — the
-- flag is global to the category, so the count must be global too; an
-- RLS-scoped count would under-report and give false confidence. Self-
-- authorizes because a DEFINER function callable by `authenticated` must not
-- rely on the caller having been gated upstream.
CREATE OR REPLACE FUNCTION public.billing_category_duplicate_conflicts(
  p_category_id uuid
)
RETURNS TABLE (
  learners_with_duplicates integer,
  extra_bills              integer,
  extra_value              numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_super_admin() OR public.user_has_permission('billing.categories.edit')) THEN
    RAISE EXCEPTION 'Not authorized to inspect billing category conflicts'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH live AS (
    SELECT
      b.student_id,
      b.final_amount,
      ROW_NUMBER() OVER (PARTITION BY b.student_id ORDER BY b.created_at, b.id) AS rn,
      COUNT(*)     OVER (PARTITION BY b.student_id)                             AS n
    FROM public.billing_student_bills b
    WHERE b.item_category_id = p_category_id
      AND b.status NOT IN ('cancelled', 'superseded')
  )
  SELECT
    COALESCE(COUNT(DISTINCT live.student_id) FILTER (WHERE live.n > 1), 0)::integer,
    COALESCE(COUNT(*)                        FILTER (WHERE live.rn > 1), 0)::integer,
    COALESCE(SUM(live.final_amount)          FILTER (WHERE live.rn > 1), 0)::numeric
  FROM live;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_category_duplicate_conflicts(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.billing_category_duplicate_conflicts(uuid) TO authenticated;
