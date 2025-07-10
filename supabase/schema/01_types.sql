-- =============================================
-- Custom Types and Enums
-- =============================================

-- User roles enum
CREATE TYPE user_role AS ENUM (
    'guest',
    'student', 
    'faculty',
    'staff',
    'administrator',
    'super_admin',
    'accounts',
    'admin'
);

-- Application status enum  
CREATE TYPE application_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);

-- Admission status enum
CREATE TYPE admission_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'enrolled',
    'Pending',
    'Approved',
    'Rejected'
);

-- Student status enum
CREATE TYPE student_status AS ENUM (
    'pending',
    'active',
    'inactive',
    'transferred',
    'suspended'
);

-- Billing status enum
CREATE TYPE billing_status AS ENUM (
    'unpaid',
    'partially_paid',
    'paid',
    'overdue',
    'cancelled'
);

-- Refund status enum
CREATE TYPE refund_status AS ENUM (
    'pending',
    'approved',
    'processed',
    'rejected'
);

-- Discount approval status enum
CREATE TYPE discount_approval_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);

-- Resource condition enum
CREATE TYPE resource_condition AS ENUM (
    'excellent',
    'good',
    'fair',
    'poor',
    'needs_repair',
    'out_of_service'
);

-- Resource request status enum
CREATE TYPE resource_request_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'fulfilled',
    'cancelled'
);

-- Resource request priority enum
CREATE TYPE resource_request_priority AS ENUM (
    'low',
    'medium',
    'high',
    'urgent'
);

-- Reservation status enum
CREATE TYPE reservation_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled',
    'completed'
);

-- Digital resource type enum
CREATE TYPE digital_resource_type AS ENUM (
    'software',
    'database',
    'cloud_service',
    'api',
    'storage'
);

-- Digital resource access method enum
CREATE TYPE digital_resource_access_method AS ENUM (
    'web',
    'desktop',
    'api',
    'vpn'
);

-- Timetable type enum
CREATE TYPE timetable_type AS ENUM (
    'weekly',
    'day_order'
);

-- Day of week enum
CREATE TYPE day_of_week AS ENUM (
    'monday',
    'tuesday',
    'wednesday', 
    'thursday',
    'friday',
    'saturday',
    'sunday'
);

-- Attendance status enum
CREATE TYPE attendance_status AS ENUM (
    'present',
    'absent',
    'late',
    'excused',
    'holiday'
);

-- Leave type enum
CREATE TYPE leave_type AS ENUM (
    'public_holiday',
    'exam_holiday',
    'weather_closure',
    'emergency_closure',
    'other'
); 