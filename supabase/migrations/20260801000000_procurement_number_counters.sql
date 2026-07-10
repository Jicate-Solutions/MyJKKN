-- Migration: 20260801000000_procurement_number_counters
-- Purpose:  Atomic document-number sequences for the centralized Procurement module
--           (Purchase Request, RFQ, Purchase Order, GRN). One counter table with a
--           doc_type discriminator, generalizing the per-type ims_grn/indent counters
--           (see 20260226_add_ims_grn_indent_number_rpcs.sql) so every procurement
--           document type shares one atomic, race-safe sequence.
-- Scope:    institution_id (module-agnostic — procurement does NOT depend on ims_stores).

-- ---------------------------------------------------------------------------
-- Counter table: one row per (institution, doc_type, date)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.procurement_number_counters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL,
    doc_type TEXT NOT NULL CHECK (doc_type IN ('PR', 'RFQ', 'PO', 'GRN')),
    counter_date DATE NOT NULL DEFAULT CURRENT_DATE,
    last_number INTEGER NOT NULL DEFAULT 0,
    UNIQUE (institution_id, doc_type, counter_date)
);

-- ---------------------------------------------------------------------------
-- RPC: atomically increment and return the next number for a doc type.
-- INSERT ... ON CONFLICT DO UPDATE ... RETURNING guarantees uniqueness under
-- concurrent usage (same technique as ims_next_grn_number).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.procurement_next_number(
    p_institution_id UUID,
    p_doc_type TEXT,
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_next INTEGER;
BEGIN
    IF p_doc_type NOT IN ('PR', 'RFQ', 'PO', 'GRN') THEN
        RAISE EXCEPTION 'Invalid procurement doc_type: %', p_doc_type;
    END IF;

    INSERT INTO public.procurement_number_counters (institution_id, doc_type, counter_date, last_number)
    VALUES (p_institution_id, p_doc_type, p_date, 1)
    ON CONFLICT (institution_id, doc_type, counter_date)
    DO UPDATE SET last_number = procurement_number_counters.last_number + 1
    RETURNING last_number INTO v_next;

    RETURN v_next;
END;
$$;

-- Table is only ever written through the SECURITY DEFINER function.
ALTER TABLE public.procurement_number_counters ENABLE ROW LEVEL SECURITY;
