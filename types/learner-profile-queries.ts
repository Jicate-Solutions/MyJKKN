// ============================================
// LEARNER PROFILE QUERY TYPES
// ============================================
// Created: 2025-12-25
// Purpose: TypeScript types for Supabase query results with relations
// ============================================

import type { LearnerProfile } from './learner-profile';

/**
 * Learner profile with all related data (full join)
 * Used for complex queries that fetch all relationships
 */
export interface LearnerProfileWithRelations extends LearnerProfile {
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
    start_date: string;
    end_date: string;
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
  created_by_user?: {
    id: string;
    email: string;
    full_name: string | null;
  };
  updated_by_user?: {
    id: string;
    email: string;
    full_name: string | null;
  };
}

/**
 * Learner profile with basic academic relations (most common query)
 * Used for list views and general queries
 */
export interface LearnerProfileWithAcademic extends LearnerProfile {
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
    start_date: string;
    end_date: string;
    is_active: boolean;
  };
}

/**
 * Profile type from auth.users table
 * Used for user creation and profile sync
 */
export interface UserProfile {
  id: string;
  email: string;
  is_active: boolean;
  full_name?: string | null;
  role?: string;
  learner_id?: string | null;
  institution_id?: string | null;
  department_id?: string | null;
}

/**
 * Learner statistics aggregation result
 * Used for dashboard analytics
 */
export interface LearnerStatsRow {
  institution_id: string | null;
  department_id: string | null;
  program_id: string | null;
  semester_id: string | null;
  lifecycle_status: string;
  count: number;
  created_at: string;
  updated_at: string;
  institutions?: {
    id: string;
    name: string;
  } | null;
  departments?: {
    id: string;
    department_name: string;
  } | null;
  programs?: {
    id: string;
    program_name: string;
  } | null;
  semesters?: {
    id: string;
    semester_name: string;
  } | null;
}
