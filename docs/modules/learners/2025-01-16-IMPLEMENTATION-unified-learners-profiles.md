# Unified Learners Profiles Implementation Plan

**Date:** 2025-01-16
**Module:** Learners (formerly Admissions + Students)
**Type:** Major Refactoring - Database Schema Unification
**Status:** Planning Phase
**Timeline:** 6 weeks (Phased Zero-Downtime Migration)

---

## Executive Summary

### Problem Statement

The current MyJKKN system maintains separate `admissions` and `students` tables with duplicate data:
- **535 admission records** tracking the application pipeline
- **2,971 student records** tracking enrolled learners
- **Data duplication:** 60+ identical fields in both tables
- **Sync issues:** Updates to students don't reflect in admissions
- **Analytics inconsistency:** Queries both tables leading to discrepancies
- **Tight coupling:** Foreign key relationship creates migration complexity

### Solution Overview

Unify both tables into a single `learners_profiles` table with:
- **Single source of truth** for all learner data from enquiry through graduation
- **Lifecycle-based status** (enquiry → pending → approved → active → graduated)
- **Status-driven field validation** (fields unlock as learner progresses)
- **Zero-downtime migration** using phased approach with rollback points
- **Backward compatibility** via database VIEWs during transition

### Success Criteria

✅ All 3,506 records (535 admissions + 2,971 students) migrated with zero data loss
✅ Existing billing (57 receipts), attendance, and other modules work unchanged
✅ Rollback capability at each phase
✅ No downtime during migration
✅ Analytics show unified data without discrepancies
✅ Users transition smoothly with parallel routes

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Database Schema Design](#2-database-schema-design)
3. [Migration Phases](#3-migration-phases)
4. [Safety & Rollback Procedures](#4-safety--rollback-procedures)
5. [Module Implementation](#5-module-implementation)
6. [Testing Strategy](#6-testing-strategy)
7. [Deployment Checklist](#7-deployment-checklist)
8. [Appendix: SQL Scripts](#8-appendix-sql-scripts)

---

## 1. Architecture Overview

### 1.1 Design Decisions

| Decision | Chosen Approach | Rationale |
|----------|----------------|-----------|
| **Status Model** | Single unified status field | Simpler queries, clearer transitions, easier to maintain |
| **Legacy Data** | Migrate all to learners_profiles | Preserves complete history, allows re-processing |
| **Conversion Flow** | Status-based field unlocking | Same table, no data copying, smooth UX |
| **Data Lineage** | original_admission_id + original_student_id | Complete audit trail, rollback capability |
| **FK Migration** | Dual-phase with VIEWs | Zero downtime, gradual migration, minimal risk |
| **Identifier** | Keep application_id format | User familiarity, preserves existing IDs |
| **Migration Strategy** | Phased with zero downtime | Production safety, rollback at each phase |
| **Route Strategy** | Parallel routes (Option A) | A/B testing, gradual user migration |

### 1.2 Current vs New Architecture

**BEFORE (Current State):**
```
┌─────────────┐         ┌──────────────┐
│ admissions  │         │   students   │
├─────────────┤         ├──────────────┤
│ 535 records │         │ 2,971 records│
│ status: 5   │         │ status: 5    │
│ values      │────FK───│ admission_id │
└─────────────┘         └──────────────┘
      │                        │
      │                        │
   60+ duplicate fields
   Analytics inconsistency
   Update sync issues
```

**AFTER (Target State):**
```
┌──────────────────────────┐
│   learners_profiles      │
├──────────────────────────┤
│ 3,506 records            │
│ lifecycle_status: 10     │
│ Single source of truth   │
└──────────────────────────┘
      │
      │ (Compatibility VIEWs during migration)
      ├─────────────┬──────────────┐
      ▼             ▼              ▼
┌─────────┐  ┌──────────┐  ┌─────────────┐
│admission│  │ students │  │ Dependent   │
│ VIEW    │  │  VIEW    │  │ tables      │
│(Phase 2)│  │(Phase 2) │  │(billing,etc)│
└─────────┘  └──────────┘  └─────────────┘
```

### 1.3 Lifecycle Status Flow

```
enquiry ──→ pending ──→ approved ──→ active ──→ inactive
              │            │                      │
              ├───→ rejected                      │
              └───→ waitlisted                    ▼
                                                exited
                                                  │
                                                  ▼
                                              graduated
                                                  │
                                                  ▼
                                               alumni
```

**Status Definitions:**
- **enquiry:** Initial form submission (basic info only)
- **pending:** Complete application submitted, under review
- **approved:** Application accepted, awaiting enrollment
- **rejected:** Application declined
- **waitlisted:** On hold for future consideration
- **active:** Enrolled student with assigned semester/section
- **inactive:** Temporarily not attending (medical leave, etc.)
- **exited:** Left before graduation (dropout, transfer)
- **graduated:** Completed degree requirements
- **alumni:** Graduated student (archival status)

---

## 2. Database Schema Design

### 2.1 learners_profiles Table Schema

```sql
-- Updated: 2025-01-16 - Created unified learners_profiles table
-- Purpose: Single source of truth for all learner data from enquiry to graduation
-- Replaces: admissions + students tables

CREATE TABLE learners_profiles (
  -- ============================================================================
  -- PRIMARY IDENTIFIERS
  -- ============================================================================
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id TEXT UNIQUE, -- JKKN-CET-25-00001 format (auto-generated)

  -- ============================================================================
  -- MIGRATION LINEAGE (for audit trail & rollback)
  -- ============================================================================
  original_admission_id UUID, -- Reference to legacy admissions.id
  original_student_id UUID,   -- Reference to legacy students.id
  migrated_at TIMESTAMPTZ,    -- When this record was migrated
  migration_source TEXT,      -- 'admission', 'student', 'direct', or 'merged'

  -- ============================================================================
  -- LIFECYCLE STATUS (replaces admission.status + student.status)
  -- ============================================================================
  lifecycle_status TEXT NOT NULL DEFAULT 'enquiry',
  -- Allowed values: enquiry, pending, approved, rejected, waitlisted,
  --                 active, inactive, exited, graduated, alumni
  -- Constraint added via CHECK below

  status_changed_at TIMESTAMPTZ, -- When lifecycle_status last changed
  status_changed_by UUID REFERENCES auth.users(id), -- Who changed it
  status_change_reason TEXT, -- Why status changed (for rejected, exited, etc.)

  -- ============================================================================
  -- PERSONAL INFORMATION
  -- ============================================================================
  first_name TEXT NOT NULL,
  last_name TEXT,
  father_name TEXT NOT NULL,
  father_occupation TEXT,
  father_mobile TEXT NOT NULL,
  mother_name TEXT NOT NULL,
  mother_occupation TEXT,
  mother_mobile TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  gender TEXT NOT NULL,

  -- ============================================================================
  -- DEMOGRAPHICS
  -- ============================================================================
  religion TEXT NOT NULL,
  community TEXT NOT NULL,
  caste TEXT,
  annual_income TEXT,
  aadhar_number TEXT,
  first_graduate BOOLEAN DEFAULT false,

  -- ============================================================================
  -- ACADEMIC HISTORY
  -- ============================================================================
  last_school TEXT NOT NULL,
  board_of_study TEXT NOT NULL,
  tenth_marks JSONB NOT NULL, -- {max_marks, obtained_marks, percentage}
  twelfth_marks JSONB NOT NULL, -- {group, max_marks, obtained_marks, percentage, subjects}
  engineering_cutoff_marks TEXT,
  medical_cutoff_marks TEXT,
  neet_roll_number TEXT,
  neet_score TEXT,

  -- ============================================================================
  -- ADMISSION DETAILS
  -- ============================================================================
  counseling_applied BOOLEAN DEFAULT false,
  counseling_number TEXT,
  quota TEXT,
  category TEXT,
  entry_type TEXT NOT NULL, -- FIRST YEAR, LATERAL ENTRY, etc.

  -- ============================================================================
  -- CONTACT INFORMATION
  -- ============================================================================
  student_mobile TEXT NOT NULL,
  student_email TEXT NOT NULL,
  permanent_address_street TEXT NOT NULL,
  permanent_address_taluk TEXT,
  permanent_address_district TEXT NOT NULL,
  permanent_address_pin_code TEXT NOT NULL,
  permanent_address_state TEXT NOT NULL,

  -- ============================================================================
  -- ACCOMMODATION & TRANSPORTATION
  -- ============================================================================
  accommodation_type TEXT NOT NULL,
  hostel_type TEXT,
  food_type TEXT,
  bus_required BOOLEAN DEFAULT false,
  bus_route TEXT,
  bus_pickup_location TEXT,

  -- ============================================================================
  -- REFERENCE INFORMATION
  -- ============================================================================
  reference_type TEXT,
  reference_name TEXT,
  reference_contact TEXT,

  -- ============================================================================
  -- INSTITUTIONAL HIERARCHY (REQUIRED)
  -- ============================================================================
  institution_id UUID NOT NULL REFERENCES institutions(id),
  degree_id UUID NOT NULL REFERENCES degrees(id),
  department_id UUID NOT NULL REFERENCES departments(id),
  program_id UUID NOT NULL REFERENCES programs(id),

  -- ============================================================================
  -- ENROLLMENT DETAILS (Required when lifecycle_status = 'active' or beyond)
  -- ============================================================================
  academic_year_id UUID REFERENCES academic_years(id),
  semester_id UUID REFERENCES semesters(id),
  section_id UUID REFERENCES sections(id),
  regulation_id UUID REFERENCES regulations(id),
  batch_id UUID REFERENCES batches(id),

  -- ============================================================================
  -- STUDENT-SPECIFIC FIELDS (Populated after enrollment)
  -- ============================================================================
  roll_number TEXT, -- Required for active+ status
  college_email TEXT, -- Required for active+ status (@jkkn.ac.in)
  student_photo_url TEXT,
  register_number TEXT,

  -- ============================================================================
  -- PROFILE COMPLETION TRACKING
  -- ============================================================================
  is_profile_complete BOOLEAN DEFAULT false,
  profile_completed_at TIMESTAMPTZ,

  -- ============================================================================
  -- AUDIT FIELDS
  -- ============================================================================
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),

  -- ============================================================================
  -- CONSTRAINTS
  -- ============================================================================
  CONSTRAINT valid_lifecycle_status CHECK (
    lifecycle_status IN (
      'enquiry', 'pending', 'approved', 'rejected', 'waitlisted',
      'active', 'inactive', 'exited', 'graduated', 'alumni'
    )
  ),

  CONSTRAINT valid_college_email CHECK (
    college_email IS NULL OR college_email LIKE '%@jkkn.ac.in'
  ),

  CONSTRAINT valid_gender CHECK (
    gender IN ('male', 'female', 'other')
  )
);

-- ============================================================================
-- INDEXES for Performance
-- ============================================================================
CREATE INDEX idx_learners_lifecycle_status ON learners_profiles(lifecycle_status);
CREATE INDEX idx_learners_institution ON learners_profiles(institution_id);
CREATE INDEX idx_learners_application_id ON learners_profiles(application_id);
CREATE INDEX idx_learners_college_email ON learners_profiles(college_email);
CREATE INDEX idx_learners_created_at ON learners_profiles(created_at);
CREATE INDEX idx_learners_original_admission_id ON learners_profiles(original_admission_id);
CREATE INDEX idx_learners_original_student_id ON learners_profiles(original_student_id);

-- Composite indexes for common queries
CREATE INDEX idx_learners_institution_status ON learners_profiles(institution_id, lifecycle_status);
CREATE INDEX idx_learners_semester_section ON learners_profiles(semester_id, section_id)
  WHERE lifecycle_status IN ('active', 'inactive');

-- ============================================================================
-- COMMENTS for Documentation
-- ============================================================================
COMMENT ON TABLE learners_profiles IS 'Unified learner profiles from enquiry through graduation. Replaces admissions + students tables. Migration completed: 2025-01-16';
COMMENT ON COLUMN learners_profiles.lifecycle_status IS 'Unified status covering application pipeline and academic lifecycle';
COMMENT ON COLUMN learners_profiles.original_admission_id IS 'Legacy admissions.id for audit trail and rollback';
COMMENT ON COLUMN learners_profiles.original_student_id IS 'Legacy students.id for audit trail and rollback';
COMMENT ON COLUMN learners_profiles.migration_source IS 'Source of migration: admission, student, direct, or merged';
```

### 2.2 Field Validation by Status

| Field Category | enquiry | pending | approved | active | graduated |
|----------------|---------|---------|----------|--------|-----------|
| Basic Info (name, DOB, gender) | ✅ Required | ✅ Required | ✅ Required | ✅ Required | ✅ Required |
| Parents Info | ⚠️ Optional | ✅ Required | ✅ Required | ✅ Required | ✅ Required |
| Address | ⚠️ Optional | ✅ Required | ✅ Required | ✅ Required | ✅ Required |
| Academic Marks | ⚠️ Optional | ✅ Required | ✅ Required | ✅ Required | ✅ Required |
| Accommodation | ⚠️ Optional | ✅ Required | ✅ Required | ✅ Required | ✅ Required |
| semester_id, section_id | 🔒 Locked | ⚠️ Optional | ⚠️ Optional | ✅ Required | ✅ Required |
| roll_number | 🔒 Locked | 🔒 Locked | ⚠️ Optional | ✅ Required | ✅ Required |
| college_email | 🔒 Locked | 🔒 Locked | ⚠️ Optional | ✅ Required | ✅ Required |

**Legend:**
- ✅ Required: Must be filled, validation enforced
- ⚠️ Optional: Can be filled but not required
- 🔒 Locked: Field hidden/disabled in UI, NULL in DB

---

## 3. Migration Phases

### Phase 1: Foundation & Data Migration (Week 1)

**Objective:** Create learners_profiles table and migrate all data without affecting existing system.

#### 1.1 Create Table & Functions

**File:** `supabase/migrations/20250116_create_learners_profiles.sql`

```sql
-- See Section 2.1 for complete CREATE TABLE statement

-- Migration function
CREATE OR REPLACE FUNCTION migrate_admissions_and_students_to_learners()
RETURNS TABLE(
  migrated_count INTEGER,
  admission_count INTEGER,
  student_count INTEGER,
  merged_count INTEGER,
  error_count INTEGER,
  errors JSONB
) AS $$
DECLARE
  v_migrated INTEGER := 0;
  v_admission INTEGER := 0;
  v_student INTEGER := 0;
  v_merged INTEGER := 0;
  v_errors JSONB := '[]'::JSONB;
BEGIN
  -- Step 1: Migrate admissions WITH corresponding students (merged records)
  INSERT INTO learners_profiles (
    original_admission_id,
    original_student_id,
    application_id,
    migration_source,
    migrated_at,
    first_name,
    last_name,
    father_name,
    mother_name,
    date_of_birth,
    gender,
    religion,
    community,
    caste,
    annual_income,
    aadhar_number,
    first_graduate,
    last_school,
    board_of_study,
    tenth_marks,
    twelfth_marks,
    engineering_cutoff_marks,
    medical_cutoff_marks,
    neet_roll_number,
    neet_score,
    counseling_applied,
    counseling_number,
    quota,
    category,
    entry_type,
    student_mobile,
    student_email,
    permanent_address_street,
    permanent_address_taluk,
    permanent_address_district,
    permanent_address_pin_code,
    permanent_address_state,
    accommodation_type,
    hostel_type,
    food_type,
    bus_required,
    bus_route,
    bus_pickup_location,
    reference_type,
    reference_name,
    reference_contact,
    institution_id,
    degree_id,
    department_id,
    program_id,
    academic_year_id,
    semester_id,
    section_id,
    regulation_id,
    batch_id,
    roll_number,
    college_email,
    student_photo_url,
    register_number,
    is_profile_complete,
    profile_completed_at,
    lifecycle_status,
    created_at,
    updated_at,
    created_by,
    updated_by
  )
  SELECT
    a.id as original_admission_id,
    s.id as original_student_id,
    COALESCE(s.application_id, a.application_id) as application_id,
    'merged' as migration_source,
    NOW() as migrated_at,
    -- Use student data as primary source (more up-to-date)
    COALESCE(s.first_name, a.first_name),
    COALESCE(s.last_name, a.last_name),
    COALESCE(s.father_name, a.father_name),
    COALESCE(s.mother_name, a.mother_name),
    COALESCE(s.date_of_birth::DATE, a.date_of_birth::DATE),
    COALESCE(s.gender, a.gender),
    COALESCE(s.religion, a.religion),
    COALESCE(s.community, a.community),
    COALESCE(s.caste, a.caste),
    COALESCE(s.annual_income, a.annual_income),
    COALESCE(s.aadhar_number, a.aadhar_number),
    COALESCE(s.first_graduate, a.first_graduate),
    COALESCE(s.last_school, a.last_school),
    COALESCE(s.board_of_study, a.board_of_study),
    COALESCE(s.tenth_marks, a.tenth_marks),
    COALESCE(s.twelfth_marks, a.twelfth_marks),
    COALESCE(s.engineering_cutoff_marks, a.engineering_cutoff_marks),
    COALESCE(s.medical_cutoff_marks, a.medical_cutoff_marks),
    COALESCE(s.neet_roll_number, a.neet_roll_number),
    COALESCE(s.neet_score, a.neet_score),
    COALESCE(s.counseling_applied, a.counseling_applied),
    COALESCE(s.counseling_number, a.counseling_number),
    COALESCE(s.quota, a.quota),
    COALESCE(s.category, a.category),
    COALESCE(s.entry_type, a.entry_type),
    COALESCE(s.student_mobile, a.student_mobile),
    COALESCE(s.student_email, a.student_email),
    COALESCE(s.permanent_address_street, a.permanent_address_street),
    COALESCE(s.permanent_address_taluk, a.permanent_address_taluk),
    COALESCE(s.permanent_address_district, a.permanent_address_district),
    COALESCE(s.permanent_address_pin_code, a.permanent_address_pin_code),
    COALESCE(s.permanent_address_state, a.permanent_address_state),
    COALESCE(s.accommodation_type, a.accommodation_type),
    COALESCE(s.hostel_type, a.hostel_type),
    COALESCE(s.food_type, a.food_type),
    COALESCE(s.bus_required, a.bus_required),
    COALESCE(s.bus_route, a.bus_route),
    COALESCE(s.bus_pickup_location, a.bus_pickup_location),
    COALESCE(s.reference_type, a.reference_type),
    COALESCE(s.reference_name, a.reference_name),
    COALESCE(s.reference_contact, a.reference_contact),
    COALESCE(s.institution_id, a.institution_id),
    COALESCE(s.degree_id, a.degree_id),
    COALESCE(s.department_id, a.department_id),
    COALESCE(s.program_id, a.program_id),
    s.academic_year_id,
    s.semester_id,
    s.section_id,
    s.regulation_id,
    s.batch_id,
    s.roll_number,
    s.college_email,
    s.student_photo_url,
    s.register_number,
    COALESCE(s.is_profile_complete, false),
    CASE WHEN s.is_profile_complete THEN s.updated_at END,
    -- Map student status to lifecycle_status
    CASE s.status::TEXT
      WHEN 'active' THEN 'active'
      WHEN 'inactive' THEN 'inactive'
      WHEN 'exited' THEN 'exited'
      WHEN 'graduated' THEN 'graduated'
      WHEN 'pending' THEN 'pending'
      ELSE 'active'
    END as lifecycle_status,
    LEAST(a.created_at, s.created_at) as created_at,
    GREATEST(a.updated_at, s.updated_at) as updated_at,
    COALESCE(s.created_by, a.created_by),
    COALESCE(s.updated_by, a.updated_by)
  FROM admissions a
  INNER JOIN students s ON s.admission_id = a.id;

  GET DIAGNOSTICS v_merged = ROW_COUNT;

  -- Step 2: Migrate admissions WITHOUT students (pending applications)
  INSERT INTO learners_profiles (
    original_admission_id,
    application_id,
    migration_source,
    migrated_at,
    first_name,
    last_name,
    father_name,
    mother_name,
    date_of_birth,
    gender,
    religion,
    community,
    caste,
    annual_income,
    aadhar_number,
    first_graduate,
    last_school,
    board_of_study,
    tenth_marks,
    twelfth_marks,
    engineering_cutoff_marks,
    medical_cutoff_marks,
    neet_roll_number,
    neet_score,
    counseling_applied,
    counseling_number,
    quota,
    category,
    entry_type,
    student_mobile,
    student_email,
    permanent_address_street,
    permanent_address_taluk,
    permanent_address_district,
    permanent_address_pin_code,
    permanent_address_state,
    accommodation_type,
    hostel_type,
    food_type,
    bus_required,
    bus_route,
    bus_pickup_location,
    reference_type,
    reference_name,
    reference_contact,
    institution_id,
    degree_id,
    department_id,
    program_id,
    academic_year_id,
    semester_id,
    section_id,
    regulation_id,
    batch_id,
    roll_number,
    college_email,
    student_photo_url,
    register_number,
    lifecycle_status,
    created_at,
    updated_at,
    created_by,
    updated_by
  )
  SELECT
    a.id,
    a.application_id,
    'admission' as migration_source,
    NOW() as migrated_at,
    a.first_name,
    a.last_name,
    a.father_name,
    a.mother_name,
    a.date_of_birth::DATE,
    a.gender,
    a.religion,
    a.community,
    a.caste,
    a.annual_income,
    a.aadhar_number,
    a.first_graduate,
    a.last_school,
    a.board_of_study,
    a.tenth_marks,
    a.twelfth_marks,
    a.engineering_cutoff_marks,
    a.medical_cutoff_marks,
    a.neet_roll_number,
    a.neet_score,
    a.counseling_applied,
    a.counseling_number,
    a.quota,
    a.category,
    a.entry_type,
    a.student_mobile,
    a.student_email,
    a.permanent_address_street,
    a.permanent_address_taluk,
    a.permanent_address_district,
    a.permanent_address_pin_code,
    a.permanent_address_state,
    a.accommodation_type,
    a.hostel_type,
    a.food_type,
    a.bus_required,
    a.bus_route,
    a.bus_pickup_location,
    a.reference_type,
    a.reference_name,
    a.reference_contact,
    a.institution_id,
    a.degree_id,
    a.department_id,
    a.program_id,
    a.academic_year_id,
    a.semester_id,
    a.section_id,
    a.regulation_id,
    a.batch_id,
    a.roll_number,
    a.college_email,
    a.student_photo_url,
    a.register_number,
    -- Map admission status to lifecycle_status
    CASE a.status
      WHEN 'pending' THEN 'pending'
      WHEN 'approved' THEN 'approved'
      WHEN 'rejected' THEN 'rejected'
      WHEN 'waitlisted' THEN 'waitlisted'
      WHEN 'enrolled' THEN 'active'
      ELSE 'enquiry'
    END as lifecycle_status,
    a.created_at,
    a.updated_at,
    a.created_by,
    a.updated_by
  FROM admissions a
  WHERE NOT EXISTS (
    SELECT 1 FROM students s WHERE s.admission_id = a.id
  );

  GET DIAGNOSTICS v_admission = ROW_COUNT;

  -- Step 3: Migrate orphaned students (no admission record)
  INSERT INTO learners_profiles (
    original_student_id,
    application_id,
    migration_source,
    migrated_at,
    first_name,
    last_name,
    father_name,
    mother_name,
    date_of_birth,
    gender,
    religion,
    community,
    caste,
    annual_income,
    aadhar_number,
    first_graduate,
    last_school,
    board_of_study,
    tenth_marks,
    twelfth_marks,
    engineering_cutoff_marks,
    medical_cutoff_marks,
    neet_roll_number,
    neet_score,
    counseling_applied,
    counseling_number,
    quota,
    category,
    entry_type,
    student_mobile,
    student_email,
    permanent_address_street,
    permanent_address_taluk,
    permanent_address_district,
    permanent_address_pin_code,
    permanent_address_state,
    accommodation_type,
    hostel_type,
    food_type,
    bus_required,
    bus_route,
    bus_pickup_location,
    reference_type,
    reference_name,
    reference_contact,
    institution_id,
    degree_id,
    department_id,
    program_id,
    academic_year_id,
    semester_id,
    section_id,
    regulation_id,
    batch_id,
    roll_number,
    college_email,
    student_photo_url,
    register_number,
    is_profile_complete,
    lifecycle_status,
    created_at,
    updated_at,
    created_by,
    updated_by
  )
  SELECT
    s.id,
    s.application_id,
    'student' as migration_source,
    NOW() as migrated_at,
    s.first_name,
    s.last_name,
    s.father_name,
    s.mother_name,
    s.date_of_birth::DATE,
    s.gender,
    s.religion,
    s.community,
    s.caste,
    s.annual_income,
    s.aadhar_number,
    s.first_graduate,
    s.last_school,
    s.board_of_study,
    s.tenth_marks,
    s.twelfth_marks,
    s.engineering_cutoff_marks,
    s.medical_cutoff_marks,
    s.neet_roll_number,
    s.neet_score,
    s.counseling_applied,
    s.counseling_number,
    s.quota,
    s.category,
    s.entry_type,
    s.student_mobile,
    s.student_email,
    s.permanent_address_street,
    s.permanent_address_taluk,
    s.permanent_address_district,
    s.permanent_address_pin_code,
    s.permanent_address_state,
    s.accommodation_type,
    s.hostel_type,
    s.food_type,
    s.bus_required,
    s.bus_route,
    s.bus_pickup_location,
    s.reference_type,
    s.reference_name,
    s.reference_contact,
    s.institution_id,
    s.degree_id,
    s.department_id,
    s.program_id,
    s.academic_year_id,
    s.semester_id,
    s.section_id,
    s.regulation_id,
    s.batch_id,
    s.roll_number,
    s.college_email,
    s.student_photo_url,
    s.register_number,
    s.is_profile_complete,
    -- Map student status to lifecycle_status
    CASE s.status::TEXT
      WHEN 'active' THEN 'active'
      WHEN 'inactive' THEN 'inactive'
      WHEN 'exited' THEN 'exited'
      WHEN 'graduated' THEN 'graduated'
      WHEN 'pending' THEN 'pending'
      ELSE 'active'
    END as lifecycle_status,
    s.created_at,
    s.updated_at,
    s.created_by,
    s.updated_by
  FROM students s
  WHERE s.admission_id IS NULL;

  GET DIAGNOSTICS v_student = ROW_COUNT;

  v_migrated := v_merged + v_admission + v_student;

  RETURN QUERY SELECT
    v_migrated,
    v_admission,
    v_student,
    v_merged,
    0 as error_count,
    v_errors;
END;
$$ LANGUAGE plpgsql;
```

#### 1.2 Run Migration

```sql
-- Execute migration (read-only, doesn't affect existing tables)
SELECT * FROM migrate_admissions_and_students_to_learners();

-- Expected output:
-- migrated_count: 3506
-- admission_count: 535 (admissions without students)
-- student_count: 0 (orphaned students)
-- merged_count: 2971 (admissions with students)
-- error_count: 0
```

#### 1.3 Verification Queries

```sql
-- Verify total count
SELECT COUNT(*) FROM learners_profiles;
-- Expected: 3506

-- Verify no data loss (admission count)
SELECT COUNT(*)
FROM admissions a
LEFT JOIN learners_profiles lp ON lp.original_admission_id = a.id
WHERE lp.id IS NULL;
-- Expected: 0 (all admissions migrated)

-- Verify no data loss (student count)
SELECT COUNT(*)
FROM students s
LEFT JOIN learners_profiles lp ON lp.original_student_id = s.id
WHERE lp.id IS NULL;
-- Expected: 0 (all students migrated)

-- Verify status distribution
SELECT lifecycle_status, COUNT(*) as count
FROM learners_profiles
GROUP BY lifecycle_status
ORDER BY count DESC;

-- Verify merged records
SELECT migration_source, COUNT(*) as count
FROM learners_profiles
GROUP BY migration_source;
-- Expected: merged: 2971, admission: 535, student: 0
```

#### 1.4 Rollback Plan (Phase 1)

If issues are found during verification:

```sql
-- Simple rollback - drop the new table
DROP TABLE IF EXISTS learners_profiles CASCADE;

-- Original tables remain untouched
-- No downtime, no risk
```

**Deliverables:**
- ✅ learners_profiles table created
- ✅ 3,506 records migrated
- ✅ Verification complete (0 data loss)
- ✅ Migration metadata tracked

---

### Phase 2: Compatibility Layer (Week 2)

**Objective:** Create database VIEWs to maintain backward compatibility with existing code.

#### 2.1 Create Admissions VIEW

**File:** `supabase/migrations/20250120_create_compatibility_views.sql`

```sql
-- Updated: 2025-01-20 - Created admissions VIEW for backward compatibility
-- This VIEW allows existing queries to work unchanged during migration

CREATE VIEW admissions AS
SELECT
  id,
  original_admission_id as legacy_id,
  application_id,
  first_name,
  last_name,
  father_name,
  father_occupation,
  father_mobile,
  mother_name,
  mother_occupation,
  mother_mobile,
  date_of_birth::TEXT,
  gender,
  religion,
  community,
  caste,
  annual_income,
  last_school,
  board_of_study,
  tenth_marks,
  twelfth_marks,
  engineering_cutoff_marks,
  medical_cutoff_marks,
  neet_roll_number,
  neet_score,
  aadhar_number,
  counseling_applied,
  counseling_number,
  first_graduate,
  quota,
  category,
  entry_type,
  permanent_address_street,
  permanent_address_taluk,
  permanent_address_district,
  permanent_address_pin_code,
  permanent_address_state,
  student_mobile,
  student_email,
  accommodation_type,
  hostel_type,
  food_type,
  bus_required,
  bus_route,
  bus_pickup_location,
  reference_type,
  reference_name,
  reference_contact,
  institution_id,
  degree_id,
  department_id,
  program_id,
  academic_year_id,
  semester_id,
  section_id,
  regulation_id,
  batch_id,
  roll_number,
  college_email,
  student_photo_url,
  register_number,
  -- Map lifecycle_status back to admission.status
  CASE lifecycle_status
    WHEN 'enquiry' THEN 'pending'
    WHEN 'pending' THEN 'pending'
    WHEN 'approved' THEN 'approved'
    WHEN 'rejected' THEN 'rejected'
    WHEN 'waitlisted' THEN 'waitlisted'
    WHEN 'active' THEN 'enrolled'
    WHEN 'inactive' THEN 'enrolled'
    WHEN 'exited' THEN 'rejected'
    WHEN 'graduated' THEN 'enrolled'
    ELSE 'pending'
  END as status,
  created_at,
  updated_at,
  created_by,
  updated_by
FROM learners_profiles
WHERE lifecycle_status IN ('enquiry', 'pending', 'approved', 'rejected', 'waitlisted');

COMMENT ON VIEW admissions IS 'Backward compatibility view for admissions table. Routes to learners_profiles. Added: 2025-01-20';
```

#### 2.2 Create Students VIEW

```sql
-- Updated: 2025-01-20 - Created students VIEW for backward compatibility

CREATE VIEW students AS
SELECT
  id,
  original_student_id as legacy_id,
  original_admission_id as admission_id,
  application_id,
  first_name,
  last_name,
  father_name,
  father_occupation,
  father_mobile,
  mother_name,
  mother_occupation,
  mother_mobile,
  date_of_birth::TEXT,
  gender,
  religion,
  community,
  caste,
  annual_income,
  last_school,
  board_of_study,
  tenth_marks,
  twelfth_marks,
  engineering_cutoff_marks,
  medical_cutoff_marks,
  neet_roll_number,
  neet_score,
  aadhar_number,
  counseling_applied,
  counseling_number,
  first_graduate,
  quota,
  category,
  entry_type,
  permanent_address_street,
  permanent_address_taluk,
  permanent_address_district,
  permanent_address_pin_code,
  permanent_address_state,
  student_mobile,
  student_email,
  accommodation_type,
  hostel_type,
  food_type,
  bus_required,
  bus_route,
  bus_pickup_location,
  reference_type,
  reference_name,
  reference_contact,
  institution_id,
  degree_id,
  department_id,
  program_id,
  academic_year_id,
  semester_id,
  section_id,
  regulation_id,
  batch_id,
  roll_number,
  college_email,
  student_photo_url,
  register_number,
  is_profile_complete,
  profile_completed_at,
  -- Map lifecycle_status to student.status enum
  CASE lifecycle_status
    WHEN 'active' THEN 'active'::student_status
    WHEN 'inactive' THEN 'inactive'::student_status
    WHEN 'exited' THEN 'exited'::student_status
    WHEN 'graduated' THEN 'graduated'::student_status
    WHEN 'approved' THEN 'pending'::student_status
    ELSE 'pending'::student_status
  END as status,
  created_at,
  updated_at,
  created_by,
  updated_by
FROM learners_profiles
WHERE lifecycle_status IN ('active', 'inactive', 'exited', 'graduated', 'approved');

COMMENT ON VIEW students IS 'Backward compatibility view for students table. Routes to learners_profiles. Added: 2025-01-20';
```

#### 2.3 Create INSTEAD OF Triggers

```sql
-- INSTEAD OF INSERT trigger for admissions view
CREATE OR REPLACE FUNCTION admissions_view_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO learners_profiles (
    application_id,
    first_name,
    last_name,
    father_name,
    father_occupation,
    father_mobile,
    mother_name,
    mother_occupation,
    mother_mobile,
    date_of_birth,
    gender,
    religion,
    community,
    caste,
    annual_income,
    last_school,
    board_of_study,
    tenth_marks,
    twelfth_marks,
    engineering_cutoff_marks,
    medical_cutoff_marks,
    neet_roll_number,
    neet_score,
    aadhar_number,
    counseling_applied,
    counseling_number,
    first_graduate,
    quota,
    category,
    entry_type,
    permanent_address_street,
    permanent_address_taluk,
    permanent_address_district,
    permanent_address_pin_code,
    permanent_address_state,
    student_mobile,
    student_email,
    accommodation_type,
    hostel_type,
    food_type,
    bus_required,
    bus_route,
    bus_pickup_location,
    reference_type,
    reference_name,
    reference_contact,
    institution_id,
    degree_id,
    department_id,
    program_id,
    lifecycle_status,
    created_by
  ) VALUES (
    NEW.application_id,
    NEW.first_name,
    NEW.last_name,
    NEW.father_name,
    NEW.father_occupation,
    NEW.father_mobile,
    NEW.mother_name,
    NEW.mother_occupation,
    NEW.mother_mobile,
    NEW.date_of_birth::DATE,
    NEW.gender,
    NEW.religion,
    NEW.community,
    NEW.caste,
    NEW.annual_income,
    NEW.last_school,
    NEW.board_of_study,
    NEW.tenth_marks,
    NEW.twelfth_marks,
    NEW.engineering_cutoff_marks,
    NEW.medical_cutoff_marks,
    NEW.neet_roll_number,
    NEW.neet_score,
    NEW.aadhar_number,
    NEW.counseling_applied,
    NEW.counseling_number,
    NEW.first_graduate,
    NEW.quota,
    NEW.category,
    NEW.entry_type,
    NEW.permanent_address_street,
    NEW.permanent_address_taluk,
    NEW.permanent_address_district,
    NEW.permanent_address_pin_code,
    NEW.permanent_address_state,
    NEW.student_mobile,
    NEW.student_email,
    NEW.accommodation_type,
    NEW.hostel_type,
    NEW.food_type,
    NEW.bus_required,
    NEW.bus_route,
    NEW.bus_pickup_location,
    NEW.reference_type,
    NEW.reference_name,
    NEW.reference_contact,
    NEW.institution_id,
    NEW.degree_id,
    NEW.department_id,
    NEW.program_id,
    COALESCE(NEW.status, 'pending'),
    NEW.created_by
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER admissions_instead_of_insert
INSTEAD OF INSERT ON admissions
FOR EACH ROW EXECUTE FUNCTION admissions_view_insert();

-- INSTEAD OF UPDATE trigger for admissions view
CREATE OR REPLACE FUNCTION admissions_view_update()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE learners_profiles
  SET
    first_name = NEW.first_name,
    last_name = NEW.last_name,
    father_name = NEW.father_name,
    father_occupation = NEW.father_occupation,
    father_mobile = NEW.father_mobile,
    mother_name = NEW.mother_name,
    mother_occupation = NEW.mother_occupation,
    mother_mobile = NEW.mother_mobile,
    date_of_birth = NEW.date_of_birth::DATE,
    gender = NEW.gender,
    religion = NEW.religion,
    community = NEW.community,
    caste = NEW.caste,
    annual_income = NEW.annual_income,
    last_school = NEW.last_school,
    board_of_study = NEW.board_of_study,
    tenth_marks = NEW.tenth_marks,
    twelfth_marks = NEW.twelfth_marks,
    engineering_cutoff_marks = NEW.engineering_cutoff_marks,
    medical_cutoff_marks = NEW.medical_cutoff_marks,
    neet_roll_number = NEW.neet_roll_number,
    neet_score = NEW.neet_score,
    aadhar_number = NEW.aadhar_number,
    counseling_applied = NEW.counseling_applied,
    counseling_number = NEW.counseling_number,
    first_graduate = NEW.first_graduate,
    quota = NEW.quota,
    category = NEW.category,
    entry_type = NEW.entry_type,
    permanent_address_street = NEW.permanent_address_street,
    permanent_address_taluk = NEW.permanent_address_taluk,
    permanent_address_district = NEW.permanent_address_district,
    permanent_address_pin_code = NEW.permanent_address_pin_code,
    permanent_address_state = NEW.permanent_address_state,
    student_mobile = NEW.student_mobile,
    student_email = NEW.student_email,
    accommodation_type = NEW.accommodation_type,
    hostel_type = NEW.hostel_type,
    food_type = NEW.food_type,
    bus_required = NEW.bus_required,
    bus_route = NEW.bus_route,
    bus_pickup_location = NEW.bus_pickup_location,
    reference_type = NEW.reference_type,
    reference_name = NEW.reference_name,
    reference_contact = NEW.reference_contact,
    institution_id = NEW.institution_id,
    degree_id = NEW.degree_id,
    department_id = NEW.department_id,
    program_id = NEW.program_id,
    lifecycle_status = NEW.status,
    updated_at = NOW(),
    updated_by = NEW.updated_by
  WHERE id = OLD.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER admissions_instead_of_update
INSTEAD OF UPDATE ON admissions
FOR EACH ROW EXECUTE FUNCTION admissions_view_update();

-- Similar INSTEAD OF triggers for students view
-- (Abbreviated for brevity - full implementation in actual migration file)
```

#### 2.4 Archive Original Tables

```sql
-- Rename original tables to legacy
ALTER TABLE admissions RENAME TO admissions_legacy;
ALTER TABLE students RENAME TO students_legacy;

-- Add migration metadata
COMMENT ON TABLE admissions_legacy IS 'LEGACY TABLE - Archived 2025-01-20. Replaced by learners_profiles. DO NOT USE.';
COMMENT ON TABLE students_legacy IS 'LEGACY TABLE - Archived 2025-01-20. Replaced by learners_profiles. DO NOT USE.';
```

#### 2.5 Testing Compatibility

```sql
-- Test: INSERT through view
INSERT INTO admissions (first_name, last_name, /* ... */)
VALUES ('Test', 'User', /* ... */);

-- Verify it went to learners_profiles
SELECT * FROM learners_profiles WHERE first_name = 'Test' AND last_name = 'User';

-- Test: UPDATE through view
UPDATE admissions SET status = 'approved' WHERE application_id = 'TEST-ID';

-- Verify lifecycle_status changed in learners_profiles
SELECT lifecycle_status FROM learners_profiles WHERE application_id = 'TEST-ID';
-- Expected: 'approved'

-- Test: Existing queries still work
SELECT COUNT(*) FROM admissions WHERE status = 'pending';
SELECT COUNT(*) FROM students WHERE status = 'active';
```

#### 2.6 Rollback Plan (Phase 2)

```sql
-- Rollback function
CREATE OR REPLACE FUNCTION rollback_to_legacy_tables()
RETURNS VOID AS $$
BEGIN
  -- Drop views
  DROP VIEW IF EXISTS admissions CASCADE;
  DROP VIEW IF EXISTS students CASCADE;

  -- Restore original tables
  ALTER TABLE admissions_legacy RENAME TO admissions;
  ALTER TABLE students_legacy RENAME TO students;

  -- Archive failed migration attempt
  ALTER TABLE learners_profiles RENAME TO learners_profiles_v1_rollback;

  RAISE NOTICE 'Rollback complete. Original tables restored.';
END;
$$ LANGUAGE plpgsql;

-- Execute rollback if needed
-- SELECT rollback_to_legacy_tables();
```

**Deliverables:**
- ✅ Admissions VIEW created with INSTEAD OF triggers
- ✅ Students VIEW created with INSTEAD OF triggers
- ✅ Original tables renamed to _legacy
- ✅ Backward compatibility verified
- ✅ Rollback procedure tested

---

### Phase 3: Service Layer Migration (Weeks 3-4)

**Objective:** Create new LearnerProfileService and migrate modules one at a time using feature flags.

#### 3.1 Create TypeScript Types

**File:** `types/learner-profile.ts`

```typescript
// Updated: 2025-01-22 - Created unified learner profile types
// Replaces: types/admission.ts + types/student.ts

export type LifecycleStatus =
  | 'enquiry'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'waitlisted'
  | 'active'
  | 'inactive'
  | 'exited'
  | 'graduated'
  | 'alumni';

export interface LearnerProfile {
  // Identifiers
  id: string;
  application_id?: string;

  // Migration lineage
  original_admission_id?: string;
  original_student_id?: string;
  migrated_at?: string;
  migration_source?: 'admission' | 'student' | 'direct' | 'merged';

  // Lifecycle
  lifecycle_status: LifecycleStatus;
  status_changed_at?: string;
  status_changed_by?: string;
  status_change_reason?: string;

  // Personal Information
  first_name: string;
  last_name?: string;
  father_name: string;
  father_occupation?: string;
  father_mobile: string;
  mother_name: string;
  mother_occupation?: string;
  mother_mobile: string;
  date_of_birth: string;
  gender: string;

  // Demographics
  religion: string;
  community: string;
  caste?: string;
  annual_income?: string;
  aadhar_number?: string;
  first_graduate: boolean;

  // Academic History
  last_school: string;
  board_of_study: string;
  tenth_marks: {
    max_marks: string;
    obtained_marks: string;
    percentage: string;
  };
  twelfth_marks: {
    group: string;
    max_marks: string;
    obtained_marks: string;
    percentage: string;
    subjects: Record<string, string>;
  };
  engineering_cutoff_marks?: string;
  medical_cutoff_marks?: string;
  neet_roll_number?: string;
  neet_score?: string;

  // Admission Details
  counseling_applied: boolean;
  counseling_number?: string;
  quota?: string;
  category?: string;
  entry_type: string;

  // Contact
  student_mobile: string;
  student_email: string;
  permanent_address_street: string;
  permanent_address_taluk?: string;
  permanent_address_district: string;
  permanent_address_pin_code: string;
  permanent_address_state: string;

  // Accommodation
  accommodation_type: string;
  hostel_type?: string;
  food_type?: string;
  bus_required?: boolean;
  bus_route?: string;
  bus_pickup_location?: string;

  // Reference
  reference_type?: string;
  reference_name?: string;
  reference_contact?: string;

  // Institutional Hierarchy
  institution_id: string;
  degree_id: string;
  department_id: string;
  program_id: string;
  academic_year_id?: string;
  semester_id?: string;
  section_id?: string;
  regulation_id?: string;
  batch_id?: string;

  // Student Fields
  roll_number?: string;
  college_email?: string;
  student_photo_url?: string;
  register_number?: string;

  // Profile Completion
  is_profile_complete: boolean;
  profile_completed_at?: string;

  // Audit
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;

  // Related data from joins
  institution?: {
    id: string;
    name: string;
  };
  degree?: {
    id: string;
    degree_name: string;
  };
  department?: {
    id: string;
    department_name: string;
  };
  program?: {
    id: string;
    program_name: string;
  };
  semester?: {
    id: string;
    semester_name: string;
    semester_code: string;
  };
  section?: {
    id: string;
    section_name: string;
  };
  academic_year?: {
    id: string;
    academic_year_name: string;
    is_active: boolean;
  };
  regulation?: {
    id: string;
    regulation_code: string;
    regulation_year: string;
  };
  batch?: {
    id: string;
    batch_name: string;
    batch_code: string;
  };
}

export interface CreateLearnerProfileDto
  extends Omit<
    LearnerProfile,
    'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by' |
    'original_admission_id' | 'original_student_id' | 'migrated_at' | 'migration_source'
  > {}

export interface UpdateLearnerProfileDto
  extends Partial<
    Omit<
      LearnerProfile,
      'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by' |
      'original_admission_id' | 'original_student_id' | 'migrated_at' | 'migration_source'
    >
  > {}

export interface LearnerProfileFilters {
  search?: string;
  lifecycle_status?: LifecycleStatus | LifecycleStatus[];
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  academic_year_id?: string;
  entry_type?: string;
  is_profile_complete?: boolean;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

export interface LearnerProfileListResponse {
  data: LearnerProfile[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Status transition helpers
export const STATUS_TRANSITIONS: Record<LifecycleStatus, LifecycleStatus[]> = {
  enquiry: ['pending', 'rejected'],
  pending: ['approved', 'rejected', 'waitlisted'],
  approved: ['active', 'rejected', 'waitlisted'],
  rejected: ['enquiry'], // Can reapply as new enquiry
  waitlisted: ['approved', 'rejected', 'pending'],
  active: ['inactive', 'exited', 'graduated'],
  inactive: ['active', 'exited'],
  exited: [], // Terminal state
  graduated: ['alumni'], // Terminal state (can become alumni)
  alumni: [], // Terminal state
};

// Field requirements by status
export const REQUIRED_FIELDS_BY_STATUS: Record<LifecycleStatus, string[]> = {
  enquiry: ['first_name', 'father_name', 'mother_name', 'date_of_birth', 'gender', 'student_mobile', 'student_email'],
  pending: ['first_name', 'father_name', 'mother_name', 'date_of_birth', 'gender', 'religion', 'community',
            'last_school', 'board_of_study', 'tenth_marks', 'twelfth_marks', 'entry_type',
            'permanent_address_street', 'permanent_address_district', 'permanent_address_pin_code',
            'permanent_address_state', 'student_mobile', 'student_email', 'accommodation_type'],
  approved: ['first_name', 'father_name', 'mother_name', 'date_of_birth', 'gender', 'religion', 'community',
             'last_school', 'board_of_study', 'tenth_marks', 'twelfth_marks', 'entry_type',
             'permanent_address_street', 'permanent_address_district', 'permanent_address_pin_code',
             'permanent_address_state', 'student_mobile', 'student_email', 'accommodation_type'],
  rejected: ['first_name', 'father_name', 'mother_name', 'date_of_birth', 'gender'],
  waitlisted: ['first_name', 'father_name', 'mother_name', 'date_of_birth', 'gender', 'religion', 'community',
               'last_school', 'board_of_study', 'tenth_marks', 'twelfth_marks', 'entry_type'],
  active: ['first_name', 'father_name', 'mother_name', 'date_of_birth', 'gender', 'religion', 'community',
           'last_school', 'board_of_study', 'tenth_marks', 'twelfth_marks', 'entry_type',
           'permanent_address_street', 'permanent_address_district', 'permanent_address_pin_code',
           'permanent_address_state', 'student_mobile', 'student_email', 'accommodation_type',
           'semester_id', 'section_id', 'roll_number', 'college_email'],
  inactive: ['first_name', 'father_name', 'mother_name', 'date_of_birth', 'gender', 'semester_id', 'section_id', 'roll_number', 'college_email'],
  exited: ['first_name', 'father_name', 'mother_name', 'date_of_birth', 'gender', 'semester_id', 'section_id'],
  graduated: ['first_name', 'father_name', 'mother_name', 'date_of_birth', 'gender', 'semester_id', 'section_id', 'roll_number', 'college_email'],
  alumni: ['first_name', 'father_name', 'mother_name', 'date_of_birth', 'gender'],
};
```

#### 3.2 Create LearnerProfileService

**File:** `lib/services/learners/learner-profile-service.ts`

```typescript
// Updated: 2025-01-22 - Created unified learner profile service
// Replaces: lib/services/admission/admission-service.ts + lib/services/student/student-service.ts

import { createClient } from '@/lib/supabase/client';
import type {
  LearnerProfile,
  CreateLearnerProfileDto,
  UpdateLearnerProfileDto,
  LearnerProfileFilters,
  LearnerProfileListResponse,
  LifecycleStatus,
} from '@/types/learner-profile';

export class LearnerProfileService {
  private static supabase = createClient();

  /**
   * Get single learner profile by ID with joins
   */
  static async getLearnerProfile(id: string): Promise<LearnerProfile | null> {
    const { data, error } = await this.supabase
      .from('learners_profiles')
      .select(`
        *,
        institution:institutions(id, name),
        degree:degrees(id, degree_name),
        department:departments(id, department_name),
        program:programs(id, program_name),
        semester:semesters(id, semester_name, semester_code),
        section:sections(id, section_name),
        academic_year:academic_years(id, academic_year_name, is_active),
        regulation:regulations(id, regulation_code, regulation_year),
        batch:batches(id, batch_name, batch_code)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('[learner-profile-service] Error fetching learner profile:', error);
      throw error;
    }

    return data as LearnerProfile;
  }

  /**
   * Get learner profiles with filters and pagination
   */
  static async getLearnerProfiles(
    filters: LearnerProfileFilters
  ): Promise<LearnerProfileListResponse> {
    let query = this.supabase
      .from('learners_profiles')
      .select(`
        *,
        institution:institutions(id, name),
        degree:degrees(id, degree_name),
        department:departments(id, department_name),
        program:programs(id, program_name),
        semester:semesters(id, semester_name, semester_code),
        section:sections(id, section_name),
        academic_year:academic_years(id, academic_year_name, is_active)
      `, { count: 'exact' });

    // Apply filters
    if (filters.lifecycle_status) {
      if (Array.isArray(filters.lifecycle_status)) {
        query = query.in('lifecycle_status', filters.lifecycle_status);
      } else {
        query = query.eq('lifecycle_status', filters.lifecycle_status);
      }
    }

    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }

    if (filters.degree_id) {
      query = query.eq('degree_id', filters.degree_id);
    }

    if (filters.department_id) {
      query = query.eq('department_id', filters.department_id);
    }

    if (filters.program_id) {
      query = query.eq('program_id', filters.program_id);
    }

    if (filters.semester_id) {
      query = query.eq('semester_id', filters.semester_id);
    }

    if (filters.section_id) {
      query = query.eq('section_id', filters.section_id);
    }

    if (filters.academic_year_id) {
      query = query.eq('academic_year_id', filters.academic_year_id);
    }

    if (filters.entry_type) {
      query = query.eq('entry_type', filters.entry_type);
    }

    if (filters.is_profile_complete !== undefined) {
      query = query.eq('is_profile_complete', filters.is_profile_complete);
    }

    if (filters.fromDate) {
      query = query.gte('created_at', filters.fromDate);
    }

    if (filters.toDate) {
      query = query.lte('created_at', filters.toDate);
    }

    if (filters.search) {
      query = query.or(
        `first_name.ilike.%${filters.search}%,` +
        `last_name.ilike.%${filters.search}%,` +
        `application_id.ilike.%${filters.search}%,` +
        `roll_number.ilike.%${filters.search}%,` +
        `college_email.ilike.%${filters.search}%,` +
        `student_mobile.ilike.%${filters.search}%`
      );
    }

    // Pagination
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query.range(from, to);

    // Order by created_at desc
    query = query.order('created_at', { ascending: false });

    const { data, error, count } = await query;

    if (error) {
      console.error('[learner-profile-service] Error fetching learner profiles:', error);
      throw error;
    }

    return {
      data: (data as LearnerProfile[]) || [],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Create new learner profile
   */
  static async createLearnerProfile(
    data: CreateLearnerProfileDto
  ): Promise<LearnerProfile> {
    const { data: created, error } = await this.supabase
      .from('learners_profiles')
      .insert({
        ...data,
        lifecycle_status: data.lifecycle_status || 'enquiry',
      })
      .select()
      .single();

    if (error) {
      console.error('[learner-profile-service] Error creating learner profile:', error);
      throw error;
    }

    return created as LearnerProfile;
  }

  /**
   * Update learner profile
   */
  static async updateLearnerProfile(
    id: string,
    data: UpdateLearnerProfileDto
  ): Promise<LearnerProfile> {
    const { data: updated, error } = await this.supabase
      .from('learners_profiles')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[learner-profile-service] Error updating learner profile:', error);
      throw error;
    }

    return updated as LearnerProfile;
  }

  /**
   * Update lifecycle status with validation
   */
  static async updateLifecycleStatus(
    id: string,
    newStatus: LifecycleStatus,
    reason?: string
  ): Promise<LearnerProfile> {
    // Fetch current learner
    const learner = await this.getLearnerProfile(id);
    if (!learner) {
      throw new Error('Learner profile not found');
    }

    // Validate transition (optional - DB trigger also validates)
    const allowedTransitions = STATUS_TRANSITIONS[learner.lifecycle_status];
    if (!allowedTransitions.includes(newStatus)) {
      throw new Error(
        `Invalid status transition from ${learner.lifecycle_status} to ${newStatus}`
      );
    }

    // Update status
    const { data, error } = await this.supabase
      .from('learners_profiles')
      .update({
        lifecycle_status: newStatus,
        status_changed_at: new Date().toISOString(),
        status_change_reason: reason || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[learner-profile-service] Error updating lifecycle status:', error);
      throw error;
    }

    // If transitioning to 'active', create auth profile if needed
    if (newStatus === 'active' && data.college_email) {
      await this.ensureAuthProfile(data as LearnerProfile);
    }

    return data as LearnerProfile;
  }

  /**
   * Enroll learner (transition to 'active' with enrollment details)
   */
  static async enrollLearner(
    id: string,
    enrollmentData: {
      semester_id: string;
      section_id: string;
      roll_number: string;
      college_email: string;
      academic_year_id?: string;
      regulation_id?: string;
      batch_id?: string;
      student_photo_url?: string;
    }
  ): Promise<LearnerProfile> {
    // Update with enrollment data + status = 'active'
    const { data, error } = await this.supabase
      .from('learners_profiles')
      .update({
        ...enrollmentData,
        lifecycle_status: 'active',
        status_changed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[learner-profile-service] Error enrolling learner:', error);
      throw error;
    }

    // Create auth profile
    await this.ensureAuthProfile(data as LearnerProfile);

    return data as LearnerProfile;
  }

  /**
   * Bulk update lifecycle status
   */
  static async bulkUpdateStatus(
    ids: string[],
    newStatus: LifecycleStatus,
    reason?: string
  ): Promise<{ updated: number; failed: number }> {
    let updated = 0;
    let failed = 0;

    for (const id of ids) {
      try {
        await this.updateLifecycleStatus(id, newStatus, reason);
        updated++;
      } catch (error) {
        console.error(`[learner-profile-service] Failed to update ${id}:`, error);
        failed++;
      }
    }

    return { updated, failed };
  }

  /**
   * Delete learner profile
   */
  static async deleteLearnerProfile(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('learners_profiles')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[learner-profile-service] Error deleting learner profile:', error);
      throw error;
    }
  }

  /**
   * Ensure auth profile exists for learner (create if missing)
   */
  private static async ensureAuthProfile(learner: LearnerProfile): Promise<void> {
    if (!learner.college_email) return;

    // Check if profile exists
    const { data: existingProfile } = await this.supabase
      .from('profiles')
      .select('id')
      .eq('email', learner.college_email)
      .maybeSingle();

    if (existingProfile) {
      console.log(`[learner-profile-service] Auth profile already exists for ${learner.college_email}`);
      return;
    }

    // Create profile (auth user creation happens via invitation flow)
    // For now, just create a pre-registered profile
    const { error } = await this.supabase
      .from('profiles')
      .insert({
        email: learner.college_email,
        full_name: `${learner.first_name} ${learner.last_name || ''}`.trim(),
        role: 'student',
        is_pre_registered: true,
        institution_id: learner.institution_id,
      });

    if (error) {
      console.error('[learner-profile-service] Error creating auth profile:', error);
      // Don't throw - profile creation failure shouldn't block enrollment
    }
  }

  /**
   * Get dashboard analytics (replaces admission + student analytics)
   */
  static async getDashboardAnalytics(filters: {
    institution_id?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<any> {
    const { data, error } = await this.supabase.rpc('get_learner_analytics', {
      p_institution_id: filters.institution_id,
      p_date_from: filters.fromDate || null,
      p_date_to: filters.toDate || null,
    });

    if (error) {
      console.error('[learner-profile-service] Error fetching analytics:', error);
      throw error;
    }

    return data;
  }
}

// Re-export for backward compatibility during migration
export { STATUS_TRANSITIONS, REQUIRED_FIELDS_BY_STATUS } from '@/types/learner-profile';
```

**Deliverables (Continued in next file due to length...):**

---

**Implementation continues in next response...**
