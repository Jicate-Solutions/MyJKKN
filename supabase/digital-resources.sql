-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create sequence for digital resource IDs
CREATE SEQUENCE IF NOT EXISTS digital_resource_id_seq START 1;

-- Create digital_resource_categories table
CREATE TABLE public.digital_resource_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_name VARCHAR(100) NOT NULL,
    description TEXT,
    attributes TEXT[],
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Add indexes for digital_resource_categories
CREATE INDEX idx_digital_resource_categories_name ON public.digital_resource_categories(category_name);

-- Create digital_resources table
CREATE TABLE public.digital_resources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    digital_resource_id VARCHAR(50) UNIQUE,
    digital_resource_name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('e-book', 'journal', 'software', 'online-course', 'streaming-media', 'other')),
    category_id UUID REFERENCES public.digital_resource_categories(id),
    access_method VARCHAR(20) NOT NULL CHECK (access_method IN ('direct-download', 'web-portal', 'license-key', 'ip-restricted')),
    license_information JSONB,
    institution_id UUID NOT NULL REFERENCES public.institutions(id),
    department_id UUID REFERENCES public.departments(id),
    owner_type VARCHAR(20) NOT NULL CHECK (owner_type IN ('institution', 'department', 'program')),
    owner_id UUID NOT NULL,
    access_availability JSONB,
    sharing_restrictions TEXT[],
    maintenance_schedule JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create function to generate digital resource IDs
CREATE OR REPLACE FUNCTION generate_digital_resource_id()
RETURNS TRIGGER AS $$
DECLARE
    next_id INTEGER;
    formatted_id VARCHAR(50);
BEGIN
    -- Get the next ID from the sequence
    SELECT nextval('digital_resource_id_seq') INTO next_id;
    
    -- Format the ID as DG-RES-00001, DG-RES-00002, etc.
    formatted_id := 'DG-RES-' || LPAD(next_id::TEXT, 5, '0');
    
    -- Set the digital_resource_id field
    NEW.digital_resource_id := formatted_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically generate digital resource IDs
CREATE TRIGGER set_digital_resource_id
BEFORE INSERT ON public.digital_resources
FOR EACH ROW
WHEN (NEW.digital_resource_id IS NULL)
EXECUTE FUNCTION generate_digital_resource_id();

-- Add indexes for digital_resources
CREATE INDEX idx_digital_resources_name ON public.digital_resources(digital_resource_name);
CREATE INDEX idx_digital_resources_type ON public.digital_resources(type);
CREATE INDEX idx_digital_resources_category ON public.digital_resources(category_id);
CREATE INDEX idx_digital_resources_institution ON public.digital_resources(institution_id);
CREATE INDEX idx_digital_resources_department ON public.digital_resources(department_id);
CREATE INDEX idx_digital_resources_owner ON public.digital_resources(owner_type, owner_id);
CREATE INDEX idx_digital_resources_access_method ON public.digital_resources(access_method);

-- Create digital_sharing_policies table
CREATE TABLE public.digital_sharing_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID REFERENCES public.digital_resource_categories(id),
    institution_id UUID REFERENCES public.institutions(id),
    approval_required BOOLEAN DEFAULT true,
    max_concurrent_users INTEGER,
    advance_notice_required INTEGER, -- in hours
    pricing_model JSONB,
    access_window JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Add indexes for digital_sharing_policies
CREATE INDEX idx_digital_sharing_policies_category ON public.digital_sharing_policies(category_id);
CREATE INDEX idx_digital_sharing_policies_institution ON public.digital_sharing_policies(institution_id);

-- Create digital_reservations table
CREATE TABLE public.digital_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    digital_resource_id UUID NOT NULL REFERENCES public.digital_resources(id),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    title VARCHAR(100) NOT NULL,
    purpose TEXT,
    reservation_start TIMESTAMP WITH TIME ZONE NOT NULL,
    reservation_end TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'canceled', 'completed')) DEFAULT 'pending',
    license_key TEXT,
    approver_id UUID REFERENCES auth.users(id),
    approval_datetime TIMESTAMP WITH TIME ZONE,
    is_recurring BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Add indexes for digital_reservations
CREATE INDEX idx_digital_reservations_resource ON public.digital_reservations(digital_resource_id);
CREATE INDEX idx_digital_reservations_user ON public.digital_reservations(user_id);
CREATE INDEX idx_digital_reservations_status ON public.digital_reservations(status);
CREATE INDEX idx_digital_reservations_datetime ON public.digital_reservations(reservation_start, reservation_end);
CREATE INDEX idx_digital_reservations_approver ON public.digital_reservations(approver_id);

-- Create digital_resource_requests table
CREATE TABLE public.digital_resource_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(100) NOT NULL,
    description TEXT,
    requested_type VARCHAR(20) NOT NULL CHECK (requested_type IN ('e-book', 'journal', 'software', 'online-course', 'streaming-media', 'other')),
    requested_by UUID NOT NULL REFERENCES auth.users(id),
    institution_id UUID NOT NULL REFERENCES public.institutions(id),
    department_id UUID REFERENCES public.departments(id),
    justification TEXT,
    estimated_cost DECIMAL(10, 2),
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'purchased')) DEFAULT 'pending',
    priority VARCHAR(20) NOT NULL CHECK (priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
    approver_id UUID REFERENCES auth.users(id),
    approval_date TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Add indexes for digital_resource_requests
CREATE INDEX idx_digital_resource_requests_user ON public.digital_resource_requests(requested_by);
CREATE INDEX idx_digital_resource_requests_status ON public.digital_resource_requests(status);
CREATE INDEX idx_digital_resource_requests_institution ON public.digital_resource_requests(institution_id);
CREATE INDEX idx_digital_resource_requests_department ON public.digital_resource_requests(department_id);
CREATE INDEX idx_digital_resource_requests_priority ON public.digital_resource_requests(priority);

-- Create digital_resource_usage table
CREATE TABLE public.digital_resource_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    digital_resource_id UUID NOT NULL REFERENCES public.digital_resources(id),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    access_start TIMESTAMP WITH TIME ZONE NOT NULL,
    access_end TIMESTAMP WITH TIME ZONE,
    access_type VARCHAR(50),
    device_info JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Add indexes for digital_resource_usage
CREATE INDEX idx_digital_resource_usage_resource ON public.digital_resource_usage(digital_resource_id);
CREATE INDEX idx_digital_resource_usage_user ON public.digital_resource_usage(user_id);
CREATE INDEX idx_digital_resource_usage_datetime ON public.digital_resource_usage(access_start, access_end);

-- Create RLS policies for digital resources tables
ALTER TABLE public.digital_resource_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_sharing_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_resource_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_resource_usage ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to view active digital resources
CREATE POLICY "Authenticated users can view active digital resources"
ON public.digital_resources
FOR SELECT
TO authenticated
USING (is_active = true);

-- Create policy for administrators to insert digital resources
CREATE POLICY "Administrators can create digital resources"
ON public.digital_resources
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = ANY(ARRAY['administrator', 'super_admin'])
  )
);

-- Create policy for administrators to update digital resources
CREATE POLICY "Administrators can update digital resources"
ON public.digital_resources
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = ANY(ARRAY['administrator', 'super_admin'])
  )
);

-- Create policy for administrators to delete digital resources
CREATE POLICY "Administrators can delete digital resources"
ON public.digital_resources
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = ANY(ARRAY['administrator', 'super_admin'])
  )
);



-- Create policy for authenticated users to view their own reservations
CREATE POLICY "Users can view their own digital reservations"
ON public.digital_reservations
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Create policy for authenticated users to create reservations
CREATE POLICY "Users can create digital reservations"
ON public.digital_reservations
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Create policy for authenticated users to update their own reservations
CREATE POLICY "Users can update their own digital reservations"
ON public.digital_reservations
FOR UPDATE
TO authenticated
USING (user_id = auth.uid() AND status NOT IN ('approved', 'rejected', 'completed'));

-- Create policy for authenticated users to view digital resource categories
CREATE POLICY "Authenticated users can view digital resource categories"
ON public.digital_resource_categories
FOR SELECT
TO authenticated
USING (is_active = true);

-- Create triggers to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_digital_resource_categories_modtime
BEFORE UPDATE ON public.digital_resource_categories
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_digital_resources_modtime
BEFORE UPDATE ON public.digital_resources
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_digital_sharing_policies_modtime
BEFORE UPDATE ON public.digital_sharing_policies
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_digital_reservations_modtime
BEFORE UPDATE ON public.digital_reservations
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_digital_resource_requests_modtime
BEFORE UPDATE ON public.digital_resource_requests
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Create a users table in the public schema
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    email TEXT NOT NULL,
    full_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create index on users table
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_full_name ON public.users(full_name);

-- Enable RLS on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create policy for the users table
CREATE POLICY "Authenticated users can view user information"
ON public.users
FOR SELECT
TO authenticated
USING (true);

-- Grant access to the users table
GRANT SELECT ON public.users TO authenticated;

-- Create a function to sync auth.users with public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) 
  DO UPDATE SET 
    email = NEW.email,
    full_name = NEW.raw_user_meta_data->>'full_name',
    updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to sync users
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Sync existing users
INSERT INTO public.users (id, email, full_name)
SELECT 
  id,
  email,
  raw_user_meta_data->>'full_name'
FROM auth.users
ON CONFLICT (id) 
DO UPDATE SET 
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  updated_at = TIMEZONE('utc', NOW());

-- digital_resource_categories table policies
-- Add INSERT policy
CREATE POLICY "Enable insert for authenticated admin users"
ON public.digital_resource_categories
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = ANY(ARRAY['administrator', 'super_admin'])
  )
);

-- Add UPDATE policy
CREATE POLICY "Enable update for authenticated admin users"
ON public.digital_resource_categories
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = ANY(ARRAY['administrator', 'super_admin'])
  )
);

-- Add DELETE policy (though we're soft deleting with is_active=false)
CREATE POLICY "Enable delete for authenticated admin users"
ON public.digital_resource_categories
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = ANY(ARRAY['administrator', 'super_admin'])
  )
);