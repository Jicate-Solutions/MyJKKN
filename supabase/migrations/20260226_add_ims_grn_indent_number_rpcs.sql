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
