// __tests__/meetings/booking-identity-service.test.ts
//
// Guards the public-booking identity gate (Director 2026-06-20). Security
// properties under test:
//   • signed-in  → 'authenticated' (binds profile id, ignores typed email)
//   • @jkkn.ac.in→ 'login_required' WITHOUT touching the account table
//                  (domain match = no enumeration oracle)
//   • known email→ 'login_required' (the one probing path)
//   • unknown    → 'guest'

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── mock the cookie-bound server client (session source) ─────────────────────
const getUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

import { BookingIdentityService } from '@/lib/services/meetings/booking-identity-service';

// ── service-role client stub: records whether the account table was probed ───
function makeServiceClient(profileRow: unknown) {
  const calls = { ilike: false, eqId: false };
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = (col: string) => {
    if (col === 'id') calls.eqId = true;
    return builder;
  };
  builder.ilike = () => {
    calls.ilike = true;
    return builder;
  };
  builder.limit = () => builder;
  builder.maybeSingle = () => Promise.resolve({ data: profileRow });
  return { client: { from: () => builder } as never, calls };
}

beforeEach(() => getUser.mockReset());

describe('BookingIdentityService.resolve', () => {
  it('signed-in viewer → authenticated, bound to their profile id', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'sess@x.com' } } });
    const { client } = makeServiceClient({ full_name: 'Asha', email: 'asha@jkkn.ac.in' });
    const r = await BookingIdentityService.resolve(client, 'whatever-they-typed@x.com');
    expect(r).toEqual({
      kind: 'authenticated',
      profileId: 'u1',
      name: 'Asha',
      email: 'asha@jkkn.ac.in',
    });
  });

  it('@jkkn.ac.in email → login_required WITHOUT probing the account table', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const { client, calls } = makeServiceClient(null);
    const r = await BookingIdentityService.resolve(client, 'Staff.Member@JKKN.AC.IN');
    expect(r).toEqual({ kind: 'login_required', reason: 'jkkn_email' });
    expect(calls.ilike).toBe(false); // the security property: no enumeration probe
  });

  it('non-JKKN email that owns an account → login_required (the probing path)', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const { client, calls } = makeServiceClient({ id: 'p9' });
    const r = await BookingIdentityService.resolve(client, 'someone@gmail.com');
    expect(r).toEqual({ kind: 'login_required', reason: 'account_exists' });
    expect(calls.ilike).toBe(true);
  });

  it('unknown external email (no session) → guest', async () => {
    // A bad/absent cookie naturally surfaces here as user:null (Supabase
    // getUser does not throw on an invalid session), so this also covers the
    // anonymous-visitor path the try/catch defends.
    getUser.mockResolvedValue({ data: { user: null } });
    const { client } = makeServiceClient(null);
    const r = await BookingIdentityService.resolve(client, 'prospect@gmail.com');
    expect(r).toEqual({ kind: 'guest' });
  });
});
