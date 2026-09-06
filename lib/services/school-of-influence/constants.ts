// lib/services/school-of-influence/constants.ts
//
// School of Influence — the PURE half of the domain: the values S3 (batches)
// and S4 (apply flow) must agree on, with no Supabase client attached.
// Spec: specs/school-of-influence-batches-2026-07-30.md
//
// WHY THIS FILE EXISTS — it is not decoration.
//   These constants were born inside batch-service.ts, which is CLIENT-ONLY: its
//   first statement builds a browser Supabase client, and @supabase/ssr's
//   createBrowserClient THROWS outright when it is constructed off-browser
//   ("requires configuring getAll and setAll cookie methods",
//   @supabase/ssr/dist/main/cookies.js). So a route handler that merely imported
//   batch-service to read SOI_COHORT_KIND would crash at import time, before any
//   request logic ran.
//
//   The apply flow (S4) is server-authoritative by necessity — eligibility,
//   capacity and the intake window must not be decidable by the browser. It
//   therefore needs these values on the server. Copying them would create a
//   second source of truth for the exact things a drift would silently break
//   (which cohort kind is a batch, which statuses occupy a seat, what the locked
//   defaults are). Extracting them here keeps ONE definition: batch-service now
//   re-exports every symbol below, so its public API is unchanged and no caller
//   moves.
//
// Nothing here may import a Supabase client, directly or transitively.
// lib/services/cohort-core/lifecycle.ts is type-only and therefore safe.

import {
  MEMBERSHIP_TRANSITIONS,
  isTerminalMembershipStatus,
} from '@/lib/services/cohort-core/lifecycle';
import type { Cohort, MembershipStatus } from '@/lib/types/cohort-core';

/** cohorts.kind for a School of Influencer batch. */
export const SOI_COHORT_KIND = 'school_of_influence' as const;

/**
 * The programme's name as a person reads it (Director decision, 2026-08-13).
 *
 * The live public event is already called "JKKN School of Influencer"; only the
 * platform's own display strings still said "School of Influence", so a learner
 * met two different names for one programme.
 *
 * This is a DISPLAY value and nothing else. SOI_COHORT_KIND above stays
 * 'school_of_influence': ~23 database functions and every batch row are keyed on
 * it, and renaming a key for a spelling is a large migration for no visible
 * gain.
 */
export const SOI_PROGRAMME_DISPLAY_NAME = 'School of Influencer' as const;

/** The name rows written before the rename still carry. */
const SOI_LEGACY_DISPLAY_NAME = 'School of Influence';

/**
 * Print a stored name under the programme's current name.
 *
 * The three live `cohorts.name` rows still read "School of Influence — Batch A/
 * B/C", and this lane deliberately does not rewrite them (that is a Director
 * decision about data, not a display fix), so the swap happens on the way to the
 * screen.
 *
 * The negative lookahead is load-bearing: "School of Influencer" CONTAINS
 * "School of Influence", so a plain replace applied twice would produce
 * "School of Influencerr". With it the function is idempotent, which matters
 * because a name can pass through more than one surface.
 */
export function soiDisplayName(raw: string | null | undefined): string {
  const text = String(raw ?? '').trim();
  if (!text) return SOI_PROGRAMME_DISPLAY_NAME;
  return text.replace(/School of Influence(?!r)/g, SOI_PROGRAMME_DISPLAY_NAME);
}

/**
 * events.event_type for the programme's front door (spec §6 P3).
 *
 * The live event 84a49ec4 still carries the wizard's 'lecture' — a two-month
 * gated programme is not a lecture, and P3 asks for a truer value. Nothing in
 * the apply flow GATES on this: the apply page decides "is this a programme?"
 * by asking whether any batch points at the event, which is the fact that
 * actually matters. This constant only drives the console's link, so a
 * mis-typed event_type hides a shortcut — it never lets the wrong person apply
 * and never blocks the right one.
 */
export const SOI_EVENT_TYPE = 'school_of_influence' as const;

/**
 * Which member shapes a batch admits, and — because spec §4 says
 * soi.eligible_audiences uses the same vocabulary — who may apply.
 *
 * 'learner' and 'staff' are BOTH inside the spine's IDENTITY_MEMBER_TYPES set,
 * so both go through assertMemberIdentity. 'team' is excluded on purpose: it is
 * the one member_type the spine does NOT identity-check, which is exactly how
 * SF100 admitted 23 fabricated humans (audit 2026-07-27).
 */
export type SoiMemberType = 'learner' | 'staff';

/** D5 — how a full batch behaves. */
export type SoiBatchFullBehaviour = 'waitlist' | 'offer_another_batch';

/** D2 — who chooses the batch. */
export type SoiBatchChoiceMode = 'participant_choose' | 'staff_assign';

/**
 * Spec §4 defaults, used verbatim as the fn_get_policy_* fallback so that a
 * missing or unreadable config row degrades to the LOCKED DECISION rather than
 * to something invented at a call site. No threshold is ever hardcoded at the
 * point of use.
 */
export const SOI_POLICY_DEFAULTS = {
  /** D5 — the most people one batch can hold. Per batch. */
  batchCapacity: { key: 'soi.batch_capacity', value: 30 },
  /** D5 — what happens when a batch is full. Per batch. */
  batchFullBehaviour: {
    key: 'soi.batch_full_behaviour',
    value: 'offer_another_batch' as SoiBatchFullBehaviour,
  },
  /** D13 — each batch opens and closes applications on its own dates. Per batch. */
  intakeDatesPerBatch: { key: 'soi.intake_dates_per_batch', value: true },
  /** D7 — only a coordinator may move someone between batches. Per batch. */
  transferStaffOnly: { key: 'soi.transfer_staff_only', value: true },

  // ── Programme-level keys (S4). Read with p_scope_id = NULL, which
  // fn_get_policy resolves to the programme-wide cohort default seeded by S1
  // (precedence 5 in 20260731180000_platform_policies_cohort_scope.sql).
  /** D4 — who may apply. Values match cohort_memberships.member_type. */
  eligibleAudiences: {
    key: 'soi.eligible_audiences',
    value: ['learner', 'staff'] as SoiMemberType[],
  },
  /** D2 — applicant picks a batch, or a coordinator assigns one. */
  batchChoiceMode: {
    key: 'soi.batch_choice_mode',
    value: 'staff_assign' as SoiBatchChoiceMode,
  },
  /** D3 — submitting is an application; a coordinator admits. */
  requireApproval: { key: 'soi.require_approval', value: true },
} as const;

/**
 * The membership statuses that OCCUPY a seat, derived from the spine's own
 * transition map so it can never drift from it: everything that still has an
 * outgoing edge. Today that is invited / enrolled / active / paused — 'paused'
 * is included because a paused member is still in the batch (paused → active is
 * legal), so pausing must not silently free a seat. Mirrors the predicate of
 * uniq_soi_one_active_batch_per_person exactly.
 */
export const SOI_OCCUPYING_STATUSES: MembershipStatus[] = (
  Object.keys(MEMBERSHIP_TRANSITIONS) as MembershipStatus[]
).filter((status) => !isTerminalMembershipStatus(status));

/**
 * PURE — is this batch inside its intake window? A null bound is unbounded on
 * that side, so a batch with neither bound set is always open (that is the
 * spine's existing semantics for opens_at/closes_at, not a new rule).
 */
export function isWithinSoiIntakeWindow(batch: Cohort, now: Date = new Date()): boolean {
  const at = now.getTime();
  if (batch.opens_at && at < new Date(batch.opens_at).getTime()) return false;
  if (batch.closes_at && at > new Date(batch.closes_at).getTime()) return false;
  return true;
}

/**
 * Normalise one raw value from soi.eligible_audiences. The seeded row uses the
 * canonical tokens, but the SPEC's §4 table writes the default with the
 * deprecated synonym for a learner — so a hand-edited row, or a copy made from
 * the spec, can carry it. Mapping it here means such a row still admits the
 * people it plainly means to admit, instead of silently locking every applicant
 * out of the programme with a refusal nobody can explain.
 */
export function normaliseSoiAudience(raw: unknown): SoiMemberType | null {
  const token = String(raw ?? '').trim().toLowerCase();
  if (token === 'learner' || token === 'student') return 'learner';
  if (token === 'staff') return 'staff';
  return null;
}
