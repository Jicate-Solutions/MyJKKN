-- Migration: Add missing resource fields for vendor address, lifecycle management
-- Date: 2025-01-30
-- Description: Adds structured vendor address, contract details, and lifecycle tracking fields

-- Drop old vendor_address if it exists (we're replacing with structured fields)
ALTER TABLE public.resources
  DROP COLUMN IF EXISTS vendor_address;

-- Add structured vendor address fields
ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS vendor_address_line1 VARCHAR(255),
  ADD COLUMN IF NOT EXISTS vendor_address_line2 VARCHAR(255),
  ADD COLUMN IF NOT EXISTS vendor_city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS vendor_state VARCHAR(100),
  ADD COLUMN IF NOT EXISTS vendor_zip VARCHAR(20),
  ADD COLUMN IF NOT EXISTS vendor_contract_details TEXT,
  ADD COLUMN IF NOT EXISTS vendor_support_contact VARCHAR(255);

-- Add lifecycle management fields
ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS depreciation_rate DECIMAL(5,2) CHECK (depreciation_rate >= 0 AND depreciation_rate <= 100),
  ADD COLUMN IF NOT EXISTS current_value DECIMAL(12,2) CHECK (current_value >= 0),
  ADD COLUMN IF NOT EXISTS disposal_date DATE;

-- Add comments for documentation
COMMENT ON COLUMN public.resources.vendor_address_line1 IS 'Vendor address line 1 (street, building)';
COMMENT ON COLUMN public.resources.vendor_address_line2 IS 'Vendor address line 2 (apartment, suite, optional)';
COMMENT ON COLUMN public.resources.vendor_city IS 'Vendor city';
COMMENT ON COLUMN public.resources.vendor_state IS 'Vendor state/province';
COMMENT ON COLUMN public.resources.vendor_zip IS 'Vendor ZIP/postal code';
COMMENT ON COLUMN public.resources.vendor_contract_details IS 'Contract terms, warranty info, service agreements';
COMMENT ON COLUMN public.resources.vendor_support_contact IS 'Vendor support phone/email for maintenance';
COMMENT ON COLUMN public.resources.depreciation_rate IS 'Annual depreciation rate as percentage (0-100)';
COMMENT ON COLUMN public.resources.current_value IS 'Current calculated value after depreciation';
COMMENT ON COLUMN public.resources.disposal_date IS 'Planned or actual disposal/retirement date';

-- Create indexes for frequently queried fields
CREATE INDEX IF NOT EXISTS idx_resources_disposal_date ON public.resources(disposal_date) WHERE disposal_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_resources_vendor_city ON public.resources(vendor_city) WHERE vendor_city IS NOT NULL;
