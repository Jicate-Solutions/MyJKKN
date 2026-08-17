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

// ── Packages & installment schedules (Phase 2b) ──────────────────────────────

export type CoursePackageRow = Database['public']['Tables']['course_packages']['Row'];
export type CoursePackageInstallmentRow =
  Database['public']['Tables']['course_package_installments']['Row'];

/**
 * WARNING — the generated Row type says `amount: number` and
 * `total_amount: number`, but PostgREST serialises Postgres `numeric` as a
 * STRING ("62500.00"). The type is a lie the compiler cannot catch, and "0.00"
 * is truthy, so a missed conversion shows up as string concatenation rather
 * than a type error. CoursePackageService Number()s every money column at the
 * read boundary; nothing downstream should have to think about it again.
 */
export type CoursePackageInstallment = CoursePackageInstallmentRow;

export interface CoursePackage extends CoursePackageRow {
  /** Ordered by installment_no. Absent on list reads that don't join. */
  installments?: CoursePackageInstallment[];
}

/** One row of the schedule editor. `installment_no` is deliberately absent:
 *  fn_save_course_package renumbers from 1 in array order, so the client never
 *  sends a number that could collide with UNIQUE (package_id, installment_no). */
export interface CoursePackageInstallmentInput {
  label?: string | null;
  amount: number;
  due_date: string;
}

/**
 * Package and schedule together, because that is what fn_save_course_package
 * takes and what one form submit produces. Splitting them into two DTOs would
 * invite a two-call save, which the deferred sum trigger makes impossible —
 * see the migration header for why.
 *
 * `institution_id` is absent on purpose: the RPC resolves it from
 * course_events, so a caller cannot write a package into another tenant.
 */
export interface SaveCoursePackageDto {
  package: {
    /** null / absent = create. */
    id?: string | null;
    course_event_id: string;
    name: string;
    description?: string | null;
    total_amount: number;
    currency?: string | null;
    seat_cap?: number | null;
    sale_opens_at?: string | null;
    sale_closes_at?: string | null;
    is_active?: boolean;
    display_order?: number | null;
  };
  installments: CoursePackageInstallmentInput[];
}

export interface SaveCoursePackageResult {
  ok: boolean;
  package_id: string;
  installment_count: number;
}
