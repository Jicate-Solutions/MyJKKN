-- SQL script for Admissions Module

-- Drop existing policies if they exist to prevent errors on re-run
DROP POLICY IF EXISTS "Admin users can delete admissions" ON public.admissions;
DROP POLICY IF EXISTS "Admin users can insert admissions" ON public.admissions;
DROP POLICY IF EXISTS "Admin users can update admissions" ON public.admissions;
DROP POLICY IF EXISTS "Admin users can view all admissions" ON public.admissions;
DROP POLICY IF EXISTS "Faculty users can delete institution admissions" ON public.admissions;
DROP POLICY IF EXISTS "Faculty users can insert institution admissions" ON public.admissions;
DROP POLICY IF EXISTS "Faculty users can update institution admissions" ON public.admissions;
DROP POLICY IF EXISTS "Faculty users can view institution admissions" ON public.admissions;

-- Create admissions table
CREATE TABLE IF NOT EXISTS public.admissions (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    father_name text NOT NULL,
    father_occupation text NULL,
    father_mobile text NOT NULL,
    mother_name text NOT NULL,
    mother_occupation text NULL,
    mother_mobile text NOT NULL,
    date_of_birth text NOT NULL,
    gender text NOT NULL,
    religion text NOT NULL,
    community text NOT NULL,
    caste text NULL,
    annual_income text NULL,
    last_school text NOT NULL,
    board_of_study text NOT NULL,
    tenth_marks jsonb NOT NULL,
    twelfth_marks jsonb NOT NULL,
    medical_cutoff_marks text NULL,
    engineering_cutoff_marks text NULL,
    neet_roll_number text NULL,
    counseling_applied boolean NULL DEFAULT false,
    counseling_number text NULL,
    first_graduate boolean NULL DEFAULT false,
    quota text NULL,
    category text NULL,
    entry_type text NOT NULL,
    permanent_address_street text NOT NULL,
    permanent_address_taluk text NULL,
    permanent_address_district text NOT NULL,
    permanent_address_pin_code text NOT NULL,
    permanent_address_state text NOT NULL,
    student_mobile text NOT NULL,
    student_email text NOT NULL,
    accommodation_type text NOT NULL,
    hostel_type text NULL,
    bus_required boolean NULL DEFAULT false,
    bus_route text NULL,
    bus_pickup_location text NULL,
    reference_type text NULL,
    reference_name text NULL,
    reference_contact text NULL,
    status text NOT NULL DEFAULT 'pending'::text,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    created_by uuid NULL,
    updated_by uuid NULL,
    degree_id uuid NULL,
    department_id uuid NULL,
    program_id uuid NULL,
    institution_id uuid NULL,
    first_name text NOT NULL,
    last_name text NULL DEFAULT ''::text,
    application_id text NULL,
    CONSTRAINT admissions_pkey PRIMARY KEY (id),
    CONSTRAINT admissions_application_id_key UNIQUE (application_id),
    CONSTRAINT admissions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
    CONSTRAINT admissions_degree_id_fkey FOREIGN KEY (degree_id) REFERENCES degrees(id),
    CONSTRAINT admissions_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id),
    CONSTRAINT admissions_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES institutions(id),
    CONSTRAINT admissions_program_id_fkey FOREIGN KEY (program_id) REFERENCES programs(id),
    CONSTRAINT admissions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id)
);

-- Enable Row Level Security
ALTER TABLE public.admissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Admissions

-- Admin Policies
CREATE POLICY "Admin users can delete admissions" ON public.admissions FOR DELETE USING (
    EXISTS (
        SELECT 1
        FROM profiles
        WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])
    )
);

CREATE POLICY "Admin users can insert admissions" ON public.admissions FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1
        FROM profiles
        WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])
    )
);

CREATE POLICY "Admin users can update admissions" ON public.admissions FOR UPDATE USING (
    EXISTS (
        SELECT 1
        FROM profiles
        WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])
    )
) WITH CHECK (
    EXISTS (
        SELECT 1
        FROM profiles
        WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])
    )
);

CREATE POLICY "Admin users can view all admissions" ON public.admissions FOR SELECT USING (
    EXISTS (
        SELECT 1
        FROM profiles
        WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])
    )
);

-- Faculty Policies
CREATE POLICY "Faculty users can delete institution admissions" ON public.admissions FOR DELETE USING (
    EXISTS (
        SELECT 1
        FROM profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'faculty'::text AND profiles.institution_id = admissions.institution_id
    )
);

CREATE POLICY "Faculty users can insert institution admissions" ON public.admissions FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1
        FROM profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'faculty'::text AND profiles.institution_id = admissions.institution_id
    )
);

CREATE POLICY "Faculty users can update institution admissions" ON public.admissions FOR UPDATE USING (
    EXISTS (
        SELECT 1
        FROM profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'faculty'::text AND profiles.institution_id = admissions.institution_id
    )
) WITH CHECK (
    EXISTS (
        SELECT 1
        FROM profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'faculty'::text AND profiles.institution_id = admissions.institution_id
    )
);

CREATE POLICY "Faculty users can view institution admissions" ON public.admissions FOR SELECT USING (
    EXISTS (
        SELECT 1
        FROM profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'faculty'::text AND profiles.institution_id = admissions.institution_id
    )
);

-- Trigger for audit fields
DROP TRIGGER IF EXISTS set_admissions_audit_user_ids ON public.admissions;

CREATE TRIGGER set_admissions_audit_user_ids
BEFORE INSERT OR UPDATE ON public.admissions
FOR EACH ROW
EXECUTE FUNCTION set_audit_user_ids();
