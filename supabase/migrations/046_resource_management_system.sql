-- Migration: Resource Management System
-- Description: Complete resource management system with categories, resources, reservations, and approval workflows
-- Author: System
-- Date: 2024

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- STORAGE BUCKETS
-- =============================================

-- Create storage bucket for resource management assets
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES 
  ('resource-management', 'Resource Management', true, false, 10485760, -- 10MB limit
   '{image/png,image/jpeg,image/gif,image/webp,image/svg+xml}')
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for resource-management bucket
-- Allow public read access to resource management assets
CREATE POLICY "Resource management assets are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'resource-management');

-- Allow authenticated users to upload resource management assets
CREATE POLICY "Authenticated users can upload resource management assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'resource-management');

-- Allow users to update and delete their own uploads or admin users
CREATE POLICY "Users can update resource management assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'resource-management' AND
  (
    auth.uid() = owner OR
    EXISTS (
      SELECT 1 FROM custom_roles cr
      JOIN user_roles ur ON cr.id = ur.role_id
      WHERE ur.user_id = auth.uid() 
      AND cr.slug IN ('super_admin', 'admin')
    )
  )
);

CREATE POLICY "Users can delete resource management assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'resource-management' AND
  (
    auth.uid() = owner OR
    EXISTS (
      SELECT 1 FROM custom_roles cr
      JOIN user_roles ur ON cr.id = ur.role_id
      WHERE ur.user_id = auth.uid() 
      AND cr.slug IN ('super_admin', 'admin')
    )
  )
);

-- =============================================
-- ENUMS
-- =============================================

-- Category status enum
CREATE TYPE category_status AS ENUM ('active', 'inactive', 'archived');

-- Attribute type enum
CREATE TYPE attribute_type AS ENUM ('text', 'number', 'date', 'boolean', 'dropdown', 'textarea', 'email', 'url');

-- Resource status enum
CREATE TYPE resource_status AS ENUM ('available', 'occupied', 'maintenance', 'out_of_order', 'retired');

-- Booking type enum
CREATE TYPE booking_type AS ENUM ('all_day', 'time_slots', 'no_booking');

-- Reservation status enum
CREATE TYPE reservation_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled', 'completed', 'no_show');

-- Approval status enum
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected', 'escalated');

-- =============================================
-- TABLES
-- =============================================

-- Parent Categories Table
CREATE TABLE resource_parent_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    status category_status NOT NULL DEFAULT 'active',
    image_url TEXT,
    display_order INTEGER,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id),
    updated_by UUID REFERENCES profiles(id),
    
    -- Constraints
    CONSTRAINT unique_parent_category_name UNIQUE (name),
    CONSTRAINT positive_display_order CHECK (display_order >= 0),
    CONSTRAINT positive_usage_count CHECK (usage_count >= 0)
);

-- Sub Categories Table
CREATE TABLE resource_sub_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_category_id UUID NOT NULL REFERENCES resource_parent_categories(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    status category_status NOT NULL DEFAULT 'active',
    image_url TEXT,
    display_order INTEGER,
    inherit_parent_attributes BOOLEAN DEFAULT FALSE,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id),
    updated_by UUID REFERENCES profiles(id),
    
    -- Constraints
    CONSTRAINT unique_sub_category_name_per_parent UNIQUE (parent_category_id, name),
    CONSTRAINT positive_display_order CHECK (display_order >= 0),
    CONSTRAINT positive_usage_count CHECK (usage_count >= 0)
);

-- Attribute Definitions Table (for dynamic attributes)
CREATE TABLE resource_attribute_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subcategory_id UUID NOT NULL REFERENCES resource_sub_categories(id) ON DELETE CASCADE,
    attribute_key VARCHAR(50) NOT NULL,
    attribute_type attribute_type NOT NULL,
    is_required BOOLEAN DEFAULT FALSE,
    is_multiple BOOLEAN DEFAULT FALSE,
    default_value TEXT,
    options JSONB, -- For dropdown options
    validation_rules JSONB, -- For validation rules
    display_order INTEGER DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_attribute_key_per_subcategory UNIQUE (subcategory_id, attribute_key),
    CONSTRAINT positive_display_order CHECK (display_order >= 0)
);

-- Resources Table
CREATE TABLE resources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    parent_category_id UUID NOT NULL REFERENCES resource_parent_categories(id),
    subcategory_id UUID NOT NULL REFERENCES resource_sub_categories(id),
    
    -- Location Details
    institution_id UUID REFERENCES institutions(id),
    department_id UUID REFERENCES departments(id),
    building_number VARCHAR(20),
    block_number VARCHAR(20),
    room_number VARCHAR(20),
    
    -- Vendor Information
    vendor_name VARCHAR(200),
    vendor_email VARCHAR(100),
    vendor_mobile VARCHAR(20),
    vendor_address TEXT,
    
    -- Inventory
    initial_stock_quantity INTEGER DEFAULT 1,
    current_stock_quantity INTEGER DEFAULT 1,
    
    -- Caretaker
    caretaker_user_id UUID REFERENCES profiles(id),
    
    -- Lifecycle
    purchase_date DATE,
    warranty_expiry_date DATE,
    maintenance_schedule TEXT,
    
    -- Status and Configuration
    status resource_status NOT NULL DEFAULT 'available',
    booking_type booking_type NOT NULL DEFAULT 'no_booking',
    booking_config JSONB DEFAULT '{}', -- Stores booking configuration
    approval_config JSONB DEFAULT '{}', -- Stores approval workflow configuration
    reminder_config JSONB DEFAULT '{}', -- Stores reminder configuration
    access_roles TEXT[] DEFAULT '{}', -- Array of role IDs that can access this resource
    
    -- Custom Attributes (dynamic based on subcategory)
    custom_attributes JSONB DEFAULT '{}',
    
    -- Metadata
    usage_count INTEGER DEFAULT 0,
    reservation_count INTEGER DEFAULT 0,
    image_urls TEXT[] DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id),
    updated_by UUID REFERENCES profiles(id),
    
    -- Constraints
    CONSTRAINT unique_resource_name_per_location UNIQUE (name, institution_id, building_number, block_number, room_number),
    CONSTRAINT positive_stock_quantities CHECK (
        initial_stock_quantity >= 0 AND 
        current_stock_quantity >= 0 AND 
        current_stock_quantity <= initial_stock_quantity
    ),
    CONSTRAINT positive_counts CHECK (usage_count >= 0 AND reservation_count >= 0)
);

-- Reservations Table
CREATE TABLE resource_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id),
    
    -- Reservation Details
    purpose TEXT NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    quantity INTEGER DEFAULT 1,
    
    -- Status and Workflow
    status reservation_status NOT NULL DEFAULT 'pending',
    priority INTEGER DEFAULT 1, -- 1 = normal, 2 = high, 3 = urgent
    
    -- Approval Information
    approved_by UUID REFERENCES profiles(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    
    -- Check-in/Check-out
    checked_in_at TIMESTAMP WITH TIME ZONE,
    checked_out_at TIMESTAMP WITH TIME ZONE,
    checked_in_by UUID REFERENCES profiles(id),
    checked_out_by UUID REFERENCES profiles(id),
    
    -- Additional Information
    notes TEXT,
    attachments TEXT[] DEFAULT '{}',
    is_recurring BOOLEAN DEFAULT FALSE,
    recurring_config JSONB, -- Stores recurring reservation configuration
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancelled_by UUID REFERENCES profiles(id),
    cancellation_reason TEXT,
    
    -- Constraints
    CONSTRAINT valid_time_range CHECK (end_time > start_time),
    CONSTRAINT positive_quantity CHECK (quantity > 0),
    CONSTRAINT valid_priority CHECK (priority BETWEEN 1 AND 3)
);

-- Resource Approvals Table
CREATE TABLE resource_approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reservation_id UUID NOT NULL REFERENCES resource_reservations(id) ON DELETE CASCADE,
    approver_user_id UUID NOT NULL REFERENCES profiles(id),
    approval_level INTEGER NOT NULL DEFAULT 1,
    status approval_status NOT NULL DEFAULT 'pending',
    
    -- Approval Details
    approved_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    comments TEXT,
    
    -- Escalation
    escalated_to UUID REFERENCES profiles(id),
    escalated_at TIMESTAMP WITH TIME ZONE,
    escalation_reason TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT positive_approval_level CHECK (approval_level > 0),
    CONSTRAINT unique_approval_per_level UNIQUE (reservation_id, approval_level)
);

-- Resource Usage Logs Table (for analytics)
CREATE TABLE resource_usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    reservation_id UUID REFERENCES resource_reservations(id),
    user_id UUID NOT NULL REFERENCES profiles(id),
    
    -- Usage Details
    action VARCHAR(50) NOT NULL, -- 'reserved', 'checked_in', 'checked_out', 'cancelled', etc.
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    actual_duration INTERVAL,
    
    -- Metadata
    ip_address INET,
    user_agent TEXT,
    additional_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- INDEXES
-- =============================================

-- Parent Categories Indexes
CREATE INDEX idx_parent_categories_status ON resource_parent_categories(status);
CREATE INDEX idx_parent_categories_name ON resource_parent_categories(name);
CREATE INDEX idx_parent_categories_display_order ON resource_parent_categories(display_order);
CREATE INDEX idx_parent_categories_created_by ON resource_parent_categories(created_by);

-- Sub Categories Indexes
CREATE INDEX idx_sub_categories_parent_id ON resource_sub_categories(parent_category_id);
CREATE INDEX idx_sub_categories_status ON resource_sub_categories(status);
CREATE INDEX idx_sub_categories_name ON resource_sub_categories(name);
CREATE INDEX idx_sub_categories_display_order ON resource_sub_categories(display_order);

-- Attribute Definitions Indexes
CREATE INDEX idx_attribute_definitions_subcategory_id ON resource_attribute_definitions(subcategory_id);
CREATE INDEX idx_attribute_definitions_type ON resource_attribute_definitions(attribute_type);
CREATE INDEX idx_attribute_definitions_required ON resource_attribute_definitions(is_required);

-- Resources Indexes
CREATE INDEX idx_resources_parent_category ON resources(parent_category_id);
CREATE INDEX idx_resources_subcategory ON resources(subcategory_id);
CREATE INDEX idx_resources_institution ON resources(institution_id);
CREATE INDEX idx_resources_department ON resources(department_id);
CREATE INDEX idx_resources_status ON resources(status);
CREATE INDEX idx_resources_booking_type ON resources(booking_type);
CREATE INDEX idx_resources_caretaker ON resources(caretaker_user_id);
CREATE INDEX idx_resources_name ON resources(name);
CREATE INDEX idx_resources_location ON resources(institution_id, building_number, block_number, room_number);
CREATE INDEX idx_resources_access_roles ON resources USING GIN(access_roles);
CREATE INDEX idx_resources_custom_attributes ON resources USING GIN(custom_attributes);
CREATE INDEX idx_resources_tags ON resources USING GIN(tags);

-- Reservations Indexes
CREATE INDEX idx_reservations_resource_id ON resource_reservations(resource_id);
CREATE INDEX idx_reservations_user_id ON resource_reservations(user_id);
CREATE INDEX idx_reservations_status ON resource_reservations(status);
CREATE INDEX idx_reservations_start_time ON resource_reservations(start_time);
CREATE INDEX idx_reservations_end_time ON resource_reservations(end_time);
CREATE INDEX idx_reservations_priority ON resource_reservations(priority);
CREATE INDEX idx_reservations_time_range ON resource_reservations(start_time, end_time);
CREATE INDEX idx_reservations_pending ON resource_reservations(status) WHERE status = 'pending';

-- Approvals Indexes
CREATE INDEX idx_approvals_reservation_id ON resource_approvals(reservation_id);
CREATE INDEX idx_approvals_approver_id ON resource_approvals(approver_user_id);
CREATE INDEX idx_approvals_status ON resource_approvals(status);
CREATE INDEX idx_approvals_level ON resource_approvals(approval_level);
CREATE INDEX idx_approvals_pending ON resource_approvals(status) WHERE status = 'pending';

-- Usage Logs Indexes
CREATE INDEX idx_usage_logs_resource_id ON resource_usage_logs(resource_id);
CREATE INDEX idx_usage_logs_user_id ON resource_usage_logs(user_id);
CREATE INDEX idx_usage_logs_reservation_id ON resource_usage_logs(reservation_id);
CREATE INDEX idx_usage_logs_action ON resource_usage_logs(action);
CREATE INDEX idx_usage_logs_created_at ON resource_usage_logs(created_at);

-- =============================================
-- TRIGGERS
-- =============================================

-- Update timestamp triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to all tables with updated_at
CREATE TRIGGER update_parent_categories_updated_at BEFORE UPDATE ON resource_parent_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sub_categories_updated_at BEFORE UPDATE ON resource_sub_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_attribute_definitions_updated_at BEFORE UPDATE ON resource_attribute_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_resources_updated_at BEFORE UPDATE ON resources FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reservations_updated_at BEFORE UPDATE ON resource_reservations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_approvals_updated_at BEFORE UPDATE ON resource_approvals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Usage count update triggers
CREATE OR REPLACE FUNCTION update_category_usage_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Increment usage count for parent and sub categories
        UPDATE resource_parent_categories 
        SET usage_count = usage_count + 1 
        WHERE id = NEW.parent_category_id;
        
        UPDATE resource_sub_categories 
        SET usage_count = usage_count + 1 
        WHERE id = NEW.subcategory_id;
        
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        -- Decrement usage count for parent and sub categories
        UPDATE resource_parent_categories 
        SET usage_count = GREATEST(usage_count - 1, 0) 
        WHERE id = OLD.parent_category_id;
        
        UPDATE resource_sub_categories 
        SET usage_count = GREATEST(usage_count - 1, 0) 
        WHERE id = OLD.subcategory_id;
        
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_category_usage_count_trigger
    AFTER INSERT OR DELETE ON resources
    FOR EACH ROW EXECUTE FUNCTION update_category_usage_count();

-- Reservation count update trigger
CREATE OR REPLACE FUNCTION update_resource_reservation_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE resources 
        SET reservation_count = reservation_count + 1 
        WHERE id = NEW.resource_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE resources 
        SET reservation_count = GREATEST(reservation_count - 1, 0) 
        WHERE id = OLD.resource_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_resource_reservation_count_trigger
    AFTER INSERT OR DELETE ON resource_reservations
    FOR EACH ROW EXECUTE FUNCTION update_resource_reservation_count();

-- Usage logging trigger
CREATE OR REPLACE FUNCTION log_resource_usage()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO resource_usage_logs (resource_id, reservation_id, user_id, action, start_time, end_time)
        VALUES (NEW.resource_id, NEW.id, NEW.user_id, 'reserved', NEW.start_time, NEW.end_time);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Log status changes
        IF OLD.status != NEW.status THEN
            INSERT INTO resource_usage_logs (resource_id, reservation_id, user_id, action, additional_data)
            VALUES (NEW.resource_id, NEW.id, NEW.user_id, 'status_changed', 
                   jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status));
        END IF;
        
        -- Log check-in
        IF OLD.checked_in_at IS NULL AND NEW.checked_in_at IS NOT NULL THEN
            INSERT INTO resource_usage_logs (resource_id, reservation_id, user_id, action, start_time)
            VALUES (NEW.resource_id, NEW.id, NEW.checked_in_by, 'checked_in', NEW.checked_in_at);
        END IF;
        
        -- Log check-out
        IF OLD.checked_out_at IS NULL AND NEW.checked_out_at IS NOT NULL THEN
            INSERT INTO resource_usage_logs (resource_id, reservation_id, user_id, action, end_time, actual_duration)
            VALUES (NEW.resource_id, NEW.id, NEW.checked_out_by, 'checked_out', NEW.checked_out_at,
                   NEW.checked_out_at - NEW.checked_in_at);
        END IF;
        
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

CREATE TRIGGER log_resource_usage_trigger
    AFTER INSERT OR UPDATE ON resource_reservations
    FOR EACH ROW EXECUTE FUNCTION log_resource_usage();

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

-- Enable RLS on all tables
ALTER TABLE resource_parent_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_sub_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_attribute_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_usage_logs ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS POLICIES
-- =============================================

-- Helper function to check if user has resource permission
CREATE OR REPLACE FUNCTION has_resource_permission(user_uuid UUID, permission_key TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles p
        LEFT JOIN custom_roles cr ON p.role = cr.role_key
        WHERE p.id = user_uuid
        AND (
            p.role = 'super_admin' OR
            (cr.permissions->permission_key)::boolean = true
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Parent Categories Policies
CREATE POLICY "Everyone can view active parent categories" ON resource_parent_categories
    FOR SELECT USING (status = 'active');

CREATE POLICY "Users with permission can manage parent categories" ON resource_parent_categories
    FOR ALL USING (has_resource_permission(auth.uid(), 'resources.categories.view'));

-- Sub Categories Policies
CREATE POLICY "Users can view sub categories" ON resource_sub_categories
    FOR SELECT USING (has_resource_permission(auth.uid(), 'resources.categories.view'));

CREATE POLICY "Users can create sub categories" ON resource_sub_categories
    FOR INSERT WITH CHECK (has_resource_permission(auth.uid(), 'resources.categories.create'));

CREATE POLICY "Users can update sub categories" ON resource_sub_categories
    FOR UPDATE USING (has_resource_permission(auth.uid(), 'resources.categories.edit'));

CREATE POLICY "Users can delete sub categories" ON resource_sub_categories
    FOR DELETE USING (has_resource_permission(auth.uid(), 'resources.categories.delete'));

-- Attribute Definitions Policies
CREATE POLICY "Users can view attribute definitions" ON resource_attribute_definitions
    FOR SELECT USING (has_resource_permission(auth.uid(), 'resources.categories.view'));

CREATE POLICY "Users can create attribute definitions" ON resource_attribute_definitions
    FOR INSERT WITH CHECK (has_resource_permission(auth.uid(), 'resources.categories.create'));

CREATE POLICY "Users can update attribute definitions" ON resource_attribute_definitions
    FOR UPDATE USING (has_resource_permission(auth.uid(), 'resources.categories.edit'));

CREATE POLICY "Users can delete attribute definitions" ON resource_attribute_definitions
    FOR DELETE USING (has_resource_permission(auth.uid(), 'resources.categories.delete'));

-- Resources Policies
CREATE POLICY "Users can view available resources they have access to" ON resources
    FOR SELECT USING (
        status = 'available' AND (
            cardinality(access_roles) = 0 OR
            has_resource_permission(auth.uid(), 'resources.resources.view') OR
            EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = auth.uid()
                AND (
                    p.role = 'super_admin' OR
                    p.role = ANY(access_roles)
                )
            )
        )
    );

CREATE POLICY "Users with permission can manage resources" ON resources
    FOR ALL USING (has_resource_permission(auth.uid(), 'resources.resources.edit'));

-- Reservations Policies
CREATE POLICY "Users can view their own reservations" ON resource_reservations
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create reservations for accessible resources" ON resource_reservations
    FOR INSERT WITH CHECK (
        user_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM resources r
            WHERE r.id = resource_id
            AND r.status = 'available'
            AND (
                cardinality(r.access_roles) = 0 OR
                has_resource_permission(auth.uid(), 'resources.reservations.create') OR
                EXISTS (
                    SELECT 1 FROM profiles p
                    WHERE p.id = auth.uid()
                    AND (
                        p.role = 'super_admin' OR
                        p.role = ANY(r.access_roles)
                    )
                )
            )
        )
    );

CREATE POLICY "Users can update their own pending reservations" ON resource_reservations
    FOR UPDATE USING (
        user_id = auth.uid() AND 
        status = 'pending'
    ) WITH CHECK (
        user_id = auth.uid()
    );

CREATE POLICY "Staff with permission can view all reservations" ON resource_reservations
    FOR SELECT USING (has_resource_permission(auth.uid(), 'resources.reservations.view'));

-- Approvals Policies
CREATE POLICY "Approvers can view pending approvals assigned to them" ON resource_approvals
    FOR SELECT USING (
        approver_user_id = auth.uid() OR
        has_resource_permission(auth.uid(), 'resources.approvals.view')
    );

CREATE POLICY "Approvers can update their assigned approvals" ON resource_approvals
    FOR UPDATE USING (
        approver_user_id = auth.uid() AND status = 'pending'
    ) WITH CHECK (
        approver_user_id = auth.uid()
    );

-- Usage Logs Policies
CREATE POLICY "Users can view their own usage logs" ON resource_usage_logs
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Staff with permission can view all usage logs" ON resource_usage_logs
    FOR SELECT USING (has_resource_permission(auth.uid(), 'resources.analytics.view'));

-- =============================================
-- FUNCTIONS FOR COMMON OPERATIONS
-- =============================================

-- Function to get available time slots for a resource
CREATE OR REPLACE FUNCTION get_available_time_slots(
    p_resource_id UUID,
    p_date DATE,
    p_slot_duration INTERVAL DEFAULT '1 hour'
)
RETURNS TABLE (
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    is_available BOOLEAN
) AS $$
DECLARE
    r_config JSONB;
    start_hour INTEGER;
    end_hour INTEGER;
    current_slot TIMESTAMP WITH TIME ZONE;
    slot_end TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get resource booking configuration
    SELECT booking_config INTO r_config 
    FROM resources 
    WHERE id = p_resource_id;
    
    -- Default working hours if not configured
    start_hour := COALESCE((r_config->>'start_hour')::INTEGER, 9);
    end_hour := COALESCE((r_config->>'end_hour')::INTEGER, 17);
    
    -- Generate time slots for the day
    current_slot := p_date::TIMESTAMP + (start_hour || ' hours')::INTERVAL;
    
    WHILE current_slot::TIME < (end_hour || ' hours')::TIME LOOP
        slot_end := current_slot + p_slot_duration;
        
        RETURN QUERY
        SELECT 
            current_slot,
            slot_end,
            NOT EXISTS (
                SELECT 1 FROM resource_reservations rr
                WHERE rr.resource_id = p_resource_id
                AND rr.status IN ('approved', 'pending')
                AND (
                    (rr.start_time <= current_slot AND rr.end_time > current_slot) OR
                    (rr.start_time < slot_end AND rr.end_time >= slot_end) OR
                    (rr.start_time >= current_slot AND rr.end_time <= slot_end)
                )
            ) AS is_available;
            
        current_slot := slot_end;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check resource availability
CREATE OR REPLACE FUNCTION check_resource_availability(
    p_resource_id UUID,
    p_start_time TIMESTAMP WITH TIME ZONE,
    p_end_time TIMESTAMP WITH TIME ZONE,
    p_quantity INTEGER DEFAULT 1,
    p_exclude_reservation_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    available_quantity INTEGER;
    current_stock INTEGER;
BEGIN
    -- Get current stock
    SELECT current_stock_quantity INTO current_stock
    FROM resources
    WHERE id = p_resource_id AND status = 'available';
    
    IF current_stock IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Calculate available quantity during the requested time period
    SELECT current_stock - COALESCE(SUM(rr.quantity), 0) INTO available_quantity
    FROM resource_reservations rr
    WHERE rr.resource_id = p_resource_id
    AND rr.status IN ('approved', 'pending')
    AND rr.id != COALESCE(p_exclude_reservation_id, uuid_nil())
    AND (
        (rr.start_time <= p_start_time AND rr.end_time > p_start_time) OR
        (rr.start_time < p_end_time AND rr.end_time >= p_end_time) OR
        (rr.start_time >= p_start_time AND rr.end_time <= p_end_time)
    );
    
    RETURN available_quantity >= p_quantity;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- SAMPLE DATA (Optional)
-- =============================================

-- Insert sample parent categories
INSERT INTO resource_parent_categories (name, description, status, display_order) VALUES
('IT Equipment', 'Information Technology equipment and devices', 'active', 1),
('Laboratory Equipment', 'Scientific and research laboratory equipment', 'active', 2),
('Audio Visual', 'Audio visual equipment for presentations and events', 'active', 3),
('Furniture', 'Office and classroom furniture', 'active', 4),
('Vehicles', 'Transportation vehicles', 'active', 5);

-- Insert sample sub categories
INSERT INTO resource_sub_categories (parent_category_id, name, description, status, display_order)
SELECT 
    pc.id,
    sub.name,
    sub.description,
    'active',
    sub.display_order
FROM resource_parent_categories pc,
(VALUES 
    ('IT Equipment', 'Laptops', 'Portable computers for staff and students', 1),
    ('IT Equipment', 'Projectors', 'Digital projectors for presentations', 2),
    ('IT Equipment', 'Tablets', 'Tablet devices for mobile computing', 3),
    ('Laboratory Equipment', 'Microscopes', 'Scientific microscopes for research', 1),
    ('Laboratory Equipment', 'Centrifuges', 'Laboratory centrifuges for sample preparation', 2),
    ('Audio Visual', 'Speakers', 'Audio speakers for events', 1),
    ('Audio Visual', 'Microphones', 'Microphones for presentations', 2)
) AS sub(parent_name, name, description, display_order)
WHERE pc.name = sub.parent_name;

-- Add some sample attribute definitions
INSERT INTO resource_attribute_definitions (subcategory_id, attribute_key, attribute_type, is_required, description, display_order)
SELECT 
    sc.id,
    attr.key,
    attr.type::attribute_type,
    attr.required,
    attr.description,
    attr.display_order
FROM resource_sub_categories sc,
(VALUES 
    ('Laptops', 'processor', 'text', true, 'Processor model and specifications', 1),
    ('Laptops', 'ram', 'text', true, 'RAM capacity (e.g., 8GB, 16GB)', 2),
    ('Laptops', 'storage', 'text', true, 'Storage capacity and type', 3),
    ('Projectors', 'resolution', 'dropdown', true, 'Display resolution', 1),
    ('Projectors', 'brightness', 'number', true, 'Brightness in lumens', 2),
    ('Microscopes', 'magnification', 'text', true, 'Maximum magnification power', 1),
    ('Microscopes', 'type', 'dropdown', true, 'Type of microscope', 2)
) AS attr(subcategory_name, key, type, required, description, display_order)
WHERE sc.name = attr.subcategory_name;

-- Update dropdown options for resolution attribute
UPDATE resource_attribute_definitions 
SET options = '["1080p", "4K", "WUXGA", "WXGA"]'::jsonb
WHERE attribute_key = 'resolution';

-- Update dropdown options for microscope type
UPDATE resource_attribute_definitions 
SET options = '["Compound", "Stereo", "Digital", "Fluorescence"]'::jsonb
WHERE attribute_key = 'type' AND EXISTS (
    SELECT 1 FROM resource_sub_categories sc 
    WHERE sc.id = subcategory_id AND sc.name = 'Microscopes'
);

COMMENT ON TABLE resource_parent_categories IS 'Main resource categories for organizing resources';
COMMENT ON TABLE resource_sub_categories IS 'Sub-categories with dynamic attribute definitions';
COMMENT ON TABLE resource_attribute_definitions IS 'Dynamic attribute definitions for sub-categories';
COMMENT ON TABLE resources IS 'Individual resources that can be reserved and managed';
COMMENT ON TABLE resource_reservations IS 'Resource booking and reservation records';
COMMENT ON TABLE resource_approvals IS 'Approval workflow for resource reservations';
COMMENT ON TABLE resource_usage_logs IS 'Audit trail and analytics for resource usage'; 