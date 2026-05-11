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
