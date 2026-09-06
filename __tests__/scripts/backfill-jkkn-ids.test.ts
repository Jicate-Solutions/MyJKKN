// __tests__/scripts/backfill-jkkn-ids.test.ts
//
// The backfill's pairing logic, tested because getting it wrong is permanent.
// jkkn_identities has no DELETE grant and no DELETE policy by design, so a
// number issued to the wrong person can only be retired — it is parked on that
// row forever. The two failure modes that matter:
//
//   • one human in both learners_profiles and staff gets TWO numbers, because
//     the two partial unique indexes sit on different columns and neither can
//     see the other; and
//   • two different humans get FUSED into one identity because they share a
//     household phone.
//
// buildPlan is the only thing standing between the backfill and both.

import { describe, it, expect } from 'vitest';
import {
  buildPlan,
  normEmail,
  normPhone,
  type LearnerCandidate,
  type TeamMemberCandidate
} from '@/scripts/backfill-jkkn-ids';

function learner(over: Partial<LearnerCandidate> & { id: string }): LearnerCandidate {
  return { name: 'Learner', status: 'active', emails: [], phone: null, ...over };
}
function teamMember(over: Partial<TeamMemberCandidate> & { id: string }): TeamMemberCandidate {
  return { name: 'Team member', emails: [], phone: null, ...over };
}

describe('normEmail', () => {
  it('folds case and whitespace', () => {
    expect(normEmail('  Anitha@JKKN.ac.in ')).toBe('anitha@jkkn.ac.in');
  });

  it('rejects anything that is not an address', () => {
    expect(normEmail('')).toBeNull();
    expect(normEmail(null)).toBeNull();
    expect(normEmail('not-an-email')).toBeNull();
  });

  it('refuses synthetic @nolog placeholders as identity evidence', () => {
    // These are generated from a phone number, so two unrelated people can
    // collide there by construction — pairing on one would fuse them.
    expect(normEmail('9123456780@nolog.jkkn.local')).toBeNull();
  });
});

describe('normPhone', () => {
  it('keeps the last ten digits and drops formatting', () => {
    expect(normPhone('+91 91234-56780')).toBe('9123456780');
  });

  it('rejects anything shorter than ten digits', () => {
    expect(normPhone('12345')).toBeNull();
    expect(normPhone(null)).toBeNull();
  });
});

describe('buildPlan — one person must never get two numbers', () => {
  it('pairs a learner and a team member sharing an email into ONE both-kind issue', () => {
    const plan = buildPlan(
      [learner({ id: 'L1', name: 'Meena Devi', emails: ['meena@jkkn.ac.in'] })],
      [teamMember({ id: 'T1', name: 'Meena Devi', emails: ['meena@jkkn.ac.in'] })]
    );

    expect(plan.both).toHaveLength(1);
    expect(plan.both[0]).toMatchObject({ via: 'email' });
    expect(plan.both[0].learner.id).toBe('L1');
    expect(plan.both[0].teamMember.id).toBe('T1');

    // The critical assertion: neither side is ALSO queued on its own. That is
    // exactly how the same human ends up with two permanent numbers.
    expect(plan.learnerOnly).toHaveLength(0);
    expect(plan.teamMemberOnly).toHaveLength(0);
  });

  it('matches across the personal/institution email pair, case-insensitively', () => {
    const plan = buildPlan(
      [learner({ id: 'L1', emails: ['MEENA@gmail.com'] })],
      [teamMember({ id: 'T1', emails: ['meena@jkkn.ac.in', 'meena@gmail.com'] })]
    );
    expect(plan.both).toHaveLength(1);
    expect(plan.learnerOnly).toHaveLength(0);
    expect(plan.teamMemberOnly).toHaveLength(0);
  });

  it('leaves unrelated people in their own single-kind cohorts', () => {
    const plan = buildPlan(
      [learner({ id: 'L1', emails: ['a@jkkn.ac.in'] }), learner({ id: 'L2' })],
      [teamMember({ id: 'T1', emails: ['b@jkkn.ac.in'] })]
    );
    expect(plan.both).toHaveLength(0);
    expect(plan.learnerOnly.map((l) => l.id)).toEqual(['L1', 'L2']);
    expect(plan.teamMemberOnly.map((t) => t.id)).toEqual(['T1']);
  });

  it('counts every candidate exactly once across the plan', () => {
    const learners = [
      learner({ id: 'L1', emails: ['shared@jkkn.ac.in'] }),
      learner({ id: 'L2', phone: '9000000001' }),
      learner({ id: 'L3' })
    ];
    const teamMembers = [
      teamMember({ id: 'T1', emails: ['shared@jkkn.ac.in'] }),
      teamMember({ id: 'T2', phone: '9000000001' }),
      teamMember({ id: 'T3' })
    ];
    const plan = buildPlan(learners, teamMembers);

    const learnerIds = [
      ...plan.both.map((p) => p.learner.id),
      ...plan.learnerOnly.map((l) => l.id),
      ...plan.needsHuman.map((p) => p.learner.id)
    ];
    const teamIds = [
      ...plan.both.map((p) => p.teamMember.id),
      ...plan.teamMemberOnly.map((t) => t.id),
      ...plan.needsHuman.map((p) => p.teamMember.id)
    ];
    expect(learnerIds.sort()).toEqual(['L1', 'L2', 'L3']);
    expect(teamIds.sort()).toEqual(['T1', 'T2', 'T3']);
    expect(new Set(learnerIds).size).toBe(3);
    expect(new Set(teamIds).size).toBe(3);
  });
});

describe('buildPlan — two people must never be fused into one', () => {
  it('withholds BOTH sides of a phone-only overlap', () => {
    // A learner and a team member on the same personal mobile is at least as
    // likely to be a parent and their child as it is to be one person.
    const plan = buildPlan(
      [learner({ id: 'L1', name: 'Child', phone: '9123456780' })],
      [teamMember({ id: 'T1', name: 'Parent', phone: '9123456780' })]
    );

    expect(plan.needsHuman).toHaveLength(1);
    expect(plan.needsHuman[0].via).toBe('phone');
    expect(plan.both).toHaveLength(0);
    // Neither is issued anything at all — the wrong guess is unrecoverable.
    expect(plan.learnerOnly).toHaveLength(0);
    expect(plan.teamMemberOnly).toHaveLength(0);
  });

  it('an email match wins over a phone match for the same pair', () => {
    const plan = buildPlan(
      [learner({ id: 'L1', emails: ['meena@jkkn.ac.in'], phone: '9123456780' })],
      [teamMember({ id: 'T1', emails: ['meena@jkkn.ac.in'], phone: '9123456780' })]
    );
    expect(plan.both).toHaveLength(1);
    expect(plan.needsHuman).toHaveLength(0);
  });

  it('never pairs on name plus date of birth — twins share both', () => {
    // Identical names, no shared email or phone: they stay separate people.
    const plan = buildPlan(
      [learner({ id: 'L1', name: 'Ravi Kumar' })],
      [teamMember({ id: 'T1', name: 'Ravi Kumar' })]
    );
    expect(plan.both).toHaveLength(0);
    expect(plan.needsHuman).toHaveLength(0);
    expect(plan.learnerOnly).toHaveLength(1);
    expect(plan.teamMemberOnly).toHaveLength(1);
  });

  it('refuses to pair on an email claimed by two different team members', () => {
    // A shared mailbox is not a person. Choosing one arbitrarily would mint a
    // permanent number against the wrong record.
    const plan = buildPlan(
      [learner({ id: 'L1', emails: ['office@jkkn.ac.in'] })],
      [
        teamMember({ id: 'T1', emails: ['office@jkkn.ac.in'] }),
        teamMember({ id: 'T2', emails: ['office@jkkn.ac.in'] })
      ]
    );
    expect(plan.both).toHaveLength(0);
    expect(plan.learnerOnly.map((l) => l.id)).toEqual(['L1']);
    expect(plan.teamMemberOnly.map((t) => t.id).sort()).toEqual(['T1', 'T2']);
  });

  it('a team member paired with one learner is not also queued alone', () => {
    const plan = buildPlan(
      [learner({ id: 'L1', emails: ['meena@jkkn.ac.in'] }), learner({ id: 'L2' })],
      [teamMember({ id: 'T1', emails: ['meena@jkkn.ac.in'] }), teamMember({ id: 'T2' })]
    );
    expect(plan.both.map((p) => p.teamMember.id)).toEqual(['T1']);
    expect(plan.teamMemberOnly.map((t) => t.id)).toEqual(['T2']);
  });
});
