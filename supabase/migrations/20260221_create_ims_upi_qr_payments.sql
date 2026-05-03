-- Migration: Create ims_upi_qr_payments table
-- Date: 2026-02-21
-- Purpose: Track UPI QR code payment lifecycle for IMS POS checkout

CREATE TABLE IF NOT EXISTS public.ims_upi_qr_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.ims_stores(id) ON DELETE CASCADE,
    transaction_ref TEXT NOT NULL UNIQUE,
    upi_string TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'paid', 'expired', 'failed')),
    sale_id UUID REFERENCES public.ims_sales(id),
    upi_transaction_id TEXT,
    confirmed_by UUID REFERENCES public.profiles(id),
    expires_at TIMESTAMPTZ NOT NULL,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ims_upi_qr_payments_store_id ON public.ims_upi_qr_payments(store_id);
CREATE INDEX IF NOT EXISTS idx_ims_upi_qr_payments_status ON public.ims_upi_qr_payments(status);
CREATE INDEX IF NOT EXISTS idx_ims_upi_qr_payments_sale_id ON public.ims_upi_qr_payments(sale_id);

ALTER TABLE public.ims_upi_qr_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ims_upi_qr_payments"
    ON public.ims_upi_qr_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ims_upi_qr_payments"
    ON public.ims_upi_qr_payments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ims_upi_qr_payments"
    ON public.ims_upi_qr_payments FOR UPDATE TO authenticated USING (true);
