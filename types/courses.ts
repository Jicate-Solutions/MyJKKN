// types/courses.ts
// Course Events module types

import type { Database } from '@/types/supabase';

export type CourseEventRow = Database['public']['Tables']['course_events']['Row'];

/** Status is a CHECK constraint, not a Postgres enum — keep this list in step with
 *  course_events_status_check. There is deliberately NO 'closed': whether
 *  applications are accepted is decided solely by the application window. */
export const COURSE_EVENT_STATUSES = ['draft', 'published', 'completed', 'cancelled'] as const;
export type CourseEventStatus = (typeof COURSE_EVENT_STATUSES)[number];

export const COURSE_EVENT_MODES = ['offline', 'online', 'hybrid'] as const;
export type CourseEventMode = (typeof COURSE_EVENT_MODES)[number];

export interface CourseEvent extends CourseEventRow {
  institution?: { id: string; name: string } | null;
  created_by_profile?: { id: string; full_name: string | null } | null;
}

export interface CourseEventFilters {
  institution_id?: string;
  /** For multi-institution users. Pass the accessible IDs; never branch on isSuperAdmin. */
  institution_ids?: string[];
  status?: CourseEventStatus;
  mode?: CourseEventMode;
  year?: number;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface CreateCourseEventDto {
  institution_id: string;
  title: string;
  slug: string;
  code?: string | null;
  description?: string | null;
  mode: CourseEventMode;
  status?: CourseEventStatus;
  start_date?: string | null;
  end_date?: string | null;
  application_opens_at?: string | null;
  application_closes_at?: string | null;
  total_seats?: number | null;
  venue_text?: string | null;
  cover_image_url?: string | null;
  year?: number | null;
  edition_number?: number | null;
  previous_course_event_id?: string | null;
}

export type UpdateCourseEventDto = Partial<Omit<CreateCourseEventDto, 'institution_id'>>;
