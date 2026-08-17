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

// ── Sessions & venue holds (Phase 2c) ────────────────────────────────────────

export type CourseSessionRow = Database['public']['Tables']['course_sessions']['Row'];

/** Mirrors reservation_status in Postgres. A course hold is only really "held"
 *  when this is 'approved'; 'pending' means somebody else's caretaker still has
 *  to release the room. The panel must show those as different states. */
export type CourseSessionHoldStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface CourseSession extends CourseSessionRow {
  /** Left joins — absent on reads that don't ask for them, null when unset. */
  venue_resource?: { id: string; name: string } | null;
  trainer?: { id: string; full_name: string | null } | null;
  reservation?: {
    id: string;
    status: CourseSessionHoldStatus;
    start_time: string;
    end_time: string;
  } | null;
}

/**
 * `reservation_id` is deliberately absent. It cannot be supplied by a caller:
 * course_sessions.reservation_id and resource_reservations.course_session_id are
 * FKs to each other, so the session row must exist before the reservation can
 * name it. CourseSessionService owns that ordering — see its create().
 */
export interface CreateCourseSessionDto {
  course_event_id: string;
  session_no?: number | null;
  title?: string | null;
  session_date: string;
  start_time: string;
  end_time: string;
  trainer_profile_id?: string | null;
  trainer_name?: string | null;
  /** The room to TRY to hold. A hold that is refused does not fail the session. */
  venue_resource_id?: string | null;
  venue_text?: string | null;
}

export type UpdateCourseSessionDto = Partial<
  Omit<CreateCourseSessionDto, 'course_event_id'>
>;

/** Why a venue hold was refused. Mirrors holdEventVenue's vocabulary so the two
 *  modules explain the same failure the same way. */
export type VenueHoldRefusal =
  | 'no_venue'
  | 'not_reservable'
  | 'walk_in'
  | 'no_approver'
  | 'taken'
  | 'error';

/**
 * A session write returns the row AND what happened to the room, because those
 * two can disagree: the sitting is scheduled but the hall was busy. Collapsing
 * them into one success/failure would either lose the session or claim a room
 * that was never held.
 */
export interface CourseSessionSaveResult {
  session: CourseSession;
  held: boolean;
  /** Set when held === false. */
  reason?: VenueHoldRefusal;
  /** Human detail from the booking spine, when it gave one. */
  message?: string;
  /** True when the hold exists but is 'pending' a caretaker's approval. */
  awaitingApproval?: boolean;
}

// ── Registration forms (Phase 3) ─────────────────────────────────────────────

export type CourseFormRow = Database['public']['Tables']['course_registration_forms']['Row'];
export type CourseFormSectionRow =
  Database['public']['Tables']['course_registration_form_sections']['Row'];
export type CourseFormFieldRow =
  Database['public']['Tables']['course_registration_form_fields']['Row'];

/** Mirrors course_registration_form_fields_field_type_check. Keep in step with it. */
export const COURSE_FIELD_TYPES = [
  'text', 'textarea', 'number', 'email', 'phone', 'date',
  'select', 'multiselect', 'checkbox', 'radio', 'file',
] as const;
export type CourseFieldType = (typeof COURSE_FIELD_TYPES)[number];

/** The field types whose `options` array is meaningful. */
export const COURSE_FIELD_TYPES_WITH_OPTIONS: CourseFieldType[] = [
  'select', 'multiselect', 'radio',
];

export type CourseFormField = CourseFormFieldRow;

export interface CourseFormSection extends CourseFormSectionRow {
  fields?: CourseFormField[];
}

export interface CourseForm extends CourseFormRow {
  sections?: CourseFormSection[];
  /** Convenience count for the panel; not a column. */
  field_count?: number;
}

/** One field as the builder submits it. `display_order` is absent because the
 *  RPC renumbers from 0 in array order — the client never sends it. */
export interface CourseFormFieldInput {
  field_key: string;
  label: string;
  field_type: CourseFieldType;
  is_required?: boolean;
  options?: string[];
  placeholder?: string | null;
  help_text?: string | null;
  validation?: Record<string, unknown>;
}

export interface CourseFormSectionInput {
  title: string;
  description?: string | null;
  fields: CourseFormFieldInput[];
}

/**
 * Form + structure together, because that is what fn_save_course_registration_form
 * takes and what one builder submit produces. A DTO that separated them would
 * invite a two-call save, and a failure between the two leaves a live PUBLIC form
 * with no fields.
 *
 * `institution_id` is absent on purpose — the RPC resolves it from course_events.
 */
export interface SaveCourseFormDto {
  form: {
    id?: string | null;
    course_event_id: string;
    name: string;
    slug: string;
    description?: string | null;
    display_order?: number | null;
    /** Enabling is what opens public intake. Defaults to false in the RPC. */
    is_enabled?: boolean;
  };
  sections: CourseFormSectionInput[];
}

export interface SaveCourseFormResult {
  ok: boolean;
  form_id: string;
  section_count: number;
  field_count: number;
}

// ── PUBLIC shapes (Phase 3) ──────────────────────────────────────────────────
//
// These are the ONLY shapes that may cross to an unauthenticated browser. They
// are deliberately separate types rather than reuses of the admin ones: an
// accidental institution_id or created_by in a public payload should be a type
// error, not something a reviewer has to spot. Nothing here carries a tenant id.

export interface PublicCoursePackageInstallment {
  label: string | null;
  amount: number;
  due_date: string;
}

export interface PublicCoursePackage {
  id: string;
  name: string;
  description: string | null;
  total_amount: number;
  currency: string;
  seat_cap: number | null;
  installments: PublicCoursePackageInstallment[];
}

export interface PublicCourseFormSummary {
  name: string;
  slug: string;
  description: string | null;
}

export interface PublicCourseSummary {
  title: string;
  slug: string;
  description: string | null;
  mode: CourseEventMode;
  start_date: string | null;
  end_date: string | null;
  venue_text: string | null;
  cover_image_url: string | null;
  application_opens_at: string | null;
  application_closes_at: string | null;
  /** Computed server-side from the window — there is no 'closed' status. */
  applicationsOpen: boolean;
  packages: PublicCoursePackage[];
  forms: PublicCourseFormSummary[];
}

/** A field as the public apply form renders it. No ids, no form_id, no ordering
 *  metadata — the array order IS the order. */
export interface PublicFormField {
  field_key: string;
  label: string;
  field_type: CourseFieldType;
  is_required: boolean;
  options: string[];
  placeholder: string | null;
  help_text: string | null;
}

export interface PublicFormSection {
  title: string;
  description: string | null;
  fields: PublicFormField[];
}

export interface PublicCourseApplyForm {
  courseTitle: string;
  courseSlug: string;
  formName: string;
  formSlug: string;
  formDescription: string | null;
  applicationsOpen: boolean;
  sections: PublicFormSection[];
  packages: PublicCoursePackage[];
}

/** What the submit route returns. Deliberately minimal — never the row. */
export interface PublicApplyResult {
  ok: boolean;
  /** A short human-quotable reference, not the application's uuid. */
  reference?: string;
  error?: string;
}
