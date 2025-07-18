-- Create the admissions table
CREATE TABLE public.admissions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name TEXT NOT NULL,
  last_name TEXT DEFAULT '',
  father_name TEXT NOT NULL,
    father_occupation TEXT,
    father_mobile TEXT NOT NULL,
    mother_name TEXT NOT NULL,
    mother_occupation TEXT,
    mother_mobile TEXT NOT NULL,
    date_of_birth TEXT NOT NULL,
    gender TEXT NOT NULL,
    religion TEXT NOT NULL,
    community TEXT NOT NULL,
    caste TEXT,
    annual_income TEXT,
    
    -- Academic information
    last_school TEXT NOT NULL,
    board_of_study TEXT NOT NULL,
    tenth_marks JSONB NOT NULL, -- { max_marks, obtained_marks, percentage }
    twelfth_marks JSONB NOT NULL, -- { group, max_marks, obtained_marks, percentage, subjects }
    medical_cutoff_marks TEXT,
    engineering_cutoff_marks TEXT,
    neet_roll_number TEXT,
    counseling_applied BOOLEAN DEFAULT FALSE,
    counseling_number TEXT,
    first_graduate BOOLEAN DEFAULT FALSE,
    
    -- Course selection
    quota TEXT,
    category TEXT,
    entry_type TEXT NOT NULL, -- FIRST YEAR, LATERAL ENTRY, etc.
    
    
    -- Contact details
    permanent_address_street TEXT NOT NULL,
    permanent_address_taluk TEXT,
    permanent_address_district TEXT NOT NULL,
    permanent_address_pin_code TEXT NOT NULL,
    permanent_address_state TEXT NOT NULL,
    student_mobile TEXT NOT NULL,
    student_email TEXT NOT NULL,
    
    -- Accommodation preferences
    accommodation_type TEXT NOT NULL,
    hostel_type TEXT,
    bus_required BOOLEAN DEFAULT FALSE,
    bus_route TEXT,
    bus_pickup_location TEXT,
    reference_type TEXT,
    reference_name TEXT,
    reference_contact TEXT,
    
    -- Status and metadata
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create indexes for performance
CREATE INDEX idx_admissions_first_name ON public.admissions(first_name);
CREATE INDEX idx_admissions_last_name ON public.admissions(last_name);
CREATE INDEX idx_admissions_status ON public.admissions(status);
CREATE INDEX idx_admissions_student_mobile ON public.admissions(student_mobile);
CREATE INDEX idx_admissions_student_email ON public.admissions(student_email);
CREATE INDEX idx_admissions_created_at ON public.admissions(created_at);

-- Create updated_at trigger function if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_updated_at') THEN
        CREATE OR REPLACE FUNCTION public.handle_updated_at()
        RETURNS TRIGGER AS $func$
        BEGIN
            NEW.updated_at = TIMEZONE('utc', NOW());
            RETURN NEW;
        END;
        $func$ LANGUAGE plpgsql;
    END IF;
END
$$;

-- Create trigger for admissions updated_at
CREATE TRIGGER set_admissions_updated_at
BEFORE UPDATE ON public.admissions
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Add RLS policies
ALTER TABLE public.admissions ENABLE ROW LEVEL SECURITY;

-- Create policy for read access (all authenticated users can view)
CREATE POLICY "Enable read access for authenticated users" ON public.admissions
    FOR SELECT
    TO authenticated
    USING (true);

-- Create policy for insert (all authenticated users can create)
CREATE POLICY "Enable insert for authenticated users" ON public.admissions
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Create policy for update (admins and admissions staff can update anyone, users can update their own)
CREATE POLICY "Enable update for admissions staff and record owners" ON public.admissions
    FOR UPDATE
    TO authenticated
    USING (
        auth.uid() = created_by OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrator', 'super_admin', 'admissions_staff')
        )
    );

-- Create policy for delete (only admins can delete)
CREATE POLICY "Enable delete for administrators" ON public.admissions
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrator', 'super_admin')
        )
    );

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admissions TO authenticated; 