-- Add approved_by column to billing_refunds table
-- This column will store the ID of the user who approved the refund

-- Add the approved_by column
ALTER TABLE public.billing_refunds 
ADD COLUMN IF NOT EXISTS approved_by UUID;

-- Add foreign key constraint
ALTER TABLE public.billing_refunds
ADD CONSTRAINT fk_billing_refunds_approved_by 
FOREIGN KEY (approved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_billing_refunds_approved_by ON public.billing_refunds(approved_by);

-- Add comment for documentation
COMMENT ON COLUMN public.billing_refunds.approved_by IS 'ID of the user who approved this refund';
COMMENT ON CONSTRAINT fk_billing_refunds_approved_by ON public.billing_refunds IS 'Foreign key to profiles table for refund approver'; 