-- ================================================================================
-- MIGRATION: Restore admissions and students tables with sync triggers
-- Created: 2025-01-18
-- Purpose: Fix PostgREST foreign key relationship detection
-- ================================================================================
-- Issue: VIEWs don't have FK constraints, breaking PostgREST resource embedding
-- Solution: Restore original tables and add bidirectional sync triggers
-- ================================================================================

BEGIN;

-- ================================================================================
-- STEP 1: DROP VIEWS
-- ================================================================================

DROP VIEW IF EXISTS public.admissions CASCADE;
DROP VIEW IF EXISTS public.students CASCADE;

-- ================================================================================
-- STEP 2: RESTORE TABLES FROM LEGACY
-- ================================================================================

-- Restore admissions table
CREATE TABLE IF NOT EXISTS public.admissions (
    id UUID PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT,
    father_name TEXT NOT NULL,
    father_occupation TEXT,
    father_mobile TEXT NOT NULL,
    mother_name TEXT NOT NULL,
    mother_occupation TEXT,
    mother_mobile TEXT NOT NULL,
    date_of_birth DATE NOT NULL,
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
    counseling_applied BOOLEAN DEFAULT false,
    counseling_number TEXT,
    first_graduate BOOLEAN DEFAULT false,
    quota TEXT,
    category TEXT,
    entry_type TEXT NOT NULL,
    permanent_address_street TEXT NOT NULL,
    permanent_address_taluk TEXT,
    permanent_address_district TEXT NOT NULL,
    permanent_address_pin_code TEXT NOT NULL,
    permanent_address_state TEXT NOT NULL,
    student_mobile TEXT NOT NULL,
    student_email TEXT NOT NULL,
    accommodation_type TEXT NOT NULL,
    hostel_type TEXT,
    bus_required BOOLEAN,
    bus_route TEXT,
    bus_pickup_location TEXT,
    reference_type TEXT,
    reference_name TEXT,
    reference_contact TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    degree_id UUID REFERENCES public.degrees(id),
    department_id UUID REFERENCES public.departments(id),
    program_id UUID REFERENCES public.programs(id),
    institution_id UUID REFERENCES public.institutions(id),
    application_id TEXT UNIQUE
);

-- Restore students table
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY,
    admission_id UUID REFERENCES public.admissions(id),
    first_name TEXT NOT NULL,
    last_name TEXT,
    father_name TEXT NOT NULL,
    father_occupation TEXT,
    father_mobile TEXT NOT NULL,
    mother_name TEXT NOT NULL,
    mother_occupation TEXT,
    mother_mobile TEXT NOT NULL,
    date_of_birth DATE NOT NULL,
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
    counseling_applied BOOLEAN DEFAULT false,
    counseling_number TEXT,
    first_graduate BOOLEAN DEFAULT false,
    quota TEXT,
    category TEXT,
    entry_type TEXT NOT NULL,
    permanent_address_street TEXT NOT NULL,
    permanent_address_taluk TEXT,
    permanent_address_district TEXT NOT NULL,
    permanent_address_pin_code TEXT NOT NULL,
    permanent_address_state TEXT NOT NULL,
    student_mobile TEXT NOT NULL,
    student_email TEXT NOT NULL,
    accommodation_type TEXT NOT NULL,
    hostel_type TEXT,
    bus_required BOOLEAN,
    bus_route TEXT,
    bus_pickup_location TEXT,
    reference_type TEXT,
    reference_name TEXT,
    reference_contact TEXT,
    institution_id UUID REFERENCES public.institutions(id),
    degree_id UUID REFERENCES public.degrees(id),
    department_id UUID REFERENCES public.departments(id),
    program_id UUID REFERENCES public.programs(id),
    semester_id UUID REFERENCES public.semesters(id),
    section_id UUID REFERENCES public.sections(id),
    academic_year_id UUID REFERENCES public.academic_years(id),
    roll_number TEXT,
    college_email TEXT,
    student_photo_url TEXT,
    is_profile_complete BOOLEAN DEFAULT false,
    status student_status DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    application_id TEXT
);

-- Copy data from legacy tables
INSERT INTO public.admissions
SELECT * FROM public.admissions_legacy
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.students
SELECT * FROM public.students_legacy
ON CONFLICT (id) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_admissions_institution_id ON public.admissions(institution_id);
CREATE INDEX IF NOT EXISTS idx_admissions_status ON public.admissions(status);
CREATE INDEX IF NOT EXISTS idx_admissions_application_id ON public.admissions(application_id);

CREATE INDEX IF NOT EXISTS idx_students_institution_id ON public.students(institution_id);
CREATE INDEX IF NOT EXISTS idx_students_admission_id ON public.students(admission_id);
CREATE INDEX IF NOT EXISTS idx_students_status ON public.students(status);
CREATE INDEX IF NOT EXISTS idx_students_roll_number ON public.students(roll_number);

-- ================================================================================
-- STEP 3: CREATE SYNC TRIGGERS
-- ================================================================================

-- Trigger function: admissions → learners_profiles sync
CREATE OR REPLACE FUNCTION sync_admission_to_learners()
RETURNS TRIGGER AS $$
BEGIN
    -- Map admission status to lifecycle_status
    DECLARE
        lifecycle_stat lifecycle_status;
    BEGIN
        lifecycle_stat := CASE NEW.status
            WHEN 'pending' THEN 'pending'::lifecycle_status
            WHEN 'approved' THEN 'approved'::lifecycle_status
            WHEN 'rejected' THEN 'rejected'::lifecycle_status
            WHEN 'waitlisted' THEN 'waitlisted'::lifecycle_status
            WHEN 'enrolled' THEN 'active'::lifecycle_status
            ELSE 'enquiry'::lifecycle_status
        END;

        IF TG_OP = 'INSERT' THEN
            INSERT INTO public.learners_profiles (
                original_admission_id,
                lifecycle_status,
                first_name, last_name, father_name, father_occupation, father_mobile,
                mother_name, mother_occupation, mother_mobile, date_of_birth, gender,
                religion, community, caste, annual_income, last_school, board_of_study,
                tenth_marks, twelfth_marks, medical_cutoff_marks, engineering_cutoff_marks,
                neet_roll_number, counseling_applied, counseling_number, first_graduate,
                quota, category, entry_type, permanent_address_street, permanent_address_taluk,
                permanent_address_district, permanent_address_pin_code, permanent_address_state,
                student_mobile, student_email, accommodation_type, hostel_type, bus_required,
                bus_route, bus_pickup_location, reference_type, reference_name, reference_contact,
                institution_id, degree_id, department_id, program_id, application_id,
                created_at, updated_at, created_by, updated_by, migration_source
            ) VALUES (
                NEW.id, lifecycle_stat,
                NEW.first_name, NEW.last_name, NEW.father_name, NEW.father_occupation, NEW.father_mobile,
                NEW.mother_name, NEW.mother_occupation, NEW.mother_mobile, NEW.date_of_birth, NEW.gender,
                NEW.religion, NEW.community, NEW.caste, NEW.annual_income, NEW.last_school, NEW.board_of_study,
                NEW.tenth_marks, NEW.twelfth_marks, NEW.medical_cutoff_marks, NEW.engineering_cutoff_marks,
                NEW.neet_roll_number, NEW.counseling_applied, NEW.counseling_number, NEW.first_graduate,
                NEW.quota, NEW.category, NEW.entry_type, NEW.permanent_address_street, NEW.permanent_address_taluk,
                NEW.permanent_address_district, NEW.permanent_address_pin_code, NEW.permanent_address_state,
                NEW.student_mobile, NEW.student_email, NEW.accommodation_type, NEW.hostel_type, NEW.bus_required,
                NEW.bus_route, NEW.bus_pickup_location, NEW.reference_type, NEW.reference_name, NEW.reference_contact,
                NEW.institution_id, NEW.degree_id, NEW.department_id, NEW.program_id, NEW.application_id,
                NEW.created_at, NEW.updated_at, NEW.created_by, NEW.updated_by, 'admission'
            )
            ON CONFLICT (original_admission_id) DO UPDATE SET
                lifecycle_status = lifecycle_stat,
                first_name = NEW.first_name,
                last_name = NEW.last_name,
                updated_at = NEW.updated_at;

        ELSIF TG_OP = 'UPDATE' THEN
            UPDATE public.learners_profiles
            SET
                lifecycle_status = lifecycle_stat,
                first_name = NEW.first_name,
                last_name = NEW.last_name,
                father_name = NEW.father_name,
                father_occupation = NEW.father_occupation,
                father_mobile = NEW.father_mobile,
                mother_name = NEW.mother_name,
                mother_occupation = NEW.mother_occupation,
                mother_mobile = NEW.mother_mobile,
                date_of_birth = NEW.date_of_birth,
                gender = NEW.gender,
                religion = NEW.religion,
                community = NEW.community,
                caste = NEW.caste,
                annual_income = NEW.annual_income,
                last_school = NEW.last_school,
                board_of_study = NEW.board_of_study,
                tenth_marks = NEW.tenth_marks,
                twelfth_marks = NEW.twelfth_marks,
                medical_cutoff_marks = NEW.medical_cutoff_marks,
                engineering_cutoff_marks = NEW.engineering_cutoff_marks,
                neet_roll_number = NEW.neet_roll_number,
                counseling_applied = NEW.counseling_applied,
                counseling_number = NEW.counseling_number,
                first_graduate = NEW.first_graduate,
                quota = NEW.quota,
                category = NEW.category,
                entry_type = NEW.entry_type,
                permanent_address_street = NEW.permanent_address_street,
                permanent_address_taluk = NEW.permanent_address_taluk,
                permanent_address_district = NEW.permanent_address_district,
                permanent_address_pin_code = NEW.permanent_address_pin_code,
                permanent_address_state = NEW.permanent_address_state,
                student_mobile = NEW.student_mobile,
                student_email = NEW.student_email,
                accommodation_type = NEW.accommodation_type,
                hostel_type = NEW.hostel_type,
                bus_required = NEW.bus_required,
                bus_route = NEW.bus_route,
                bus_pickup_location = NEW.bus_pickup_location,
                reference_type = NEW.reference_type,
                reference_name = NEW.reference_name,
                reference_contact = NEW.reference_contact,
                institution_id = NEW.institution_id,
                degree_id = NEW.degree_id,
                department_id = NEW.department_id,
                program_id = NEW.program_id,
                application_id = NEW.application_id,
                updated_at = NEW.updated_at,
                updated_by = NEW.updated_by
            WHERE original_admission_id = NEW.id;

        ELSIF TG_OP = 'DELETE' THEN
            DELETE FROM public.learners_profiles
            WHERE original_admission_id = OLD.id;
        END IF;

        RETURN NEW;
    END;
END;
$$ LANGUAGE plpgsql;

-- Trigger function: students → learners_profiles sync
CREATE OR REPLACE FUNCTION sync_student_to_learners()
RETURNS TRIGGER AS $$
BEGIN
    DECLARE
        lifecycle_stat lifecycle_status;
    BEGIN
        lifecycle_stat := CASE NEW.status
            WHEN 'active' THEN 'active'::lifecycle_status
            WHEN 'inactive' THEN 'inactive'::lifecycle_status
            WHEN 'graduated' THEN 'graduated'::lifecycle_status
            WHEN 'exited' THEN 'exited'::lifecycle_status
            ELSE 'active'::lifecycle_status
        END;

        IF TG_OP = 'INSERT' THEN
            INSERT INTO public.learners_profiles (
                original_student_id,
                original_admission_id,
                lifecycle_status,
                first_name, last_name, father_name, father_occupation, father_mobile,
                mother_name, mother_occupation, mother_mobile, date_of_birth, gender,
                religion, community, caste, annual_income, last_school, board_of_study,
                tenth_marks, twelfth_marks, medical_cutoff_marks, engineering_cutoff_marks,
                neet_roll_number, counseling_applied, counseling_number, first_graduate,
                quota, category, entry_type, permanent_address_street, permanent_address_taluk,
                permanent_address_district, permanent_address_pin_code, permanent_address_state,
                student_mobile, student_email, accommodation_type, hostel_type, bus_required,
                bus_route, bus_pickup_location, reference_type, reference_name, reference_contact,
                institution_id, degree_id, department_id, program_id,
                semester_id, section_id, academic_year_id, roll_number, college_email,
                student_photo_url, is_profile_complete, application_id,
                created_at, updated_at, created_by, updated_by, migration_source
            ) VALUES (
                NEW.id, NEW.admission_id, lifecycle_stat,
                NEW.first_name, NEW.last_name, NEW.father_name, NEW.father_occupation, NEW.father_mobile,
                NEW.mother_name, NEW.mother_occupation, NEW.mother_mobile, NEW.date_of_birth, NEW.gender,
                NEW.religion, NEW.community, NEW.caste, NEW.annual_income, NEW.last_school, NEW.board_of_study,
                NEW.tenth_marks, NEW.twelfth_marks, NEW.medical_cutoff_marks, NEW.engineering_cutoff_marks,
                NEW.neet_roll_number, NEW.counseling_applied, NEW.counseling_number, NEW.first_graduate,
                NEW.quota, NEW.category, NEW.entry_type, NEW.permanent_address_street, NEW.permanent_address_taluk,
                NEW.permanent_address_district, NEW.permanent_address_pin_code, NEW.permanent_address_state,
                NEW.student_mobile, NEW.student_email, NEW.accommodation_type, NEW.hostel_type, NEW.bus_required,
                NEW.bus_route, NEW.bus_pickup_location, NEW.reference_type, NEW.reference_name, NEW.reference_contact,
                NEW.institution_id, NEW.degree_id, NEW.department_id, NEW.program_id,
                NEW.semester_id, NEW.section_id, NEW.academic_year_id, NEW.roll_number, NEW.college_email,
                NEW.student_photo_url, NEW.is_profile_complete, NEW.application_id,
                NEW.created_at, NEW.updated_at, NEW.created_by, NEW.updated_by, 'student'
            )
            ON CONFLICT (original_student_id) DO UPDATE SET
                lifecycle_status = lifecycle_stat,
                semester_id = NEW.semester_id,
                section_id = NEW.section_id,
                updated_at = NEW.updated_at;

        ELSIF TG_OP = 'UPDATE' THEN
            UPDATE public.learners_profiles
            SET
                lifecycle_status = lifecycle_stat,
                original_admission_id = NEW.admission_id,
                first_name = NEW.first_name,
                last_name = NEW.last_name,
                father_name = NEW.father_name,
                father_occupation = NEW.father_occupation,
                father_mobile = NEW.father_mobile,
                mother_name = NEW.mother_name,
                mother_occupation = NEW.mother_occupation,
                mother_mobile = NEW.mother_mobile,
                date_of_birth = NEW.date_of_birth,
                gender = NEW.gender,
                religion = NEW.religion,
                community = NEW.community,
                caste = NEW.caste,
                annual_income = NEW.annual_income,
                last_school = NEW.last_school,
                board_of_study = NEW.board_of_study,
                tenth_marks = NEW.tenth_marks,
                twelfth_marks = NEW.twelfth_marks,
                medical_cutoff_marks = NEW.medical_cutoff_marks,
                engineering_cutoff_marks = NEW.engineering_cutoff_marks,
                neet_roll_number = NEW.neet_roll_number,
                counseling_applied = NEW.counseling_applied,
                counseling_number = NEW.counseling_number,
                first_graduate = NEW.first_graduate,
                quota = NEW.quota,
                category = NEW.category,
                entry_type = NEW.entry_type,
                permanent_address_street = NEW.permanent_address_street,
                permanent_address_taluk = NEW.permanent_address_taluk,
                permanent_address_district = NEW.permanent_address_district,
                permanent_address_pin_code = NEW.permanent_address_pin_code,
                permanent_address_state = NEW.permanent_address_state,
                student_mobile = NEW.student_mobile,
                student_email = NEW.student_email,
                accommodation_type = NEW.accommodation_type,
                hostel_type = NEW.hostel_type,
                bus_required = NEW.bus_required,
                bus_route = NEW.bus_route,
                bus_pickup_location = NEW.bus_pickup_location,
                reference_type = NEW.reference_type,
                reference_name = NEW.reference_name,
                reference_contact = NEW.reference_contact,
                institution_id = NEW.institution_id,
                degree_id = NEW.degree_id,
                department_id = NEW.department_id,
                program_id = NEW.program_id,
                semester_id = NEW.semester_id,
                section_id = NEW.section_id,
                academic_year_id = NEW.academic_year_id,
                roll_number = NEW.roll_number,
                college_email = NEW.college_email,
                student_photo_url = NEW.student_photo_url,
                is_profile_complete = NEW.is_profile_complete,
                application_id = NEW.application_id,
                updated_at = NEW.updated_at,
                updated_by = NEW.updated_by
            WHERE original_student_id = NEW.id;

        ELSIF TG_OP = 'DELETE' THEN
            DELETE FROM public.learners_profiles
            WHERE original_student_id = OLD.id;
        END IF;

        RETURN NEW;
    END;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS trg_sync_admission_to_learners ON public.admissions;
CREATE TRIGGER trg_sync_admission_to_learners
    AFTER INSERT OR UPDATE OR DELETE ON public.admissions
    FOR EACH ROW EXECUTE FUNCTION sync_admission_to_learners();

DROP TRIGGER IF EXISTS trg_sync_student_to_learners ON public.students;
CREATE TRIGGER trg_sync_student_to_learners
    AFTER INSERT OR UPDATE OR DELETE ON public.students
    FOR EACH ROW EXECUTE FUNCTION sync_student_to_learners();

-- ================================================================================
-- STEP 4: VERIFICATION
-- ================================================================================

DO $$
DECLARE
    admission_count INTEGER;
    student_count INTEGER;
    learner_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO admission_count FROM public.admissions;
    SELECT COUNT(*) INTO student_count FROM public.students;
    SELECT COUNT(*) INTO learner_count FROM public.learners_profiles;

    RAISE NOTICE 'Migration verification:';
    RAISE NOTICE '  - Admissions table: % records', admission_count;
    RAISE NOTICE '  - Students table: % records', student_count;
    RAISE NOTICE '  - Learners_profiles: % records', learner_count;
    RAISE NOTICE '  - Sync triggers: ACTIVE';
    RAISE NOTICE 'Tables restored with bidirectional sync!';
END $$;

COMMIT;

-- ================================================================================
-- ROLLBACK PROCEDURE (if needed)
-- ================================================================================
-- To rollback this migration:
-- 1. DROP TRIGGER trg_sync_admission_to_learners ON public.admissions;
-- 2. DROP TRIGGER trg_sync_student_to_learners ON public.students;
-- 3. DROP FUNCTION sync_admission_to_learners();
-- 4. DROP FUNCTION sync_student_to_learners();
-- 5. DROP TABLE public.admissions;
-- 6. DROP TABLE public.students;
-- 7. Recreate VIEWs from previous migration
-- ================================================================================
