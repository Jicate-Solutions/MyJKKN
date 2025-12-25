// types/academic/timetable-queries.ts
// Created: 2025-12-25
// Purpose: Type definitions for complex Supabase timetable queries with relations
// Used by: faculty-attendance-service.ts, faculty-timetable-service.ts

import { Json } from '@/types/database.types';

/**
 * Timetable with full relations for Supabase queries
 * Used when querying timetables with joined tables (sections, semesters, departments, etc.)
 */
export interface TimetableWithRelations {
  id: string;
  timetable_name?: string;
  timetable_format: string;
  start_date: string;
  end_date: string;
  selected_dates?: string[] | Json | null;
  section_id?: string | null;
  semester_id?: string | null;
  department_id?: string | null;
  program_id?: string | null;
  degree_id?: string | null;
  academic_year_id?: string | null;
  institution_id: string;
  is_active?: boolean;
  timetable_data: Json | null;
  periods?: Json | null;
  semester?: string | null;
  section?: string | null; // Legacy field for section name (some timetables store this)

  // Relations (nullable because they might not be included in every query)
  sections?: {
    id: string;
    section_name: string;
  } | null;

  semesters?: {
    id: string;
    semester_name: string;
  } | null;

  departments?: {
    id: string;
    department_name: string;
  } | null;

  programs?: {
    id: string;
    program_name: string;
  } | null;

  degrees?: {
    id: string;
    degree_name: string;
  } | null;

  institution?: {
    id: string;
    name: string;
  } | null;

  department?: {
    id: string;
    department_name: string;
  } | null;

  program?: {
    id: string;
    program_name: string;
  } | null;
}

/**
 * Structure of timetable_data JSONB field
 * Format: { [dayOrDate: string]: { [periodId: string]: SlotData } }
 */
export interface TimetableDataStructure {
  [dayOrDate: string]: {
    [periodId: string]: TimetableSlotData;
  };
}

/**
 * Individual slot data within timetable_data
 */
export interface TimetableSlotData {
  course_id?: string;
  staff_ids?: string[];
  room_id?: string;
  section_ids?: string[];
  is_break?: boolean;
  // Add other fields as needed
  [key: string]: any;
}

/**
 * Periods definition structure (JSONB field)
 */
export interface PeriodsDefinition {
  [periodId: string]: {
    period_name: string;
    start_time: string;
    end_time: string;
    period_type?: string;
  };
}

/**
 * Academic year with basic fields
 */
export interface AcademicYearBasic {
  id: string;
  academic_year_name: string;
  start_date?: string;
  end_date?: string;
  is_active?: boolean;
}

/**
 * Staff data with basic fields
 */
export interface StaffBasic {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  institution_email?: string;
  institution_id: string;
  department_id?: string | null;
}

/**
 * Course data with basic fields
 */
export interface CourseBasic {
  id: string;
  course_code: string;
  course_name: string;
  course_type?: string;
}

/**
 * Period data with basic fields
 */
export interface PeriodBasic {
  id: string;
  period_name: string;
  start_time: string;
  end_time: string;
  period_type?: string;
}
