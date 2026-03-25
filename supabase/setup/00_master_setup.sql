-- =====================================================
-- MYJKKN SUPABASE MASTER SETUP FILE
-- =====================================================
-- Purpose: Central setup file for all database initialization
-- Created: 2025-01-16
-- Last Updated: 2025-01-16
-- 
-- IMPORTANT: This is the ONLY file for initial database setup
-- DO NOT create duplicate setup files
-- If changes are needed, UPDATE this file with proper comments
-- =====================================================

-- =====================================================
-- EXECUTION ORDER:
-- 1. Run this file first (00_master_setup.sql)
-- 2. Run 01_tables.sql
-- 3. Run 02_functions.sql  
-- 4. Run 03_policies.sql
-- 5. Run 04_triggers.sql
-- 6. Run 05_views.sql
-- 7. Run 06_seed_data.sql (optional)
-- =====================================================

-- =====================================================
-- ENABLE REQUIRED EXTENSIONS
-- =====================================================
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable crypto functions for secure operations
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enable Row Level Security
ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-jwt-secret-here';

-- =====================================================
-- CREATE CUSTOM TYPES
-- =====================================================

-- User role types
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM (
        'super_admin',
        'admin', 
        'institution_admin',
        'staff',
        'student',
        'parent',
        'guest'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Attendance status types  
DO $$ BEGIN
    CREATE TYPE attendance_status AS ENUM (
        'present',
        'absent',
        'late',
        'excused',
        'holiday'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Bill status types
DO $$ BEGIN
    CREATE TYPE bill_status AS ENUM (
        'pending',
        'partial',
        'paid',
        'overdue',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Academic year status
DO $$ BEGIN
    CREATE TYPE academic_year_status AS ENUM (
        'upcoming',
        'active',
        'completed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =====================================================
-- CREATE SCHEMAS (if using multiple schemas)
-- =====================================================
-- CREATE SCHEMA IF NOT EXISTS academics;
-- CREATE SCHEMA IF NOT EXISTS billing;
-- CREATE SCHEMA IF NOT EXISTS attendance;

-- =====================================================
-- HELPER FUNCTIONS FOR RLS
-- =====================================================

-- Get current user's role
CREATE OR REPLACE FUNCTION auth.get_user_role()
RETURNS text AS $$
BEGIN
    RETURN COALESCE(
        current_setting('request.jwt.claims', true)::json->>'role',
        'guest'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get current user's institution IDs
CREATE OR REPLACE FUNCTION auth.get_user_institutions()
RETURNS uuid[] AS $$
BEGIN
    RETURN COALESCE(
        string_to_array(
            current_setting('request.jwt.claims', true)::json->>'institution_ids',
            ','
        )::uuid[],
        ARRAY[]::uuid[]
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user has access to institution
CREATE OR REPLACE FUNCTION auth.has_institution_access(institution_id uuid)
RETURNS boolean AS $$
BEGIN
    RETURN institution_id = ANY(auth.get_user_institutions())
        OR auth.get_user_role() IN ('super_admin', 'admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- AUDIT FUNCTIONS
-- =====================================================

-- Updated timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- NOTES AND CONVENTIONS
-- =====================================================
-- 1. All tables should have: id (uuid), created_at, updated_at
-- 2. Use snake_case for all identifiers
-- 3. Add proper comments to all objects
-- 4. Use proper foreign key constraints
-- 5. Always enable RLS on tables with sensitive data
-- 6. Create indexes for frequently queried columns
-- 7. Use transactions for multi-step operations

-- =====================================================
-- END OF MASTER SETUP
-- =====================================================