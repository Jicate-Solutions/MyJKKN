-- Dashboard personalization schema
-- This enables super admins to customize their dashboard layout and widgets

-- Table to store available widget types
CREATE TABLE IF NOT EXISTS public.dashboard_widget_types (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    widget_key VARCHAR(50) UNIQUE NOT NULL,
    widget_name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL, -- 'kpi', 'chart', 'table', 'feed'
    data_source VARCHAR(100) NOT NULL, -- The service/table to fetch data from
    default_config JSONB DEFAULT '{}',
    permissions_required TEXT[], -- Array of required permissions
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table to store user dashboard configurations
CREATE TABLE IF NOT EXISTS public.dashboard_configurations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    configuration_name VARCHAR(100) NOT NULL DEFAULT 'Default',
    is_default BOOLEAN DEFAULT false,
    layout_config JSONB NOT NULL DEFAULT '[]', -- Stores widget positions and sizes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, configuration_name)
);

-- Table to store individual widget configurations
CREATE TABLE IF NOT EXISTS public.dashboard_widgets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    configuration_id UUID NOT NULL REFERENCES public.dashboard_configurations(id) ON DELETE CASCADE,
    widget_type_id UUID NOT NULL REFERENCES public.dashboard_widget_types(id) ON DELETE CASCADE,
    position_x INTEGER NOT NULL DEFAULT 0,
    position_y INTEGER NOT NULL DEFAULT 0,
    width INTEGER NOT NULL DEFAULT 1,
    height INTEGER NOT NULL DEFAULT 1,
    widget_config JSONB DEFAULT '{}', -- Specific configuration for this widget instance
    is_visible BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default widget types
INSERT INTO public.dashboard_widget_types (widget_key, widget_name, description, category, data_source, default_config, permissions_required) VALUES
-- User Management Widgets
('total_users', 'Total Users', 'Display total number of users in the system', 'kpi', 'users', '{"showTrend": true, "timeframe": "month"}', ARRAY['users.view']),
('users_by_role', 'Users by Role', 'Breakdown of users by their roles', 'chart', 'users', '{"chartType": "bar", "showPercentage": true}', ARRAY['users.view']),
('users_by_status', 'User Status Distribution', 'Active vs Inactive users', 'chart', 'users', '{"chartType": "pie", "showLegend": true}', ARRAY['users.view']),
('recent_users', 'Recent Users', 'List of recently registered users', 'table', 'users', '{"limit": 10, "showAvatar": true}', ARRAY['users.view']),
('user_activity', 'User Activity', 'User login and activity metrics', 'chart', 'activity', '{"chartType": "line", "timeframe": "week"}', ARRAY['users.activity.view']),

-- Academic Management Widgets
('total_students', 'Total Students', 'Total number of students enrolled', 'kpi', 'students', '{"showTrend": true, "timeframe": "semester"}', ARRAY['students.view']),
('students_by_institution', 'Students by Institution', 'Student distribution across institutions', 'chart', 'students', '{"chartType": "bar", "showInstitutionNames": true}', ARRAY['students.view']),
('academic_years', 'Academic Years', 'Current and upcoming academic years', 'table', 'academic', '{"showCurrent": true, "limit": 5}', ARRAY['academic.years.view']),
('staff_planning', 'Staff Planning Overview', 'Staff allocation and planning metrics', 'kpi', 'academic', '{"showUtilization": true}', ARRAY['academic.staff.planning.view']),
('timetable_coverage', 'Timetable Coverage', 'Percentage of scheduled vs planned classes', 'kpi', 'academic', '{"showProgress": true}', ARRAY['academic.timetables.view']),

-- Organization Widgets
('total_institutions', 'Total Institutions', 'Number of institutions in the system', 'kpi', 'organizations', '{"showActiveOnly": true}', ARRAY['organizations.institutions.view']),
('institutions_by_type', 'Institutions by Type', 'Breakdown by institution category', 'chart', 'organizations', '{"chartType": "pie", "groupByType": true}', ARRAY['organizations.institutions.view']),
('courses_overview', 'Courses Overview', 'Total courses and recent additions', 'kpi', 'organizations', '{"showRecentlyAdded": true}', ARRAY['organizations.courses.view']),
('departments_summary', 'Departments Summary', 'Department count and distribution', 'kpi', 'organizations', '{"showByInstitution": true}', ARRAY['organizations.departments.view']),

-- Billing & Financial Widgets
('revenue_overview', 'Revenue Overview', 'Total revenue and trends', 'kpi', 'billing', '{"showTrend": true, "timeframe": "month", "currency": "INR"}', ARRAY['billing.reports.view']),
('invoice_status', 'Invoice Status', 'Paid, pending, and overdue invoices', 'chart', 'billing', '{"chartType": "pie", "showAmounts": true}', ARRAY['billing.invoices.view']),
('payment_trends', 'Payment Trends', 'Payment collection trends over time', 'chart', 'billing', '{"chartType": "line", "timeframe": "3months"}', ARRAY['billing.receipts.view']),
('discounts_summary', 'Discounts Applied', 'Summary of discounts given', 'kpi', 'billing', '{"showPercentage": true, "showSavings": true}', ARRAY['billing.discounts.view']),
('pending_refunds', 'Pending Refunds', 'Refunds awaiting processing', 'table', 'billing', '{"limit": 10, "showAmount": true}', ARRAY['billing.refunds.view']),

-- Application & Admission Widgets
('total_applications', 'Total Applications', 'Application submissions across all programs', 'kpi', 'applications', '{"showTrend": true, "timeframe": "month"}', ARRAY['applications.view']),
('application_status', 'Application Status', 'Approved, pending, and rejected applications', 'chart', 'applications', '{"chartType": "pie", "showCounts": true}', ARRAY['applications.view']),
('admissions_pipeline', 'Admissions Pipeline', 'Admission process stage breakdown', 'chart', 'admissions', '{"chartType": "funnel", "showConversion": true}', ARRAY['admissions.view']),
('recent_applications', 'Recent Applications', 'Latest application submissions', 'table', 'applications', '{"limit": 10, "showInstitution": true}', ARRAY['applications.view']),

-- Staff Management Widgets
('total_staff', 'Total Staff', 'Total number of staff members', 'kpi', 'staff', '{"showByCategory": true}', ARRAY['staff.view']),
('staff_categories', 'Staff Categories', 'Distribution of staff by category', 'chart', 'staff', '{"chartType": "bar", "showCounts": true}', ARRAY['staff.categories.view']),
('staff_utilization', 'Staff Utilization', 'Staff workload and allocation', 'kpi', 'staff', '{"showUtilization": true, "showOverload": true}', ARRAY['staff.view']),

-- Resource Management Widgets
('resource_utilization', 'Resource Utilization', 'Physical and digital resource usage', 'chart', 'resources', '{"chartType": "area", "showBoth": true}', ARRAY['physical_resources.view', 'digital_resources.view']),
('resource_requests', 'Resource Requests', 'Pending and approved resource requests', 'kpi', 'resources', '{"showPending": true, "showApproved": true}', ARRAY['physical_resources.requests.view']),
('popular_resources', 'Popular Resources', 'Most requested/used resources', 'table', 'resources', '{"limit": 10, "showUsageCount": true}', ARRAY['physical_resources.view']),

-- System & Activity Widgets
('system_health', 'System Health', 'Overall system performance metrics', 'kpi', 'system', '{"showUptime": true, "showErrors": false}', ARRAY['system.api.view']),
('api_usage', 'API Usage', 'API endpoint usage statistics', 'chart', 'system', '{"chartType": "line", "timeframe": "week"}', ARRAY['system.api.view']),
('recent_activity', 'Recent Activity', 'Latest system activities and changes', 'feed', 'activity', '{"limit": 15, "showUser": true}', ARRAY['users.activity.view']),
('login_analytics', 'Login Analytics', 'User login patterns and analytics', 'chart', 'activity', '{"chartType": "heatmap", "timeframe": "week"}', ARRAY['users.activity.analytics']);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_dashboard_configurations_user_id ON public.dashboard_configurations(user_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_configurations_default ON public.dashboard_configurations(user_id, is_default) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_config_id ON public.dashboard_widgets(configuration_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_sort_order ON public.dashboard_widgets(configuration_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_dashboard_widget_types_active ON public.dashboard_widget_types(is_active) WHERE is_active = true;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_dashboard_configurations_updated_at BEFORE UPDATE ON public.dashboard_configurations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_dashboard_widgets_updated_at BEFORE UPDATE ON public.dashboard_widgets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_dashboard_widget_types_updated_at BEFORE UPDATE ON public.dashboard_widget_types FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE public.dashboard_widget_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_widgets ENABLE ROW LEVEL SECURITY;

-- Widget types are readable by all authenticated users
CREATE POLICY "Widget types are viewable by authenticated users" ON public.dashboard_widget_types
    FOR SELECT USING (auth.role() = 'authenticated');

-- Users can only manage their own dashboard configurations
CREATE POLICY "Users can view their own dashboard configurations" ON public.dashboard_configurations
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own dashboard configurations" ON public.dashboard_configurations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own dashboard configurations" ON public.dashboard_configurations
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own dashboard configurations" ON public.dashboard_configurations
    FOR DELETE USING (auth.uid() = user_id);

-- Users can only manage widgets in their own configurations
CREATE POLICY "Users can view their own dashboard widgets" ON public.dashboard_widgets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.dashboard_configurations 
            WHERE id = configuration_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert widgets to their own configurations" ON public.dashboard_widgets
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.dashboard_configurations 
            WHERE id = configuration_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update widgets in their own configurations" ON public.dashboard_widgets
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.dashboard_configurations 
            WHERE id = configuration_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete widgets from their own configurations" ON public.dashboard_widgets
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.dashboard_configurations 
            WHERE id = configuration_id AND user_id = auth.uid()
        )
    );

COMMENT ON TABLE public.dashboard_widget_types IS 'Defines available widget types for the personalized dashboard';
COMMENT ON TABLE public.dashboard_configurations IS 'Stores user dashboard layout configurations';
COMMENT ON TABLE public.dashboard_widgets IS 'Individual widget instances within dashboard configurations'; 