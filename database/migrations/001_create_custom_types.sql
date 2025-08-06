-- Custom Types and Enums for MyJKKN Application

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "moddatetime";

-- Student Status Enum
CREATE TYPE public.student_status AS ENUM (
    'active',
    'inactive',
    'exited',
    'graduated',
    'pending'
);

-- User Role Enum (if not already created)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE public.user_role AS ENUM (
            'super_admin',
            'administrator',
            'faculty',
            'student',
            'test',
            'accounts',
            'guest',
            'staff'
        );
    END IF;
END $$;

-- Approval Status Enum
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_status') THEN
        CREATE TYPE public.approval_status AS ENUM (
            'pending',
            'approved',
            'rejected',
            'escalated'
        );
    END IF;
END $$;

-- Day of Week Enum
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'day_of_week') THEN
        CREATE TYPE public.day_of_week AS ENUM (
            'MONDAY',
            'TUESDAY',
            'WEDNESDAY',
            'THURSDAY',
            'FRIDAY',
            'SATURDAY',
            'SUNDAY'
        );
    END IF;
END $$;

-- Application Type Enum
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'application_type') THEN
        CREATE TYPE public.application_type AS ENUM (
            'Internal',
            'External'
        );
    END IF;
END $$;

-- Authentication Method Enum
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'authentication_method') THEN
        CREATE TYPE public.authentication_method AS ENUM (
            'SSO',
            'Separate Login',
            'No Authentication'
        );
    END IF;
END $$;

-- Integration Type Enum
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'integration_type') THEN
        CREATE TYPE public.integration_type AS ENUM (
            'direct_link',
            'embedded',
            'api'
        );
    END IF;
END $$;

-- Platform Type Enum
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'platform_type') THEN
        CREATE TYPE public.platform_type AS ENUM (
            'web',
            'mobile',
            'both'
        );
    END IF;
END $$;

-- Sensitivity Level Enum
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sensitivity_level') THEN
        CREATE TYPE public.sensitivity_level AS ENUM (
            'public',
            'restricted',
            'confidential'
        );
    END IF;
END $$;

-- Category Status Enum
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'category_status') THEN
        CREATE TYPE public.category_status AS ENUM (
            'active',
            'inactive',
            'archived'
        );
    END IF;
END $$;