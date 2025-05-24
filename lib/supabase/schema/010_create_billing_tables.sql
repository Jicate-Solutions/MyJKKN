-- lib/supabase/schema/010_create_billing_tables.sql

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create billing_parent_categories table
CREATE TABLE IF NOT EXISTS public.billing_parent_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID NOT NULL,
  parent_category_name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  
  -- Foreign key constraints
  CONSTRAINT fk_billing_parent_categories_institution 
    FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_billing_parent_categories_created_by 
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT fk_billing_parent_categories_updated_by 
    FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL,
    
  -- Unique constraint: parent category name must be unique within each institution
  CONSTRAINT uk_billing_parent_categories_institution_name 
    UNIQUE (institution_id, parent_category_name)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_billing_parent_categories_institution_id 
  ON public.billing_parent_categories(institution_id);

CREATE INDEX IF NOT EXISTS idx_billing_parent_categories_is_active 
  ON public.billing_parent_categories(is_active);

CREATE INDEX IF NOT EXISTS idx_billing_parent_categories_parent_category_name 
  ON public.billing_parent_categories(parent_category_name);

-- Create trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_billing_parent_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_billing_parent_categories_updated_at
  BEFORE UPDATE ON public.billing_parent_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_billing_parent_categories_updated_at();

-- Row Level Security (RLS) policies
ALTER TABLE public.billing_parent_categories ENABLE ROW LEVEL SECURITY;

-- Policy for viewing billing parent categories
CREATE POLICY "Users can view billing parent categories" 
  ON public.billing_parent_categories FOR SELECT 
  USING (true);

-- Policy for creating billing parent categories
CREATE POLICY "Authenticated users can create billing parent categories" 
  ON public.billing_parent_categories FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

-- Policy for updating billing parent categories
CREATE POLICY "Users can update billing parent categories" 
  ON public.billing_parent_categories FOR UPDATE 
  USING (auth.role() = 'authenticated');

-- Policy for deleting billing parent categories
CREATE POLICY "Users can delete billing parent categories" 
  ON public.billing_parent_categories FOR DELETE 
  USING (auth.role() = 'authenticated');

-- Grant permissions
GRANT ALL ON public.billing_parent_categories TO authenticated;
GRANT SELECT ON public.billing_parent_categories TO anon;

-- Create billing_sub_categories table
CREATE TABLE IF NOT EXISTS public.billing_sub_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID NOT NULL,
  parent_category_id UUID NOT NULL,
  sub_category_name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  
  -- Foreign key constraints
  CONSTRAINT fk_billing_sub_categories_institution 
    FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_billing_sub_categories_parent_category 
    FOREIGN KEY (parent_category_id) REFERENCES public.billing_parent_categories(id) ON DELETE CASCADE,
  CONSTRAINT fk_billing_sub_categories_created_by 
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT fk_billing_sub_categories_updated_by 
    FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL,
    
  -- Unique constraint: sub category name must be unique within each parent category
  CONSTRAINT uk_billing_sub_categories_parent_name 
    UNIQUE (parent_category_id, sub_category_name)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_billing_sub_categories_institution_id 
  ON public.billing_sub_categories(institution_id);

CREATE INDEX IF NOT EXISTS idx_billing_sub_categories_parent_category_id 
  ON public.billing_sub_categories(parent_category_id);

CREATE INDEX IF NOT EXISTS idx_billing_sub_categories_is_active 
  ON public.billing_sub_categories(is_active);

CREATE INDEX IF NOT EXISTS idx_billing_sub_categories_sub_category_name 
  ON public.billing_sub_categories(sub_category_name);

-- Create trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_billing_sub_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_billing_sub_categories_updated_at
  BEFORE UPDATE ON public.billing_sub_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_billing_sub_categories_updated_at();

-- Row Level Security (RLS) policies
ALTER TABLE public.billing_sub_categories ENABLE ROW LEVEL SECURITY;

-- Policy for viewing billing sub categories
CREATE POLICY "Users can view billing sub categories" 
  ON public.billing_sub_categories FOR SELECT 
  USING (true);

-- Policy for creating billing sub categories
CREATE POLICY "Authenticated users can create billing sub categories" 
  ON public.billing_sub_categories FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

-- Policy for updating billing sub categories
CREATE POLICY "Users can update billing sub categories" 
  ON public.billing_sub_categories FOR UPDATE 
  USING (auth.role() = 'authenticated');

-- Policy for deleting billing sub categories
CREATE POLICY "Users can delete billing sub categories" 
  ON public.billing_sub_categories FOR DELETE 
  USING (auth.role() = 'authenticated');

-- Grant permissions
GRANT ALL ON public.billing_sub_categories TO authenticated;
GRANT SELECT ON public.billing_sub_categories TO anon;

-- Create billing_item_categories table
CREATE TABLE IF NOT EXISTS public.billing_item_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID NOT NULL,
  parent_category_id UUID NOT NULL,
  sub_category_id UUID NOT NULL,
  item_category_name VARCHAR(150) NOT NULL,
  amount DECIMAL(10,2),
  frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('monthly', 'quarterly', 'yearly', 'one-time')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  
  -- Foreign key constraints
  CONSTRAINT fk_billing_item_categories_institution 
    FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_billing_item_categories_parent_category 
    FOREIGN KEY (parent_category_id) REFERENCES public.billing_parent_categories(id) ON DELETE CASCADE,
  CONSTRAINT fk_billing_item_categories_sub_category 
    FOREIGN KEY (sub_category_id) REFERENCES public.billing_sub_categories(id) ON DELETE CASCADE,
  CONSTRAINT fk_billing_item_categories_created_by 
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT fk_billing_item_categories_updated_by 
    FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL,
    
  -- Unique constraint: item category name must be unique within each sub category
  CONSTRAINT uk_billing_item_categories_sub_name 
    UNIQUE (sub_category_id, item_category_name),
    
  -- Check constraints
  CONSTRAINT chk_billing_item_categories_amount_positive 
    CHECK (amount IS NULL OR amount > 0)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_billing_item_categories_institution_id 
  ON public.billing_item_categories(institution_id);

CREATE INDEX IF NOT EXISTS idx_billing_item_categories_parent_category_id 
  ON public.billing_item_categories(parent_category_id);

CREATE INDEX IF NOT EXISTS idx_billing_item_categories_sub_category_id 
  ON public.billing_item_categories(sub_category_id);

CREATE INDEX IF NOT EXISTS idx_billing_item_categories_is_active 
  ON public.billing_item_categories(is_active);

CREATE INDEX IF NOT EXISTS idx_billing_item_categories_frequency 
  ON public.billing_item_categories(frequency);


-- Create trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_billing_item_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_billing_item_categories_updated_at
  BEFORE UPDATE ON public.billing_item_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_billing_item_categories_updated_at();

-- Row Level Security (RLS) policies
ALTER TABLE public.billing_item_categories ENABLE ROW LEVEL SECURITY;

-- Policy for viewing billing item categories
CREATE POLICY "Users can view billing item categories" 
  ON public.billing_item_categories FOR SELECT 
  USING (true);

-- Policy for creating billing item categories
CREATE POLICY "Authenticated users can create billing item categories" 
  ON public.billing_item_categories FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

-- Policy for updating billing item categories
CREATE POLICY "Users can update billing item categories" 
  ON public.billing_item_categories FOR UPDATE 
  USING (auth.role() = 'authenticated');

-- Policy for deleting billing item categories
CREATE POLICY "Users can delete billing item categories" 
  ON public.billing_item_categories FOR DELETE 
  USING (auth.role() = 'authenticated');

-- Grant permissions
GRANT ALL ON public.billing_item_categories TO authenticated;
GRANT SELECT ON public.billing_item_categories TO anon; 