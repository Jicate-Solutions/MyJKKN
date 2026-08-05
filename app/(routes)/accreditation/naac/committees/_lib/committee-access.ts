// app/(routes)/accreditation/naac/committees/_lib/committee-access.ts
// ============================================================================
// Who may open a committee page — Director decision 8: "access to committee
// pages follows committee-roster membership, not job title."
//
// Two ways in, and the order matters for what the refusal SAYS:
//   1. the accreditation.naac.committees.view permission (or super admin), or
//   2. being named on the roster of the committee in question.
//
// The roster half is derived from a READ, not from a claim. The caller passes
// the committee ids that came back from an actual RLS-filtered query of
// accreditation_committee_members. That is deliberate: RLS denial in this repo
// is silent (0 rows, error = null), so a gate that trusted anything else could
// let a member in and then show them an empty page — indistinguishable from
// "no committees exist". Here the gate cannot open wider than the data: no
// rows, no entry, and the viewer is told so in words.
// ============================================================================

/** Who a refused viewer should go to. One string, so both pages say the same thing. */
export const COMMITTEE_ACCESS_CONTACT =
  'your IQAC coordinator, or the Accreditation Officer';

export type CommitteeAccessRoute = 'permission' | 'roster';

export interface CommitteeAccessDecision {
  allowed: boolean;
  /** How they got in. Undefined when refused. */
  via?: CommitteeAccessRoute;
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
 * May this viewer open the committee LIST?
 *
 * `rosterCommitteeIds` are the committees the viewer was actually able to read
 * a roster row for. One is enough — there is something to show them.
 */
export function decideCommitteeListAccess(input: {
  hasViewPermission: boolean;
  rosterCommitteeIds: readonly string[];
}): CommitteeAccessDecision {
  if (input.hasViewPermission) return ALLOWED('permission');
  if (input.rosterCommitteeIds.length > 0) return ALLOWED('roster');

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
 * Anti-ragging cell. The refusal says which of the two it is, so a member who
 * followed a link to the wrong committee is not left thinking the platform is
 * broken.
 */
export function decideCommitteeDetailAccess(input: {
  hasViewPermission: boolean;
  rosterCommitteeIds: readonly string[];
  committeeId: string;
}): CommitteeAccessDecision {
  if (input.hasViewPermission) return ALLOWED('permission');
  if (input.rosterCommitteeIds.includes(input.committeeId)) return ALLOWED('roster');

  const onSomeOtherCommittee = input.rosterCommitteeIds.length > 0;

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
