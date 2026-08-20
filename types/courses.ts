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
  /** Computed server-side from the window — there is no 'closed' status. Also
   *  false when the course cannot actually be applied to: no enabled form, or
   *  packages defined but none currently on sale. */
  applicationsOpen: boolean;
  /** The packages currently ON SALE. May be empty while packagesExist is true. */
  packages: PublicCoursePackage[];
  /** Whether the course defines any active package at all.
   *
   *  Distinguishes "this course is free / unpriced" from "this course has fees
   *  but none are on sale right now" — both of which leave `packages` empty, and
   *  which call for completely different things to be said to a visitor. Without
   *  this the apply page silently dropped its package chooser and collected an
   *  application that could never become an enrollment. */
  packagesExist: boolean;
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
  /** The packages currently ON SALE. */
  packages: PublicCoursePackage[];
  /** The course defines active packages. With `packages` empty this means the
   *  fees exist but no tier is on sale, so nothing can be priced — see
   *  PublicCourseSummary.packagesExist. */
  packagesExist: boolean;
}

/** What the submit route returns. Deliberately minimal — never the row. */
export interface PublicApplyResult {
  ok: boolean;
  /** A short human-quotable reference, not the application's uuid. */
  reference?: string;
  error?: string;
}

// ── applications ────────────────────────────────────────────────────────────
// Phase 4, read side. The decide side (approve → provision a profile → issue a
// JKKN ID → enroll → bill) is not built yet, so nothing here writes.

export type CourseApplicationRow =
  Database['public']['Tables']['course_applications']['Row'];

/** CHECK constraint, not an enum — keep in step with
 *  course_applications_status_check. `withdrawn` is the applicant pulling out;
 *  `rejected` is the institution declining. */
export const COURSE_APPLICATION_STATUSES = [
  'pending', 'shortlisted', 'approved', 'rejected', 'withdrawn',
] as const;
export type CourseApplicationStatus = (typeof COURSE_APPLICATION_STATUSES)[number];

export const COURSE_APPLICANT_TYPES = ['learner', 'staff', 'external'] as const;
export type CourseApplicantType = (typeof COURSE_APPLICANT_TYPES)[number];

export interface CourseApplication extends CourseApplicationRow {
  form?: { id: string; name: string } | null;
  package?: { id: string; name: string; total_amount: number } | null;
  decided_by_profile?: { id: string; full_name: string | null } | null;
  /** Present once approved. Credentials are reissued against the ENROLLMENT
   *  rather than the profile, because the enrollment carries institution_id and
   *  is therefore the thing RLS can gate. Carries the fee position so an admin
   *  can see who has paid without opening a second screen. */
  enrollment?: {
    id: string;
    enrollment_number: string | null;
    status?: string | null;
    total_payable?: number | null;
    total_paid?: number | null;
    balance?: number | null;
  } | null;
  /** The provisioned person. jkkn_identities is reached THROUGH profiles —
   *  course_applications has no FK to it, but jkkn_identities.profile_id does,
   *  so PostgREST embeds it in reverse. Readable by the same roles that can see
   *  applications: all 7 holding courses.applications.view also hold
   *  users.jkkn_id.view, so this never silently returns null for them. */
  profile?: { id: string; jkkn_identities?: { jkkn_id: string }[] | null } | null;
}

export interface CourseApplicationFilters {
  status?: CourseApplicationStatus;
  applicant_type?: CourseApplicantType;
  /** Matches name, phone or email. */
  search?: string;
}

/** Per-status counts for the panel's summary row. Every status is present with
 *  0 rather than absent, so the UI never has to distinguish "none" from
 *  "not loaded". */
export type CourseApplicationCounts = Record<CourseApplicationStatus, number> & {
  total: number;
};

/** What fn_course_approve_application returns, plus what the route adds.
 *
 *  `tempPassword` is present ONLY when a login was newly created. It is never
 *  stored and cannot be fetched again, so the UI has to show it before this
 *  object is discarded. It is absent when an existing identity was reused —
 *  overwriting a person's password to display it to an admin would be an
 *  account takeover, not a convenience. */
export interface CourseApprovalResult {
  ok: true;
  profile_id: string;
  jkkn_id: string;
  enrollment_id: string;
  enrollment_no: string;
  package_name: string;
  total_payable: number;
  bill_count: number;
  /** The participant's CONTACT address, or null when they gave none. Never the
   *  synthetic participants.jkkn.local address Supabase Auth was created with —
   *  that is not a way of reaching anyone and must not be shown as one. */
  email: string | null;
  tempPassword: string | null;
  /** The person already had a profile and a JKKN ID — a second course, not a
   *  second identity. No password is issued in this case. */
  reusedExistingIdentity: boolean;
  /** Whether the welcome email actually went out. Sent AFTER the approval
   *  transaction and unable to fail it, so this is reported rather than thrown:
   *  when false the admin still has to hand the credentials over themselves. */
  emailSent: boolean;
  /** Present when sending was deliberately skipped — most often because the
   *  participant has no email address at all, which is normal, not a fault. */
  emailSkipReason?: string;
  /** Present when Resend actually rejected the send. */
  emailError?: string;
}

/** What the resend-credentials route returns. The password is ALWAYS here —
 *  most external participants have no email, so showing it once in the dialog
 *  is the primary delivery path, not a fallback. */
export interface CourseCredentialsResult {
  ok: true;
  jkkn_id: string;
  tempPassword: string;
  email: string | null;
  emailSent: boolean;
  emailSkipReason?: string;
  emailError?: string;
}

/** What deleting a course would destroy — returned by fn_course_delete_blockers.
 *
 *  Counted in the database, not the client: the child tables are RLS-gated, so a
 *  client-side count reports 0 for anyone who cannot see the bills and would show
 *  "nothing will be lost" over the exact rows the preview exists to protect.
 *
 *  Despite the name nothing here BLOCKS the delete — a super admin can always go
 *  through. These are the numbers the confirm dialog shows so the choice is
 *  informed rather than blind. (Contrast EventDeleteBlockers in types/events.ts,
 *  which really does refuse.) */
export interface CourseDeleteBlockers {
  course_title: string;
  applications: number;
  enrollments: number;
  packages: number;
  forms: number;
  sessions: number;
  /** Venue reservations that will be RELEASED, not deleted — the reservation row
   *  survives with course_session_id nulled. */
  venue_holds: number;
  bills: number;
  /** Every payment row, including abandoned 'initiated' Razorpay attempts. */
  payments: number;
  /** Only status='success' — money actually received. This is the number that
   *  decides whether the dialog demands type-to-confirm. */
  successful_payments: number;
  /** Sum of amount_paid across successful payments only. Comes back from
   *  Postgres numeric, so it can arrive as a string — coerce before formatting. */
  amount_received: number | string;
}

/** Receipt returned by fn_course_delete_cascade: what was actually removed. */
export interface CourseDeleteResult {
  course_title: string;
  deleted: {
    payments: number;
    bills: number;
    enrollments: number;
    applications: number;
    packages: number;
    forms: number;
    sessions: number;
  };
}
