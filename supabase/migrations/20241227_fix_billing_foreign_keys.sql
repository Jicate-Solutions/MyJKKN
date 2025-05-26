-- Fix missing foreign key constraints for billing tables
-- Add foreign key constraints for authorizer_id fields that reference profiles table

-- Add foreign key constraint for billing_discounts.authorizer_id
DO $$
BEGIN
    -- Check if the constraint doesn't already exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_billing_discounts_authorizer'
        AND table_name = 'billing_discounts'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.billing_discounts 
        ADD CONSTRAINT fk_billing_discounts_authorizer 
        FOREIGN KEY (authorizer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Add foreign key constraint for billing_refunds.authorizer_id
DO $$
BEGIN
    -- Check if the constraint doesn't already exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_billing_refunds_authorizer'
        AND table_name = 'billing_refunds'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.billing_refunds 
        ADD CONSTRAINT fk_billing_refunds_authorizer 
        FOREIGN KEY (authorizer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Add foreign key constraint for billing_receipts.accountant_id (if missing)
DO $$
BEGIN
    -- Check if the constraint doesn't already exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_billing_receipts_accountant'
        AND table_name = 'billing_receipts'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.billing_receipts 
        ADD CONSTRAINT fk_billing_receipts_accountant 
        FOREIGN KEY (accountant_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Add indexes for the foreign key columns for better performance
CREATE INDEX IF NOT EXISTS idx_billing_discounts_authorizer_id ON public.billing_discounts(authorizer_id);
CREATE INDEX IF NOT EXISTS idx_billing_refunds_authorizer_id ON public.billing_refunds(authorizer_id);
CREATE INDEX IF NOT EXISTS idx_billing_receipts_accountant_id ON public.billing_receipts(accountant_id);

-- Comment on the constraints for documentation
COMMENT ON CONSTRAINT fk_billing_discounts_authorizer ON public.billing_discounts IS 'Foreign key to profiles table for discount authorizer';
COMMENT ON CONSTRAINT fk_billing_refunds_authorizer ON public.billing_refunds IS 'Foreign key to profiles table for refund authorizer';
COMMENT ON CONSTRAINT fk_billing_receipts_accountant ON public.billing_receipts IS 'Foreign key to profiles table for receipt accountant'; 