-- ─── Rename billing "discounts" → "scholarships" — part 1 of 4: table, columns, constraints, indexes, trigger ───
-- 2026-10-09
--
-- The module is labelled "Scholarships" everywhere in the UI; the database still
-- said "discount". This renames every object that belongs to the module so the
-- vocabulary is one word end to end. Follows 20271009090000 (categories/types).
--
--   table        billing_discounts                → billing_scholarships
--   columns      discount_type                    → value_mode        (percentage | amount;
--                                                   NOT the scholarship type)
--                discount_value / _amount / _reason → scholarship_value / _amount / _reason
--   rpc          get_billing_reports_discounts    → get_billing_reports_scholarships
--   perm keys    billing.discounts.{view,create,edit,delete,approve}
--                                                  → billing.scholarships.*
--   log vocab    user_activity_logs.resource_type 'discount' → 'scholarship'
--
-- ── Why this is more than ALTER TABLE … RENAME ──────────────────────────────
-- plpgsql / SQL function bodies are stored as TEXT. Renaming the table does not
-- rewrite them; they would fail at call time with "relation does not exist".
-- Seven functions name the table or its columns and are recreated below:
-- delete_bill_with_cascade, preview_bill_deletion, get_billing_analytics_overview,
-- get_billing_report_kpis, get_billing_report_schemes, get_billing_user_activity,
-- get_billing_reports_discounts. get_scholarship_permissions /
-- update_scholarship_permissions are recreated for the permission-key rename.
--
-- ── Dependency scan (2026-10-09, live DB) ───────────────────────────────────
-- billing_discounts: 0 rows, no inbound FKs, no views / matviews. Permission keys
-- appear ONLY in custom_roles.permissions (75 roles declare them), the 4 table
-- policies and the 2 RPCs above — director_handovers, api_keys, ai_tool_catalog,
-- page_tab_*, reference_catalogs, applications, parent_portal_access, hr_duty_*
-- were each checked and hold none. user_activity_logs has 0 'discount' rows, so
-- the activity vocabulary is renamed without a data backfill.
--
-- NOT touched — different concepts that merely share the word:
--   billing_invoices.discount_applied, hostel_category_upgrade_fees.discount_*,
--   ims_sales*.discount_*, events/marathon discount_code, sh_solutions.*,
--   learners_profiles.scholarship_type, health_sports_scholarships.
--
-- Code and database must ship together: old code reads billing_discounts and
-- billing.discounts.*; new code reads the names below.
--
-- Delivered as 4 migrations (130000 / 130100 / 130200 / 130300) because one 35 KB
-- exec_sql call hit the 57014 statement timeout. Between part 1 and part 3 the
-- functions still name the old table; apply all four back to back.
--
-- No BEGIN/COMMIT: applied through exec_sql (scripts/apply-migration-file.mjs).

-- ── 1. Table, columns ───────────────────────────────────────────────────────
ALTER TABLE public.billing_discounts RENAME TO billing_scholarships;

ALTER TABLE public.billing_scholarships RENAME COLUMN discount_type   TO value_mode;
ALTER TABLE public.billing_scholarships RENAME COLUMN discount_value  TO scholarship_value;
ALTER TABLE public.billing_scholarships RENAME COLUMN discount_amount TO scholarship_amount;
ALTER TABLE public.billing_scholarships RENAME COLUMN discount_reason TO scholarship_reason;

-- ── 2. Constraints (renaming the PK also renames its index) ─────────────────
ALTER TABLE public.billing_scholarships RENAME CONSTRAINT billing_discounts_pkey                  TO billing_scholarships_pkey;
ALTER TABLE public.billing_scholarships RENAME CONSTRAINT billing_discounts_approval_status_check TO billing_scholarships_approval_status_check;
ALTER TABLE public.billing_scholarships RENAME CONSTRAINT billing_discounts_discount_amount_check TO billing_scholarships_scholarship_amount_check;
ALTER TABLE public.billing_scholarships RENAME CONSTRAINT billing_discounts_discount_type_check   TO billing_scholarships_value_mode_check;
ALTER TABLE public.billing_scholarships RENAME CONSTRAINT billing_discounts_discount_value_check  TO billing_scholarships_scholarship_value_check;
ALTER TABLE public.billing_scholarships RENAME CONSTRAINT fk_billing_discounts_authorizer         TO fk_billing_scholarships_authorizer;
ALTER TABLE public.billing_scholarships RENAME CONSTRAINT fk_billing_discounts_bill               TO fk_billing_scholarships_bill;
ALTER TABLE public.billing_scholarships RENAME CONSTRAINT fk_billing_discounts_created_by         TO fk_billing_scholarships_created_by;
ALTER TABLE public.billing_scholarships RENAME CONSTRAINT fk_billing_discounts_scholarship_category TO fk_billing_scholarships_scholarship_category;
ALTER TABLE public.billing_scholarships RENAME CONSTRAINT fk_billing_discounts_scholarship_type   TO fk_billing_scholarships_scholarship_type;

-- ── 3. Indexes ──────────────────────────────────────────────────────────────
ALTER INDEX public.billing_discounts_scholarship_category_idx RENAME TO billing_scholarships_category_idx;
ALTER INDEX public.billing_discounts_scholarship_type_idx     RENAME TO billing_scholarships_type_idx;
ALTER INDEX public.idx_billing_discounts_approval_status      RENAME TO idx_billing_scholarships_approval_status;
ALTER INDEX public.idx_billing_discounts_authorizer_id        RENAME TO idx_billing_scholarships_authorizer_id;
ALTER INDEX public.idx_billing_discounts_bill_id              RENAME TO idx_billing_scholarships_bill_id;
ALTER INDEX public.idx_billing_discounts_outcome_based        RENAME TO idx_billing_scholarships_outcome_based;
ALTER INDEX public.idx_billing_discounts_outcome_criteria     RENAME TO idx_billing_scholarships_outcome_criteria;

-- ── 4. Trigger ──────────────────────────────────────────────────────────────
ALTER TRIGGER trigger_billing_discounts_updated_at ON public.billing_scholarships
  RENAME TO trigger_billing_scholarships_updated_at;

