// canWriteEventRegistrations is the gate on bulk-register, which inserts up to
// 1,000 rows on the service-role client. It must be stricter than
// canManageEventOps: no read-permission path (events.marathon.view is held by
// Senior Learner), no cross-institution admin or tournament-manager path, and
// no "creator-less event, same institution" path. canManageEventOps itself
// (committees, QR) must not change.
import { describe, it, expect } from 'vitest';
import {
  canManageEventOps,
  canWriteEventRegistrations,
  type EventOpsCaller,
} from '@/lib/services/events/shared/event-manage-access';

const EV = '11111111-1111-4111-8111-111111111111';
const ME = 'u-caller';
const INST_A = 'inst-a';
const INST_B = 'inst-b';

interface World {
  profile: { role: string | null; is_super_admin: boolean | null; institution_id: string | null };
  event: { event_type: string; created_by: string | null; institution_id: string };
  incharge?: boolean;
  perms?: string[];
}

function caller(w: World): EventOpsCaller {
  const row = (table: string) => (table === 'profiles' ? w.profile : w.event);
  return {
    userId: ME,
    svc: {
      from: (table: string) => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row(table) }) }) }),
      }),
    },
    auth: {
      rpc: async (fn: string, args?: Record<string, unknown>) => {
        if (fn === 'fn_is_event_incharge') return { data: w.incharge === true };
        if (fn === 'user_has_permission') {
          return { data: (w.perms ?? []).includes(String(args?.permission_name)) };
        }
        return { data: false };
      },
    },
  };
}

const marathon = (over: Partial<World['event']> = {}) => ({
  event_type: 'marathon',
  created_by: 'someone-else',
  institution_id: INST_A,
  ...over,
});
const person = (role: string, institution_id: string | null = INST_A, is_super_admin = false) => ({
  role,
  institution_id,
  is_super_admin,
});

describe('canWriteEventRegistrations', () => {
  it('a view-only marathon holder (events.marathon.view, not in-charge, not creator) is refused', async () => {
    const w: World = { profile: person('senior_learner'), event: marathon(), perms: ['events.marathon.view'] };
    expect(await canWriteEventRegistrations(caller(w), EV)).toBe(false);
  });

  it('an HOD holding events.marathon.view in the same institution is refused', async () => {
    const w: World = { profile: person('hod'), event: marathon(), perms: ['events.marathon.view'] };
    expect(await canWriteEventRegistrations(caller(w), EV)).toBe(false);
  });

  it('an admin-role user from another institution is refused', async () => {
    for (const role of ['admin', 'administrator', 'event_coordinator']) {
      const w: World = { profile: person(role, INST_B), event: marathon() };
      expect(await canWriteEventRegistrations(caller(w), EV)).toBe(false);
    }
  });

  it('an admin-role user with no institution is refused', async () => {
    const w: World = { profile: person('event_coordinator', null), event: marathon() };
    expect(await canWriteEventRegistrations(caller(w), EV)).toBe(false);
  });

  it('an admin-role user from the same institution is allowed', async () => {
    for (const role of ['admin', 'administrator', 'event_coordinator']) {
      const w: World = { profile: person(role, INST_A), event: marathon() };
      expect(await canWriteEventRegistrations(caller(w), EV)).toBe(true);
    }
  });

  it('a sports.tournaments.manage holder from another institution is refused', async () => {
    const w: World = {
      profile: person('faculty', INST_B),
      event: marathon({ event_type: 'sports_tournament' }),
      perms: ['sports.tournaments.manage'],
    };
    expect(await canWriteEventRegistrations(caller(w), EV)).toBe(false);
  });

  it('a sports.tournaments.manage holder from the same institution is allowed', async () => {
    const w: World = {
      profile: person('faculty', INST_A),
      event: marathon({ event_type: 'sports_tournament' }),
      perms: ['sports.tournaments.manage'],
    };
    expect(await canWriteEventRegistrations(caller(w), EV)).toBe(true);
  });

  it('a creator-less event does not admit a same-institution non-learner', async () => {
    const w: World = { profile: person('faculty', INST_A), event: marathon({ created_by: null }) };
    expect(await canWriteEventRegistrations(caller(w), EV)).toBe(false);
  });

  it('a named in-charge is allowed, even from another institution', async () => {
    const w: World = { profile: person('faculty', INST_B), event: marathon(), incharge: true };
    expect(await canWriteEventRegistrations(caller(w), EV)).toBe(true);
  });

  it('the creator is allowed', async () => {
    const w: World = { profile: person('faculty', INST_B), event: marathon({ created_by: ME }) };
    expect(await canWriteEventRegistrations(caller(w), EV)).toBe(true);
  });

  it('a super admin is allowed in any institution', async () => {
    const flag: World = { profile: person('principal', INST_B, true), event: marathon() };
    const role: World = { profile: person('super_admin', INST_B), event: marathon() };
    expect(await canWriteEventRegistrations(caller(flag), EV)).toBe(true);
    expect(await canWriteEventRegistrations(caller(role), EV)).toBe(true);
  });

  it('a learner is refused', async () => {
    const w: World = { profile: person('student', INST_A), event: marathon({ created_by: null }) };
    expect(await canWriteEventRegistrations(caller(w), EV)).toBe(false);
  });
});

describe('canManageEventOps (committees, QR) is unchanged', () => {
  it('still admits an events.marathon.view holder on a marathon', async () => {
    const w: World = { profile: person('senior_learner'), event: marathon(), perms: ['events.marathon.view'] };
    expect(await canManageEventOps(caller(w), EV)).toBe(true);
  });

  it('still admits an admin-role user from another institution', async () => {
    const w: World = { profile: person('event_coordinator', INST_B), event: marathon() };
    expect(await canManageEventOps(caller(w), EV)).toBe(true);
  });

  it('still admits a same-institution non-learner on a creator-less event', async () => {
    const w: World = { profile: person('faculty', INST_A), event: marathon({ created_by: null }) };
    expect(await canManageEventOps(caller(w), EV)).toBe(true);
  });
});
