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

/**
 * cohorts.kind — which domain registered this container.
 * 'school_of_influence' added 2026-07-30 (a batch IS a cohort; spec §7 S3,
 * migration 20260808130000_soi_batches_on_cohort_spine.sql widens the DB CHECK).
 */
export type CohortKind =
  | 'sf100'
  | 'foundations'
  | 'cdc'
  | 'trainer'
  | 'school_of_influence';

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

// ── D2 · Per-program rule configuration (stored under cohorts.config.rules) ────
// Each cohort toggles which SHARED lifecycle rules (PLAN rules 5/9/11) apply to
// it, and with what thresholds. Sensible defaults per kind come from
// defaultRuleConfigForKind() in lib/services/cohort-core/lifecycle.ts.

/** The shared lifecycle rules a cohort can switch on/off. */
export type CohortRuleKey = 'inactivity' | 'escalation' | 'grace';

/** Rule 11 — nudge→pause inactivity ladder. */
export interface InactivityRuleConfig {
  enabled: boolean;
  /** idle days before a member is nudged. */
  nudgeAfterDays: number;
  /** idle days before a nudged member is paused. */
  pauseAfterDays: number;
}

/** Rule 9 — escalate to the coordinator after N business days of mentor silence. */
export interface EscalationRuleConfig {
  enabled: boolean;
  businessDays: number;
}

/** Rule 5 — grace window after dropping below target. */
export interface GraceRuleConfig {
  enabled: boolean;
  graceDays: number;
}

/**
 * Per-cohort switches for the shared lifecycle rules (D2). Persisted as
 * `cohorts.config.rules`; read by the lifecycle engine to decide which generic
 * rules apply and with what thresholds. The SF100 backfill writes the full
 * `defaultRuleConfigForKind('sf100')` block into every migrated cohort.
 */
export interface CohortRuleConfig {
  inactivity: InactivityRuleConfig;
  escalation: EscalationRuleConfig;
  grace: GraceRuleConfig;
}

/**
 * Typed view of `cohorts.config` for the fields the shared engine reads. It is
 * still a superset of the untyped JSONB (domains stash their own keys too), so
 * every field is optional — read defensively.
 */
export interface CohortConfig {
  rules?: CohortRuleConfig;
  [key: string]: unknown;
}

// ── D7 · Round-close cascade ──────────────────────────────────────────────────

/** The two terminal container statuses a round-close can target. */
export type CohortCloseStatus = Extract<CohortStatus, 'completed' | 'archived'>;

/** mutate() variables for the useCloseCohort hook. */
export interface CloseCohortDto extends TransitionOptions {
  cohortId: string;
  /** terminal container status to move the cohort to; defaults to 'completed'. */
  toStatus?: CohortCloseStatus;
}

// ── D8 · Member transfer between cohorts (history preserved) ───────────────────

/** mutate() variables for the useTransferMembership hook. */
export interface TransferMembershipDto extends TransitionOptions {
  membershipId: string;
  toCohortId: string;
}

// ── PHASE 7 · THE MOAT — score / experiment / feed-forward / alumni ───────────
// Mirrors migrations 20260731092000..095000. See docs/cohort-core/PLAN.md Phase 7.

/** Within-cohort A/B arm (cohort_memberships.config.experiment_arm). */
export type ExperimentArm = 'control' | 'treatment';

/**
 * The blended-score envelope fn_cohort_blended_score merges into
 * cohort_outcomes.outcome_snapshot at close (M7.1). `scored:false` when the kind
 * has no estimator yet (only sf100 today) — then `lift` is null.
 */
export interface BlendedScoreSnapshot {
  scored: boolean;
  estimator_version: string;
  blended_baseline?: number;
  blended_outcome?: number;
  lift: number | null;
  components?: {
    baseline: { success: number; revenue: number; speed: number };
    outcome: { success: number; revenue: number; speed: number };
  };
  inputs?: Record<string, unknown>;
  reason?: string;
}

/** A row of public.cohort_experiments (M7.2 — one causal-lift result per cohort). */
export interface CohortExperiment {
  id: string;
  cohort_id: string;
  kind: CohortKind;
  n_treatment: number;
  n_control: number;
  treatment_mean_lift: number | null;
  control_mean_lift: number | null;
  /** treatment_mean − control_mean; NULL unless both arms present. Act on THIS. */
  causal_lift: number | null;
  /** mean over all arms — CONFOUNDED. Kept for contrast only; never act on it. */
  naive_lift: number | null;
  n_scored: number;
  estimator_version: string | null;
  computed_at: string;
  institution_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** cohort_adjustment_proposals.decision (M7.3). */
export type ProposalDecision = 'adopt' | 'revert' | 'inconclusive';

/** cohort_adjustment_proposals.status lifecycle: pending → approved → applied | rejected. */
export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'applied';

/** A row of public.cohort_adjustment_proposals (M7.3 — feed-forward proposal). */
export interface CohortAdjustmentProposal {
  id: string;
  based_on_cohort_id: string;
  kind: CohortKind;
  target_scope: 'program';
  target_id: string;
  causal_lift: number | null;
  decision: ProposalDecision;
  proposed_changes: Record<string, unknown>;
  rationale: string | null;
  status: ProposalStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  applied_at: string | null;
  applied_by: string | null;
  institution_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** A row of public.v_cohort_alumni_mentor_pool (M7.4 — flywheel read surface). */
export interface AlumniMentorPoolEntry {
  membership_id: string;
  source_cohort_id: string;
  kind: CohortKind;
  source_cohort_name: string;
  institution_id: string;
  academic_year: string | null;
  member_type: MembershipType;
  member_ref: string;
  is_person: boolean;
  graduated_at: string;
  blended_outcome: string | null;
  lift: string | null;
}
