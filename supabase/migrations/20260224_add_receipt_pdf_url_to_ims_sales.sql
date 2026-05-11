-- Migration: 20260224_add_receipt_pdf_url_to_ims_sales
-- Purpose: Store URL of auto-generated receipt PDFs for audit trail.
--          PDFs are uploaded to Supabase Storage bucket 'ims-receipts'.

ALTER TABLE public.ims_sales ADD COLUMN IF NOT EXISTS receipt_pdf_url TEXT;
