-- Create Students Table
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id UUID REFERENCES public.admissions(id),
  student_name TEXT NOT NULL,
  father_name TEXT NOT NULL,
  father_occupation TEXT,
  father_mobile TEXT,
  mother_name TEXT NOT NULL,
  mother_occupation TEXT,
  mother_mobile TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  gender TEXT NOT NULL,
  religion TEXT NOT NULL,
  community TEXT NOT NULL,
  caste TEXT,
  annual_income TEXT,
  last_school TEXT NOT NULL,
  board_of_study TEXT NOT NULL,
  tenth_marks JSONB NOT NULL,
  twelfth_marks JSONB NOT NULL,
  medical_cutoff_marks TEXT,
  engineering_cutoff_marks TEXT,
  neet_roll_number TEXT,
  counseling_applied BOOLEAN DEFAULT FALSE,
  counseling_number TEXT,
  first_graduate BOOLEAN DEFAULT FALSE,
  quota TEXT,
  category TEXT,
  institution_id UUID REFERENCES public.institutions(id),
  degree_id UUID REFERENCES public.degrees(id),
  department_id UUID REFERENCES public.departments(id),
  program_id UUID REFERENCES public.programs(id),
  entry_type TEXT NOT NULL,
  permanent_address_street TEXT,
  permanent_address_taluk TEXT,
  permanent_address_district TEXT,
  permanent_address_pin_code TEXT,
  permanent_address_state TEXT,
  student_mobile TEXT,
  student_email TEXT,
  accommodation_type TEXT,
  hostel_type TEXT,
  bus_required BOOLEAN DEFAULT FALSE,
  bus_route TEXT,
  bus_pickup_location TEXT,
  reference_type TEXT,
  reference_name TEXT,
  reference_contact TEXT,
  
  -- Additional student fields
  roll_number TEXT,
  student_photo_url TEXT,
  college_email TEXT,
  is_profile_complete BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  status public.student_status DEFAULT 'active'
);

-- Create index on admission_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_students_admission_id ON public.students(admission_id);

-- Create index on student_name for faster searches
CREATE INDEX IF NOT EXISTS idx_students_student_name ON public.students(student_name);

-- Create index on roll_number for faster searches
CREATE INDEX IF NOT EXISTS idx_students_roll_number ON public.students(roll_number);

-- Create index on is_profile_complete for filtering
CREATE INDEX IF NOT EXISTS idx_students_is_profile_complete ON public.students(is_profile_complete);

-- Create index on status for faster filtering
CREATE INDEX IF NOT EXISTS idx_students_status ON public.students(status);

-- Create RLS policies for students table
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- Policy for all authenticated users to select
CREATE POLICY "Authenticated users can view students"
  ON public.students FOR SELECT
  TO authenticated
  USING (true);

-- Policy for all authenticated users to insert 
CREATE POLICY "Authenticated users can insert students"
  ON public.students FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy for authenticated users to update their own records
CREATE POLICY "Authenticated users can update their own students"
  ON public.students FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- Policy for authenticated users to delete their own records
CREATE POLICY "Authenticated users can delete their own students"
  ON public.students FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);


-- Add comments for better documentation
COMMENT ON TABLE public.students IS 'Stores student information for enrolled students';
COMMENT ON COLUMN public.students.admission_id IS 'Reference to the original admission record';
COMMENT ON COLUMN public.students.roll_number IS 'Student roll number assigned by the institution';
COMMENT ON COLUMN public.students.student_photo_url IS 'URL to the student photo in storage';
COMMENT ON COLUMN public.students.college_email IS 'Official college email address assigned to the student';
COMMENT ON COLUMN public.students.is_profile_complete IS 'Indicates if all required student information has been filled';
COMMENT ON COLUMN public.students.status IS 'Current status of the student';

-- Create enum type for student status
CREATE TYPE public.student_status AS ENUM ('active', 'inactive', 'exited', 'graduated');
COMMENT ON TYPE public.student_status IS 'Enum type for student status: active, inactive, exited, graduated';

-- Add status column to students table
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS status public.student_status DEFAULT 'active';
COMMENT ON COLUMN public.students.status IS 'Current status of the student';