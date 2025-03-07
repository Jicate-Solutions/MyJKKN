-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create resource_categories table
CREATE TABLE public.resource_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_name VARCHAR(100) NOT NULL,
    parent_category_id UUID REFERENCES public.resource_categories(id),
    description TEXT,
    attributes JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Add indexes for resource_categories
CREATE INDEX idx_resource_categories_parent_id ON public.resource_categories(parent_category_id);
CREATE INDEX idx_resource_categories_name ON public.resource_categories(category_name);

-- Create resources table
CREATE TABLE public.resources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resource_name VARCHAR(100) NOT NULL,
    resource_type VARCHAR(20) NOT NULL CHECK (resource_type IN ('equipment', 'facility', 'vehicle', 'other')),
    category_id UUID REFERENCES public.resource_categories(id),
    description TEXT,
    institution_id UUID NOT NULL REFERENCES public.institutions(id),
    department_id UUID REFERENCES public.departments(id),
    building VARCHAR(100),
    room VARCHAR(50),
    specifications JSONB,
    acquisition_date DATE,
    value DECIMAL(10, 2),
    condition VARCHAR(20) NOT NULL CHECK (condition IN ('excellent', 'good', 'fair', 'poor')),
    availability_schedule JSONB,
    is_shareable BOOLEAN DEFAULT true,
    sharing_restrictions TEXT[],
    maintenance_schedule JSONB,
    owner_type VARCHAR(20) NOT NULL CHECK (owner_type IN ('institution', 'department', 'program')),
    owner_id UUID NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Add indexes for resources
CREATE INDEX idx_resources_name ON public.resources(resource_name);
CREATE INDEX idx_resources_type ON public.resources(resource_type);
CREATE INDEX idx_resources_category ON public.resources(category_id);
CREATE INDEX idx_resources_institution ON public.resources(institution_id);
CREATE INDEX idx_resources_department ON public.resources(department_id);
CREATE INDEX idx_resources_condition ON public.resources(condition);
CREATE INDEX idx_resources_owner ON public.resources(owner_type, owner_id);

-- Create sharing_policies table
CREATE TABLE public.sharing_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resource_type_id UUID REFERENCES public.resource_categories(id),
    institution_id UUID REFERENCES public.institutions(id),
    priority_levels JSONB NOT NULL,
    approval_required BOOLEAN DEFAULT true,
    max_reservation_duration INTEGER NOT NULL, -- in hours
    advance_notice_required INTEGER NOT NULL, -- in hours
    cancellation_policy TEXT,
    pricing_model JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Add indexes for sharing_policies
CREATE INDEX idx_sharing_policies_resource_type ON public.sharing_policies(resource_type_id);
CREATE INDEX idx_sharing_policies_institution ON public.sharing_policies(institution_id);

-- Create reservations table
CREATE TABLE public.reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resource_id UUID NOT NULL REFERENCES public.resources(id),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    title VARCHAR(100) NOT NULL,
    description TEXT,
    start_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    end_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'canceled', 'completed')) DEFAULT 'pending',
    purpose TEXT,
    requester_institution_id UUID NOT NULL REFERENCES public.institutions(id),
    requester_department_id UUID REFERENCES public.departments(id),
    approver_id UUID REFERENCES auth.users(id),
    approval_datetime TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    recurring_pattern VARCHAR(20) CHECK (recurring_pattern IN ('daily', 'weekly', 'monthly')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Add indexes for reservations
CREATE INDEX idx_reservations_resource ON public.reservations(resource_id);
CREATE INDEX idx_reservations_user ON public.reservations(user_id);
CREATE INDEX idx_reservations_status ON public.reservations(status);
CREATE INDEX idx_reservations_datetime ON public.reservations(start_datetime, end_datetime);
CREATE INDEX idx_reservations_requester_institution ON public.reservations(requester_institution_id);
CREATE INDEX idx_reservations_requester_department ON public.reservations(requester_department_id);

-- Create usage_reports table
CREATE TABLE public.usage_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resource_id UUID NOT NULL REFERENCES public.resources(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    metrics JSONB NOT NULL,
    usage_by_institution JSONB NOT NULL,
    usage_by_department JSONB NOT NULL,
    peak_usage_times JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Add indexes for usage_reports
CREATE INDEX idx_usage_reports_resource ON public.usage_reports(resource_id);
CREATE INDEX idx_usage_reports_date_range ON public.usage_reports(start_date, end_date);

-- Create resource_requests table
CREATE TABLE public.resource_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requester_id UUID NOT NULL REFERENCES auth.users(id),
    resource_type VARCHAR(20) NOT NULL CHECK (resource_type IN ('equipment', 'facility', 'vehicle', 'other')),
    specifications JSONB,
    justification TEXT NOT NULL,
    estimated_cost DECIMAL(10, 2),
    priority VARCHAR(10) NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'acquired')) DEFAULT 'pending',
    approver_id UUID REFERENCES auth.users(id),
    approval_date DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Add indexes for resource_requests
CREATE INDEX idx_resource_requests_requester ON public.resource_requests(requester_id);
CREATE INDEX idx_resource_requests_type ON public.resource_requests(resource_type);
CREATE INDEX idx_resource_requests_status ON public.resource_requests(status);
CREATE INDEX idx_resource_requests_priority ON public.resource_requests(priority);

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for resource_categories
CREATE TRIGGER set_resource_categories_updated_at
BEFORE UPDATE ON public.resource_categories
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Trigger for resources
CREATE TRIGGER set_resources_updated_at
BEFORE UPDATE ON public.resources
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Trigger for sharing_policies
CREATE TRIGGER set_sharing_policies_updated_at
BEFORE UPDATE ON public.sharing_policies
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Trigger for reservations
CREATE TRIGGER set_reservations_updated_at
BEFORE UPDATE ON public.reservations
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Trigger for resource_requests
CREATE TRIGGER set_resource_requests_updated_at
BEFORE UPDATE ON public.resource_requests
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Add RLS policies
ALTER TABLE public.resource_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sharing_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_requests ENABLE ROW LEVEL SECURITY;

-- RLS policies for resource_categories
CREATE POLICY "Enable read access for authenticated users" ON public.resource_categories
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Enable insert for authenticated admin users" ON public.resource_categories
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrator', 'super_admin')
        )
    );

CREATE POLICY "Enable update for authenticated admin users" ON public.resource_categories
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrator', 'super_admin')
        )
    );

CREATE POLICY "Enable delete for authenticated admin users" ON public.resource_categories
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrator', 'super_admin')
        )
    );

-- RLS policies for resources
CREATE POLICY "Enable read access for authenticated users" ON public.resources
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Enable insert for authenticated admin users" ON public.resources
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrator', 'super_admin')
        )
    );

CREATE POLICY "Enable update for authenticated admin users" ON public.resources
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrator', 'super_admin')
        )
    );

CREATE POLICY "Enable delete for authenticated admin users" ON public.resources
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrator', 'super_admin')
        )
    );

-- RLS policies for sharing_policies
CREATE POLICY "Enable read access for authenticated users" ON public.sharing_policies
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Enable insert for authenticated admin users" ON public.sharing_policies
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrator', 'super_admin')
        )
    );

CREATE POLICY "Enable update for authenticated admin users" ON public.sharing_policies
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrator', 'super_admin')
        )
    );

CREATE POLICY "Enable delete for authenticated admin users" ON public.sharing_policies
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrator', 'super_admin')
        )
    );

-- RLS policies for reservations
CREATE POLICY "Enable read access for authenticated users" ON public.reservations
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Enable insert for authenticated users" ON public.reservations
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Enable update for resource owners and admins" ON public.reservations
    FOR UPDATE
    TO authenticated
    USING (
        auth.uid() = user_id OR
        auth.uid() = approver_id OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrator', 'super_admin')
        )
    );

CREATE POLICY "Enable delete for resource owners and admins" ON public.reservations
    FOR DELETE
    TO authenticated
    USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrator', 'super_admin')
        )
    );

-- RLS policies for usage_reports
CREATE POLICY "Enable read access for authenticated users" ON public.usage_reports
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Enable insert for authenticated admin users" ON public.usage_reports
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrator', 'super_admin')
        )
    );

-- RLS policies for resource_requests
CREATE POLICY "Enable read access for authenticated users" ON public.resource_requests
    FOR SELECT
    TO authenticated
    USING (
        auth.uid() = requester_id OR
        auth.uid() = approver_id OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrator', 'super_admin')
        )
    );

CREATE POLICY "Enable insert for authenticated users" ON public.resource_requests
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Enable update for requesters and admins" ON public.resource_requests
    FOR UPDATE
    TO authenticated
    USING (
        auth.uid() = requester_id OR
        auth.uid() = approver_id OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrator', 'super_admin')
        )
    );

-- Create function to check reservation conflicts
CREATE OR REPLACE FUNCTION check_reservation_conflict(
    p_resource_id UUID,
    p_start_datetime TIMESTAMP WITH TIME ZONE,
    p_end_datetime TIMESTAMP WITH TIME ZONE,
    p_reservation_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    conflict_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.reservations
        WHERE resource_id = p_resource_id
        AND status IN ('pending', 'approved')
        AND (
            (start_datetime <= p_end_datetime AND end_datetime >= p_start_datetime)
        )
        AND (p_reservation_id IS NULL OR id != p_reservation_id)
    ) INTO conflict_exists;
    
    RETURN conflict_exists;
END;
$$ LANGUAGE plpgsql;

-- Create function to generate usage reports
CREATE OR REPLACE FUNCTION generate_usage_report(
    p_resource_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS UUID AS $$
DECLARE
    v_report_id UUID;
    v_metrics JSONB;
    v_usage_by_institution JSONB;
    v_usage_by_department JSONB;
    v_peak_usage_times JSONB;
    v_total_hours NUMERIC;
    v_total_reservations INTEGER;
    v_unique_users INTEGER;
    v_cross_institution_usage INTEGER;
    v_resource_owner_id UUID;
    v_resource_owner_type VARCHAR;
BEGIN
    -- Get resource owner info
    SELECT owner_id, owner_type INTO v_resource_owner_id, v_resource_owner_type
    FROM public.resources
    WHERE id = p_resource_id;
    
    -- Calculate total hours used
    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (end_datetime - start_datetime)) / 3600), 0)
    INTO v_total_hours
    FROM public.reservations
    WHERE resource_id = p_resource_id
    AND status = 'completed'
    AND start_datetime >= p_start_date
    AND end_datetime <= p_end_date + INTERVAL '1 day';
    
    -- Count total reservations
    SELECT COUNT(*)
    INTO v_total_reservations
    FROM public.reservations
    WHERE resource_id = p_resource_id
    AND status = 'completed'
    AND start_datetime >= p_start_date
    AND end_datetime <= p_end_date + INTERVAL '1 day';
    
    -- Count unique users
    SELECT COUNT(DISTINCT user_id)
    INTO v_unique_users
    FROM public.reservations
    WHERE resource_id = p_resource_id
    AND status = 'completed'
    AND start_datetime >= p_start_date
    AND end_datetime <= p_end_date + INTERVAL '1 day';
    
    -- Count cross-institution usage
    SELECT COUNT(*)
    INTO v_cross_institution_usage
    FROM public.reservations r
    JOIN public.resources res ON r.resource_id = res.id
    WHERE r.resource_id = p_resource_id
    AND r.status = 'completed'
    AND r.start_datetime >= p_start_date
    AND r.end_datetime <= p_end_date + INTERVAL '1 day'
    AND r.requester_institution_id != res.institution_id;
    
    -- Calculate utilization percentage (assuming 12 hours per day availability)
    v_metrics = jsonb_build_object(
        'total_hours_used', v_total_hours,
        'utilization_percentage', (v_total_hours / (12 * (p_end_date - p_start_date + 1))) * 100,
        'reservation_count', v_total_reservations,
        'unique_users', v_unique_users,
        'cross_institution_usage', v_cross_institution_usage
    );
    
    -- Calculate usage by institution
    SELECT jsonb_object_agg(institution_id, hours_used)
    INTO v_usage_by_institution
    FROM (
        SELECT 
            requester_institution_id AS institution_id,
            SUM(EXTRACT(EPOCH FROM (end_datetime - start_datetime)) / 3600) AS hours_used
        FROM public.reservations
        WHERE resource_id = p_resource_id
        AND status = 'completed'
        AND start_datetime >= p_start_date
        AND end_datetime <= p_end_date + INTERVAL '1 day'
        GROUP BY requester_institution_id
    ) AS inst_usage;
    
    -- Calculate usage by department
    SELECT jsonb_object_agg(department_id, hours_used)
    INTO v_usage_by_department
    FROM (
        SELECT 
            requester_department_id AS department_id,
            SUM(EXTRACT(EPOCH FROM (end_datetime - start_datetime)) / 3600) AS hours_used
        FROM public.reservations
        WHERE resource_id = p_resource_id
        AND status = 'completed'
        AND start_datetime >= p_start_date
        AND end_datetime <= p_end_date + INTERVAL '1 day'
        AND requester_department_id IS NOT NULL
        GROUP BY requester_department_id
    ) AS dept_usage;
    
    -- Calculate peak usage times
    SELECT jsonb_object_agg(time_slot, reservation_count)
    INTO v_peak_usage_times
    FROM (
        SELECT 
            to_char(start_datetime, 'HH24:00-') || to_char(start_datetime + INTERVAL '2 hours', 'HH24:00') AS time_slot,
            COUNT(*) AS reservation_count
        FROM public.reservations
        WHERE resource_id = p_resource_id
        AND status = 'completed'
        AND start_datetime >= p_start_date
        AND end_datetime <= p_end_date + INTERVAL '1 day'
        GROUP BY time_slot
        ORDER BY reservation_count DESC
        LIMIT 5
    ) AS peak_times;
    
    -- Insert the report
    INSERT INTO public.usage_reports (
        resource_id,
        start_date,
        end_date,
        metrics,
        usage_by_institution,
        usage_by_department,
        peak_usage_times
    ) VALUES (
        p_resource_id,
        p_start_date,
        p_end_date,
        v_metrics,
        COALESCE(v_usage_by_institution, '{}'::jsonb),
        COALESCE(v_usage_by_department, '{}'::jsonb),
        COALESCE(v_peak_usage_times, '{}'::jsonb)
    )
    RETURNING id INTO v_report_id;
    
    RETURN v_report_id;
END;
$$ LANGUAGE plpgsql; 