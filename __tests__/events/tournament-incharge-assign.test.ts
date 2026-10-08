// __tests__/events/tournament-incharge-assign.test.ts
//
// BUG-006177 — the COO could not remove or correct a tournament's in-charges:
// only sports.tournaments.manage holders were offered the × / Add In-charge
// controls. Editors and the event's creator may now correct the roster; a plain
// in-charge still may not (privilege escalation).

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({}),
  createAdminClient: () => ({}),
  getSupabaseClient: () => ({}),
}));

import { canAssignTournamentIncharge } from '@/hooks/events/use-tournament-access';

const base = { hasManagePerm: false, hasEditPerm: false, profileId: 'u1', createdBy: 'someone-else' };

describe('canAssignTournamentIncharge', () => {
  it('allows sports.tournaments.manage holders', () => {
    expect(canAssignTournamentIncharge({ ...base, hasManagePerm: true })).toBe(true);
  });

  it('allows sports.tournaments.edit holders (e.g. the COO)', () => {
    expect(canAssignTournamentIncharge({ ...base, hasEditPerm: true })).toBe(true);
  });

  it("allows the event's creator", () => {
    expect(canAssignTournamentIncharge({ ...base, createdBy: 'u1' })).toBe(true);
  });

  it('denies a user with no key who did not create the event (e.g. a plain in-charge)', () => {
    expect(canAssignTournamentIncharge(base)).toBe(false);
  });

  it('does not treat a missing profile and missing creator as a match', () => {
    expect(canAssignTournamentIncharge({ ...base, profileId: null, createdBy: null })).toBe(false);
  });
});
