/**
 * Cohort Core — shared TypeScript types
 * Purpose: Domain-agnostic cohort spine shared by SF100 / Foundations / CDC /
 *          Trainer programs. Mirrors the columns of public.cohorts,
 *          public.cohort_memberships and public.cohort_status_events.
 * Connected to: supabase/migrations/20260731040000_cohort_core_spine.sql
 *               lib/services/cohort-core/cohort-service.ts
 *               lib/services/cohort-core/lifecycle.ts
 * Created: 2026-07-05 (PLAN.md Phase 1.3)
 */

// ── Union types (mirror the CHECK constraints in the migration) ───────────────

/** cohorts.kind — which domain registered this container. */
export type CohortKind = 'sf100' | 'foundations' | 'cdc' | 'trainer';

/** cohorts.status lifecycle: draft → enrolling → active → completed → archived */
export type CohortStatus =
  | 'draft'
  | 'enrolling'
  | 'active'
  | 'completed'
  | 'archived';

/** cohort_memberships.member_type — the shape of the thing enrolled. */
export type MembershipType = 'team' | 'student' | 'learner' | 'staff';

/**
 * cohort_memberships.status lifecycle:
 * invited → enrolled → active → graduated | removed | paused
 */
export type MembershipStatus =
  | 'invited'
  | 'enrolled'
  | 'active'
  | 'graduated'
  | 'removed'
  | 'paused';

// ── Row interfaces (one property per DB column) ───────────────────────────────

/** A row of public.cohorts. */
export interface Cohort {
  id: string;
  kind: CohortKind;
  name: string;
  institution_id: string;
  owner_id: string | null;
  academic_year: string | null;
  opens_at: string | null;
  closes_at: string | null;
  hard_deadline: string | null;
  status: CohortStatus;
  config: Record<string, unknown>;
  archived_at: string | null;
  archived_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** A row of public.cohort_memberships. */
export interface CohortMembership {
  id: string;
  cohort_id: string;
  member_type: MembershipType;
  member_ref: string;
  status: MembershipStatus;
  role: string | null;
  joined_at: string | null;
  joined_by: string | null;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * A row of public.cohort_status_events (append-only audit).
 * cohort_id and membership_id are both nullable — an event targets either the
 * cohort or a membership.
 */
export interface CohortStatusEvent {
  id: string;
  cohort_id: string | null;
  membership_id: string | null;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ── DTOs used by the service layer ────────────────────────────────────────────

export interface CreateCohortDto {
  kind: CohortKind;
  name: string;
  institution_id: string;
  owner_id?: string | null;
  academic_year?: string | null;
  opens_at?: string | null;
  closes_at?: string | null;
  hard_deadline?: string | null;
  status?: CohortStatus;
  config?: Record<string, unknown>;
  created_by?: string | null;
}

export type UpdateCohortDto = Partial<
  Omit<CreateCohortDto, 'kind' | 'institution_id'>
> & {
  archived_at?: string | null;
  archived_by?: string | null;
};

export interface CohortFilters {
  institution_id?: string;
  kind?: CohortKind;
  status?: CohortStatus;
  academic_year?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CreateMembershipDto {
  cohort_id: string;
  member_type: MembershipType;
  member_ref: string;
  status?: MembershipStatus;
  role?: string | null;
  joined_at?: string | null;
  joined_by?: string | null;
  config?: Record<string, unknown>;
}

export type UpdateMembershipDto = Partial<
  Pick<CohortMembership, 'status' | 'role' | 'joined_at' | 'joined_by' | 'config'>
>;

export interface RecordStatusEventDto {
  cohort_id?: string | null;
  membership_id?: string | null;
  event_type: string;
  from_status?: string | null;
  to_status?: string | null;
  actor_id?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

/** Options for a lifecycle status transition (membership or cohort). */
export interface TransitionOptions {
  actorId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  /** Custom event_type; defaults to 'status_change'. */
  eventType?: string;
}

/** Paginated list envelope (matches the repo XxxListResponse shape). */
export interface CohortListResponse {
  data: Cohort[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
