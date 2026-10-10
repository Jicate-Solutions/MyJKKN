// BUG-005850 — /startup-studio/school-of-influence sent EVERY visitor to the
// Director's settings screen, so a learner who opened it to enrol met "you do
// not have access". Programme owners keep the settings landing; everyone else
// lands on the programme's application page.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const rpc = vi.fn();
const maybeSingle = vi.fn();
const eqCalls: Array<[string, unknown]> = [];

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ rpc })),
  createServiceRoleClient: vi.fn(() => {
    const chain: any = {
      from: () => chain,
      select: () => chain,
      eq: (col: string, val: unknown) => {
        eqCalls.push([col, val]);
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      maybeSingle,
    };
    return chain;
  }),
}));

import { GET } from '../route';

const EVENT_ID = '84a49ec4-8fc8-44f9-a6a1-e84df5330f07';
const req = () => new NextRequest('https://www.jkkn.ai/startup-studio/school-of-influence');

describe('School of Influencer landing (BUG-005850)', () => {
  beforeEach(() => {
    rpc.mockReset();
    maybeSingle.mockReset();
    eqCalls.length = 0;
  });

  it('sends a learner without the configure key to the programme application page, not settings', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    maybeSingle.mockResolvedValue({ data: { id: EVENT_ID }, error: null });

    const res = await GET(req());

    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toBe(`https://www.jkkn.ai/events/${EVENT_ID}/apply`);
    expect(location).not.toContain('/admin/settings');
    expect(eqCalls).toContainEqual(['event_type', 'school_of_influence']);
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

  it('treats a failed permission check as "not an owner" (fails closed)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    maybeSingle.mockResolvedValue({ data: { id: EVENT_ID }, error: null });

    const res = await GET(req());

    expect(res.headers.get('location')).toBe(`https://www.jkkn.ai/events/${EVENT_ID}/apply`);
  });

  it('shows an explicit "not open" notice when no programme event exists', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const res = await GET(req());

    expect(res.headers.get('location')).toBe(
      'https://www.jkkn.ai/unauthorized?reason=soi_no_programme'
    );
  });
});
