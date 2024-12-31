-- Create employment_categories table
create table employment_categories (
  id uuid primary key default uuid_generate_v4(),
  category_name text not null,
  description text,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

-- Add RLS policies
alter table employment_categories enable row level security;

create policy "Enable read access for authenticated users" on employment_categories
  for select using (auth.role() = 'authenticated');

create policy "Enable insert access for authenticated users" on employment_categories
  for insert with check (auth.role() = 'authenticated');

create policy "Enable update access for authenticated users" on employment_categories
  for update using (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users" 
ON employment_categories FOR DELETE 
TO authenticated
USING (true); 

-- Update created_by foreign key constraint
ALTER TABLE employment_categories
DROP CONSTRAINT IF EXISTS employment_categories_created_by_fkey,
ADD CONSTRAINT employment_categories_created_by_fkey
    FOREIGN KEY (created_by)
    REFERENCES auth.users(id)
    ON DELETE SET NULL;

-- Update updated_by foreign key constraint
ALTER TABLE employment_categories
DROP CONSTRAINT IF EXISTS employment_categories_updated_by_fkey,
ADD CONSTRAINT employment_categories_updated_by_fkey
    FOREIGN KEY (updated_by)
    REFERENCES auth.users(id)
    ON DELETE SET NULL;


-- Create staff table
CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female', 'bigender')),
  date_of_birth DATE NOT NULL,
  marital_status TEXT NOT NULL CHECK (marital_status IN ('single', 'married', 'divorced', 'widow')),
  blood_group TEXT CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  staff_id TEXT UNIQUE,
  profile_picture TEXT,
  address TEXT,
  state TEXT,
  district TEXT,
  pincode TEXT,
  date_of_joining DATE NOT NULL,
  designation TEXT NOT NULL,
  
  -- Foreign keys
  category_id UUID NOT NULL REFERENCES employment_categories(id),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  department_id UUID NOT NULL REFERENCES departments(id),
  
  -- Audit fields
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Add indexes for better query performance
CREATE INDEX idx_staff_email ON staff(email);
CREATE INDEX idx_staff_staff_id ON staff(staff_id);
CREATE INDEX idx_staff_category_id ON staff(category_id);
CREATE INDEX idx_staff_institution_id ON staff(institution_id);
CREATE INDEX idx_staff_department_id ON staff(department_id);

-- Enable RLS
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Enable read access for authenticated users" ON staff
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for authenticated users" ON staff
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for authenticated users" ON staff
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users" ON staff
  FOR DELETE TO authenticated USING (true);

-- Add triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_staff_updated_at
    BEFORE UPDATE ON staff
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Update foreign key constraints
ALTER TABLE staff
DROP CONSTRAINT IF EXISTS staff_created_by_fkey,
ADD CONSTRAINT staff_created_by_fkey
    FOREIGN KEY (created_by)
    REFERENCES auth.users(id)
    ON DELETE SET NULL;

ALTER TABLE staff
DROP CONSTRAINT IF EXISTS staff_updated_by_fkey,
ADD CONSTRAINT staff_updated_by_fkey
    FOREIGN KEY (updated_by)
    REFERENCES auth.users(id)
    ON DELETE SET NULL;