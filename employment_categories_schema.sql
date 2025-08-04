-- SQL script to create the employment_categories table and apply RLS policies

-- Create the employment_categories table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.employment_categories (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  category_name text NOT NULL,
  description text NULL,
  is_active boolean NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  created_by uuid NULL,
  updated_by uuid NULL,
  CONSTRAINT employment_categories_pkey PRIMARY KEY (id),
  CONSTRAINT employment_categories_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT employment_categories_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Add comments to the table and columns for better understanding
COMMENT ON TABLE public.employment_categories IS 'Stores categories for staff employment, such as ''Teaching'', ''Non-Teaching'', etc.';
COMMENT ON COLUMN public.employment_categories.category_name IS 'The name of the employment category.';
COMMENT ON COLUMN public.employment_categories.created_by IS 'Foreign key to the user who created the record.';
COMMENT ON COLUMN public.employment_categories.updated_by IS 'Foreign key to the user who last updated the record.';

-- Enable Row Level Security
ALTER TABLE public.employment_categories ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, to prevent errors on re-run
DROP POLICY IF EXISTS "Allow delete access to authorized users" ON public.employment_categories;
DROP POLICY IF EXISTS "Allow update access to authorized users" ON public.employment_categories;
DROP POLICY IF EXISTS "Allow insert access to authorized users" ON public.employment_categories;
DROP POLICY IF EXISTS "Allow read access to all authenticated users" ON public.employment_categories;


-- RLS Policies

-- 1. Allow read access to all authenticated users
CREATE POLICY "Allow read access to all authenticated users"
ON public.employment_categories
FOR SELECT
TO authenticated
USING (true);

-- 2. Allow insert access to authorized users
-- This policy allows users with 'staff.categories.create' permission or super admins to insert new categories.
CREATE POLICY "Allow insert access to authorized users"
ON public.employment_categories
FOR INSERT
WITH CHECK (
  (
    get_my_claim('permissions'::text)::jsonb -> 'staff'::text -> 'categories'::text ->> 'create'::text
  ) = 'true'::text
  OR get_my_claim('is_super_admin')::boolean = true
);

-- 3. Allow update access to authorized users
-- This policy allows users with 'staff.categories.edit' permission or super admins to update categories.
CREATE POLICY "Allow update access to authorized users"
ON public.employment_categories
FOR UPDATE
USING (
  (
    get_my_claim('permissions'::text)::jsonb -> 'staff'::text -> 'categories'::text ->> 'edit'::text
  ) = 'true'::text
  OR get_my_claim('is_super_admin')::boolean = true
)
WITH CHECK (
  (
    get_my_claim('permissions'::text)::jsonb -> 'staff'::text -> 'categories'::text ->> 'edit'::text
  ) = 'true'::text
  OR get_my_claim('is_super_admin')::boolean = true
);


-- 4. Allow delete access to authorized users
-- This policy allows users with 'staff.categories.delete' permission or super admins to delete categories.
CREATE POLICY "Allow delete access to authorized users"
ON public.employment_categories
FOR DELETE
USING (
  (
    get_my_claim('permissions'::text)::jsonb -> 'staff'::text -> 'categories'::text ->> 'delete'::text
  ) = 'true'::text
  OR get_my_claim('is_super_admin')::boolean = true
);

-- Function to set created_by and updated_by user IDs automatically
CREATE OR REPLACE FUNCTION set_audit_user_ids()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    NEW.created_by := auth.uid();
    NEW.updated_by := auth.uid();
  ELSIF (TG_OP = 'UPDATE') THEN
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger to avoid conflicts
DROP TRIGGER IF EXISTS set_employment_categories_audit_user_ids ON public.employment_categories;

-- Trigger to call the function before insert or update
CREATE TRIGGER set_employment_categories_audit_user_ids
BEFORE INSERT OR UPDATE ON public.employment_categories
FOR EACH ROW
EXECUTE FUNCTION set_audit_user_ids();
