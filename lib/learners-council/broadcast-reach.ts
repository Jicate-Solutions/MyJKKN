/**
 * Learners Council broadcast — turning a held request into plain English.
 *
 * Pure helpers only (no Supabase, no server imports) so both the server pages
 * and the browser components can share one reading of a request. The live
 * countdown has to tick in the browser, and the reach summary has to be
 * computed on the server, so neither may own this logic alone.
 *
 * Everything here is deliberately conservative. When a payload is a shape this
 * file does not recognise, it says so rather than guessing a reach — an
 * approver who is shown a confident number that happens to be wrong is worse
 * off than one who is told the number could not be established.
 *
 * Substrate: supabase/migrations/20260808214500_lc_broadcast_approval.sql
 * (applied to production 2026-08-08) and its predecessor
 * 20260807010000_lc_office_bearer_learner_notifications.sql, whose allowlist
 * decides which targeting keys can legally appear here.
 */

/**
 * Keys that make a send NARROWER than "everyone in these colleges".
 * Taken from the allowlist in fn_notification_targets_learners_only — that
 * function refuses any key outside its list, so this set cannot silently fall
 * behind the payloads that actually reach the table.
 */
const NARROWING_KEYS = ['department_id', 'program_id', 'semester_id', 'section_id'] as const;

export interface TargetingSummary {
  /** Every institution id the payload names, de-duplicated. */
  institutionIds: string[];
  /** True when the payload also narrows by department / programme / semester / section. */
  isNarrowed: boolean;
  /** False when the payload is a shape we cannot read — never assume a reach then. */
  recognised: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read the institutions a targeting payload names.
 *
 * Both shapes are stored in this column: a single object, or an array of
 * objects. The database guard normalises them identically, so this does too —
 * reading only one shape would under-report the reach of the other.
 */
export function summariseTargeting(targeting: unknown): TargetingSummary {
  const elements: Record<string, unknown>[] = Array.isArray(targeting)
    ? (targeting as unknown[]).filter(isPlainObject)
    : isPlainObject(targeting)
      ? [targeting]
      : [];

  if (elements.length === 0) {
    return { institutionIds: [], isNarrowed: false, recognised: false };
  }

  const ids = new Set<string>();
  let isNarrowed = false;

  for (const element of elements) {
    const single = element.institution_id;
    if (typeof single === 'string' && single.length > 0) ids.add(single);

    const many = element.institution_ids;
    if (Array.isArray(many)) {
      for (const value of many) {
        if (typeof value === 'string' && value.length > 0) ids.add(value);
      }
    }

    if (NARROWING_KEYS.some((key) => element[key] != null && element[key] !== '')) {
      isNarrowed = true;
    }
  }

  // A council payload always names at least one institution — the database
  // guard refuses it otherwise. No institutions therefore means we are looking
  // at something we do not understand, not at an empty audience.
  return { institutionIds: [...ids], isNarrowed, recognised: ids.size > 0 };
}

/** Who the countdown sentence is addressed to. */
export type CountdownVoice = 'approver' | 'sender';

/**
 * The auto-send window, said out loud.
 *
 * The Director chose silence-counts-as-yes knowing the consequence, so this
 * sentence never softens it: the message goes out on its own unless somebody
 * acts. `nowMs` is passed in rather than read here so a component can tick it
 * without this function becoming impure.
 */
export function describeAutoSend(
  autoSendAtIso: string | null | undefined,
  nowMs: number,
  voice: CountdownVoice
): string {
  if (!autoSendAtIso) {
    return 'No automatic send time is recorded for this message.';
  }

  const deadline = new Date(autoSendAtIso).getTime();
  if (Number.isNaN(deadline)) {
    return 'The automatic send time on this message could not be read.';
  }

  const remainingMs = deadline - nowMs;

  if (remainingMs <= 0) {
    // Same sentence for both readers: the message is past the point where
    // either of them can rely on the window, and softening it for the sender
    // would be a lie about how much time is left.
    return 'The waiting window has already passed — this will send itself at the next automatic check.';
  }

  const minutes = Math.ceil(remainingMs / 60000);
  let amount: string;
  if (minutes < 60) {
    amount = `${minutes} minute${minutes === 1 ? '' : 's'}`;
  } else if (minutes < 60 * 48) {
    const hours = Math.round(minutes / 60);
    amount = `${hours} hour${hours === 1 ? '' : 's'}`;
  } else {
    const days = Math.round(minutes / (60 * 24));
    amount = `${days} day${days === 1 ? '' : 's'}`;
  }

  return voice === 'approver'
    ? `Sends itself in ${amount} if you do nothing.`
    : `Sends itself in ${amount} unless it is decided or cancelled first.`;
}

/** The reach category, as a sentence rather than a database value. */
export function describeReach(reach: string | null | undefined): string {
  if (reach === 'all_colleges') return 'Every JKKN college';
  if (reach === 'own_college') return "The sender's own college";
  return 'Reach not recorded';
}

/** What a status value means to somebody who has never seen the table. */
export function describeStatus(status: string | null | undefined): {
  label: string;
  detail: string;
  tone: 'waiting' | 'good' | 'bad' | 'neutral';
} {
  switch (status) {
    case 'pending':
      return { label: 'Waiting for approval', detail: 'Nobody has decided on this yet.', tone: 'waiting' };
    case 'approved':
      return { label: 'Approved and sent', detail: 'The approver said yes and the message went out.', tone: 'good' };
    case 'auto_approved':
      return {
        label: 'Sent automatically',
        detail: 'The waiting window passed with no answer, so it went out on its own.',
        tone: 'good',
      };
    case 'rejected':
      return { label: 'Rejected', detail: 'The approver said no. The reason is below.', tone: 'bad' };
    case 'cancelled':
      return { label: 'Cancelled', detail: 'The sender withdrew this before it went out.', tone: 'neutral' };
    default:
      return { label: status || 'Unknown', detail: 'This message is in a state this page does not recognise.', tone: 'neutral' };
  }
}

/**
 * A date a person can read, pinned to campus time.
 *
 * The timezone is named explicitly rather than left to the runtime. A client
 * component is rendered twice — once on the server, where Node runs in UTC,
 * and again in the browser, which is on IST — and an unpinned toLocaleString
 * produces two different strings for the same instant, which React reports as
 * a hydration mismatch. Pinning also means an approver travelling abroad reads
 * the same deadline the council does.
 */
export function formatMoment(iso: string | null | undefined): string {
  if (!iso) return 'unknown time';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return 'unknown time';
  return parsed.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}
