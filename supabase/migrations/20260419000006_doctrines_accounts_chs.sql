-- =====================================================================
-- Doctrines v1 — Accounts Collections Health Score (CHS)
-- =====================================================================
-- Part of: feat/doctrines-composite-scores-v1
-- Spec: JKKNKB/MyJKKN/Routines-Stickiness-Ivy-Doctrine.md §8 Doctrine 1
--
-- Extends fn_accounts_metrics() with a composite collections_health_score
-- object in its JSONB response. Keeps existing 4 tile payloads untouched
-- (backward compatible) — UI chooses whether to render CHS tile-1 or the
-- legacy collection tile.
--
-- Components (weights):
--   collection_vs_plan         30%   30d collected / 30d target
--   overdue_ratio_inverted     25%   100 - (overdue bills / active bills × 100)
--   reconciliation_freshness   25%   100 - MIN(100, |30d gap| / 30d invoiced × 100)
--   refund_sla                 20%   % of pending refunds within 3-day SLA
--
-- Renormalization: any component with insufficient data (active_bills=0,
-- invoices=0, pending_refunds=0) returns NULL and the helper renormalizes
-- remaining weights to sum to 100. Zero-pending-refunds = no signal (NULL),
-- NOT a perfect 100 — consistent with other renorm patterns.
--
-- Trailing-30-days window: matches Thrash Q1 decision. Today's daily
-- target × 30 as the 30d plan denominator.
--
-- Idempotent: CREATE OR REPLACE. Safe to re-run.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_accounts_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller UUID;
  v_institution_id UUID;
  v_today DATE := CURRENT_DATE;
  v_month_start DATE;
  v_month_end DATE;
  v_window_start DATE;
  -- tile values
  v_collected_today NUMERIC := 0;
  v_daily_target NUMERIC := 100000;
  v_overdue_count BIGINT := 0;
  v_invoiced_month NUMERIC := 0;
  v_receipted_month NUMERIC := 0;
  v_recon_gap NUMERIC := 0;
  v_pending_refunds BIGINT := 0;
  -- CHS ingredients (30d window)
  v_collected_30d NUMERIC := 0;
  v_invoiced_30d NUMERIC := 0;
  v_recon_gap_30d NUMERIC := 0;
  v_active_bills BIGINT := 0;
  v_overdue_30d BIGINT := 0;
  v_pending_refunds_total BIGINT := 0;
  v_refunds_within_sla BIGINT := 0;
  -- CHS component scores (null-able)
  v_collection_vs_plan NUMERIC := NULL;
  v_overdue_inv NUMERIC := NULL;
  v_recon_freshness NUMERIC := NULL;
  v_refund_sla NUMERIC := NULL;
  v_composite jsonb;
BEGIN
  -- Auth gate
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object(
      'collection', jsonb_build_object('collected_today', 0, 'daily_target', v_daily_target, 'pct', 0),
      'overdue_bills', jsonb_build_object('count', 0),
      'reconciliation', jsonb_build_object('gap', 0, 'invoiced', 0, 'receipted', 0),
      'pending_refunds', jsonb_build_object('count', 0),
      'collections_health_score', jsonb_build_object(
        'score', 0, 'band', 'red',
        'components', jsonb_build_object(
          'collection_vs_plan', NULL,
          'overdue_ratio_inverted', NULL,
          'reconciliation_freshness', NULL,
          'refund_sla', NULL
        ),
        'data_source', 'not_authenticated'
      ),
      'scope', jsonb_build_object('user_id', null, 'institution_id', null, 'computed_at', now())
    );
  END IF;

  -- Get caller's institution
  SELECT institution_id INTO v_institution_id
  FROM profiles WHERE id = v_caller;

  -- Month + 30d window boundaries
  v_month_start := date_trunc('month', v_today)::date;
  v_month_end := (date_trunc('month', v_today) + interval '1 month' - interval '1 day')::date;
  v_window_start := v_today - INTERVAL '30 days';

  -- ============= Existing 4 tiles (unchanged) =============

  -- Tile 1: Today's collection
  SELECT COALESCE(SUM(payment_amount), 0) INTO v_collected_today
  FROM billing_receipts
  WHERE receipt_date = v_today
    AND (v_institution_id IS NULL OR institution_id = v_institution_id);

  -- Tile 2: Overdue bills (past due, not paid/cancelled)
  SELECT COUNT(*) INTO v_overdue_count
  FROM billing_student_bills
  WHERE due_date < v_today
    AND status NOT IN ('paid', 'cancelled')
    AND (v_institution_id IS NULL OR institution_id = v_institution_id);

  -- Tile 3: Reconciliation gap (current month)
  SELECT COALESCE(SUM(grand_total), 0) INTO v_invoiced_month
  FROM billing_invoices
  WHERE invoice_date BETWEEN v_month_start AND v_month_end
    AND (v_institution_id IS NULL OR institution_id = v_institution_id);

  SELECT COALESCE(SUM(payment_amount), 0) INTO v_receipted_month
  FROM billing_receipts
  WHERE receipt_date BETWEEN v_month_start AND v_month_end
    AND (v_institution_id IS NULL OR institution_id = v_institution_id);

  v_recon_gap := v_invoiced_month - v_receipted_month;

  -- Tile 4: Pending refunds
  SELECT COUNT(*) INTO v_pending_refunds
  FROM billing_refunds
  WHERE approval_status = 'pending'
    AND (v_institution_id IS NULL OR EXISTS (
      SELECT 1 FROM billing_receipts br WHERE br.id = billing_refunds.receipt_id AND br.institution_id = v_institution_id
    ));

  -- ============= CHS ingredients (30d trailing window) =============

  -- 30d collection total
  SELECT COALESCE(SUM(payment_amount), 0) INTO v_collected_30d
  FROM billing_receipts
  WHERE receipt_date >= v_window_start AND receipt_date <= v_today
    AND (v_institution_id IS NULL OR institution_id = v_institution_id);

  -- 30d invoices + receipts for reconciliation freshness
  SELECT COALESCE(SUM(grand_total), 0) INTO v_invoiced_30d
  FROM billing_invoices
  WHERE invoice_date >= v_window_start AND invoice_date <= v_today
    AND (v_institution_id IS NULL OR institution_id = v_institution_id);

  v_recon_gap_30d := v_invoiced_30d - v_collected_30d;

  -- Active bills (not paid/cancelled) for overdue ratio denominator
  SELECT COUNT(*) INTO v_active_bills
  FROM billing_student_bills
  WHERE status NOT IN ('paid', 'cancelled')
    AND (v_institution_id IS NULL OR institution_id = v_institution_id);

  -- Overdue bills within 30d (same as tile 2 but bounded — kept for clarity)
  v_overdue_30d := v_overdue_count;

  -- Refund SLA: % of pending refunds still within 3-day SLA window
  SELECT
    COUNT(*) FILTER (WHERE approval_status = 'pending'),
    COUNT(*) FILTER (WHERE approval_status = 'pending' AND created_at > NOW() - INTERVAL '3 days')
  INTO v_pending_refunds_total, v_refunds_within_sla
  FROM billing_refunds
  WHERE (v_institution_id IS NULL OR EXISTS (
    SELECT 1 FROM billing_receipts br WHERE br.id = billing_refunds.receipt_id AND br.institution_id = v_institution_id
  ));

  -- ============= CHS component computation =============

  -- collection_vs_plan: 30d collected / (daily_target × 30). Cap at 100.
  IF v_daily_target > 0 THEN
    v_collection_vs_plan := LEAST(100,
      ROUND((v_collected_30d / (v_daily_target * 30) * 100)::numeric, 1)
    );
  END IF;

  -- overdue_ratio_inverted: 100 - (overdue / active × 100). NULL if no active bills.
  IF v_active_bills > 0 THEN
    v_overdue_inv := GREATEST(0,
      ROUND(100 - (v_overdue_30d::numeric / v_active_bills * 100), 1)
    );
  END IF;

  -- reconciliation_freshness: 100 - MIN(100, |gap| / invoiced × 100).
  -- NULL if no 30d invoicing activity (can't judge freshness with zero denominator).
  IF v_invoiced_30d > 0 THEN
    v_recon_freshness := GREATEST(0,
      ROUND(100 - LEAST(100, ABS(v_recon_gap_30d) / v_invoiced_30d * 100), 1)
    );
  END IF;

  -- refund_sla: % of pending refunds still within 3-day SLA.
  -- NULL if no pending refunds (no signal — not the same as "perfect").
  IF v_pending_refunds_total > 0 THEN
    v_refund_sla := ROUND(
      (v_refunds_within_sla::numeric / v_pending_refunds_total * 100), 1
    );
  END IF;

  -- Composite via shared helper (zero-state renormalization happens here)
  v_composite := compute_renormalized_composite(
    jsonb_build_object(
      'collection_vs_plan', v_collection_vs_plan,
      'overdue_ratio_inverted', v_overdue_inv,
      'reconciliation_freshness', v_recon_freshness,
      'refund_sla', v_refund_sla
    ),
    jsonb_build_object(
      'collection_vs_plan', 30,
      'overdue_ratio_inverted', 25,
      'reconciliation_freshness', 25,
      'refund_sla', 20
    )
  );

  RETURN jsonb_build_object(
    'collection', jsonb_build_object(
      'collected_today', v_collected_today,
      'daily_target', v_daily_target,
      'pct', CASE WHEN v_daily_target > 0 THEN ROUND((v_collected_today / v_daily_target * 100)::numeric, 1) ELSE 0 END
    ),
    'overdue_bills', jsonb_build_object(
      'count', v_overdue_count
    ),
    'reconciliation', jsonb_build_object(
      'gap', v_recon_gap,
      'invoiced', v_invoiced_month,
      'receipted', v_receipted_month
    ),
    'pending_refunds', jsonb_build_object(
      'count', v_pending_refunds
    ),
    'collections_health_score', jsonb_build_object(
      'score', v_composite->'score',
      'band', v_composite->'band',
      'components', jsonb_build_object(
        'collection_vs_plan', v_collection_vs_plan,
        'overdue_ratio_inverted', v_overdue_inv,
        'reconciliation_freshness', v_recon_freshness,
        'refund_sla', v_refund_sla
      ),
      'present_components', v_composite->'present_components',
      'missing_components', v_composite->'missing_components',
      'effective_weights', v_composite->'effective_weights',
      'window', 'trailing_30_days',
      'data_source', CASE
        WHEN v_collection_vs_plan IS NULL
             AND v_overdue_inv IS NULL
             AND v_recon_freshness IS NULL
             AND v_refund_sla IS NULL
        THEN 'empty'
        ELSE 'live'
      END
    ),
    'scope', jsonb_build_object(
      'user_id', v_caller,
      'institution_id', v_institution_id,
      'computed_at', now()
    )
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_accounts_metrics() IS
'Doctrines v1 — Returns accounts hero tile metrics + composite Collections Health Score (CHS). CHS weights: collection_vs_plan 30%, overdue_ratio_inverted 25%, reconciliation_freshness 25%, refund_sla 20%. Renormalizes when components lack data (active_bills=0, invoices=0, pending_refunds=0).';

GRANT EXECUTE ON FUNCTION public.fn_accounts_metrics() TO authenticated;

-- Self-test: verify RPC returns CHS key and correct shape
DO $$
DECLARE
  v_result jsonb;
BEGIN
  -- Unauthenticated branch returns the CHS key
  v_result := fn_accounts_metrics();
  IF NOT (v_result ? 'collections_health_score') THEN
    RAISE EXCEPTION 'fn_accounts_metrics missing collections_health_score key';
  END IF;
  IF NOT ((v_result->'collections_health_score') ? 'components') THEN
    RAISE EXCEPTION 'CHS missing components sub-object';
  END IF;
  IF NOT ((v_result->'collections_health_score'->'components') ? 'collection_vs_plan') THEN
    RAISE EXCEPTION 'CHS.components missing collection_vs_plan';
  END IF;
  RAISE NOTICE 'Doctrines v1 Accounts CHS: self-test passed.';
END;
$$;
