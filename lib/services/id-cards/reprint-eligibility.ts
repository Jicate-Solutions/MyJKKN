// lib/services/id-cards/reprint-eligibility.ts
// Three guards on POST /api/id-cards/jobs: who a card may be printed for, that
// their card will actually show a face, and at whose cost.
//
// GUARD 1 — a person who has LEFT never reaches the printer.
//   The batch-print screen already filters its cohort to card-worthy lifecycle
//   statuses, but that filter lives in the browser: a direct POST with any
//   profile_id bypasses it entirely and burns a ribbon panel on a leaver's
//   card. This is the same rule enforced where it cannot be skipped.
//
// GUARD 2 — the first card is free; a replacement is counted and chargeable.
//   `id_card_print_jobs` has no reprint counter and needs none — the count of
//   the person's own PRINTED rows IS the number of cards they have had.
//
// GUARD 3 — no card without a photograph (Director decision, 2026-08-26).
//   The QR carries a number, and a photograph of somebody else's card scans
//   identically. The PHOTO is the identity control. Without one the renderer
//   draws initials (render-card.tsx `initialsFromName`) and the card proves
//   nothing at a gate, so it is refused outright. A picture from the person's
//   own LOGIN ACCOUNT does not qualify (Director 2026-09-03, reversing an
//   earlier ruling that let it print behind a confirmation click — that click
//   existed only in this endpoint's contract and no screen ever sent it). Two
//   outcomes, no override. The decision itself lives in
//   lib/id-cards/photo-quality.ts, which the worklist screen imports too so
//   both cannot drift.
//
// WHY THE MONEY IS NOT IN THIS FILE. The replacement fee AMOUNT is a Director
// decision that has not been made. Per the standing config-table rule
// (docs/architecture/config-table-pattern.md) it is a `platform_policies` row
// read at runtime, never a literal here. Until that row carries a number the
// endpoint REFUSES a replacement and says so — it must never quietly print a
// replacement for free, and it must never invent a price.
//
// NOTE `learners_profiles.lifecycle_status`, `staff` and its `is_active`
// column are existing database identifiers (terminology-exempt). The prose a
// caller actually reads says "learner" and "team member".

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  classifyCardPhoto,
  describePhotoVerdict,
  PHOTO_MISSING_CODE,
  type CardPhotoInput,
  type PhotoVerdict
} from '@/lib/id-cards/photo-quality';

// ---------------------------------------------------------------------------
// Defaults. Each is also a platform_policies row, so a super admin can retune
// it without a deploy; these values are what an unseeded database uses.
// ---------------------------------------------------------------------------

/**
 * Lifecycle statuses a learner card may be printed for.
 *
 * NOT invented here: this is the union of the three cohort choices the batch
 * print screen offers (`STATUS_CHOICES` in
 * components/admin/id-cards/id-card-batch-print.tsx, Director-locked
 * 2026-07-25), whose own comment records the rule as "card-worthy statuses
 * only — enquiries, rejected and exited learners are never offered".
 *
 * Everything outside it is refused, which covers both halves of "not on the
 * rolls": people who have LEFT (graduated / exited / inactive /
 * withdrawal_pending) and people who never joined (enquiry / rejected /
 * waitlisted / approved).
 */
export const DEFAULT_LEARNER_CARD_STATUSES: readonly string[] = [
  'active',
  'admitted',
  'account',
  'reserved'
];

/** Lifecycle statuses that mean the learner has LEFT, for a precise message. */
const LEAVER_STATUSES: readonly string[] = [
  'graduated',
  'exited',
  'inactive',
  'withdrawal_pending',
  'alumni'
];

/** Cards issued at no charge before the fee applies. The first card is free. */
export const DEFAULT_FREE_CARD_COUNT = 1;

/** Fee currency. INR is this platform's currency everywhere money is shown. */
export const DEFAULT_FEE_CURRENCY = 'INR';

// Policy keys — the `id_card.*` namespace the subsystem already uses.
export const POLICY_KEY_LEARNER_STATUSES = 'id_card.eligibility.learner_statuses';
export const POLICY_KEY_FREE_CARD_COUNT = 'id_card.replacement.free_card_count';
export const POLICY_KEY_FEE_AMOUNT = 'id_card.replacement.fee_amount';
export const POLICY_KEY_FEE_CURRENCY = 'id_card.replacement.fee_currency';
/**
 * Whether a photograph is required before a card may be printed. Standing rule
 * (docs/architecture/config-table-pattern.md): a Director decision is a config
 * row, not a literal. Absent or unreadable → REQUIRED, so the rule is on by
 * default and a database that has never seen this key still enforces it.
 */
export const POLICY_KEY_PHOTO_REQUIRED = 'id_card.photo.required';

// ---------------------------------------------------------------------------
// Guard 1 — pure decision layer
// ---------------------------------------------------------------------------

export type CardSubject =
  | { kind: 'learner'; lifecycleStatus: string | null }
  | { kind: 'team_member'; isActive: boolean | null }
  /**
   * Nobody we can classify — a profile with no learner record and no
   * team-member record (340 such profiles on this estate: administrative and
   * service accounts). Deliberately ALLOWED: this guard refuses people who can
   * be SHOWN to have left, and an unclassified person cannot be. Refusing here
   * would block a live workflow the spec never asked to change.
   */
  | { kind: 'unclassified' };

/**
 * Discriminated on a STRING, deliberately. This repo compiles with
 * `strict: false` / `strictNullChecks: false` (tsconfig.json), and under those
 * settings TypeScript does NOT narrow a union keyed on a boolean literal — a
 * `{ eligible: true } | { eligible: false; code }` shape fails to compile at
 * every use site. A string tag narrows correctly regardless.
 */
export type EligibilityVerdict =
  | { kind: 'eligible' }
  | { kind: 'refused'; code: string; message: string };

/** A learner may hold a card only while their lifecycle status is card-worthy. */
export function judgeLearnerEligibility(
  lifecycleStatus: string | null,
  allowedStatuses: readonly string[] = DEFAULT_LEARNER_CARD_STATUSES
): EligibilityVerdict {
  if (lifecycleStatus === null || lifecycleStatus.trim() === '') {
    return {
      kind: 'refused',
      code: 'learner_status_unknown',
      message:
        'This learner has no lifecycle status recorded, so we cannot confirm they are still on the rolls. Set their status on the learner profile, then print the card.'
    };
  }

  const status = lifecycleStatus.trim();
  if (allowedStatuses.includes(status)) return { kind: 'eligible' };

  const hasLeft = LEAVER_STATUSES.includes(status);
  return {
    kind: 'refused',
    code: hasLeft ? 'learner_has_left' : 'learner_not_on_rolls',
    message: hasLeft
      ? `This learner has left the institution (status "${status}"), so an ID card cannot be printed for them. Reinstate them on the learner profile first if this is wrong.`
      : `This learner is not on the rolls yet (status "${status}"), so an ID card cannot be printed for them. Cards are issued to learners whose status is one of: ${allowedStatuses.join(', ')}.`
  };
}

/** A team member may hold a card only while their record is active. */
export function judgeTeamMemberEligibility(isActive: boolean | null): EligibilityVerdict {
  if (isActive === false) {
    return {
      kind: 'refused',
      code: 'team_member_has_left',
      message:
        'This team member is no longer active, so an ID card cannot be printed for them. Reactivate their team-member record first if this is wrong.'
    };
  }
  return { kind: 'eligible' };
}

/** Route the subject to the right rule. */
export function judgeCardSubject(
  subject: CardSubject,
  allowedStatuses: readonly string[] = DEFAULT_LEARNER_CARD_STATUSES
): EligibilityVerdict {
  switch (subject.kind) {
    case 'learner':
      return judgeLearnerEligibility(subject.lifecycleStatus, allowedStatuses);
    case 'team_member':
      return judgeTeamMemberEligibility(subject.isActive);
    case 'unclassified':
      return { kind: 'eligible' };
  }
}

// ---------------------------------------------------------------------------
// Guard 3 — pure decision layer
// ---------------------------------------------------------------------------

/** String-tagged for the same `strict: false` narrowing reason as above. */
export type PhotoGateVerdict =
  /** An institutional photograph is on file — print it. */
  | { kind: 'allowed'; verdict: PhotoVerdict }
  /** No institutional photograph. No override exists for this. */
  | { kind: 'refused'; code: string; message: string };

export type PhotoGateInput = {
  photo: CardPhotoInput;
  /** False disables the rule entirely (config row); defaults to on. */
  required: boolean;
};

/**
 * Decide whether this card may be printed on the strength of its photograph.
 *
 * TWO outcomes, and the refusal has NO override (Director 2026-09-03). An
 * earlier ruling let a login-account picture print behind a confirmation
 * click; that is WITHDRAWN — the click existed only in this endpoint's
 * contract and no screen ever sent it, so it was unreachable. Only a
 * photograph the institution took qualifies. A card showing initials is not an
 * identity document, and confirming that would not make it one.
 *
 * LIMIT: this judges the shape of the stored value, not whether the image is
 * still fetchable. A well-formed but dead URL passes here and the renderer
 * falls back to initials anyway. See the "WHAT THIS DOES NOT CHECK" note in
 * lib/id-cards/photo-quality.ts.
 */
export function judgeCardPhoto(input: PhotoGateInput): PhotoGateVerdict {
  const verdict = classifyCardPhoto(input.photo);

  // Rule switched off by config — every card prints, as before this guard.
  if (!input.required) return { kind: 'allowed', verdict };

  return verdict.kind === 'official'
    ? { kind: 'allowed', verdict }
    : {
        kind: 'refused',
        code: PHOTO_MISSING_CODE,
        message: describePhotoVerdict(verdict)
      };
}

// ---------------------------------------------------------------------------
// Guard 2 — pure decision layer
// ---------------------------------------------------------------------------

export type ReplacementInput = {
  /** How many cards this person has already had PRINTED. */
  priorPrintedCount: number;
  /** Cards issued free before the fee applies. */
  freeCardCount: number;
  /** Configured fee, or null when the Director has not set one yet. */
  feeAmount: number | null;
  feeCurrency: string;
  /** The caller has seen the amount and is enqueuing the charge knowingly. */
  acknowledged: boolean;
};

export type ReplacementVerdict =
  /** Within the free allowance — enqueue as normal, nothing is owed. */
  | { kind: 'free'; replacementNumber: 0 }
  /** A replacement is due but no price exists. REFUSE; never default to zero. */
  | { kind: 'fee_not_configured'; replacementNumber: number }
  /** A replacement is due and priced, but the caller has not accepted it yet. */
  | {
      kind: 'fee_required';
      replacementNumber: number;
      feeAmount: number;
      feeCurrency: string;
    }
  /** Accepted — enqueue, and report what is owed. */
  | {
      kind: 'chargeable';
      replacementNumber: number;
      feeAmount: number;
      feeCurrency: string;
    };

/**
 * Decide whether this print is free, chargeable, or must be refused.
 *
 * `replacementNumber` counts replacements, not cards: with one free card, the
 * person's 2nd card is replacement 1.
 */
export function judgeReplacement(input: ReplacementInput): ReplacementVerdict {
  const priorPrinted = Number.isFinite(input.priorPrintedCount)
    ? Math.max(0, Math.trunc(input.priorPrintedCount))
    : 0;
  const freeCards = Number.isFinite(input.freeCardCount)
    ? Math.max(0, Math.trunc(input.freeCardCount))
    : DEFAULT_FREE_CARD_COUNT;

  if (priorPrinted < freeCards) return { kind: 'free', replacementNumber: 0 };

  const replacementNumber = priorPrinted - freeCards + 1;

  // A missing price is a refusal, never a free card and never a guessed number.
  if (
    input.feeAmount === null ||
    typeof input.feeAmount !== 'number' ||
    !Number.isFinite(input.feeAmount) ||
    input.feeAmount < 0
  ) {
    return { kind: 'fee_not_configured', replacementNumber };
  }

  return input.acknowledged
    ? {
        kind: 'chargeable',
        replacementNumber,
        feeAmount: input.feeAmount,
        feeCurrency: input.feeCurrency
      }
    : {
        kind: 'fee_required',
        replacementNumber,
        feeAmount: input.feeAmount,
        feeCurrency: input.feeCurrency
      };
}

/** The message a caller reads for a non-enqueuing replacement verdict. */
export function describeReplacement(verdict: ReplacementVerdict): string {
  switch (verdict.kind) {
    case 'fee_not_configured':
      return `This is replacement card ${verdict.replacementNumber} for this person, so a replacement fee applies — but no fee has been configured yet. A super admin must set "${POLICY_KEY_FEE_AMOUNT}" before a replacement card can be printed. The card was NOT printed and nothing was charged.`;
    case 'fee_required':
      return `This is replacement card ${verdict.replacementNumber} for this person. A replacement fee of ${verdict.feeCurrency} ${verdict.feeAmount} applies. Re-submit with "replacement_fee_acknowledged": true to print it and record the charge.`;
    case 'chargeable':
      return `Replacement card ${verdict.replacementNumber} queued. ${verdict.feeCurrency} ${verdict.feeAmount} is payable.`;
    case 'free':
      return 'First card — no charge.';
  }
}

// ---------------------------------------------------------------------------
// Async readers. Thin on purpose: every decision above is pure and tested.
// ---------------------------------------------------------------------------

// The id-card subsystem's clients carry different generics (session-bound vs
// service-role); the reads below are narrow and hand-checked.
type AnyClient = SupabaseClient<any, any, any>;

export type ReplacementPolicy = {
  freeCardCount: number;
  feeAmount: number | null;
  feeCurrency: string;
  allowedLearnerStatuses: readonly string[];
  /** Guard 3. Switched off only by a recognised off-value; see isPolicyValueOff. */
  photoRequired: boolean;
};

/**
 * Read one policy value with the institution > global precedence
 * `fn_get_id_card_policy` uses. Returns undefined when no row exists — which
 * is NOT the same as a row holding JSON null (a deliberately unset value).
 */
async function readPolicyValue(
  supabase: AnyClient,
  key: string,
  institutionId: string | null
): Promise<unknown> {
  const { data, error } = await supabase
    .from('platform_policies')
    .select('value, scope_type')
    .eq('policy_key', key)
    .eq('is_active', true)
    .in('scope_type', institutionId ? ['institution', 'global'] : ['global']);

  if (error || !data || data.length === 0) return undefined;

  const rows = data as Array<{ value: unknown; scope_type: string }>;
  const preferred =
    rows.find((r) => r.scope_type === 'institution') ??
    rows.find((r) => r.scope_type === 'global');
  return preferred ? preferred.value : undefined;
}

/**
 * The values that switch a boolean policy row OFF.
 *
 * `platform_policies.value` is JSONB and this key is set by hand, so the
 * off-switch has to survive the shapes a person actually types. These count as
 * off: the JSON boolean `false`, the number `0`, and the strings "false",
 * "off", "no", "0" (trimmed, any case).
 *
 * EVERYTHING else is NOT an off-value and leaves the rule ON — a missing row,
 * a row holding JSON null, an object, an array, a typo like "flase". That is
 * the fail-closed half: only a value we positively recognise as "off" can
 * disable a guard, so an unreadable config can never quietly open the gate.
 */
const POLICY_OFF_STRINGS: ReadonlySet<string> = new Set(['false', 'off', 'no', '0']);

export function isPolicyValueOff(value: unknown): boolean {
  if (value === false) return true;
  if (typeof value === 'number') return Number.isFinite(value) && value === 0;
  if (typeof value === 'string') return POLICY_OFF_STRINGS.has(value.trim().toLowerCase());
  return false;
}

/**
 * Resolve the replacement-fee policy. Every field fails soft to its documented
 * default EXCEPT the fee amount, which stays null when unset — an absent price
 * must refuse the print, not become zero.
 */
export async function readReplacementPolicy(
  supabase: AnyClient,
  institutionId: string | null
): Promise<ReplacementPolicy> {
  const [statuses, freeCount, amount, currency, photoRequired] = await Promise.all([
    readPolicyValue(supabase, POLICY_KEY_LEARNER_STATUSES, institutionId),
    readPolicyValue(supabase, POLICY_KEY_FREE_CARD_COUNT, institutionId),
    readPolicyValue(supabase, POLICY_KEY_FEE_AMOUNT, institutionId),
    readPolicyValue(supabase, POLICY_KEY_FEE_CURRENCY, institutionId),
    readPolicyValue(supabase, POLICY_KEY_PHOTO_REQUIRED, institutionId)
  ]);

  const allowedLearnerStatuses =
    Array.isArray(statuses) && statuses.every((s) => typeof s === 'string') && statuses.length > 0
      ? (statuses as string[])
      : DEFAULT_LEARNER_CARD_STATUSES;

  return {
    allowedLearnerStatuses,
    // Fails CLOSED. A recognised off-value (`false`, `0`, "false"/"off"/"no"/"0")
    // turns the rule off — the file's promise that this is retunable from the
    // config table without a deploy. A missing row, JSON null, an unreadable
    // value or a policy table that has never heard of this key all leave the
    // photograph required.
    photoRequired: !isPolicyValueOff(photoRequired),
    freeCardCount:
      typeof freeCount === 'number' && Number.isFinite(freeCount) && freeCount >= 0
        ? Math.trunc(freeCount)
        : DEFAULT_FREE_CARD_COUNT,
    feeAmount: typeof amount === 'number' && Number.isFinite(amount) ? amount : null,
    feeCurrency: typeof currency === 'string' && currency.trim() !== '' ? currency.trim() : DEFAULT_FEE_CURRENCY
  };
}

/** String-tagged for the same `strict: false` narrowing reason as above. */
export type SubjectLookup =
  | {
      kind: 'found';
      subject: CardSubject;
      institutionId: string | null;
      /** Guard 3 input — read in the same queries, no extra round trip. */
      photo: CardPhotoInput;
    }
  | { kind: 'error'; code: string; message: string };

/**
 * Classify the person behind a profile_id, using the same anchors the render
 * engine uses (lib/id-cards/render-data.ts): profiles.learner_id for a
 * learner, otherwise the canonical email bridge to their team-member record.
 */
export async function lookupCardSubject(
  supabase: AnyClient,
  profileId: string
): Promise<SubjectLookup> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, email, institution_id, learner_id, avatar_url')
    .eq('id', profileId)
    .maybeSingle();

  if (error) {
    return {
      kind: 'error',
      code: 'query_failed',
      message: `Could not read the profile for this person: ${error.message}`
    };
  }
  if (!profile) {
    return {
      kind: 'error',
      code: 'profile_not_found',
      message: 'No profile exists for the given profile_id, so no ID card can be printed.'
    };
  }

  const p = profile as {
    id: string;
    email: string | null;
    institution_id: string | null;
    learner_id: string | null;
    avatar_url: string | null;
  };

  if (p.learner_id) {
    const { data: learner, error: learnerError } = await supabase
      .from('learners_profiles')
      .select('id, lifecycle_status, institution_id, student_photo_url')
      .eq('id', p.learner_id)
      .maybeSingle();

    if (learnerError) {
      return {
        kind: 'error',
        code: 'query_failed',
        message: `Could not read the learner record for this person: ${learnerError.message}`
      };
    }
    if (!learner) {
      // Fail closed: the profile claims a learner record that is not there, so
      // we cannot show they are still on the rolls. Zero such rows exist on
      // this estate today, so this refuses nobody who is printable now.
      return {
        kind: 'error',
        code: 'learner_record_missing',
        message:
          'This profile is linked to a learner record that no longer exists, so we cannot confirm they are still on the rolls. No ID card was printed.'
      };
    }

    const l = learner as {
      lifecycle_status: string | null;
      institution_id: string | null;
      student_photo_url: string | null;
    };
    return {
      kind: 'found',
      subject: { kind: 'learner', lifecycleStatus: l.lifecycle_status },
      institutionId: l.institution_id ?? p.institution_id ?? null,
      photo: { officialPhotoUrl: l.student_photo_url }
    };
  }

  const email = (p.email ?? '').trim();
  if (email !== '') {
    for (const column of ['institution_email', 'email'] as const) {
      const { data: rows, error: staffError } = await supabase
        .from('staff')
        .select('id, is_active, institution_id, profile_picture')
        .eq(column, email)
        .limit(1);
      if (staffError) continue;
      if (rows && rows.length > 0) {
        const s = rows[0] as {
          is_active: boolean | null;
          institution_id: string | null;
          profile_picture: string | null;
        };
        return {
          kind: 'found',
          subject: { kind: 'team_member', isActive: s.is_active },
          institutionId: s.institution_id ?? p.institution_id ?? null,
          // 397 of 734 active team members store '' here, which is a real
          // stored value — isRenderablePhotoRef treats it as no photo.
          photo: { officialPhotoUrl: s.profile_picture }
        };
      }
    }
  }

  return {
    kind: 'found',
    subject: { kind: 'unclassified' },
    institutionId: p.institution_id ?? null,
    // No learner and no team-member record, so there is no institutional
    // photograph anywhere for them — an administrative or service account.
    // Since 2026-09-03 a login-account avatar no longer qualifies, so Guard 3
    // refuses every unclassified profile. Guard 1 still admits them (it only
    // refuses people who can be SHOWN to have left); Guard 3 is what stops
    // them, and an account with no institutional photo should not hold a card.
    photo: { officialPhotoUrl: null }
  };
}

/** How many cards this person has already had printed. */
export async function countPriorPrintedCards(
  supabase: AnyClient,
  profileId: string
): Promise<{ kind: 'ok'; count: number } | { kind: 'error'; message: string }> {
  const { count, error } = await supabase
    .from('id_card_print_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .eq('status', 'printed');

  if (error) return { kind: 'error', message: error.message };
  return { kind: 'ok', count: count ?? 0 };
}
