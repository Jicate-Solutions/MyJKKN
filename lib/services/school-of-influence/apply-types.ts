// lib/services/school-of-influence/apply-types.ts
//
// School of Influence — the wire shape of the apply flow (spec §7 S4).
// Spec: specs/school-of-influence-batches-2026-07-30.md
//
// TYPES ONLY, and deliberately in their own file. apply-service.ts imports
// @/lib/supabase/server, so a client component that reached into it for a type
// would be one elision away from pulling server code into the browser bundle.
// Splitting the contract out removes that question entirely: the apply page and
// its form import from here, the service implements it, and neither can drag
// the other's runtime along.

import type { EventRegistrationFormSection } from '@/types/tournament';
import type {
  SoiBatchChoiceMode,
  SoiBatchFullBehaviour,
  SoiMemberType,
} from '@/lib/services/school-of-influence/constants';
import type { SoiKnownAnswer } from '@/lib/services/school-of-influence/known-answers';

/**
 * Every way this flow can say no. Each one is rendered as an explicit sentence
 * on screen — CLAUDE.md rule 27: a refusal is a surface, never a silent
 * redirect and never an empty form the applicant cannot submit.
 */
export type SoiRefusalCode =
  | 'not_signed_in'
  | 'not_a_programme'
  | 'programme_not_open'
  | 'intake_closed'
  | 'not_eligible'
  | 'already_member'
  | 'already_applied'
  | 'no_open_batch'
  | 'batch_required'
  | 'batch_not_open'
  | 'batch_full'
  | 'answers_incomplete';

export interface SoiRefusal {
  code: SoiRefusalCode;
  /** Plain-English, addressed to the applicant, and always says what to do next. */
  message: string;
  /** The HTTP status the API answers a POST with. */
  status: number;
}

/** One batch as the applicant sees it — enough to explain a refusal. */
export interface SoiApplyBatchView {
  id: string;
  name: string;
  opensAt: string | null;
  closesAt: string | null;
  intakeOpen: boolean;
  occupancy: number;
  capacity: number;
  isFull: boolean;
  fullBehaviour: SoiBatchFullBehaviour;
  /** Open window AND a free seat. */
  acceptingNow: boolean;
}

export interface SoiApplyContext {
  eventId: string;
  eventName: string;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  /** Read from the session on the server. Never supplied by the browser. */
  applicant: {
    fullName: string | null;
    email: string | null;
    /** Which of the configured audiences this person actually belongs to. */
    audiences: SoiMemberType[];
  } | null;
  policy: {
    eligibleAudiences: SoiMemberType[];
    batchChoiceMode: SoiBatchChoiceMode;
    requireApproval: boolean;
  };
  batches: SoiApplyBatchView[];
  /** The applicant's live application, if any. */
  existingApplication: { id: string; status: string } | null;
  /** The applicant's live place in a batch of this programme, if any. */
  existingMembership: { cohortId: string; batchName: string; status: string } | null;
  /**
   * Questions to render. Empty when no form is built, or it is disabled.
   *
   * A question the SERVER already answers for itself is not in here at all —
   * see isSoiServerDerivedField. The applicant is never shown a box whose
   * answer the server has already decided and would override.
   */
  formSections: EventRegistrationFormSection[];
  /**
   * Answers the platform already holds about this applicant, keyed by
   * field_key. The browser fills these boxes in and leaves them EDITABLE
   * (Director decision, 2026-08-13). A field the record cannot answer is
   * absent, so its box renders blank — never a blocked application.
   */
  knownAnswers: Record<string, SoiKnownAnswer>;
  /** null means "you may apply". Anything else is shown verbatim. */
  refusal: SoiRefusal | null;
}

/**
 * The only thing a client may send: answers to the questions the coordinator
 * built, and — when the programme lets applicants choose — which batch.
 * There is deliberately NOWHERE here to put a name, an email, a profile id or a
 * learner id. Identity comes from the session, server-side, or the request is
 * refused.
 */
export interface SoiApplySubmission {
  answers?: Record<string, unknown> | null;
  batchCohortId?: string | null;
}

export interface SoiApplyResult {
  applicationId: string;
  /** 'pending' — awaiting a coordinator. 'waitlisted' — held for a free seat. */
  status: 'pending' | 'waitlisted';
  /** Set when the applicant chose a batch; null when a coordinator will assign one. */
  requestedBatchId: string | null;
  message: string;
}

/**
 * What a submit attempt produced: exactly one of the two fields is set.
 *
 * Written as two nullable fields rather than a discriminated union on purpose —
 * tsconfig.json turns `strict` and `strictNullChecks` OFF repo-wide, and under
 * those settings TypeScript does not narrow a `{ok:true}|{ok:false}` union at
 * the call site, so the caller cannot reach either member. Two explicit fields
 * need no narrowing to be safe.
 */
export interface SoiSubmitOutcome {
  result: SoiApplyResult | null;
  refusal: SoiRefusal | null;
}
