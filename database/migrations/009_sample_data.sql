-- Sample Data for Testing (Optional - Remove in Production)

-- Insert sample institution (if not exists)
INSERT INTO public.institutions (id, name, code, counselling_code, address, city, state, country, postal_code, phone, email, website)
VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'JKKN College of Engineering',
    'JKKN-ENG',
    'ENG',
    '123 Main Street',
    'Chennai',
    'Tamil Nadu',
    'India',
    '600001',
    '+91-44-12345678',
    'info@jkkneng.edu.in',
    'www.jkkneng.edu.in'
) ON CONFLICT (id) DO NOTHING;

-- Insert sample academic year
INSERT INTO public.academic_years (institution_id, academic_year_name, start_date, end_date, is_active)
VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    '2024-2025',
    '2024-06-01',
    '2025-05-31',
    true
) ON CONFLICT (institution_id, academic_year_name) DO NOTHING;

-- Insert sample degrees
INSERT INTO public.degrees (institution_id, degree_id, degree_name, degree_type)
VALUES 
    ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'BE', 'Bachelor of Engineering', 'UG'),
    ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'ME', 'Master of Engineering', 'PG'),
    ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'BSC', 'Bachelor of Science', 'UG'),
    ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'MSC', 'Master of Science', 'PG')
ON CONFLICT DO NOTHING;

-- Insert sample departments
WITH deg AS (
    SELECT id FROM degrees WHERE institution_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' AND degree_id = 'BE' LIMIT 1
)
INSERT INTO public.departments (institution_id, degree_id, department_code, department_name)
SELECT 
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    deg.id,
    dept_code,
    dept_name
FROM deg, 
(VALUES 
    ('CSE', 'Computer Science and Engineering'),
    ('ECE', 'Electronics and Communication Engineering'),
    ('MECH', 'Mechanical Engineering'),
    ('CIVIL', 'Civil Engineering')
) AS t(dept_code, dept_name)
ON CONFLICT (institution_id, department_code) DO NOTHING;

-- Note: Run these migrations in order
-- 1. First run migrations 001-008
-- 2. Then run this sample data migration if needed for testing
-- 3. In production, skip this migration file