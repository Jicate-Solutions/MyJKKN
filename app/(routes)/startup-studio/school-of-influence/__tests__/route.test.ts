// BUG-005850 — /startup-studio/school-of-influence sent EVERY visitor to the
// Director's settings screen, so a learner who opened it to enrol met "you do
// not have access". Programme owners keep the settings landing; everyone else
// lands on the programme's application page.
// #4339 review — the programme is read through the visitor's OWN session (RLS
// decides which events they may be sent to; no service role), anonymous
// visitors sign in first, a failed lookup says so, and an open intake wins.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { AuthSessionMissingError } from '@supabase/supabase-js';

const rpc = vi.fn();
const getUser = vi.fn();
const listResult = vi.fn();
const from = vi.fn();
const profileResult = vi.fn();
const eqCalls: Array<[string, unknown]> = [];
const notCalls: Array<[string, string, unknown]> = [];
const { createServiceRoleClient } = vi.hoisted(() => ({ createServiceRoleClient: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => {
    const chain: any = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        eqCalls.push([col, val]);
        return chain;
      },
      not: (col: string, op: string, val: unknown) => {
        notCalls.push([col, op, val]);
        return chain;
      },
      order: () => chain,
      limit: () => listResult(),
    };
    chain.maybeSingle = () => profileResult();
    from.mockImplementation(() => chain);
    return { rpc, auth: { getUser }, from };
  }),
  createServiceRoleClient: (...args: unknown[]) => createServiceRoleClient(...args),
}));

vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { GET } from '../route';
import { logger } from '@/lib/utils/enhanced-logger';

const EVENT_ID = '84a49ec4-8fc8-44f9-a6a1-e84df5330f07';
const OLDER_OPEN_ID = '11111111-1111-4111-8111-111111111111';
const OWN_INST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_INST = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const req = () => new NextRequest('https://www.jkkn.ai/startup-studio/school-of-influence');
const DAY = 24 * 60 * 60 * 1000;
const iso = (offset: number) => new Date(Date.now() + offset).toISOString();

describe('School of Influencer landing (BUG-005850)', () => {
  beforeEach(() => {
    rpc.mockReset();
    getUser.mockReset();
    listResult.mockReset();
    from.mockReset();
    profileResult.mockReset();
    profileResult.mockResolvedValue({ data: { institution_id: OWN_INST }, error: null });
    createServiceRoleClient.mockReset();
    vi.mocked(logger.warn).mockReset();
    vi.mocked(logger.error).mockReset();
    eqCalls.length = 0;
    notCalls.length = 0;
    getUser.mockResolvedValue({ data: { user: { id: 'learner-1' } }, error: null });
  });

  it('sends a learner without the configure key to the programme application page, not settings', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    listResult.mockResolvedValue({ data: [{ id: EVENT_ID }], error: null });

    const res = await GET(req());

    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toBe(`https://www.jkkn.ai/events/${EVENT_ID}/apply`);
    expect(location).not.toContain('/admin/settings');
    expect(eqCalls).toContainEqual(['event_type', 'school_of_influence']);
  });

  it("reads the programme through the visitor's own session, never the service role", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    listResult.mockResolvedValue({ data: [{ id: EVENT_ID }], error: null });

    await GET(req());

    expect(from).toHaveBeenCalledWith('events');
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it('keeps programme owners (configure key) on the settings screen', async () => {
    rpc.mockResolvedValue({ data: true, error: null });

    const res = await GET(req());

    expect(rpc).toHaveBeenCalledWith('user_has_permission', {
      permission_name: 'startup_studio.school_of_influence.configure',
    });
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(
      'https://www.jkkn.ai/startup-studio/school-of-influence/admin/settings'
    );
  });

  it('treats a failed permission check as "not an owner" (fails closed) and logs it', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    listResult.mockResolvedValue({ data: [{ id: EVENT_ID }], error: null });

    const res = await GET(req());

    expect(res.headers.get('location')).toBe(`https://www.jkkn.ai/events/${EVENT_ID}/apply`);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('shows an explicit "not open" notice when no programme event exists', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    listResult.mockResolvedValue({ data: [], error: null });

    const res = await GET(req());

    expect(res.headers.get('location')).toBe(
      'https://www.jkkn.ai/unauthorized?reason=soi_no_programme'
    );
  });

  it('sends an anonymous visitor to sign in, with a way back, before any lookup', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await GET(req());

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.pathname).toBe('/auth/login');
    expect(location.searchParams.get('redirectedFrom')).toBe('/startup-studio/school-of-influence');
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('an Auth outage is "could not open", never a trip to sign-in (no login loop)', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('fetch failed') });

    const res = await GET(req());

    expect(res.headers.get('location')).toBe(
      'https://www.jkkn.ai/unauthorized?reason=soi_unavailable'
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('a thrown getUser is also "could not open", not sign-in', async () => {
    getUser.mockRejectedValue(new Error('network down'));

    const res = await GET(req());

    expect(res.headers.get('location')).toBe(
      'https://www.jkkn.ai/unauthorized?reason=soi_unavailable'
    );
  });

  it('a missing session (AuthSessionMissingError) still goes to sign-in', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });

    const res = await GET(req());

    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/auth/login');
  });

  it('filters draft and cancelled programmes in the query, before the newest-25 limit', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    listResult.mockResolvedValue({ data: [{ id: EVENT_ID }], error: null });

    await GET(req());

    expect(notCalls).toContainEqual(['status', 'in', '(draft,cancelled)']);
  });

  it('an unparseable registration date is not an open intake', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    listResult.mockResolvedValue({
      data: [
        { id: EVENT_ID, registration_open_date: 'not-a-date', registration_close_date: 'also-bad' },
        { id: OLDER_OPEN_ID, registration_open_date: iso(-1 * DAY), registration_close_date: iso(5 * DAY) },
      ],
      error: null,
    });

    const res = await GET(req());

    expect(res.headers.get('location')).toBe(`https://www.jkkn.ai/events/${OLDER_OPEN_ID}/apply`);
  });

  it('says the programme could not be opened (not "not open") when the lookup fails, and logs it', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    listResult.mockResolvedValue({ data: null, error: { message: 'statement timeout' } });

    const res = await GET(req());

    expect(res.headers.get('location')).toBe(
      'https://www.jkkn.ai/unauthorized?reason=soi_unavailable'
    );
    expect(logger.error).toHaveBeenCalled();
  });

  it('prefers a programme whose registration is open now over a newer closed one', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    listResult.mockResolvedValue({
      data: [
        // newest first, as ordered — its intake has closed
        { id: EVENT_ID, registration_open_date: iso(-30 * DAY), registration_close_date: iso(-2 * DAY) },
        { id: OLDER_OPEN_ID, registration_open_date: iso(-1 * DAY), registration_close_date: iso(5 * DAY) },
      ],
      error: null,
    });

    const res = await GET(req());

    expect(res.headers.get('location')).toBe(`https://www.jkkn.ai/events/${OLDER_OPEN_ID}/apply`);
  });

  it('falls back to the newest programme when none has an open intake (its apply page explains "closed")', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    listResult.mockResolvedValue({
      data: [
        { id: EVENT_ID, registration_open_date: iso(-30 * DAY), registration_close_date: iso(-2 * DAY) },
        { id: OLDER_OPEN_ID, registration_open_date: iso(-90 * DAY), registration_close_date: iso(-60 * DAY) },
      ],
      error: null,
    });

    const res = await GET(req());

    expect(res.headers.get('location')).toBe(`https://www.jkkn.ai/events/${EVENT_ID}/apply`);
  });

  it("prefers the learner's own college when two public live programmes are both open (even if the other is newer)", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    listResult.mockResolvedValue({
      data: [
        { id: EVENT_ID, status: 'live', institution_id: OTHER_INST, registration_open_date: iso(-1 * DAY), registration_close_date: iso(5 * DAY) },
        { id: OLDER_OPEN_ID, status: 'live', institution_id: OWN_INST, registration_open_date: iso(-1 * DAY), registration_close_date: iso(5 * DAY) },
      ],
      error: null,
    });

    const res = await GET(req());

    expect(from).toHaveBeenCalledWith('profiles');
    expect(res.headers.get('location')).toBe(`https://www.jkkn.ai/events/${OLDER_OPEN_ID}/apply`);
  });

  it('never lands on a draft or cancelled programme (the statuses the apply page refuses)', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    listResult.mockResolvedValue({
      data: [
        { id: EVENT_ID, status: 'draft', institution_id: OWN_INST, registration_open_date: iso(-1 * DAY), registration_close_date: iso(5 * DAY) },
        { id: '22222222-2222-4222-8222-222222222222', status: 'cancelled', institution_id: OWN_INST },
        { id: OLDER_OPEN_ID, status: 'live', institution_id: OTHER_INST, registration_open_date: iso(-30 * DAY), registration_close_date: iso(-2 * DAY) },
      ],
      error: null,
    });

    const res = await GET(req());

    expect(res.headers.get('location')).toBe(`https://www.jkkn.ai/events/${OLDER_OPEN_ID}/apply`);
  });

  it('shows "not open" when the only programmes are draft or cancelled', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    listResult.mockResolvedValue({
      data: [{ id: EVENT_ID, status: 'draft', institution_id: OWN_INST }],
      error: null,
    });

    const res = await GET(req());

    expect(res.headers.get('location')).toBe(
      'https://www.jkkn.ai/unauthorized?reason=soi_no_programme'
    );
  });
});
