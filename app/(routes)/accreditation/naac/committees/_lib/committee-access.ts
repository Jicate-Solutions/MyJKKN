// app/(routes)/accreditation/naac/committees/_lib/committee-access.ts
// ============================================================================
// Who may open a committee page — Director decision 8: "access to committee
// pages follows committee-roster membership, not job title." Director decision
// 7: "committee access must be cut off automatically on the member's term end
// date."
//
// Two ways in, and the order matters for what the refusal SAYS:
//   1. the accreditation.naac.committees.view permission (or super admin), or
//   2. holding an UNEXPIRED seat on the roster of the committee in question.
//
// The roster half is derived from a READ, not from a claim. The caller passes
// the seats that came back from an actual RLS-filtered query of
// accreditation_committee_members. That is deliberate: RLS denial in this repo
// is silent (0 rows, error = null), so a gate that trusted anything else could
// let a member in and then show them an empty page — indistinguishable from
// "no committees exist".
//
// EXPIRY IS THE THIRD OUTCOME, and it is why this file is not just a boolean.
// After 20260809103100_committee_term_expiry.sql an expired member can still
// read THEIR OWN seat row (and nothing else). So a returned seat no longer
// means an open door — it means "we know who you are and we can tell you what
// happened". Refusing an expired member with the generic "you are not on any
// roster" wording would be false; refusing them with a 404 or a redirect would
// be worse. They get the date their term ended and who to ask.
// ============================================================================

/** Who a refused viewer should go to. One string, so both pages say the same thing. */
export const COMMITTEE_ACCESS_CONTACT =
  'your IQAC coordinator, or the Accreditation Officer';

/** Who an EXPIRED member should go to — the Chairman renews a term, not the coordinator. */
export const COMMITTEE_TERM_RENEWAL_CONTACT =
  'the committee Chairman, or the Accreditation Officer';

export type CommitteeAccessRoute = 'permission' | 'roster';

/** One seat as read back from accreditation_committee_members. */
export interface CommitteeSeat {
  committeeId: string;
  /** Last day of the term, INCLUSIVE, as the plain `YYYY-MM-DD` Postgres hands back. */
  termEnd: string | null;
}

export interface CommitteeAccessDecision {
  allowed: boolean;
  /** How they got in. Undefined when refused. */
  via?: CommitteeAccessRoute;
  /** True when the refusal is "your term ended", not "you were never on it". */
  expired?: boolean;
  /** Heading for the refusal panel. Empty when allowed. */
  title: string;
  /** Sentence explaining the refusal in the viewer's terms. Empty when allowed. */
  detail: string;
  /** Who to ask. Empty when allowed. */
  contact: string;
}

const ALLOWED = (via: CommitteeAccessRoute): CommitteeAccessDecision => ({
  allowed: true,
  via,
  title: '',
  detail: '',
  contact: '',
});

/**
 * Today as `YYYY-MM-DD` in the viewer's own timezone.
 *
 * Built from the local calendar fields rather than `toISOString()`, which
 * would render the UTC date and so, for a viewer east of Greenwich, could hand
 * back YESTERDAY — a whole extra day of access after the term ended.
 * Deliberately never `new Date('YYYY-MM-DD')`: that parses as UTC midnight and
 * shifts the date for anyone behind Greenwich.
 */
function localToday(): string {
  const now = new Date();
  const mm = `${now.getMonth() + 1}`.padStart(2, '0');
  const dd = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}

/**
 * Is this seat still current?
 *
 * Mirrors `fn_user_is_committee_member`'s predicate exactly —
 * `term_end IS NULL OR term_end >= current_date` — including the NULL arm,
 * which is a deliberate permanent safety net rather than leftover scaffolding:
 * a seat with no end date fails OPEN, because a closed failure here is a
 * silent lockout.
 *
 * Compared as plain `YYYY-MM-DD` strings, which sort lexicographically in date
 * order and involve no Date parsing, no timezone conversion and no off-by-one.
 *
 * The database evaluates its half against `current_date` in UTC. This runs in
 * the viewer's timezone, and JKKN sits at UTC+5:30, so the local date is
 * always the same as or one ahead of the database's. That direction is the
 * safe one: this gate can be a few hours STRICTER than the database, never
 * looser — so it can never open a door the database then shuts, which is the
 * blank-page failure the whole lane exists to prevent.
 */
export function isSeatCurrent(seat: CommitteeSeat, today: string = localToday()): boolean {
  if (seat.termEnd === null) return true;
  return seat.termEnd >= today;
}

/** Human-readable term end date, e.g. "31 March 2027". Falls back to the raw value. */
export function formatTermEnd(termEnd: string | null): string {
  if (!termEnd) return 'an unrecorded date';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(termEnd);
  if (!m) return termEnd;
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return termEnd;
  return `${Number(m[3])} ${month} ${m[1]}`;
}

const expiredDecision = (termEnd: string | null, scope: 'list' | 'detail'): CommitteeAccessDecision => ({
  allowed: false,
  expired: true,
  title: 'Your term on this committee has ended',
  detail:
    `Your term ended on ${formatTermEnd(termEnd)}, and committee access ends ` +
    'with it. Nothing you contributed has been removed — the minutes, ' +
    'resolutions and notes you wrote are all still on the record. ' +
    (scope === 'list'
      ? 'If you have been reappointed, ask for your term to be extended and this page opens again.'
      : 'If you have been reappointed, ask for your term to be extended and this committee opens again.'),
  contact: COMMITTEE_TERM_RENEWAL_CONTACT,
});

/**
 * May this viewer open the committee LIST?
 *
 * `seats` are the seats the viewer was actually able to read a roster row for.
 * One UNEXPIRED seat is enough — there is something to show them. If every
 * seat they hold has expired they are told that, with the latest end date,
 * rather than being told they were never on a committee.
 */
export function decideCommitteeListAccess(input: {
  hasViewPermission: boolean;
  seats: readonly CommitteeSeat[];
}): CommitteeAccessDecision {
  if (input.hasViewPermission) return ALLOWED('permission');
  if (input.seats.some((s) => isSeatCurrent(s))) return ALLOWED('roster');

  if (input.seats.length > 0) {
    // Every seat expired. Quote the one that ran longest — that is the date
    // they will remember, and the one worth asking to have extended.
    const latest = input.seats.reduce((a, b) =>
      (b.termEnd ?? '') > (a.termEnd ?? '') ? b : a,
    );
    return expiredDecision(latest.termEnd, 'list');
  }

  return {
    allowed: false,
    title: 'You do not have access to IQAC committees',
    detail:
      'Committee pages open for two kinds of people: those whose role grants ' +
      'the IQAC committees permission, and anyone named on a committee ' +
      'roster. You are neither right now. If you have been appointed to a ' +
      'committee, ask for your name to be added to its roster — that is what ' +
      'opens this page, not your job title.',
    contact: COMMITTEE_ACCESS_CONTACT,
  };
}

/**
 * May this viewer open ONE committee?
 *
 * Roster membership is per-committee: being on the IQAC does not open the
 * Anti-ragging cell. The refusal says which of the three it is — expired term,
 * wrong committee, or no committee at all — so a member who followed a link is
 * never left thinking the platform is broken.
 */
export function decideCommitteeDetailAccess(input: {
  hasViewPermission: boolean;
  seats: readonly CommitteeSeat[];
  committeeId: string;
}): CommitteeAccessDecision {
  if (input.hasViewPermission) return ALLOWED('permission');

  const seatsHere = input.seats.filter((s) => s.committeeId === input.committeeId);
  if (seatsHere.some((s) => isSeatCurrent(s))) return ALLOWED('roster');

  // They ARE on this committee's roster, but their term is over. Say so.
  if (seatsHere.length > 0) {
    const latest = seatsHere.reduce((a, b) =>
      (b.termEnd ?? '') > (a.termEnd ?? '') ? b : a,
    );
    return expiredDecision(latest.termEnd, 'detail');
  }

  const onSomeOtherCommittee = input.seats.some((s) => isSeatCurrent(s));

  return {
    allowed: false,
    title: 'You do not have access to this committee',
    detail: onSomeOtherCommittee
      ? 'You are on the roster of another committee, but not this one. ' +
        'Committee pages open per committee, not per person — ask to be added ' +
        'to this committee’s roster if you have been appointed to it.'
      : 'This page opens for people whose role grants the IQAC committees ' +
        'permission, and for anyone named on this committee’s roster. ' +
        'You are neither right now. If you have been appointed to it, ask for ' +
        'your name to be added to the roster.',
    contact: COMMITTEE_ACCESS_CONTACT,
  };
}
