-- Add degree_id and program_id columns to leave_onduty_approval_flows table
-- to support full hierarchy: Institution -> Degree -> Department -> Program -> Semester

ALTER TABLE leave_onduty_approval_flows
ADD COLUMN IF NOT EXISTS degree_id UUID REFERENCES degrees(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES programs(id) ON DELETE CASCADE;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_leave_onduty_flows_degree ON leave_onduty_approval_flows(degree_id);
CREATE INDEX IF NOT EXISTS idx_leave_onduty_flows_program ON leave_onduty_approval_flows(program_id);

-- Add comment for documentation
COMMENT ON COLUMN leave_onduty_approval_flows.degree_id IS 'Optional degree filter - flows can be specific to a degree';
COMMENT ON COLUMN leave_onduty_approval_flows.program_id IS 'Optional program filter - flows can be specific to a program';
