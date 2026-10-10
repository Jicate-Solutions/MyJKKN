-- ─── Rename billing "discounts" → "scholarships" — part 2e: activity-log read policy ───
-- 2026-10-09. See 20271009130000_rename_discounts_to_scholarships.sql for the rationale and dependency scan.
-- Applied through the Supabase MCP apply_migration as "rename_scholarships_activity_log_policy"; ledger version aligned to 20271009130140.

-- ── 7. Activity-log read policy: 'discount' → 'scholarship' ─────────────────
ALTER POLICY activity_logs_select_billing ON public.user_activity_logs
  USING (
    (resource_type)::text = ANY (ARRAY['bill', 'receipt', 'invoice', 'scholarship', 'refund', 'category'])
    AND (SELECT user_has_permission('billing.reports.view'))
    AND (institution_id IS NULL OR role_has_institution_access(institution_id))
  );
