-- custom-roles.sql
-- Create a table for dynamic role management

-- Create custom_roles table
CREATE TABLE public.custom_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_key VARCHAR(50) NOT NULL UNIQUE, -- Machine-readable key (e.g., 'department_head')
    role_name VARCHAR(100) NOT NULL, -- Human-readable name (e.g., 'Department Head')
    description TEXT,
    is_system_role BOOLEAN DEFAULT false, -- Flag for system-defined roles that cannot be deleted
    permissions JSONB DEFAULT '{}', -- Store role permissions as JSON
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    created_by UUID REFERENCES auth.users(id)
);

-- Add index for performance
CREATE INDEX idx_custom_roles_key ON public.custom_roles(role_key);
CREATE INDEX idx_custom_roles_system ON public.custom_roles(is_system_role);

-- Enable RLS
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;

-- RLS policies for custom_roles
CREATE POLICY "Enable read access for authenticated users" ON public.custom_roles
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Enable admin operations for super_admin" ON public.custom_roles
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'super_admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'super_admin'
        )
    );

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_custom_roles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_custom_roles_updated_at
BEFORE UPDATE ON public.custom_roles
FOR EACH ROW
EXECUTE FUNCTION public.update_custom_roles_updated_at();

-- Insert default system roles
INSERT INTO public.custom_roles (role_key, role_name, description, is_system_role, permissions)
VALUES 
('super_admin', 'Super Administrator', 'Full system access and control', true, '{"all": true}'),
('administrator', 'Administrator', 'Administrative access to manage the system', true, '{"manage_users": true, "manage_content": true}'),
('faculty', 'Faculty', 'Teaching staff with academic privileges', true, '{"manage_courses": true, "view_students": true}'),
('student', 'Student', 'Student role with limited access', true, '{"view_courses": true, "submit_assignments": true}'),
('staff', 'Staff', 'Non-teaching staff with administrative access', true, '{"view_reports": true, "manage_resources": true}'),
('guest', 'Guest', 'Limited access for visitors', true, '{"view_public": true}');

-- Function to check if a user has a specific permission based on their role
CREATE OR REPLACE FUNCTION public.user_has_permission(permission_name text)
RETURNS boolean AS $$
DECLARE
  user_role text;
  role_permissions jsonb;
BEGIN
  -- Get the current user's role
  SELECT role INTO user_role FROM profiles WHERE id = auth.uid();
  
  -- If no role found, return false
  IF user_role IS NULL THEN
    RETURN false;
  END IF;
  
  -- Get permissions for this role
  SELECT permissions INTO role_permissions FROM custom_roles WHERE role_key = user_role;
  
  -- If role not found in custom_roles, return false
  IF role_permissions IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check for 'all' permission (super admin)
  IF (role_permissions->>'all')::boolean = true THEN
    RETURN true;
  END IF;
  
  -- Check for specific permission
  RETURN (role_permissions->>permission_name)::boolean = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 