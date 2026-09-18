'use client';

/**
 * The joint-departments half of the community engagement register, on the
 * client side.
 *
 * WHY THIS FILE EXISTS AT ALL, AND WHY IT CASTS.
 *   `sh_community_engagements.department_id` is NOT NULL and singular, so one
 *   recorded initiative has exactly one department. JKKN is one walkable
 *   campus and a health camp run by Pharmacy, Nursing and Dental together is
 *   the ordinary case. The substrate that fixes that — the participants table,
 *   the per-department confirmation, the event link — ships in a SEPARATE
 *   change (migration + `SocietalService.listParticipants` /
 *   `addParticipants` / `linkEngagementToEvent`). This file is the screen half,
 *   and the two halves can land in either order.
 *
 *   So the three methods are reached through a narrow, explicitly-typed view of
 *   the service rather than by importing symbols that may not exist yet. That
 *   is the whole reason for the cast below: it is a compile-time bridge, not a
 *   claim that the methods are there. `participantsSupport()` asks the question
 *   at RUNTIME, and every screen that uses this asks it before promising a
 *   coordinator anything — CLAUDE.md rule 27: a missing capability is NAMED,
 *   never a silent no-op and never a form that looks like it saved.
 *
 * NO NEW ROUTE, NO NEW SERVICE FILE. Same reasoning as
 * hooks/solutions/use-community-engagements.ts: an API route would run as the
 * server client and hide the per-institution scoping the RLS policies exist to
 * apply, and this feature is under a hard instruction to add no routes.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { SocietalService } from '@/lib/services/solutions/societal-service';
import {
  DepartmentTrackerService,
  type SolutionDepartmentWithDetails,
} from '@/lib/services/solutions/department-tracker-service';
import { communityEngagementKeys } from '@/hooks/solutions/use-community-engagements';

// ============================================
// TYPES
// ============================================

/**
 * The three values `sh_community_engagement_participants.confirmation_status`
 * is CHECK-constrained to. A named department is a CLAIM until it confirms:
 * only 'confirmed' counts in any total, which is the entire defence against
 * naming departments that did nothing.
 */
export type ParticipantConfirmationStatus = 'pending' | 'confirmed' | 'declined';

/**
 * WHO is waiting, said explicitly. The service lane's own labels avoid the bare
 * word "waiting" on the grounds that a lead reading it takes it for their own
 * move; that reasoning is right, and the fix kept here is to name the subject
 * rather than to drop the word, because "waiting" is what the state is called
 * everywhere else on this screen.
 */
export const PARTICIPANT_STATUS_LABELS: Record<ParticipantConfirmationStatus, string> = {
  pending: 'Waiting for this department to confirm',
  confirmed: 'Confirmed',
  declined: 'Says it did not take part',
};

/** Short form for the badge itself; the long form above is the tooltip. */
export const PARTICIPANT_STATUS_SHORT: Record<ParticipantConfirmationStatus, string> = {
  pending: 'Waiting to confirm',
  confirmed: 'Confirmed',
  declined: 'Declined',
};

export interface EngagementParticipant {
  /** Present on real rows; the shape is pinned by the sibling service. */
  id?: string;
  department_id: string;
  institution_id: string | null;
  /** Hours THIS department put in, not the initiative's total. */
  hours_contributed: number | null;
  /** The department that recorded the initiative. Lead confirms nobody else. */
  is_lead: boolean;
  confirmation_status: ParticipantConfirmationStatus;
  confirmed_at: string | null;
  decline_note: string | null;
  /**
   * Optional, and never assumed. If the service joins the department name in,
   * it is used; when it does not, the screen resolves the name from the
   * solution-department list it already holds and says so when it cannot.
   */
  department_name?: string | null;
}

/**
 * The exact slice of the sibling service this screen needs. Written out rather
 * than imported so that this file compiles against a `societal-service.ts` that
 * does not have these methods yet.
 */
interface ParticipantCapableService {
  listParticipants?: (engagementId: string) => Promise<EngagementParticipant[]>;
  addParticipants?: (
    engagementId: string,
    departmentIds: string[]
  ) => Promise<AddParticipantsOutcome>;
  /**
   * `eventId` is a plain string, never null: the service rejects an empty one
   * with "Pick an event to link this initiative to." Breaking a link is a
   * different method with a different meaning, and this screen does not do it.
   */
  linkEngagementToEvent?: (engagementId: string, eventId: string) => Promise<unknown>;
}

/**
 * What naming departments actually did, reported as two separate facts.
 *
 * `added` and `alreadyNamed` are NOT summed anywhere on screen. Collapsing them
 * would let "all three were already on this initiative, nothing happened" be
 * announced as "three departments added".
 */
export interface AddParticipantsOutcome {
  added: EngagementParticipant[];
  /** `department_id`s that already had a row, whatever its confirmation state. */
  alreadyNamed: string[];
}

const societal = SocietalService as unknown as ParticipantCapableService;

/** What this environment's service can actually do, asked at runtime. */
export function participantsSupport(): {
  canList: boolean;
  canAdd: boolean;
  canLinkEvent: boolean;
} {
  return {
    canList: typeof societal.listParticipants === 'function',
    canAdd: typeof societal.addParticipants === 'function',
    canLinkEvent: typeof societal.linkEngagementToEvent === 'function',
  };
}

/**
 * Thrown when the joint-departments substrate is not present in this build.
 * A distinct type because "the feature is not installed" and "the read failed"
 * are different facts and the screen says different things about them.
 */
export class JointDepartmentsUnavailableError extends Error {
  constructor() {
    super('Joint departments are not available in this environment yet.');
    this.name = 'JointDepartmentsUnavailableError';
  }
}

// ============================================
// QUERY KEYS
// ============================================

export const engagementParticipantKeys = {
  byEngagement: (engagementId: string) =>
    ['solutions-hub', 'community-engagements', 'participants', engagementId] as const,
  solutionDepartments: () =>
    ['solutions-hub', 'community-engagements', 'solution-departments'] as const,
};

// ============================================
// THE DEPARTMENTS THAT CAN BE NAMED
// ============================================

/**
 * The solution departments — 44 rows on production — as both the picker's
 * options and the name lookup the register needs to turn a participant's
 * `department_id` into something a person can read.
 *
 * WHY NOT hooks/use-department-tracker.ts's `useSolutionDepartments`. That hook
 * is useState + useEffect, so it is not cached: the picker and every engagement
 * row in the register would each fetch the same 44 rows. This is the same
 * service call behind one React Query key, fetched once, and gated on `enabled`
 * so a page with nothing to name never pays for it.
 */
export function useSolutionDepartmentRows(enabled = true) {
  return useQuery<SolutionDepartmentWithDetails[]>({
    queryKey: engagementParticipantKeys.solutionDepartments(),
    queryFn: () => DepartmentTrackerService.listDepartments({}),
    enabled,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * `department_id` → readable name. Keyed by `department_id` (a
 * public.departments id) and NOT by `sh_solution_departments.id`, because that
 * is the key space a participant row uses.
 */
export function buildDepartmentNameMap(
  rows: SolutionDepartmentWithDetails[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (!row.department_id || map.has(row.department_id)) continue;
    const name = row.department?.department_name;
    if (!name) continue;
    const college = row.institution?.name;
    map.set(row.department_id, college ? `${name} — ${college}` : name);
  }
  return map;
}

// ============================================
// QUERIES
// ============================================

/**
 * CALLED WITH ITS RECEIVER, never detached.
 *
 * Every service in this repo is a static class extending BaseService and
 * reaches the client through `this.supabase` — `SocietalService.record` does
 * exactly that. Pulling the method off into a local and calling it bare would
 * leave `this` undefined and blow up inside the service on
 * "Cannot read properties of undefined (reading 'supabase')", which reads to a
 * coordinator as the register being broken rather than as a call written wrong.
 */
function fetchParticipants(engagementId: string): Promise<EngagementParticipant[]> {
  const list = societal.listParticipants;
  if (typeof list !== 'function') {
    return Promise.reject(new JointDepartmentsUnavailableError());
  }
  return list.call(societal, engagementId);
}

/** The departments taking part in one initiative, and where each one stands. */
export function useEngagementParticipants(engagementId: string, enabled = true) {
  return useQuery({
    queryKey: engagementParticipantKeys.byEngagement(engagementId),
    queryFn: () => fetchParticipants(engagementId),
    enabled: !!engagementId && enabled,
    ...QUERY_CONFIG.DYNAMIC_DATA,
    // AFTER the spread, deliberately: QUERY_CONFIG.DYNAMIC_DATA carries
    // `retry: 1`, so putting this line above it would be silently overridden
    // and the "not installed" rejection would be retried anyway. A missing
    // capability will not start existing on a second attempt, and an RLS
    // refusal will not either — retrying both just delays the sentence that
    // tells the reader what happened.
    retry: false,
  });
}

// ============================================
// MUTATIONS
// ============================================

/**
 * Name other departments on an initiative. They land PENDING — this call
 * cannot confirm anybody, by design, and the screen says so before the
 * coordinator submits.
 */
export function useAddEngagementParticipants() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      engagementId,
      departmentIds,
    }: {
      engagementId: string;
      departmentIds: string[];
    }) => {
      const add = societal.addParticipants;
      if (typeof add !== 'function') throw new JointDepartmentsUnavailableError();
      // `.call(societal, …)` — see fetchParticipants: a detached static method
      // loses `this` and therefore `this.supabase`.
      return add.call(societal, engagementId, departmentIds);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: engagementParticipantKeys.byEngagement(variables.engagementId),
      });
    },
  });
}

/** Link an initiative to the event it was run as. */
export function useLinkEngagementToEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      engagementId,
      eventId,
    }: {
      engagementId: string;
      eventId: string;
    }) => {
      const link = societal.linkEngagementToEvent;
      if (typeof link !== 'function') throw new JointDepartmentsUnavailableError();
      // `.call(societal, …)` — see fetchParticipants.
      return link.call(societal, engagementId, eventId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: communityEngagementKeys.all });
    },
  });
}
