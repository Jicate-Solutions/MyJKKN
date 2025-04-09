-- Add new columns to the admissions table for organization structure
ALTER TABLE admissions 
ADD COLUMN degree_id UUID REFERENCES degrees(id),
ADD COLUMN department_id UUID REFERENCES departments(id),
ADD COLUMN program_id UUID REFERENCES programs(id);

-- Add comments to the new columns
COMMENT ON COLUMN admissions.degree_id IS 'Reference to degree selected during admission application';
COMMENT ON COLUMN admissions.department_id IS 'Reference to department selected during admission application';
COMMENT ON COLUMN admissions.program_id IS 'Reference to program selected during admission application';

-- Create indexes on the new columns for better query performance
CREATE INDEX idx_admissions_degree_id ON admissions(degree_id);
CREATE INDEX idx_admissions_department_id ON admissions(department_id);
CREATE INDEX idx_admissions_program_id ON admissions(program_id); 