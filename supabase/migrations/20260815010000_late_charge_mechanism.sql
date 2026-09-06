-- =============================================================================
-- Platform-wide late-payment charge — MECHANISM ONLY, OFF AT EVERY LAYER
-- Created: 2026-08-07 · 🛑 FILE ONLY — NOT APPLIED. Apply is Director-gated.
-- Requires: 20260815009000_billing_category_kind_add_penalty.sql (adds the
--           'penalty' enum value in its own transaction — see that file's WHY).
--
-- DIRECTOR'S LOCKED DECISIONS (2026-08-06):
--   * 10% per month, COMPOUNDING (total owed = balance × 1.1^m;
--     charge = balance × (1.1^m − 1)), NO ceiling.
--   * Applies to every overdue fee bill platform-wide
--     (billing_student_bills: status unpaid/partially_paid,
--     balance_amount > 0, due_date past).
--   * Starts the day a bill goes overdue (grace_days policy, default 0).
--     BACKDATED to existing dues once enabled.
--   * Only the Director may waive; waivers record the approver.
--   * Families are warned first; the charge begins warning_lead_days later.
--     This migration builds the WARNING PREVIEW substrate only — NO sending.
--   * The learner sees the figure monthly and on her fees page, with a
--     month-by-month derivation.
--
-- OFF AT EVERY LAYER: billing.late_charge.enabled seeds FALSE (master switch);
-- effective_from seeds '' (unset until the Director sets it);
-- fn_late_charge_accrue RAISEs unless the switch is true AND effective_from is
-- set and reached; no schedule is registered anywhere; the admin page has no
-- accrual control; billing.late_charges.waive is granted to NO role (Director =
-- super-admin bypass). Nothing in this file charges anyone.
--
-- Canonical mechanisms used (nothing parallel invented):
--   * platform_policies + fn_get_policy / fn_get_policy_bool/int/text
--   * billing_categories ('penalty' fee head) + billing_student_bills spine
--   * is_super_admin()/is_admin() + user_has_permission() +
--     role_has_institution_access() for RLS and RPC gates
-- =============================================================================

-- Fail loudly (and early) if the companion enum migration has not run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'billing_category_kind' AND e.enumlabel = 'penalty'
  ) THEN
    RAISE EXCEPTION 'billing_category_kind is missing the ''penalty'' value — apply 20260815009000_billing_category_kind_add_penalty.sql first';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1. Penalty fee-head category (idempotent). visible_to_learners = true is
--    deliberate: a learner must always be able to see a late charge levied on
--    her, with its derivation — hiding it is not an option here.
-- -----------------------------------------------------------------------------
INSERT INTO billing_categories
  (category_name, amount, frequency, description, is_active, visible_to_learners, kind)
SELECT
  'Late Payment Charge', NULL, 'one-time',
  'Penalty head for the platform-wide late-payment charge mechanism. Penalty bills are created ONLY by fn_late_charge_accrue (never by hand) and are excluded from further late-charge accrual — the compounding formula already carries the month-on-month growth.',
  true, true, 'penalty'::billing_category_kind
WHERE NOT EXISTS (
  SELECT 1 FROM billing_categories
  WHERE category_name = 'Late Payment Charge'
     OR kind = 'penalty'::billing_category_kind
);

-- -----------------------------------------------------------------------------
-- 2. Policy rows (global scope, idempotent). Every knob of this mechanism is a
--    platform_policies row — docs/architecture/config-table-pattern.md.
-- -----------------------------------------------------------------------------

-- MASTER SWITCH — false. Every other layer defers to this row.
INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
SELECT 'billing.late_charge.enabled', 'global', NULL, to_jsonb(false),
       'MASTER SWITCH for the platform-wide late-payment charge. FALSE = the mechanism is dormant: no accrual runs, learners see nothing. Only the Director flips this, deliberately, after the warning window.',
       'boolean', false, true
WHERE NOT EXISTS (SELECT 1 FROM platform_policies WHERE policy_key = 'billing.late_charge.enabled' AND scope_type = 'global' AND scope_id IS NULL);

INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
SELECT 'billing.late_charge.rate_percent_per_month', 'global', NULL, to_jsonb(10),
       'Late-payment charge rate, percent per month of the unpaid balance. Director decision 2026-08-06: 10.',
       'number', false, true
WHERE NOT EXISTS (SELECT 1 FROM platform_policies WHERE policy_key = 'billing.late_charge.rate_percent_per_month' AND scope_type = 'global' AND scope_id IS NULL);

INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
SELECT 'billing.late_charge.compounding', 'global', NULL, to_jsonb(true),
       'TRUE = the charge compounds monthly (total owed = balance × (1 + rate/100)^months). FALSE = simple interest per month. Director decision 2026-08-06: compounding, no ceiling.',
       'boolean', false, true
WHERE NOT EXISTS (SELECT 1 FROM platform_policies WHERE policy_key = 'billing.late_charge.compounding' AND scope_type = 'global' AND scope_id IS NULL);

INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
SELECT 'billing.late_charge.grace_days', 'global', NULL, to_jsonb(0),
       'Days after due_date before a bill counts as overdue for the late charge. Director decision 2026-08-06: 0 — the charge starts the day a bill goes overdue.',
       'number', false, true
WHERE NOT EXISTS (SELECT 1 FROM platform_policies WHERE policy_key = 'billing.late_charge.grace_days' AND scope_type = 'global' AND scope_id IS NULL);

INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
SELECT 'billing.late_charge.warning_lead_days', 'global', NULL, to_jsonb(7),
       'Families are warned first: the warning goes out, and the charge begins this many days later. The warning SENDING path is deliberately not built yet — only the preview of who would be messaged.',
       'number', false, true
WHERE NOT EXISTS (SELECT 1 FROM platform_policies WHERE policy_key = 'billing.late_charge.warning_lead_days' AND scope_type = 'global' AND scope_id IS NULL);

-- Empty until the Director sets it. fn_late_charge_accrue refuses to run (even
-- a live call, even with the switch on) while this is empty or in the future.
INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
SELECT 'billing.late_charge.effective_from', 'global', NULL, to_jsonb(''::text),
       'ISO date (YYYY-MM-DD) the late-payment charge takes effect. EMPTY = not yet set; accrual refuses to run. Set by the Director when the warning window is scheduled. Once enabled, charges are BACKDATED to when each bill went overdue.',
       'string', false, true
WHERE NOT EXISTS (SELECT 1 FROM platform_policies WHERE policy_key = 'billing.late_charge.effective_from' AND scope_type = 'global' AND scope_id IS NULL);

INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
SELECT 'billing.late_charge.warning_template', 'global', NULL,
       to_jsonb('Dear parent, our records show that a fee bill for {learner_name} of {balance_amount}, due on {due_date}, is still unpaid. From {charge_start_date}, a late payment charge of {rate_percent}% per month will be added to the unpaid amount, and it grows each month the balance stays unpaid. Paying the full balance before {charge_start_date} avoids this charge entirely. If you believe this bill is wrong, or if you need help arranging payment, please contact the accounts office of your college right away.'::text),
       'Plain-English warning message a parent can read. Placeholders: {learner_name} {balance_amount} {due_date} {charge_start_date} {rate_percent}. Used by the warning PREVIEW only — no sending path exists yet.',
       'string', false, true
WHERE NOT EXISTS (SELECT 1 FROM platform_policies WHERE policy_key = 'billing.late_charge.warning_template' AND scope_type = 'global' AND scope_id IS NULL);

-- -----------------------------------------------------------------------------
-- 3. Ledger table: one row per (bill, monthly period) of accrued late charge.
--    UNIQUE (bill_id, period_start) is the idempotency contract — re-running
--    the accrual can never double-charge a month.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_late_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID NOT NULL REFERENCES public.billing_student_bills(id),
    student_id UUID NOT NULL,
    institution_id UUID NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    -- Balance the month's charge was computed on, and the charge itself, as of
    -- accrual time. The learner-facing derivation recomputes on the bill's
    -- CURRENT balance (favourable to families — see fn_late_charge_derivation).
    base_amount NUMERIC(15,2) NOT NULL,
    charge_amount NUMERIC(15,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','charged','waived')),
    -- The penalty bill (kind='penalty' category) this row was billed through.
    penalty_bill_id UUID REFERENCES public.billing_student_bills(id),
    -- Only the Director may waive (billing.late_charges.waive is granted to no
    -- role; super-admin bypass). The approver is always recorded.
    waived_by UUID,
    waived_at TIMESTAMPTZ,
    waiver_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_billing_late_charges_bill_period UNIQUE (bill_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_billing_late_charges_student
    ON public.billing_late_charges (student_id);
CREATE INDEX IF NOT EXISTS idx_billing_late_charges_institution_status
    ON public.billing_late_charges (institution_id, status);

-- CREATE TABLE never enables RLS; do it explicitly, and close the anon door
-- Supabase's default privileges opened.
ALTER TABLE public.billing_late_charges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_late_charges FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_billing_late_charges_updated_at ON public.billing_late_charges;
CREATE TRIGGER trg_billing_late_charges_updated_at
    BEFORE UPDATE ON public.billing_late_charges
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Admin read: permission + institution scope. Learner read: her own rows only,
-- resolved the same two ways the live bills policies resolve a learner
-- (profiles.learner_id linkage OR the email join).
DROP POLICY IF EXISTS late_charges_select_scoped ON public.billing_late_charges;
CREATE POLICY late_charges_select_scoped ON public.billing_late_charges
    FOR SELECT USING (
        (SELECT is_super_admin() OR is_admin())
        OR (user_has_permission('billing.late_charges.view')
            AND role_has_institution_access(institution_id))
        OR student_id IN (
            SELECT lp.id
            FROM learners_profiles lp
            JOIN profiles p ON p.id = auth.uid()
            WHERE lp.id = p.learner_id
               OR p.email IN (lp.student_email, lp.college_email)
        )
    );

DROP POLICY IF EXISTS late_charges_insert_admin ON public.billing_late_charges;
CREATE POLICY late_charges_insert_admin ON public.billing_late_charges
    FOR INSERT WITH CHECK (
        (SELECT is_super_admin() OR is_admin())
        OR (user_has_permission('billing.late_charges.manage')
            AND role_has_institution_access(institution_id))
    );

DROP POLICY IF EXISTS late_charges_update_admin ON public.billing_late_charges;
CREATE POLICY late_charges_update_admin ON public.billing_late_charges
    FOR UPDATE USING (
        (SELECT is_super_admin() OR is_admin())
        OR (user_has_permission('billing.late_charges.manage')
            AND role_has_institution_access(institution_id))
    );

DROP POLICY IF EXISTS late_charges_delete_admin ON public.billing_late_charges;
CREATE POLICY late_charges_delete_admin ON public.billing_late_charges
    FOR DELETE USING (
        is_super_admin()
        OR (user_has_permission('billing.late_charges.manage')
            AND role_has_institution_access(institution_id))
    );

-- -----------------------------------------------------------------------------
-- 4a. fn_late_charge_preview — read-only, per-bill "what would be charged
--     today". Powers the admin dry-run page AND the warning preview (who would
--     be messaged). WRITES NOTHING; works while the master switch is OFF —
--     that is the point of a preview.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_late_charge_preview()
RETURNS TABLE (
  bill_id uuid,
  student_id uuid,
  learner_name text,
  institution_id uuid,
  bill_description text,
  due_date date,
  months_overdue integer,
  balance_amount numeric,
  would_charge numeric,
  total_would_owe numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_admin boolean;
  v_rate numeric;
  v_compounding boolean;
  v_grace integer;
  v_factor numeric;
BEGIN
  v_is_admin := is_super_admin() OR is_admin();
  IF NOT (v_is_admin OR user_has_permission('billing.late_charges.view')) THEN
    RAISE EXCEPTION 'insufficient privilege: billing.late_charges.view required'
      USING ERRCODE = '42501';
  END IF;

  -- STABLE body: read policies through STABLE fn_get_policy (NOT the
  -- instrumented fn_get_policy_bool, which is VOLATILE on production).
  v_rate        := COALESCE((fn_get_policy('billing.late_charge.rate_percent_per_month'))::numeric, 10);
  v_compounding := COALESCE((fn_get_policy('billing.late_charge.compounding'))::boolean, true);
  v_grace       := COALESCE((fn_get_policy('billing.late_charge.grace_days'))::int, 0);
  v_factor      := 1 + v_rate / 100.0;

  RETURN QUERY
  WITH eligible AS (
    SELECT
      b.id            AS e_bill_id,
      b.student_id    AS e_student_id,
      b.institution_id AS e_institution_id,
      b.bill_description AS e_description,
      b.due_date      AS e_due_date,
      b.balance_amount AS e_balance,
      -- First overdue day is the day AFTER due_date (+ grace). Month 1's charge
      -- applies from that first day — "starts the day a bill goes overdue".
      (b.due_date + v_grace + 1) AS e_overdue_start,
      CASE
        WHEN current_date < (b.due_date + v_grace + 1) THEN 0
        ELSE 12 * EXTRACT(YEAR FROM age(current_date, (b.due_date + v_grace + 1)))::int
           + EXTRACT(MONTH FROM age(current_date, (b.due_date + v_grace + 1)))::int
           + 1
      END AS e_months
    FROM billing_student_bills b
    WHERE b.status IN ('unpaid', 'partially_paid')
      AND b.balance_amount > 0
      AND b.due_date + v_grace < current_date
      -- Never accrue on penalty bills themselves: the compounding formula
      -- already carries month-on-month growth; charging the charge would
      -- double-count it.
      AND NOT EXISTS (
        SELECT 1 FROM billing_categories bc
        WHERE bc.id = b.item_category_id AND bc.kind = 'penalty'
      )
      AND (v_is_admin OR role_has_institution_access(b.institution_id))
  )
  SELECT
    e.e_bill_id,
    e.e_student_id,
    TRIM(lp.first_name || ' ' || COALESCE(lp.last_name, '')),
    e.e_institution_id,
    e.e_description,
    e.e_due_date,
    e.e_months,
    e.e_balance,
    CASE WHEN v_compounding
      THEN ROUND(e.e_balance * (POWER(v_factor, e.e_months) - 1), 2)
      ELSE ROUND(e.e_balance * (v_rate / 100.0) * e.e_months, 2)
    END,
    CASE WHEN v_compounding
      THEN ROUND(e.e_balance * POWER(v_factor, e.e_months), 2)
      ELSE ROUND(e.e_balance * (1 + (v_rate / 100.0) * e.e_months), 2)
    END
  FROM eligible e
  LEFT JOIN learners_profiles lp ON lp.id = e.e_student_id
  WHERE e.e_months >= 1
  ORDER BY 9 DESC;  -- largest would_charge first
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_late_charge_preview() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_late_charge_preview() TO authenticated;

-- -----------------------------------------------------------------------------
-- 4b. fn_late_charge_derivation — the month-by-month explanation of ONE bill's
--     late charge. Callable by admins (view permission + institution scope)
--     AND by the learner who owns the bill.
--
--     Computed on the bill's CURRENT outstanding balance for ALL months —
--     payments reduce every month's base, which is deliberately favourable to
--     families: paying part of a bill shrinks the whole charge history, never
--     just the months after the payment.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_late_charge_derivation(p_bill_id uuid)
RETURNS TABLE (
  month_number integer,
  period_start date,
  period_end date,
  opening_base numeric,
  rate_percent numeric,
  month_charge numeric,
  cumulative_charge numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_admin boolean;
  v_allowed boolean;
  v_rate numeric;
  v_compounding boolean;
  v_grace integer;
  v_factor numeric;
  v_balance numeric;
  v_overdue_start date;
  v_months integer;
BEGIN
  v_is_admin := is_super_admin() OR is_admin();

  SELECT b.balance_amount,
         (v_is_admin
          OR (user_has_permission('billing.late_charges.view')
              AND role_has_institution_access(b.institution_id))
          -- The learner who owns the bill — same two linkages as the live
          -- bills RLS (profiles.learner_id OR the email join), and only for
          -- categories the learner is allowed to see.
          OR (
            b.student_id IN (
              SELECT lp.id
              FROM learners_profiles lp
              JOIN profiles p ON p.id = auth.uid()
              WHERE lp.id = p.learner_id
                 OR p.email IN (lp.student_email, lp.college_email)
            )
            AND (
              b.item_category_id IS NULL
              OR EXISTS (
                SELECT 1 FROM billing_categories bc
                WHERE bc.id = b.item_category_id AND bc.visible_to_learners
              )
            )
          ))
    INTO v_balance, v_allowed
  FROM billing_student_bills b
  WHERE b.id = p_bill_id
    AND b.status IN ('unpaid', 'partially_paid')
    AND b.balance_amount > 0
    AND NOT EXISTS (
      SELECT 1 FROM billing_categories bc
      WHERE bc.id = b.item_category_id AND bc.kind = 'penalty'
    );

  -- Unknown bill, settled bill, penalty bill, or no right to see it:
  -- return no rows rather than leaking that the bill exists.
  IF v_balance IS NULL OR NOT COALESCE(v_allowed, false) THEN
    RETURN;
  END IF;

  v_rate        := COALESCE((fn_get_policy('billing.late_charge.rate_percent_per_month'))::numeric, 10);
  v_compounding := COALESCE((fn_get_policy('billing.late_charge.compounding'))::boolean, true);
  v_grace       := COALESCE((fn_get_policy('billing.late_charge.grace_days'))::int, 0);
  v_factor      := 1 + v_rate / 100.0;

  SELECT b.due_date + v_grace + 1 INTO v_overdue_start
  FROM billing_student_bills b WHERE b.id = p_bill_id;

  IF current_date < v_overdue_start THEN
    RETURN;  -- not overdue yet (grace window) — no months, no charge
  END IF;

  v_months := 12 * EXTRACT(YEAR FROM age(current_date, v_overdue_start))::int
            + EXTRACT(MONTH FROM age(current_date, v_overdue_start))::int
            + 1;

  RETURN QUERY
  SELECT
    gs.k,
    (v_overdue_start + make_interval(months => gs.k - 1))::date,
    ((v_overdue_start + make_interval(months => gs.k))::date - 1),
    CASE WHEN v_compounding
      THEN ROUND(v_balance * POWER(v_factor, gs.k - 1), 2)
      ELSE v_balance
    END,
    v_rate,
    CASE WHEN v_compounding
      THEN ROUND(v_balance * (POWER(v_factor, gs.k) - POWER(v_factor, gs.k - 1)), 2)
      ELSE ROUND(v_balance * (v_rate / 100.0), 2)
    END,
    CASE WHEN v_compounding
      THEN ROUND(v_balance * (POWER(v_factor, gs.k) - 1), 2)
      ELSE ROUND(v_balance * (v_rate / 100.0) * gs.k, 2)
    END
  FROM generate_series(1, v_months) gs(k);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_late_charge_derivation(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_late_charge_derivation(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4c. fn_late_charge_accrue — the ONLY writer. Idempotent on
--     UNIQUE (bill_id, period_start). Dry-run by default; the live path is
--     quadruple-gated: caller privilege + master switch + effective_from set
--     + effective_from reached. Defense in depth — even a live call with the
--     switch off RAISEs.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_late_charge_accrue(p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rate numeric;
  v_compounding boolean;
  v_grace integer;
  v_factor numeric;
  v_effective_raw text;
  v_effective date;
  v_penalty_cat uuid;
  v_bills bigint := 0;
  v_rows bigint := 0;
  v_total numeric := 0;
  v_inserted bigint := 0;
  v_penalty_bills bigint := 0;
  r RECORD;
  v_new_bill uuid;
BEGIN
  -- Caller gate: the cron route (service role), a super admin, or a holder of
  -- billing.late_charges.manage. Inside SECURITY DEFINER current_user is the
  -- owner for everyone, so the PostgREST end-user signal is auth.role() and the
  -- direct-SQL signal (Director via Management API / psql) is session_user not
  -- being the PostgREST 'authenticator' pool role.
  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR session_user <> 'authenticator'
    OR is_super_admin()
    OR user_has_permission('billing.late_charges.manage')
  ) THEN
    RAISE EXCEPTION 'insufficient privilege: billing.late_charges.manage required'
      USING ERRCODE = '42501';
  END IF;

  -- Master switch — spec-mandated fn_get_policy_bool read (VOLATILE is fine
  -- here, this function is VOLATILE).
  IF NOT fn_get_policy_bool('billing.late_charge.enabled', false) THEN
    RAISE EXCEPTION 'late-payment charge is disabled (billing.late_charge.enabled = false) — nothing accrued';
  END IF;

  v_effective_raw := NULLIF(TRIM(fn_get_policy_text('billing.late_charge.effective_from', '')), '');
  IF v_effective_raw IS NULL THEN
    RAISE EXCEPTION 'billing.late_charge.effective_from is not set — the Director must set the start date before any accrual';
  END IF;
  v_effective := v_effective_raw::date;
  IF current_date < v_effective THEN
    RAISE EXCEPTION 'late-payment charge takes effect % — refusing to accrue before then', v_effective;
  END IF;

  SELECT id INTO v_penalty_cat
  FROM billing_categories
  WHERE kind = 'penalty'::billing_category_kind AND is_active
  ORDER BY created_at
  LIMIT 1;
  IF v_penalty_cat IS NULL THEN
    RAISE EXCEPTION 'no active penalty billing category found';
  END IF;

  v_rate        := fn_get_policy_int('billing.late_charge.rate_percent_per_month', 10);
  v_compounding := fn_get_policy_bool('billing.late_charge.compounding', true);
  v_grace       := fn_get_policy_int('billing.late_charge.grace_days', 0);
  v_factor      := 1 + v_rate / 100.0;

  -- Everything that WOULD be inserted today: each eligible overdue bill ×
  -- each monthly period since it went overdue, minus periods already ledgered.
  -- DROP first: a dry-run and a live call in the SAME transaction would
  -- otherwise collide on the temp table.
  DROP TABLE IF EXISTS _late_charge_candidates;
  CREATE TEMP TABLE _late_charge_candidates ON COMMIT DROP AS
  WITH eligible AS (
    SELECT
      b.id AS bill_id,
      b.student_id,
      b.institution_id,
      b.academic_year_id,
      b.bill_description,
      b.balance_amount,
      (b.due_date + v_grace + 1) AS overdue_start,
      12 * EXTRACT(YEAR FROM age(current_date, (b.due_date + v_grace + 1)))::int
        + EXTRACT(MONTH FROM age(current_date, (b.due_date + v_grace + 1)))::int
        + 1 AS months_overdue
    FROM billing_student_bills b
    WHERE b.status IN ('unpaid', 'partially_paid')
      AND b.balance_amount > 0
      AND b.due_date + v_grace < current_date
      AND NOT EXISTS (
        SELECT 1 FROM billing_categories bc
        WHERE bc.id = b.item_category_id AND bc.kind = 'penalty'
      )
  ),
  periods AS (
    SELECT
      e.*,
      gs.k,
      (e.overdue_start + make_interval(months => gs.k - 1))::date AS period_start,
      ((e.overdue_start + make_interval(months => gs.k))::date - 1) AS period_end,
      CASE WHEN v_compounding
        THEN ROUND(e.balance_amount * POWER(v_factor, gs.k - 1), 2)
        ELSE e.balance_amount
      END AS base_amount,
      CASE WHEN v_compounding
        THEN ROUND(e.balance_amount * (POWER(v_factor, gs.k) - POWER(v_factor, gs.k - 1)), 2)
        ELSE ROUND(e.balance_amount * (v_rate / 100.0), 2)
      END AS charge_amount
    FROM eligible e
    CROSS JOIN LATERAL generate_series(1, e.months_overdue) gs(k)
  )
  SELECT p.*
  FROM periods p
  WHERE NOT EXISTS (
    SELECT 1 FROM billing_late_charges c
    WHERE c.bill_id = p.bill_id AND c.period_start = p.period_start
  );

  SELECT COUNT(DISTINCT bill_id), COUNT(*), COALESCE(SUM(charge_amount), 0)
    INTO v_bills, v_rows, v_total
  FROM _late_charge_candidates;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'dry_run', true,
      'bills_examined', v_bills,
      'charge_rows_would_insert', v_rows,
      'total_charge', v_total
    );
  END IF;

  -- LIVE PATH. Conflict target matches uq_billing_late_charges_bill_period
  -- exactly (bill_id, period_start) — the idempotency contract.
  INSERT INTO billing_late_charges
    (bill_id, student_id, institution_id, period_start, period_end,
     base_amount, charge_amount, status)
  SELECT bill_id, student_id, institution_id, period_start, period_end,
         base_amount, charge_amount, 'pending'
  FROM _late_charge_candidates
  ON CONFLICT (bill_id, period_start) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Bill every pending, un-billed charge row through the penalty category.
  FOR r IN
    SELECT c.id, c.bill_id, c.student_id, c.institution_id, c.period_start,
           c.period_end, c.charge_amount, b.bill_description, b.academic_year_id
    FROM billing_late_charges c
    JOIN billing_student_bills b ON b.id = c.bill_id
    WHERE c.status = 'pending' AND c.penalty_bill_id IS NULL
  LOOP
    INSERT INTO billing_student_bills
      (student_id, institution_id, item_category_id, bill_description, due_date,
       quantity, unit_amount, total_amount, tax_amount, final_amount,
       balance_amount, status, academic_year_id)
    VALUES
      (r.student_id, r.institution_id, v_penalty_cat,
       'Late payment charge — ' || r.bill_description
         || ' (' || to_char(r.period_start, 'DD Mon YYYY')
         || ' to ' || to_char(r.period_end, 'DD Mon YYYY') || ')',
       current_date, 1, r.charge_amount, r.charge_amount, 0, r.charge_amount,
       r.charge_amount, 'unpaid', r.academic_year_id)
    RETURNING id INTO v_new_bill;

    UPDATE billing_late_charges
       SET status = 'charged', penalty_bill_id = v_new_bill, updated_at = now()
     WHERE id = r.id;

    v_penalty_bills := v_penalty_bills + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', false,
    'bills_examined', v_bills,
    'charge_rows_inserted', v_inserted,
    'penalty_bills_created', v_penalty_bills,
    'total_charge', v_total
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_late_charge_accrue(boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_late_charge_accrue(boolean) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4d. fn_late_charge_waive — Director-only in practice: requires
--     billing.late_charges.waive, which this PR grants to NO role, so only the
--     super-admin bypass (the Director) can call it today. Always records the
--     approver and the reason; cancels the linked penalty bill if one exists.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_late_charge_waive(p_late_charge_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row billing_late_charges%ROWTYPE;
  v_penalty_cancelled boolean := false;
BEGIN
  IF NOT (is_super_admin() OR user_has_permission('billing.late_charges.waive')) THEN
    RAISE EXCEPTION 'insufficient privilege: billing.late_charges.waive required'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(TRIM(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'a waiver reason is required — waivers are always recorded with who and why';
  END IF;

  UPDATE billing_late_charges
     SET status = 'waived',
         waived_by = auth.uid(),
         waived_at = now(),
         waiver_reason = TRIM(p_reason),
         updated_at = now()
   WHERE id = p_late_charge_id
     AND status <> 'waived'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'late charge % not found or already waived', p_late_charge_id;
  END IF;

  -- Cancel the linked penalty bill unless it has already been fully paid —
  -- a paid penalty needs a refund decision, which is a human call, not this
  -- function's.
  IF v_row.penalty_bill_id IS NOT NULL THEN
    UPDATE billing_student_bills
       SET status = 'cancelled', balance_amount = 0, updated_at = now()
     WHERE id = v_row.penalty_bill_id
       AND status IN ('unpaid', 'partially_paid');
    v_penalty_cancelled := FOUND;
  END IF;

  RETURN jsonb_build_object(
    'waived', true,
    'late_charge_id', v_row.id,
    'waived_by', v_row.waived_by,
    'waived_at', v_row.waived_at,
    'penalty_bill_id', v_row.penalty_bill_id,
    'penalty_bill_cancelled', v_penalty_cancelled
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_late_charge_waive(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_late_charge_waive(uuid, text) TO authenticated;
