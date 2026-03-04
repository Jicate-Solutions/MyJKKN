-- ============================================================
-- STEP 2: IMS Supplementary Migrations
-- Run AFTER STEP1. Order matters.
-- All ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE — safe to re-run.
-- ============================================================


-- ─────────────────────────────────────────────────
-- File: supabase/migrations/20260221_add_store_id_to_ims_tables.sql
-- ─────────────────────────────────────────────────
-- Migration: Add store_id to all IMS tables + extend ims_stores with POS/receipt settings
-- Date: 2026-02-21
-- Purpose: Enable multi-store per institution, store-scoped catalogs, and receipt configuration
-- Breaking the 1:1 institution-to-store mapping to support multiple stores per institution.

-- =====================================================
-- 1A. Extend ims_stores with POS/receipt configuration
-- =====================================================
ALTER TABLE public.ims_stores ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.ims_stores ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.ims_stores ADD COLUMN IF NOT EXISTS gstin TEXT;
ALTER TABLE public.ims_stores ADD COLUMN IF NOT EXISTS upi_vpa TEXT;
ALTER TABLE public.ims_stores ADD COLUMN IF NOT EXISTS upi_merchant_name TEXT;
ALTER TABLE public.ims_stores ADD COLUMN IF NOT EXISTS receipt_header TEXT;
ALTER TABLE public.ims_stores ADD COLUMN IF NOT EXISTS receipt_footer TEXT;
ALTER TABLE public.ims_stores ADD COLUMN IF NOT EXISTS sale_number_prefix TEXT DEFAULT 'INV';

-- =====================================================
-- 1B. Add store_id to 12 IMS tables
-- =====================================================

-- 1. ims_item_categories (store-scoped catalogs)
ALTER TABLE public.ims_item_categories ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.ims_stores(id);
CREATE INDEX IF NOT EXISTS idx_ims_item_categories_store_id ON public.ims_item_categories(store_id);

-- 2. ims_items (items belong to a store)
ALTER TABLE public.ims_items ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.ims_stores(id);
CREATE INDEX IF NOT EXISTS idx_ims_items_store_id ON public.ims_items(store_id);

-- 3. ims_suppliers
ALTER TABLE public.ims_suppliers ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.ims_stores(id);
CREATE INDEX IF NOT EXISTS idx_ims_suppliers_store_id ON public.ims_suppliers(store_id);

-- 4. ims_stock_summary — also change UNIQUE from (item_id) to (item_id, store_id)
ALTER TABLE public.ims_stock_summary ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.ims_stores(id);
CREATE INDEX IF NOT EXISTS idx_ims_stock_summary_store_id ON public.ims_stock_summary(store_id);
-- Drop the old single-column unique constraint and add multi-column one
ALTER TABLE public.ims_stock_summary DROP CONSTRAINT IF EXISTS ims_stock_summary_item_id_key;
-- Create new composite unique constraint (item_id + store_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ims_stock_summary_item_id_store_id_key'
  ) THEN
    ALTER TABLE public.ims_stock_summary
      ADD CONSTRAINT ims_stock_summary_item_id_store_id_key UNIQUE (item_id, store_id);
  END IF;
END $$;

-- 5. ims_stock_batches
ALTER TABLE public.ims_stock_batches ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.ims_stores(id);
CREATE INDEX IF NOT EXISTS idx_ims_stock_batches_store_id ON public.ims_stock_batches(store_id);

-- 6. ims_goods_received_notes
ALTER TABLE public.ims_goods_received_notes ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.ims_stores(id);
CREATE INDEX IF NOT EXISTS idx_ims_goods_received_notes_store_id ON public.ims_goods_received_notes(store_id);

-- 7. ims_indent_requests
ALTER TABLE public.ims_indent_requests ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.ims_stores(id);
CREATE INDEX IF NOT EXISTS idx_ims_indent_requests_store_id ON public.ims_indent_requests(store_id);

-- 8. ims_stock_issues
ALTER TABLE public.ims_stock_issues ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.ims_stores(id);
CREATE INDEX IF NOT EXISTS idx_ims_stock_issues_store_id ON public.ims_stock_issues(store_id);

-- 9. ims_sales
ALTER TABLE public.ims_sales ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.ims_stores(id);
CREATE INDEX IF NOT EXISTS idx_ims_sales_store_id ON public.ims_sales(store_id);

-- 10. ims_financial_transactions
ALTER TABLE public.ims_financial_transactions ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.ims_stores(id);
CREATE INDEX IF NOT EXISTS idx_ims_financial_transactions_store_id ON public.ims_financial_transactions(store_id);

-- 11. ims_department_consumption
ALTER TABLE public.ims_department_consumption ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.ims_stores(id);
CREATE INDEX IF NOT EXISTS idx_ims_department_consumption_store_id ON public.ims_department_consumption(store_id);

-- 12. ims_unit_conversions
ALTER TABLE public.ims_unit_conversions ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.ims_stores(id);
CREATE INDEX IF NOT EXISTS idx_ims_unit_conversions_store_id ON public.ims_unit_conversions(store_id);

-- Note: ims_units remains global (no store_id) — units are shared across all stores

-- =====================================================
-- 1C. Backfill existing data
-- For each table, set store_id from the matching ims_stores row
-- based on institution_id. This handles the existing 1:1 mapping.
-- =====================================================

-- Backfill ims_item_categories (no institution_id column, so we skip or handle differently)
-- Categories don't have institution_id, so they'll be assigned via items' store_id later
-- For now, assign to the first active store if any exist
UPDATE public.ims_item_categories c
SET store_id = s.id
FROM public.ims_stores s
WHERE c.store_id IS NULL
  AND s.is_active = true
  AND s.id = (SELECT id FROM public.ims_stores WHERE is_active = true ORDER BY created_at LIMIT 1);

-- Backfill ims_items
UPDATE public.ims_items SET store_id = s.id
FROM public.ims_stores s
WHERE ims_items.institution_id = s.institution_id
  AND ims_items.store_id IS NULL;

-- Backfill ims_suppliers
UPDATE public.ims_suppliers SET store_id = s.id
FROM public.ims_stores s
WHERE ims_suppliers.institution_id = s.institution_id
  AND ims_suppliers.store_id IS NULL;

-- Backfill ims_stock_summary
UPDATE public.ims_stock_summary SET store_id = s.id
FROM public.ims_stores s
WHERE ims_stock_summary.institution_id = s.institution_id
  AND ims_stock_summary.store_id IS NULL;

-- Backfill ims_stock_batches
UPDATE public.ims_stock_batches SET store_id = s.id
FROM public.ims_stores s
WHERE ims_stock_batches.institution_id = s.institution_id
  AND ims_stock_batches.store_id IS NULL;

-- Backfill ims_goods_received_notes
UPDATE public.ims_goods_received_notes SET store_id = s.id
FROM public.ims_stores s
WHERE ims_goods_received_notes.institution_id = s.institution_id
  AND ims_goods_received_notes.store_id IS NULL;

-- Backfill ims_indent_requests
UPDATE public.ims_indent_requests SET store_id = s.id
FROM public.ims_stores s
WHERE ims_indent_requests.institution_id = s.institution_id
  AND ims_indent_requests.store_id IS NULL;

-- Backfill ims_stock_issues
UPDATE public.ims_stock_issues SET store_id = s.id
FROM public.ims_stores s
WHERE ims_stock_issues.institution_id = s.institution_id
  AND ims_stock_issues.store_id IS NULL;

-- Backfill ims_sales
UPDATE public.ims_sales SET store_id = s.id
FROM public.ims_stores s
WHERE ims_sales.institution_id = s.institution_id
  AND ims_sales.store_id IS NULL;

-- Backfill ims_financial_transactions
UPDATE public.ims_financial_transactions SET store_id = s.id
FROM public.ims_stores s
WHERE ims_financial_transactions.institution_id = s.institution_id
  AND ims_financial_transactions.store_id IS NULL;

-- Backfill ims_department_consumption
UPDATE public.ims_department_consumption SET store_id = s.id
FROM public.ims_stores s
WHERE ims_department_consumption.institution_id = s.institution_id
  AND ims_department_consumption.store_id IS NULL;

-- Backfill ims_unit_conversions (may not have institution_id)
-- Unit conversions are typically global, assign to first store if needed
UPDATE public.ims_unit_conversions c
SET store_id = s.id
FROM public.ims_stores s
WHERE c.store_id IS NULL
  AND s.is_active = true
  AND s.id = (SELECT id FROM public.ims_stores WHERE is_active = true ORDER BY created_at LIMIT 1);


-- ─────────────────────────────────────────────────
-- File: supabase/migrations/20260224_add_gst_fields_to_ims.sql
-- ─────────────────────────────────────────────────
-- Migration: Add GST fields to IMS items and GRN items
-- Date: 2026-02-24
-- Purpose: Enable GST tracking on procurement (GRN) side per store GSTIN

-- ─── Items: HSN code + GST rate ─────────────────────────────────────────────
ALTER TABLE ims_items
  ADD COLUMN IF NOT EXISTS hsn_code   TEXT,
  ADD COLUMN IF NOT EXISTS gst_rate   NUMERIC(5,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN ims_items.hsn_code  IS 'HSN/SAC code for GST classification (e.g. 4820 for notebooks)';
COMMENT ON COLUMN ims_items.gst_rate  IS 'Applicable GST rate in % (0, 5, 12, 18, 28)';

-- ─── GRN Items: GST breakdown per line ──────────────────────────────────────
-- cost_price already stored per unit (excluding GST)
-- taxable_amount = cost_price × quantity
-- CGST+SGST for intra-state, IGST for inter-state (auto-determined from GSTINs)

ALTER TABLE ims_grn_items
  ADD COLUMN IF NOT EXISTS taxable_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_percent     NUMERIC(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_percent     NUMERIC(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_percent     NUMERIC(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_gst_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

-- total column already exists and equals taxable_amount + total_gst_amount

COMMENT ON COLUMN ims_grn_items.taxable_amount   IS 'cost_price × quantity before GST';
COMMENT ON COLUMN ims_grn_items.cgst_percent     IS 'CGST rate % (gst_rate / 2 for intra-state)';
COMMENT ON COLUMN ims_grn_items.cgst_amount      IS 'CGST rupee amount';
COMMENT ON COLUMN ims_grn_items.sgst_percent     IS 'SGST rate % (gst_rate / 2 for intra-state)';
COMMENT ON COLUMN ims_grn_items.sgst_amount      IS 'SGST rupee amount';
COMMENT ON COLUMN ims_grn_items.igst_percent     IS 'IGST rate % (full gst_rate for inter-state)';
COMMENT ON COLUMN ims_grn_items.igst_amount      IS 'IGST rupee amount';
COMMENT ON COLUMN ims_grn_items.total_gst_amount IS 'CGST + SGST + IGST total';


-- ─────────────────────────────────────────────────
-- File: supabase/migrations/20260224_add_items_returned_to_ims_sales.sql
-- ─────────────────────────────────────────────────
-- Migration: 20260224_add_items_returned_to_ims_sales
-- Purpose: Track whether items were physically returned when a sale is cancelled.
--          When items_returned = false, stock is NOT restored and write-off
--          adjustments are created instead.

ALTER TABLE public.ims_sales ADD COLUMN IF NOT EXISTS items_returned BOOLEAN DEFAULT true;


-- ─────────────────────────────────────────────────
-- File: supabase/migrations/20260224_add_receipt_pdf_url_to_ims_sales.sql
-- ─────────────────────────────────────────────────
-- Migration: 20260224_add_receipt_pdf_url_to_ims_sales
-- Purpose: Store URL of auto-generated receipt PDFs for audit trail.
--          PDFs are uploaded to Supabase Storage bucket 'ims-receipts'.

ALTER TABLE public.ims_sales ADD COLUMN IF NOT EXISTS receipt_pdf_url TEXT;


-- ─────────────────────────────────────────────────
-- File: supabase/migrations/20260226_add_upi_qr_to_ims_sales.sql
-- ─────────────────────────────────────────────────
-- Migration: Add UPI QR columns to ims_sales and fix payment_method CHECK constraint
-- Date: 2026-02-26
-- Root cause: createSale inserts upi_qr_amount and upi_qr_transaction_ref but these
--             columns don't exist; and 'upi_qr' is not in the payment_method CHECK.

-- 1. Add missing UPI QR columns (mirrors the cash/gpay/card pattern)
ALTER TABLE public.ims_sales
  ADD COLUMN IF NOT EXISTS upi_qr_amount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS upi_qr_transaction_ref TEXT;

-- 2. Drop the existing CHECK constraint (must drop to recreate with new values)
ALTER TABLE public.ims_sales
  DROP CONSTRAINT IF EXISTS ims_sales_payment_method_check;

-- 3. Recreate CHECK constraint including 'upi_qr'
ALTER TABLE public.ims_sales
  ADD CONSTRAINT ims_sales_payment_method_check
  CHECK (payment_method IN ('cash', 'gpay', 'card', 'upi_qr', 'mixed'));

NOTIFY pgrst, 'reload schema';


-- ─────────────────────────────────────────────────
-- File: supabase/migrations/20260224_fix_ims_stores_jkkn_institution.sql
-- ─────────────────────────────────────────────────
-- Migration: Fix ims_stores institution linkage for JKKN API integration
-- Date: 2026-02-24
-- Problem: institution_id FK references Supabase institutions table,
--          but IMS uses JKKN API institution IDs (different UUID space).
--          This caused FK violations on every store creation.
-- Solution: Drop the FK constraint, keep institution_id as plain UUID,
--           add institution_name TEXT column to snapshot the name at creation.

-- Drop the FK constraint blocking JKKN institution IDs
ALTER TABLE public.ims_stores
  DROP CONSTRAINT IF EXISTS ims_stores_institution_id_fkey;

-- Add institution_name column to snapshot the name (avoids broken JOIN)
ALTER TABLE public.ims_stores
  ADD COLUMN IF NOT EXISTS institution_name TEXT;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';


-- ─────────────────────────────────────────────────
-- File: supabase/migrations/20260224_create_store_admin_system_role.sql
-- ─────────────────────────────────────────────────
-- Migration: 20260224_create_store_admin_system_role
-- Purpose: Seed the Store Administrator system role for the IMS module.
-- All 14 IMS permission keys are granted. is_system_role = true prevents
-- accidental deletion through the Role Management UI.
-- Uses ON CONFLICT DO UPDATE to make this migration idempotent (safe to re-run).

INSERT INTO public.custom_roles (
  role_key,
  role_name,
  description,
  permissions,
  is_system_role
)
VALUES (
  'store_admin',
  'Store Administrator',
  'Full operational and administrative access to the IMS module: inventory, stock, GRN, indents, sales/POS, reports, and store settings.',
  '{
    "ims.dashboard.view":   true,
    "ims.inventory.view":   true,
    "ims.inventory.manage": true,
    "ims.stock.view":       true,
    "ims.stock.manage":     true,
    "ims.grn.view":         true,
    "ims.grn.create":       true,
    "ims.indent.view":      true,
    "ims.indent.create":    true,
    "ims.indent.approve":   true,
    "ims.sales.view":       true,
    "ims.sales.manage":     true,
    "ims.reports.view":     true,
    "ims.settings.manage":  true
  }'::jsonb,
  true
)
ON CONFLICT (role_key)
DO UPDATE SET
  role_name      = EXCLUDED.role_name,
  description    = EXCLUDED.description,
  permissions    = EXCLUDED.permissions,
  is_system_role = true,
  updated_at     = now();


-- ─────────────────────────────────────────────────
-- File: supabase/migrations/20260224_create_ims_receipts_bucket.sql
-- ─────────────────────────────────────────────────
-- Migration: Create storage bucket for IMS receipt PDFs
-- Date: 2026-02-24
-- Description: Provision the ims-receipts bucket required by lib/utils/ims-receipt-pdf.ts
--              The ims_sales.receipt_pdf_url column was added in 20260224_add_receipt_pdf_url_to_ims_sales.sql
--              but the storage bucket was not created at that time, causing StorageApiError: Bucket not found.

-- Create the bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ims-receipts',
  'ims-receipts',
  true,           -- Public: receipt URLs are shared with customers via WhatsApp/email
  10485760,       -- 10MB limit (PDFs are small; 10MB is generous headroom)
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Note: CREATE POLICY IF NOT EXISTS requires PG17+; Supabase runs PG15/16.
-- Use DROP IF EXISTS → CREATE for idempotent re-runs.
DROP POLICY IF EXISTS "Authenticated users can upload IMS receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update IMS receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete IMS receipts" ON storage.objects;
DROP POLICY IF EXISTS "Public can view IMS receipts" ON storage.objects;

-- Authenticated users can upload receipts (fire-and-forget from POS sale completion)
CREATE POLICY "Authenticated users can upload IMS receipts"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'ims-receipts');

-- Authenticated users can overwrite receipts (required for upsert: true in upload call)
CREATE POLICY "Authenticated users can update IMS receipts"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'ims-receipts')
WITH CHECK (bucket_id = 'ims-receipts');

-- Authenticated users can delete receipts
CREATE POLICY "Authenticated users can delete IMS receipts"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'ims-receipts');

-- Public read: receipt links shared via WhatsApp/email must be publicly accessible
CREATE POLICY "Public can view IMS receipts"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'ims-receipts');


-- ─────────────────────────────────────────────────
-- File: supabase/migrations/20260225_add_store_admin_to_profiles_role_check.sql
-- ─────────────────────────────────────────────────
-- Migration: Add 'store_admin' to profiles.role CHECK constraint
-- Date: 2026-02-25
-- Reason: 'store_admin' was missing from the CHECK constraint list.
--   The sync_primary_role_trigger tried to UPDATE profiles SET role = 'store_admin'
--   when the store_admin role was assigned via role management UI, but the
--   constraint violation caused the trigger to fail silently.
--   This left profiles.role stuck at 'student', breaking sidebar menu detection.

-- Step 1: Drop the old constraint
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Step 2: Re-add with 'store_admin' included
-- STAGING ADAPTATION: Added 'principal' and 'parent' because staging already
-- has existing test users with those roles. STEP3 would have added them via
-- its own constraint update anyway. Unified here to avoid check violation.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'student', 'staff', 'admin', 'super_admin', 'administrator',
    'faculty', 'hod', 'guest', 'driver', 'store_admin',
    'principal', 'parent'
  ));

-- Step 3: Backfill existing users whose profiles.role is stale (still 'student')
--   but who have store_admin as their primary role in user_roles.
UPDATE public.profiles p
SET role = cr.role_key
FROM public.user_roles ur
JOIN public.custom_roles cr ON cr.id = ur.role_id
WHERE p.id = ur.user_id
  AND ur.is_primary = true
  AND cr.role_key = 'store_admin'
  AND p.role != 'store_admin';


-- ─────────────────────────────────────────────────
-- File: supabase/migrations/20260225_fix_user_roles_rls_circular_recursion.sql
-- ─────────────────────────────────────────────────
-- ================================================================
-- Fix: user_roles RLS circular recursion → HTTP 500
-- Root cause: "Managers can view all user roles" and
--             "Managers can manage user roles" both JOIN user_roles
--             inside a policy enforced ON user_roles
--             → PostgreSQL infinite recursion → stack overflow → 500.
-- Solution:   SECURITY DEFINER functions bypass RLS on read → no loop.
-- ================================================================

-- Step 1: Create get_current_user_role()
-- Reads profiles.role for auth.uid() — no reference to user_roles → safe
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Step 2: Create current_user_has_permission(permission_key)
-- Reads user_roles + custom_roles via SECURITY DEFINER → RLS bypassed
-- → calling this from a user_roles policy does NOT re-trigger that policy
CREATE OR REPLACE FUNCTION current_user_has_permission(permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        INNER JOIN public.custom_roles cr ON cr.id = ur.role_id
        WHERE ur.user_id = auth.uid()
          AND (cr.permissions ->> permission_key)::boolean = true
    );
$$;

-- Step 3: Drop the two self-referencing policies
DROP POLICY IF EXISTS "Managers can view all user roles" ON user_roles;
DROP POLICY IF EXISTS "Managers can manage user roles"  ON user_roles;

-- Step 4a: Safe SELECT policy
-- "Users can view own roles" already covers auth.uid() = user_id;
-- included here for explicitness and to fully replace the dropped policy.
CREATE POLICY "user_roles_select_managers"
    ON user_roles
    FOR SELECT
    USING (
        auth.uid() = user_id
        OR current_user_has_permission('users.manage')
        OR get_current_user_role() = 'super_admin'
    );

-- Step 4b: Safe ALL (INSERT/UPDATE/DELETE) policy
CREATE POLICY "user_roles_manage_admins"
    ON user_roles
    FOR ALL
    USING (
        current_user_has_permission('users.manage')
        OR get_current_user_role() = 'super_admin'
    )
    WITH CHECK (
        current_user_has_permission('users.manage')
        OR get_current_user_role() = 'super_admin'
    );


-- ─────────────────────────────────────────────────
-- File: supabase/migrations/20260225_create_service_request_tables.sql
-- ─────────────────────────────────────────────────
-- ============================================================
-- Migration: Create Service Request Tables
-- Created: 2026-02-25
-- Tables: service_types, service_type_fields,
--         service_request_approval_steps, service_requests,
--         service_request_approvals, service_request_timeline,
--         service_request_attachments
-- ============================================================

-- ---------- ENUM types ----------

DO $$ BEGIN
  CREATE TYPE service_request_status AS ENUM (
    'draft', 'submitted', 'in_review', 'approved',
    'rejected', 'returned', 'fulfilled', 'closed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE service_field_type AS ENUM (
    'text', 'select', 'date', 'number', 'boolean', 'textarea', 'file'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE service_request_priority AS ENUM (
    'low', 'normal', 'high', 'urgent'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE service_approval_action AS ENUM (
    'pending', 'approved', 'rejected', 'returned'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE service_timeline_event_type AS ENUM (
    'status_change', 'comment', 'internal_note',
    'edit', 'attachment_added', 'system'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE approval_workflow_type AS ENUM (
    'sequential', 'parallel'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- 1. service_types ----------

CREATE TABLE IF NOT EXISTS service_types (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                      TEXT NOT NULL UNIQUE,
  name                      TEXT NOT NULL,
  description               TEXT,
  icon                      TEXT NOT NULL DEFAULT 'FileText',
  color                     TEXT NOT NULL DEFAULT '#3B82F6',
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  is_system_default         BOOLEAN NOT NULL DEFAULT false,
  allowed_roles             TEXT[]  NOT NULL DEFAULT '{}',
  max_active_requests       INTEGER NOT NULL DEFAULT 1,
  auto_fulfill_on_approval  BOOLEAN NOT NULL DEFAULT false,
  enable_priority           BOOLEAN NOT NULL DEFAULT false,
  enable_attachments        BOOLEAN NOT NULL DEFAULT false,
  enable_email_notifications BOOLEAN NOT NULL DEFAULT true,
  approval_workflow_type    approval_workflow_type NOT NULL DEFAULT 'sequential',
  attachment_config         JSONB,
  validity_period_days      INTEGER,
  created_by                UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 2. service_type_fields ----------

CREATE TABLE IF NOT EXISTS service_type_fields (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type_id  UUID NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
  field_key        TEXT NOT NULL,
  field_label      TEXT NOT NULL,
  field_type       service_field_type NOT NULL DEFAULT 'text',
  field_options    JSONB,
  is_required      BOOLEAN NOT NULL DEFAULT false,
  display_order    INTEGER NOT NULL DEFAULT 0,
  placeholder      TEXT,
  help_text        TEXT,
  default_value    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (service_type_id, field_key)
);

-- ---------- 3. service_request_approval_steps ----------

CREATE TABLE IF NOT EXISTS service_request_approval_steps (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type_id              UUID NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
  step_order                   INTEGER NOT NULL,
  step_name                    TEXT NOT NULL,
  approver_role                TEXT NOT NULL,
  is_required                  BOOLEAN NOT NULL DEFAULT true,
  on_return_restart_from_step  INTEGER,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (service_type_id, step_order)
);

-- ---------- 4. service_requests ----------

CREATE SEQUENCE IF NOT EXISTS service_request_number_seq START WITH 1000;

CREATE TABLE IF NOT EXISTS service_requests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number       TEXT NOT NULL UNIQUE DEFAULT ('SR-' || nextval('service_request_number_seq')::TEXT),
  service_type_id      UUID NOT NULL REFERENCES service_types(id) ON DELETE RESTRICT,
  requester_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  institution_id       UUID REFERENCES institutions(id) ON DELETE SET NULL,
  status               service_request_status NOT NULL DEFAULT 'draft',
  priority             service_request_priority,
  current_approval_step INTEGER NOT NULL DEFAULT 0,
  form_data            JSONB NOT NULL DEFAULT '{}',
  requester_context    JSONB NOT NULL DEFAULT '{}',
  submitted_at         TIMESTAMPTZ,
  approved_at          TIMESTAMPTZ,
  fulfilled_at         TIMESTAMPTZ,
  closed_at            TIMESTAMPTZ,
  cancelled_at         TIMESTAMPTZ,
  validity_expires_at  TIMESTAMPTZ,
  cancellation_reason  TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ---------- 5. service_request_approvals ----------

CREATE TABLE IF NOT EXISTS service_request_approvals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id  UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  approval_step_id    UUID REFERENCES service_request_approval_steps(id) ON DELETE SET NULL,
  step_order          INTEGER NOT NULL,
  approver_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action              service_approval_action NOT NULL DEFAULT 'pending',
  comments            TEXT,
  acted_at            TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 6. service_request_timeline ----------

CREATE TABLE IF NOT EXISTS service_request_timeline (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id  UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  actor_id            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type          service_timeline_event_type NOT NULL DEFAULT 'system',
  old_status          service_request_status,
  new_status          service_request_status,
  content             TEXT,
  is_internal         BOOLEAN NOT NULL DEFAULT false,
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 7. service_request_attachments ----------

CREATE TABLE IF NOT EXISTS service_request_attachments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id  UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  file_name           TEXT NOT NULL,
  file_url            TEXT NOT NULL,
  file_size           BIGINT,
  file_type           TEXT,
  uploaded_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Indexes ----------

CREATE INDEX IF NOT EXISTS idx_service_types_slug       ON service_types(slug);
CREATE INDEX IF NOT EXISTS idx_service_types_is_active  ON service_types(is_active);

CREATE INDEX IF NOT EXISTS idx_stf_service_type_id      ON service_type_fields(service_type_id);
CREATE INDEX IF NOT EXISTS idx_sras_service_type_id     ON service_request_approval_steps(service_type_id);

CREATE INDEX IF NOT EXISTS idx_sr_requester_id          ON service_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_sr_service_type_id       ON service_requests(service_type_id);
CREATE INDEX IF NOT EXISTS idx_sr_institution_id        ON service_requests(institution_id);
CREATE INDEX IF NOT EXISTS idx_sr_status                ON service_requests(status);
CREATE INDEX IF NOT EXISTS idx_sr_submitted_at          ON service_requests(submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_sra_request_id           ON service_request_approvals(service_request_id);
CREATE INDEX IF NOT EXISTS idx_sra_approver_id          ON service_request_approvals(approver_id);

CREATE INDEX IF NOT EXISTS idx_srt_request_id           ON service_request_timeline(service_request_id);
CREATE INDEX IF NOT EXISTS idx_srt_created_at           ON service_request_timeline(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sratt_request_id         ON service_request_attachments(service_request_id);

-- ---------- updated_at trigger ----------

CREATE OR REPLACE FUNCTION update_service_request_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_types_updated_at    ON service_types;
DROP TRIGGER IF EXISTS trg_service_requests_updated_at ON service_requests;

CREATE TRIGGER trg_service_types_updated_at
  BEFORE UPDATE ON service_types
  FOR EACH ROW EXECUTE FUNCTION update_service_request_updated_at();

CREATE TRIGGER trg_service_requests_updated_at
  BEFORE UPDATE ON service_requests
  FOR EACH ROW EXECUTE FUNCTION update_service_request_updated_at();

-- ---------- Row-Level Security ----------

ALTER TABLE service_types                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_type_fields             ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_request_approval_steps  ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_requests                ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_request_approvals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_request_timeline        ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_request_attachments     ENABLE ROW LEVEL SECURITY;

-- service_types: anyone authenticated can read active types
CREATE POLICY "Authenticated users can view active service types"
  ON service_types FOR SELECT
  TO authenticated
  USING (is_active = true);

-- service_type_fields: readable if the parent type is active
CREATE POLICY "Authenticated users can view service type fields"
  ON service_type_fields FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM service_types st
      WHERE st.id = service_type_id AND st.is_active = true
    )
  );

-- service_request_approval_steps: same as fields
CREATE POLICY "Authenticated users can view approval steps"
  ON service_request_approval_steps FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM service_types st
      WHERE st.id = service_type_id AND st.is_active = true
    )
  );

-- service_requests: users see their own; admins/staff see all
CREATE POLICY "Users can view their own service requests"
  ON service_requests FOR SELECT
  TO authenticated
  USING (requester_id = auth.uid());

CREATE POLICY "Users can create service requests"
  ON service_requests FOR INSERT
  TO authenticated
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Users can update their own draft requests"
  ON service_requests FOR UPDATE
  TO authenticated
  USING (requester_id = auth.uid() AND status = 'draft');

-- service_request_approvals: requester can read their own; approver can see theirs
CREATE POLICY "Users can view approvals for their requests"
  ON service_request_approvals FOR SELECT
  TO authenticated
  USING (
    approver_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM service_requests sr
      WHERE sr.id = service_request_id AND sr.requester_id = auth.uid()
    )
  );

-- timeline: public entries visible to requester; internal only to staff (handled in app layer)
CREATE POLICY "Users can view timeline for their requests"
  ON service_request_timeline FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM service_requests sr
      WHERE sr.id = service_request_id
        AND (sr.requester_id = auth.uid() OR actor_id = auth.uid())
    )
  );

-- attachments: requester can see their own
CREATE POLICY "Users can view attachments for their requests"
  ON service_request_attachments FOR SELECT
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM service_requests sr
      WHERE sr.id = service_request_id AND sr.requester_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────────────
-- File: supabase/migrations/20260226_add_ims_grn_indent_number_rpcs.sql
-- ─────────────────────────────────────────────────
-- Migration: 20260226_add_ims_grn_indent_number_rpcs
-- Purpose: Atomic GRN and indent number sequences to prevent duplicate numbers
--          under concurrent usage (same race condition fix as sale numbers).
-- Replaces: COUNT(*) + 1 approach in grn-service.ts generateGRNNumber()
--           and indent-service.ts generateIndentNumber()

-- ---------------------------------------------------------------------------
-- GRN number counters
-- ---------------------------------------------------------------------------

-- Counter table: one row per (store, date) pair
CREATE TABLE IF NOT EXISTS public.ims_grn_number_counters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.ims_stores(id) ON DELETE CASCADE,
    counter_date DATE NOT NULL DEFAULT CURRENT_DATE,
    last_number INTEGER NOT NULL DEFAULT 0,
    UNIQUE(store_id, counter_date)
);

-- RPC function: atomically increments and returns next GRN number
-- Uses INSERT ... ON CONFLICT DO UPDATE ... RETURNING for guaranteed uniqueness
CREATE OR REPLACE FUNCTION public.ims_next_grn_number(
    p_store_id UUID,
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_next INTEGER;
BEGIN
    INSERT INTO public.ims_grn_number_counters (store_id, counter_date, last_number)
    VALUES (p_store_id, p_date, 1)
    ON CONFLICT (store_id, counter_date)
    DO UPDATE SET last_number = ims_grn_number_counters.last_number + 1
    RETURNING last_number INTO v_next;

    RETURN v_next;
END;
$$;

-- Enable RLS (table is only accessed via the SECURITY DEFINER function)
ALTER TABLE public.ims_grn_number_counters ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Indent number counters
-- ---------------------------------------------------------------------------

-- Counter table: one row per (store, date) pair
CREATE TABLE IF NOT EXISTS public.ims_indent_number_counters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.ims_stores(id) ON DELETE CASCADE,
    counter_date DATE NOT NULL DEFAULT CURRENT_DATE,
    last_number INTEGER NOT NULL DEFAULT 0,
    UNIQUE(store_id, counter_date)
);

-- RPC function: atomically increments and returns next indent number
-- Uses INSERT ... ON CONFLICT DO UPDATE ... RETURNING for guaranteed uniqueness
CREATE OR REPLACE FUNCTION public.ims_next_indent_number(
    p_store_id UUID,
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_next INTEGER;
BEGIN
    INSERT INTO public.ims_indent_number_counters (store_id, counter_date, last_number)
    VALUES (p_store_id, p_date, 1)
    ON CONFLICT (store_id, counter_date)
    DO UPDATE SET last_number = ims_indent_number_counters.last_number + 1
    RETURNING last_number INTO v_next;

    RETURN v_next;
END;
$$;

-- Enable RLS (table is only accessed via the SECURITY DEFINER function)
ALTER TABLE public.ims_indent_number_counters ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────
-- File: supabase/migrations/20260226_fix_ims_rls_policies.sql
-- ─────────────────────────────────────────────────
-- Migration: 20260226_fix_ims_rls_policies
-- Purpose: Replace USING (true) RLS on all IMS tables with institution-scoped policies.
--          Prevents cross-institution data access for IMS module.
-- Security: Uses get_current_user_role() SECURITY DEFINER to avoid RLS recursion.

-- ================================================================================
-- SECTION 1: DROP ALL EXISTING PERMISSIVE IMS POLICIES
-- ================================================================================

-- 1. ims_units
DROP POLICY IF EXISTS "Authenticated users can read ims_units" ON public.ims_units;
DROP POLICY IF EXISTS "Authenticated users can insert ims_units" ON public.ims_units;
DROP POLICY IF EXISTS "Authenticated users can update ims_units" ON public.ims_units;
DROP POLICY IF EXISTS "Authenticated users can delete ims_units" ON public.ims_units;

-- 2. ims_item_categories
DROP POLICY IF EXISTS "Authenticated users can read ims_item_categories" ON public.ims_item_categories;
DROP POLICY IF EXISTS "Authenticated users can insert ims_item_categories" ON public.ims_item_categories;
DROP POLICY IF EXISTS "Authenticated users can update ims_item_categories" ON public.ims_item_categories;
DROP POLICY IF EXISTS "Authenticated users can delete ims_item_categories" ON public.ims_item_categories;

-- 3. ims_items
DROP POLICY IF EXISTS "Authenticated users can read ims_items" ON public.ims_items;
DROP POLICY IF EXISTS "Authenticated users can insert ims_items" ON public.ims_items;
DROP POLICY IF EXISTS "Authenticated users can update ims_items" ON public.ims_items;
DROP POLICY IF EXISTS "Authenticated users can delete ims_items" ON public.ims_items;

-- 4. ims_unit_conversions
DROP POLICY IF EXISTS "Authenticated users can read ims_unit_conversions" ON public.ims_unit_conversions;
DROP POLICY IF EXISTS "Authenticated users can insert ims_unit_conversions" ON public.ims_unit_conversions;
DROP POLICY IF EXISTS "Authenticated users can update ims_unit_conversions" ON public.ims_unit_conversions;
DROP POLICY IF EXISTS "Authenticated users can delete ims_unit_conversions" ON public.ims_unit_conversions;

-- 5. ims_suppliers
DROP POLICY IF EXISTS "Authenticated users can read ims_suppliers" ON public.ims_suppliers;
DROP POLICY IF EXISTS "Authenticated users can insert ims_suppliers" ON public.ims_suppliers;
DROP POLICY IF EXISTS "Authenticated users can update ims_suppliers" ON public.ims_suppliers;
DROP POLICY IF EXISTS "Authenticated users can delete ims_suppliers" ON public.ims_suppliers;

-- 6. ims_stock_summary
DROP POLICY IF EXISTS "Authenticated users can read ims_stock_summary" ON public.ims_stock_summary;
DROP POLICY IF EXISTS "Authenticated users can insert ims_stock_summary" ON public.ims_stock_summary;
DROP POLICY IF EXISTS "Authenticated users can update ims_stock_summary" ON public.ims_stock_summary;
DROP POLICY IF EXISTS "Authenticated users can delete ims_stock_summary" ON public.ims_stock_summary;

-- 7. ims_goods_received_notes
DROP POLICY IF EXISTS "Authenticated users can read ims_goods_received_notes" ON public.ims_goods_received_notes;
DROP POLICY IF EXISTS "Authenticated users can insert ims_goods_received_notes" ON public.ims_goods_received_notes;
DROP POLICY IF EXISTS "Authenticated users can update ims_goods_received_notes" ON public.ims_goods_received_notes;
DROP POLICY IF EXISTS "Authenticated users can delete ims_goods_received_notes" ON public.ims_goods_received_notes;

-- 8. ims_stock_batches
DROP POLICY IF EXISTS "Authenticated users can read ims_stock_batches" ON public.ims_stock_batches;
DROP POLICY IF EXISTS "Authenticated users can insert ims_stock_batches" ON public.ims_stock_batches;
DROP POLICY IF EXISTS "Authenticated users can update ims_stock_batches" ON public.ims_stock_batches;
DROP POLICY IF EXISTS "Authenticated users can delete ims_stock_batches" ON public.ims_stock_batches;

-- 9. ims_grn_items
DROP POLICY IF EXISTS "Authenticated users can read ims_grn_items" ON public.ims_grn_items;
DROP POLICY IF EXISTS "Authenticated users can insert ims_grn_items" ON public.ims_grn_items;
DROP POLICY IF EXISTS "Authenticated users can update ims_grn_items" ON public.ims_grn_items;
DROP POLICY IF EXISTS "Authenticated users can delete ims_grn_items" ON public.ims_grn_items;

-- 10. ims_indent_requests
DROP POLICY IF EXISTS "Authenticated users can read ims_indent_requests" ON public.ims_indent_requests;
DROP POLICY IF EXISTS "Authenticated users can insert ims_indent_requests" ON public.ims_indent_requests;
DROP POLICY IF EXISTS "Authenticated users can update ims_indent_requests" ON public.ims_indent_requests;
DROP POLICY IF EXISTS "Authenticated users can delete ims_indent_requests" ON public.ims_indent_requests;

-- 11. ims_indent_request_items
DROP POLICY IF EXISTS "Authenticated users can read ims_indent_request_items" ON public.ims_indent_request_items;
DROP POLICY IF EXISTS "Authenticated users can insert ims_indent_request_items" ON public.ims_indent_request_items;
DROP POLICY IF EXISTS "Authenticated users can update ims_indent_request_items" ON public.ims_indent_request_items;
DROP POLICY IF EXISTS "Authenticated users can delete ims_indent_request_items" ON public.ims_indent_request_items;

-- 12. ims_stock_issues
DROP POLICY IF EXISTS "Authenticated users can read ims_stock_issues" ON public.ims_stock_issues;
DROP POLICY IF EXISTS "Authenticated users can insert ims_stock_issues" ON public.ims_stock_issues;
DROP POLICY IF EXISTS "Authenticated users can update ims_stock_issues" ON public.ims_stock_issues;
DROP POLICY IF EXISTS "Authenticated users can delete ims_stock_issues" ON public.ims_stock_issues;

-- 13. ims_sales
DROP POLICY IF EXISTS "Authenticated users can read ims_sales" ON public.ims_sales;
DROP POLICY IF EXISTS "Authenticated users can insert ims_sales" ON public.ims_sales;
DROP POLICY IF EXISTS "Authenticated users can update ims_sales" ON public.ims_sales;
DROP POLICY IF EXISTS "Authenticated users can delete ims_sales" ON public.ims_sales;

-- 14. ims_sale_items
DROP POLICY IF EXISTS "Authenticated users can read ims_sale_items" ON public.ims_sale_items;
DROP POLICY IF EXISTS "Authenticated users can insert ims_sale_items" ON public.ims_sale_items;
DROP POLICY IF EXISTS "Authenticated users can update ims_sale_items" ON public.ims_sale_items;
DROP POLICY IF EXISTS "Authenticated users can delete ims_sale_items" ON public.ims_sale_items;

-- 15. ims_financial_transactions
DROP POLICY IF EXISTS "Authenticated users can read ims_financial_transactions" ON public.ims_financial_transactions;
DROP POLICY IF EXISTS "Authenticated users can insert ims_financial_transactions" ON public.ims_financial_transactions;
DROP POLICY IF EXISTS "Authenticated users can update ims_financial_transactions" ON public.ims_financial_transactions;
DROP POLICY IF EXISTS "Authenticated users can delete ims_financial_transactions" ON public.ims_financial_transactions;

-- 16. ims_department_consumption
DROP POLICY IF EXISTS "Authenticated users can read ims_department_consumption" ON public.ims_department_consumption;
DROP POLICY IF EXISTS "Authenticated users can insert ims_department_consumption" ON public.ims_department_consumption;
DROP POLICY IF EXISTS "Authenticated users can update ims_department_consumption" ON public.ims_department_consumption;
DROP POLICY IF EXISTS "Authenticated users can delete ims_department_consumption" ON public.ims_department_consumption;

-- 17. ims_stores
DROP POLICY IF EXISTS "Authenticated users can read ims_stores" ON public.ims_stores;
DROP POLICY IF EXISTS "Authenticated users can insert ims_stores" ON public.ims_stores;
DROP POLICY IF EXISTS "Authenticated users can update ims_stores" ON public.ims_stores;
DROP POLICY IF EXISTS "Authenticated users can delete ims_stores" ON public.ims_stores;

-- 18. ims_upi_qr_payments
DROP POLICY IF EXISTS "Authenticated users can read ims_upi_qr_payments" ON public.ims_upi_qr_payments;
DROP POLICY IF EXISTS "Authenticated users can insert ims_upi_qr_payments" ON public.ims_upi_qr_payments;
DROP POLICY IF EXISTS "Authenticated users can update ims_upi_qr_payments" ON public.ims_upi_qr_payments;

-- 20. ims_shifts
DROP POLICY IF EXISTS "Authenticated users can read ims_shifts" ON public.ims_shifts;
DROP POLICY IF EXISTS "Authenticated users can insert ims_shifts" ON public.ims_shifts;
DROP POLICY IF EXISTS "Authenticated users can update ims_shifts" ON public.ims_shifts;

-- ================================================================================
-- SECTION 2: CREATE INSTITUTION-SCOPED REPLACEMENT POLICIES
-- ================================================================================

-- -------------------------------------------------------------------------
-- 1. ims_units — global lookup table, no institution_id
--    Reads are open to all authenticated users.
--    Writes restricted to admins only.
-- -------------------------------------------------------------------------
CREATE POLICY "ims_units_select"
  ON public.ims_units FOR SELECT TO authenticated USING (true);

CREATE POLICY "ims_units_insert"
  ON public.ims_units FOR INSERT TO authenticated
  WITH CHECK (get_current_user_role() IN ('super_admin', 'admin'));

CREATE POLICY "ims_units_update"
  ON public.ims_units FOR UPDATE TO authenticated
  USING (get_current_user_role() IN ('super_admin', 'admin'));

CREATE POLICY "ims_units_delete"
  ON public.ims_units FOR DELETE TO authenticated
  USING (get_current_user_role() IN ('super_admin', 'admin'));

-- -------------------------------------------------------------------------
-- 2. ims_item_categories — global lookup table, no institution_id
--    Same treatment as ims_units: open reads, admin-only writes.
-- -------------------------------------------------------------------------
CREATE POLICY "ims_item_categories_select"
  ON public.ims_item_categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "ims_item_categories_insert"
  ON public.ims_item_categories FOR INSERT TO authenticated
  WITH CHECK (get_current_user_role() IN ('super_admin', 'admin'));

CREATE POLICY "ims_item_categories_update"
  ON public.ims_item_categories FOR UPDATE TO authenticated
  USING (get_current_user_role() IN ('super_admin', 'admin'));

CREATE POLICY "ims_item_categories_delete"
  ON public.ims_item_categories FOR DELETE TO authenticated
  USING (get_current_user_role() IN ('super_admin', 'admin'));

-- -------------------------------------------------------------------------
-- 3. ims_items — has institution_id
-- -------------------------------------------------------------------------
CREATE POLICY "ims_items_select"
  ON public.ims_items FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_items_insert"
  ON public.ims_items FOR INSERT TO authenticated
  WITH CHECK (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_items_update"
  ON public.ims_items FOR UPDATE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_items_delete"
  ON public.ims_items FOR DELETE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

-- -------------------------------------------------------------------------
-- 4. ims_unit_conversions — scoped via item_id → ims_items (institution_id)
-- -------------------------------------------------------------------------
CREATE POLICY "ims_unit_conversions_select"
  ON public.ims_unit_conversions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_items i
      WHERE i.id = item_id
      AND (
        i.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_unit_conversions_insert"
  ON public.ims_unit_conversions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ims_items i
      WHERE i.id = item_id
      AND (
        i.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_unit_conversions_update"
  ON public.ims_unit_conversions FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_items i
      WHERE i.id = item_id
      AND (
        i.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_unit_conversions_delete"
  ON public.ims_unit_conversions FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_items i
      WHERE i.id = item_id
      AND (
        i.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

-- -------------------------------------------------------------------------
-- 5. ims_suppliers — has institution_id
-- -------------------------------------------------------------------------
CREATE POLICY "ims_suppliers_select"
  ON public.ims_suppliers FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_suppliers_insert"
  ON public.ims_suppliers FOR INSERT TO authenticated
  WITH CHECK (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_suppliers_update"
  ON public.ims_suppliers FOR UPDATE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_suppliers_delete"
  ON public.ims_suppliers FOR DELETE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

-- -------------------------------------------------------------------------
-- 6. ims_stock_summary — has institution_id
-- -------------------------------------------------------------------------
CREATE POLICY "ims_stock_summary_select"
  ON public.ims_stock_summary FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_stock_summary_insert"
  ON public.ims_stock_summary FOR INSERT TO authenticated
  WITH CHECK (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_stock_summary_update"
  ON public.ims_stock_summary FOR UPDATE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_stock_summary_delete"
  ON public.ims_stock_summary FOR DELETE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

-- -------------------------------------------------------------------------
-- 7. ims_goods_received_notes — has institution_id
-- -------------------------------------------------------------------------
CREATE POLICY "ims_goods_received_notes_select"
  ON public.ims_goods_received_notes FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_goods_received_notes_insert"
  ON public.ims_goods_received_notes FOR INSERT TO authenticated
  WITH CHECK (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_goods_received_notes_update"
  ON public.ims_goods_received_notes FOR UPDATE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_goods_received_notes_delete"
  ON public.ims_goods_received_notes FOR DELETE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

-- -------------------------------------------------------------------------
-- 8. ims_stock_batches — has institution_id
-- -------------------------------------------------------------------------
CREATE POLICY "ims_stock_batches_select"
  ON public.ims_stock_batches FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_stock_batches_insert"
  ON public.ims_stock_batches FOR INSERT TO authenticated
  WITH CHECK (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_stock_batches_update"
  ON public.ims_stock_batches FOR UPDATE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_stock_batches_delete"
  ON public.ims_stock_batches FOR DELETE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

-- -------------------------------------------------------------------------
-- 9. ims_grn_items — junction table, scoped via grn_id → ims_goods_received_notes
-- -------------------------------------------------------------------------
CREATE POLICY "ims_grn_items_select"
  ON public.ims_grn_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_goods_received_notes g
      WHERE g.id = grn_id
      AND (
        g.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_grn_items_insert"
  ON public.ims_grn_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ims_goods_received_notes g
      WHERE g.id = grn_id
      AND (
        g.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_grn_items_update"
  ON public.ims_grn_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_goods_received_notes g
      WHERE g.id = grn_id
      AND (
        g.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_grn_items_delete"
  ON public.ims_grn_items FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_goods_received_notes g
      WHERE g.id = grn_id
      AND (
        g.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

-- -------------------------------------------------------------------------
-- 10. ims_indent_requests — has institution_id
-- -------------------------------------------------------------------------
CREATE POLICY "ims_indent_requests_select"
  ON public.ims_indent_requests FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_indent_requests_insert"
  ON public.ims_indent_requests FOR INSERT TO authenticated
  WITH CHECK (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_indent_requests_update"
  ON public.ims_indent_requests FOR UPDATE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_indent_requests_delete"
  ON public.ims_indent_requests FOR DELETE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

-- -------------------------------------------------------------------------
-- 11. ims_indent_request_items — junction table, scoped via indent_id → ims_indent_requests
-- -------------------------------------------------------------------------
CREATE POLICY "ims_indent_request_items_select"
  ON public.ims_indent_request_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_indent_requests ir
      WHERE ir.id = indent_id
      AND (
        ir.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_indent_request_items_insert"
  ON public.ims_indent_request_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ims_indent_requests ir
      WHERE ir.id = indent_id
      AND (
        ir.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_indent_request_items_update"
  ON public.ims_indent_request_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_indent_requests ir
      WHERE ir.id = indent_id
      AND (
        ir.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_indent_request_items_delete"
  ON public.ims_indent_request_items FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_indent_requests ir
      WHERE ir.id = indent_id
      AND (
        ir.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

-- -------------------------------------------------------------------------
-- 12. ims_stock_issues — has institution_id
-- -------------------------------------------------------------------------
CREATE POLICY "ims_stock_issues_select"
  ON public.ims_stock_issues FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_stock_issues_insert"
  ON public.ims_stock_issues FOR INSERT TO authenticated
  WITH CHECK (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_stock_issues_update"
  ON public.ims_stock_issues FOR UPDATE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_stock_issues_delete"
  ON public.ims_stock_issues FOR DELETE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

-- -------------------------------------------------------------------------
-- 13. ims_sales — has institution_id
-- -------------------------------------------------------------------------
CREATE POLICY "ims_sales_select"
  ON public.ims_sales FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_sales_insert"
  ON public.ims_sales FOR INSERT TO authenticated
  WITH CHECK (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_sales_update"
  ON public.ims_sales FOR UPDATE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_sales_delete"
  ON public.ims_sales FOR DELETE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

-- -------------------------------------------------------------------------
-- 14. ims_sale_items — junction table, scoped via sale_id → ims_sales
-- -------------------------------------------------------------------------
CREATE POLICY "ims_sale_items_select"
  ON public.ims_sale_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_sales s
      WHERE s.id = sale_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_sale_items_insert"
  ON public.ims_sale_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ims_sales s
      WHERE s.id = sale_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_sale_items_update"
  ON public.ims_sale_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_sales s
      WHERE s.id = sale_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_sale_items_delete"
  ON public.ims_sale_items FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_sales s
      WHERE s.id = sale_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

-- -------------------------------------------------------------------------
-- 15. ims_financial_transactions — has institution_id
-- -------------------------------------------------------------------------
CREATE POLICY "ims_financial_transactions_select"
  ON public.ims_financial_transactions FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_financial_transactions_insert"
  ON public.ims_financial_transactions FOR INSERT TO authenticated
  WITH CHECK (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_financial_transactions_update"
  ON public.ims_financial_transactions FOR UPDATE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_financial_transactions_delete"
  ON public.ims_financial_transactions FOR DELETE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

-- -------------------------------------------------------------------------
-- 16. ims_department_consumption — has institution_id
-- -------------------------------------------------------------------------
CREATE POLICY "ims_department_consumption_select"
  ON public.ims_department_consumption FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_department_consumption_insert"
  ON public.ims_department_consumption FOR INSERT TO authenticated
  WITH CHECK (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_department_consumption_update"
  ON public.ims_department_consumption FOR UPDATE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_department_consumption_delete"
  ON public.ims_department_consumption FOR DELETE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

-- -------------------------------------------------------------------------
-- 17. ims_stores — has institution_id
-- -------------------------------------------------------------------------
CREATE POLICY "ims_stores_select"
  ON public.ims_stores FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_stores_insert"
  ON public.ims_stores FOR INSERT TO authenticated
  WITH CHECK (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_stores_update"
  ON public.ims_stores FOR UPDATE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

CREATE POLICY "ims_stores_delete"
  ON public.ims_stores FOR DELETE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() = 'super_admin'
  );

-- -------------------------------------------------------------------------
-- 18. ims_upi_qr_payments — has store_id only, join via ims_stores for institution
-- -------------------------------------------------------------------------
CREATE POLICY "ims_upi_qr_payments_select"
  ON public.ims_upi_qr_payments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_stores s
      WHERE s.id = store_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_upi_qr_payments_insert"
  ON public.ims_upi_qr_payments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ims_stores s
      WHERE s.id = store_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_upi_qr_payments_update"
  ON public.ims_upi_qr_payments FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_stores s
      WHERE s.id = store_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_upi_qr_payments_delete"
  ON public.ims_upi_qr_payments FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_stores s
      WHERE s.id = store_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

-- -------------------------------------------------------------------------
-- 19. ims_sale_number_counters — has store_id only, join via ims_stores
--     Note: primary access is via ims_next_sale_number() SECURITY DEFINER RPC.
--     Direct table policies provided for admin visibility.
-- -------------------------------------------------------------------------
CREATE POLICY "ims_sale_number_counters_select"
  ON public.ims_sale_number_counters FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_stores s
      WHERE s.id = store_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_sale_number_counters_insert"
  ON public.ims_sale_number_counters FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ims_stores s
      WHERE s.id = store_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_sale_number_counters_update"
  ON public.ims_sale_number_counters FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_stores s
      WHERE s.id = store_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

-- -------------------------------------------------------------------------
-- 20. ims_shifts — has store_id only, join via ims_stores
-- -------------------------------------------------------------------------
CREATE POLICY "ims_shifts_select"
  ON public.ims_shifts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_stores s
      WHERE s.id = store_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_shifts_insert"
  ON public.ims_shifts FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ims_stores s
      WHERE s.id = store_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_shifts_update"
  ON public.ims_shifts FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_stores s
      WHERE s.id = store_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );

CREATE POLICY "ims_shifts_delete"
  ON public.ims_shifts FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ims_stores s
      WHERE s.id = store_id
      AND (
        s.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        OR get_current_user_role() = 'super_admin'
      )
    )
  );


-- ─────────────────────────────────────────────────
-- File: supabase/migrations/20260227_add_assigned_store_id_to_profiles.sql
-- ─────────────────────────────────────────────────
-- Migration: 2026-02-27
-- Add assigned_store_id to profiles table
--
-- Purpose:
--   Enables persistent store assignment during role allocation.
--   When an admin assigns the store_admin role to a user, they can now
--   also choose which IMS store that user manages. This value is written
--   to profiles.assigned_store_id and consumed by useImsStoreContext as
--   priority-2 auto-resolution (over the institution first-match fallback).
--
-- Resolution priority in useImsStoreContext after this migration:
--   1. Zustand / localStorage (persisted choice)
--   2. profiles.assigned_store_id  ← NEW
--   3. First active store for user's institution (existing fallback)
--   4. Manual selection required (Gate D)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS assigned_store_id UUID
    REFERENCES ims_stores(id)
    ON DELETE SET NULL;

-- Fast lookup when resolving store context on every IMS page load
CREATE INDEX IF NOT EXISTS idx_profiles_assigned_store_id
  ON profiles(assigned_store_id)
  WHERE assigned_store_id IS NOT NULL;

COMMENT ON COLUMN profiles.assigned_store_id IS
  'Pre-assigned IMS store for store_admin users. Set during role assignment. '
  'Takes priority over institution-based auto-resolution in useImsStoreContext. '
  'NULL means no explicit assignment — fall back to institution first-match or Gate D.';


-- ─────────────────────────────────────────────────
-- File: supabase/migrations/20260227_add_company_name_batch_to_ims.sql
-- ─────────────────────────────────────────────────
-- Migration: 20260227_add_company_name_batch_to_ims
-- Purpose:
--   1. Add company_name to ims_items (manufacturer/brand at the item-master level)
--   2. Add batch_number and expiry_date to ims_financial_transactions
--      so stock adjustments (damage, expiry, theft, etc.) can record which batch was affected
--
-- Both columns are nullable for backward compatibility with existing records.

-- ── 1. ims_items ──────────────────────────────────────────────────────────────
ALTER TABLE public.ims_items
  ADD COLUMN IF NOT EXISTS company_name TEXT;

-- ── 2. ims_financial_transactions ────────────────────────────────────────────
ALTER TABLE public.ims_financial_transactions
  ADD COLUMN IF NOT EXISTS batch_number TEXT,
  ADD COLUMN IF NOT EXISTS expiry_date  DATE;


-- ─────────────────────────────────────────────────
-- File: supabase/migrations/20260227_add_missing_ims_items_columns.sql
-- ─────────────────────────────────────────────────
-- Migration: 20260227_add_missing_ims_items_columns
-- Purpose:
--   Add hsn_code, gst_rate, and created_by to ims_items.
--   These columns are present in the TypeScript ImsItem type and the import
--   route but were never applied to the database, causing PGRST204 errors.
--
--   All three are nullable / have defaults for backward compatibility.

ALTER TABLE public.ims_items
  ADD COLUMN IF NOT EXISTS hsn_code   TEXT,
  ADD COLUMN IF NOT EXISTS gst_rate   NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;


-- ─────────────────────────────────────────────────
-- File: supabase/migrations/20260302_fix_store_admin_base_permissions.sql
-- ─────────────────────────────────────────────────
-- Fix store_admin role: add missing base permissions (view_dashboard, view_profile)
-- Without these, the Dashboard and Profile sidebar items are hidden for store_admin users
-- Updated: 2026-03-02

UPDATE custom_roles
SET permissions = permissions || jsonb_build_object(
  'view_dashboard', true,
  'view_profile', true
)
WHERE role_key = 'store_admin';


-- ─────────────────────────────────────────────────
-- File: supabase/migrations/20260302_fix_student_service_requests_permissions.sql
-- ─────────────────────────────────────────────────
-- Fix student role: align service_requests permission keys with MENU_PERMISSIONS
-- Student role had service_requests.view/create but MENU_PERMISSIONS uses submit/view_own
-- MENU_PERMISSIONS mapping:
--   '/service-requests'             -> 'service_requests.submit'
--   '/service-requests/my-requests' -> 'service_requests.view_own'
-- Updated: 2026-03-02

UPDATE custom_roles
SET permissions = permissions
  - 'service_requests.view'     -- remove old key
  - 'service_requests.create'   -- remove old key
  || jsonb_build_object(
      'service_requests.submit', true,    -- matches MENU_PERMISSIONS for /service-requests
      'service_requests.view_own', true   -- matches MENU_PERMISSIONS for /service-requests/my-requests
     )
WHERE role_key = 'student';

