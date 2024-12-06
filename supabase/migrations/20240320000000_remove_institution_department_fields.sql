-- Remove institution and department columns from profiles table
ALTER TABLE profiles 
DROP COLUMN IF EXISTS institution,
DROP COLUMN IF EXISTS department; 

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create degrees table
CREATE TABLE public.degrees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    degree_id VARCHAR(20) NOT NULL,
    degree_name VARCHAR(100) NOT NULL,
    degree_type VARCHAR(10) NOT NULL CHECK (degree_type IN ('ug', 'pg')),
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Add indexes
CREATE INDEX idx_degrees_institution_id ON public.degrees(institution_id);
CREATE INDEX idx_degrees_degree_id ON public.degrees(degree_id);
CREATE INDEX idx_degrees_degree_type ON public.degrees(degree_type);

-- Add RLS policies
ALTER TABLE public.degrees ENABLE ROW LEVEL SECURITY;

-- Policies for degrees table
CREATE POLICY "Enable read access for authenticated users" ON public.degrees
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Enable insert for authenticated admin users" ON public.degrees
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrator', 'super_admin')
        )
    );

CREATE POLICY "Enable update for authenticated admin users" ON public.degrees
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrator', 'super_admin')
        )
    );

CREATE POLICY "Enable delete for authenticated admin users" ON public.degrees
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrator', 'super_admin')
        )
    );