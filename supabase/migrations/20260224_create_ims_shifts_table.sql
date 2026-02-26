-- Migration: 20260224_create_ims_shifts_table
-- Purpose: Cashier shift tracking for future cash reconciliation.
--          Schema only — no service/hooks/UI yet.

CREATE TABLE IF NOT EXISTS public.ims_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.ims_stores(id) ON DELETE CASCADE,
    cashier_id UUID NOT NULL REFERENCES public.profiles(id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    opening_balance NUMERIC(12,2) DEFAULT 0,
    closing_balance NUMERIC(12,2),
    expected_balance NUMERIC(12,2),
    notes TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed', 'reconciled')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ims_shifts_store_id ON public.ims_shifts(store_id);
CREATE INDEX IF NOT EXISTS idx_ims_shifts_cashier_id ON public.ims_shifts(cashier_id);
CREATE INDEX IF NOT EXISTS idx_ims_shifts_status ON public.ims_shifts(status);

ALTER TABLE public.ims_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ims_shifts"
    ON public.ims_shifts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ims_shifts"
    ON public.ims_shifts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ims_shifts"
    ON public.ims_shifts FOR UPDATE TO authenticated USING (true);

-- Add optional shift_id FK on ims_sales
ALTER TABLE public.ims_sales ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES public.ims_shifts(id);
