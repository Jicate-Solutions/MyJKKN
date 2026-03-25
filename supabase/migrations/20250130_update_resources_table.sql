-- Migration: Update resources table to match new schema
-- Date: 2025-01-30
-- Description: Add missing columns and update existing columns for resource management module

-- First, drop the old resources table if it exists (backup data first if needed)
-- DROP TABLE IF EXISTS public.resources CASCADE;

-- Add new columns to existing resources table
ALTER TABLE public.resources
  -- Rename columns to match new schema
  ADD COLUMN IF NOT EXISTS name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS subcategory_id UUID,
  ADD COLUMN IF NOT EXISTS building_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS block_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS floor_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS room_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS location_notes TEXT,
  ADD COLUMN IF NOT EXISTS vendor_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS vendor_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS vendor_mobile VARCHAR(20),
  ADD COLUMN IF NOT EXISTS vendor_address TEXT,
  ADD COLUMN IF NOT EXISTS initial_stock_quantity INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_stock_quantity INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS caretaker_user_ids TEXT[], -- Array of staff IDs
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS booking_type VARCHAR(50) DEFAULT 'reservation',
  ADD COLUMN IF NOT EXISTS booking_config JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS approval_config JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reminder_config JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS access_roles TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reservation_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by_user UUID,
  ADD COLUMN IF NOT EXISTS updated_by_user UUID;

-- Update existing columns (if they need modification)
-- ALTER TABLE public.resources ALTER COLUMN resource_name TYPE VARCHAR(200);
-- ALTER TABLE public.resources RENAME COLUMN resource_name TO name;
-- ALTER TABLE public.resources RENAME COLUMN sub_category_id TO subcategory_id;

-- Add comments for documentation
COMMENT ON COLUMN public.resources.caretaker_user_ids IS 'Array of staff IDs who are responsible for this resource';
COMMENT ON COLUMN public.resources.booking_config IS 'JSON configuration for booking settings';
COMMENT ON COLUMN public.resources.approval_config IS 'JSON configuration for approval workflow';
COMMENT ON COLUMN public.resources.reminder_config IS 'JSON configuration for reminders';
COMMENT ON COLUMN public.resources.access_roles IS 'Array of roles that can access this resource';
COMMENT ON COLUMN public.resources.image_urls IS 'Array of image URLs for this resource';
COMMENT ON COLUMN public.resources.tags IS 'Array of tags for categorization';

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_resources_institution_id ON public.resources(institution_id);
CREATE INDEX IF NOT EXISTS idx_resources_parent_category_id ON public.resources(parent_category_id);
CREATE INDEX IF NOT EXISTS idx_resources_subcategory_id ON public.resources(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_resources_status ON public.resources(status);
CREATE INDEX IF NOT EXISTS idx_resources_caretaker_user_ids ON public.resources USING GIN(caretaker_user_ids);
CREATE INDEX IF NOT EXISTS idx_resources_tags ON public.resources USING GIN(tags);

-- Add foreign key constraints (if not already present)
-- ALTER TABLE public.resources
--   ADD CONSTRAINT fk_resources_subcategory 
--   FOREIGN KEY (subcategory_id) 
--   REFERENCES public.resource_sub_categories(id) 
--   ON DELETE RESTRICT;
