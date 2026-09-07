// Which learner lifecycle statuses count as a Campus Living resident.
//
// This is the TypeScript mirror of the SQL helper `fn_cl_roster_statuses()`
// (migration 20260905102440). The two must agree: the SQL side decides which
// rows v_learner_hostelites and the allocation RPCs can SEE, this side decides
// which of them a given screen SHOWS.
//
// Why the split matters: `v_learner_hostelites` was widened from active-only to
// active+reserved+admitted on 2026-09-05, reversing a narrowing from
// 2026-06-08. The June widening was reverted within hours partly because it
// changed every consuming screen at once. Defaulting reads to `active` here is
// what keeps that from happening again — widening the view changes what is
// AVAILABLE, never what is SHOWN by default.

/** Every status Campus Living treats as a resident. Used when a caller
 *  explicitly asks for "All" — e.g. the Residents Status filter. */
export const CL_ROSTER_STATUSES = ['active', 'reserved', 'admitted'] as const;

/** What a read returns when the caller says nothing. Deliberately narrower than
 *  CL_ROSTER_STATUSES: no existing screen or headcount changes until someone
 *  asks for the wider set. */
export const CL_DEFAULT_ROSTER_STATUSES = ['active'] as const;

export type ClRosterStatus = (typeof CL_ROSTER_STATUSES)[number];

/** Labels for the Status filter and badges. */
export const CL_ROSTER_STATUS_LABEL: Record<ClRosterStatus, string> = {
  active: 'Active',
  reserved: 'Reserved',
  admitted: 'Admitted',
};

export function isClRosterStatus(v: string | null | undefined): v is ClRosterStatus {
  return !!v && (CL_ROSTER_STATUSES as readonly string[]).includes(v);
}
