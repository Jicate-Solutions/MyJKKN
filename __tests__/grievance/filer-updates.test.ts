// __tests__/grievance/filer-updates.test.ts
//
// Director rulings, 30 Sep 2026: the person who complained hears about every
// change; every complaint shows who is handling it; My complaints lists your own.
// These pin the three rules that would be silent if they broke:
//   1. the filer bell goes ONLY to a named (non-anonymous) filer, once per change;
//   2. My complaints reads ONLY the caller's own non-anonymous rows;
//   3. an empty or zero deadline never renders as 1 Jan 1970.

import { describe, expect, it, vi } from 'vitest';

// filer-updates.ts imports the live bell sender, whose module pulls in the
// calendar integration and the server Supabase client. The tests inject their
// own sender, so the real one is replaced with an inert stub at import time.
vi.mock('@/lib/services/meetings/meeting-trigger-service', () => ({
  createBellNotification: vi.fn(async () => 'real-sender-must-not-be-used'),
}));

import {
  describeFilerUpdate,
  formatComplaintDate,
  handledByLabel,
  statusInWords,
  type FilerUpdateAfter,
} from '@/lib/grievance/complaint-display';
import { notifyFilerOfChange } from '@/lib/grievance/filer-updates';
import { readMyComplaints } from '@/lib/grievance/my-complaints';

const FILER = '11111111-1111-4111-8111-111111111111';
const HANDLER = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const TICKET = '44444444-4444-4444-8444-444444444444';

function after(overrides: Partial<FilerUpdateAfter> = {}): FilerUpdateAfter {
  return {
    id: TICKET,
    ticket_number: 'GRV-20260930-0001',
    status: 'in_progress',
    assigned_to: HANDLER,
    is_anonymous: false,
    raised_by_id: FILER,
    resolution: null,
    ...overrides,
  };
}

/** A service-role client whose only read is the handler's name. */
function adminWithHandler(fullName: string | null) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.maybeSingle = () => Promise.resolve({ data: { full_name: fullName }, error: null });
  return { from: vi.fn(() => chain) } as never;
}

describe('describeFilerUpdate — who is told, and what', () => {
  it('names the handler when a complaint is picked up', () => {
    const m = describeFilerUpdate({ status: 'open', assigned_to: null }, after(), 'Priya R');
    expect(m).not.toBeNull();
    expect(m!.recipientId).toBe(FILER);
    expect(m!.title).toBe('Your complaint GRV-20260930-0001');
    expect(m!.body).toBe('Your complaint GRV-20260930-0001 is now being handled by Priya R.');
  });

  it('sends ONE message when a single write both assigns and moves the status', () => {
    const m = describeFilerUpdate({ status: 'open', assigned_to: null }, after(), 'Priya R');
    expect(m!.idempotencyKey).toBe(`grievance-filer:${TICKET}:in_progress:${HANDLER}`);
  });

  it('says what was done on resolve', () => {
    const m = describeFilerUpdate(
      { status: 'in_progress', assigned_to: HANDLER },
      after({ status: 'resolved', resolution: 'The fan in room 204 was replaced.' }),
      'Priya R'
    );
    expect(m!.body).toBe(
      'Your complaint GRV-20260930-0001 was resolved: The fan in room 204 was replaced.'
    );
    expect(m!.idempotencyKey).toBe(`grievance-filer:${TICKET}:resolved`);
  });

  it('puts a plain status in words', () => {
    const m = describeFilerUpdate(
      { status: 'resolved', assigned_to: HANDLER },
      after({ status: 'closed' }),
      null
    );
    expect(m!.body).toBe('Your complaint GRV-20260930-0001 is now closed.');
  });

  it('NEVER messages on an anonymous complaint, even though raised_by_id is kept', () => {
    expect(
      describeFilerUpdate({ status: 'open', assigned_to: null }, after({ is_anonymous: true }), 'X')
    ).toBeNull();
  });

  it('stays quiet when nothing a filer cares about changed', () => {
    expect(
      describeFilerUpdate({ status: 'in_progress', assigned_to: HANDLER }, after(), 'Priya R')
    ).toBeNull();
  });

  it('stays quiet when there is no filer or no before-row', () => {
    expect(describeFilerUpdate({ status: 'open', assigned_to: null }, after({ raised_by_id: null }), null)).toBeNull();
    expect(describeFilerUpdate(null, after(), null)).toBeNull();
  });
});

describe('notifyFilerOfChange — the bell itself', () => {
  it('sends to the filer only, attributed to the filer, linking to My complaints', async () => {
    const send = vi.fn(async () => 'notif-1');
    const out = await notifyFilerOfChange(
      adminWithHandler('Priya R'),
      { before: { status: 'open', assigned_to: null }, after: after() },
      send as never
    );
    expect(out).toBe('sent');
    expect(send).toHaveBeenCalledTimes(1);
    const opts = (send.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(opts.recipientIds).toEqual([FILER]);
    expect(opts.createdBy).toBe(FILER);
    expect(opts.url).toBe('/instasolver/my-complaints');
    expect(opts.body).toContain('Priya R');
    expect(opts.idempotencyKey).toBe(`grievance-filer:${TICKET}:in_progress:${HANDLER}`);
  });

  it('is idempotent: a repeat of the same change reuses the same key', async () => {
    const keys: string[] = [];
    const send = vi.fn(async (_db: unknown, o: { idempotencyKey?: string }) => {
      const first = !keys.includes(o.idempotencyKey!);
      keys.push(o.idempotencyKey!);
      return first ? 'notif-1' : null; // the DB unique index returns 23505 → null
    });
    const change = { before: { status: 'open', assigned_to: null }, after: after() };
    expect(await notifyFilerOfChange(adminWithHandler('Priya R'), change, send as never)).toBe('sent');
    expect(await notifyFilerOfChange(adminWithHandler('Priya R'), change, send as never)).toBe('not-sent');
    expect(new Set(keys).size).toBe(1);
  });

  it('never calls the sender, or reads anything, for an anonymous complaint', async () => {
    const send = vi.fn(async () => 'notif-1');
    const admin = adminWithHandler('Priya R') as unknown as { from: ReturnType<typeof vi.fn> };
    const out = await notifyFilerOfChange(
      admin as never,
      { before: { status: 'open', assigned_to: null }, after: after({ is_anonymous: true }) },
      send as never
    );
    expect(out).toBe('skipped');
    expect(send).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('never throws into the write that triggered it', async () => {
    const send = vi.fn(async () => {
      throw new Error('bell down');
    });
    await expect(
      notifyFilerOfChange(
        adminWithHandler('Priya R'),
        { before: { status: 'open', assigned_to: null }, after: after() },
        send as never
      )
    ).resolves.toBe('not-sent');
  });
});

describe('readMyComplaints — ownership filter', () => {
  function recordingAdmin(rows: unknown[]) {
    const filters: Array<[string, unknown]> = [];
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = (col: string, val: unknown) => {
      filters.push([col, val]);
      return chain;
    };
    chain.order = () => chain;
    chain.limit = () => Promise.resolve({ data: rows, error: null });
    return { admin: { from: () => chain } as never, filters };
  }

  const base = {
    ticket_number: 'GRV-1',
    subject: 'Water cooler broken',
    status: 'open',
    sla_deadline: null,
    created_at: '2026-09-30T04:00:00Z',
    updated_at: null,
    assigned_at: null,
    resolved_at: null,
    resolution: null,
    assigned_to: null,
    category: { name: 'Facilities' },
    assignee: null,
  };

  it('asks the database for this user and non-anonymous rows only', async () => {
    const { admin, filters } = recordingAdmin([]);
    await readMyComplaints(admin, FILER);
    expect(filters).toContainEqual(['raised_by_id', FILER]);
    expect(filters).toContainEqual(['is_anonymous', false]);
  });

  it('drops any row that is not theirs, or is anonymous, even if the query returned it', async () => {
    const { admin } = recordingAdmin([
      { ...base, id: 'mine', raised_by_id: FILER, is_anonymous: false },
      { ...base, id: 'anon-mine', raised_by_id: FILER, is_anonymous: true },
      { ...base, id: 'someone-else', raised_by_id: OTHER, is_anonymous: false },
    ]);
    const res = await readMyComplaints(admin, FILER);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.complaints.map((c) => c.id)).toEqual(['mine']);
      expect(res.complaints[0].category).toBe('Facilities');
    }
  });

  it('refuses without a user id instead of reading everything', async () => {
    const { admin, filters } = recordingAdmin([{ ...base, id: 'x', raised_by_id: OTHER, is_anonymous: false }]);
    const res = await readMyComplaints(admin, '');
    expect(res.ok).toBe(false);
    expect(filters).toHaveLength(0);
  });
});

describe('the 1970 guard and plain words', () => {
  it.each([null, undefined, '', 'not a date', '1970-01-01T00:00:00Z', '1970-01-01T05:30:00+05:30'])(
    'shows no date for %p',
    (value) => {
      expect(formatComplaintDate(value as string | null | undefined)).toBeNull();
    }
  );

  it('shows a real deadline', () => {
    const out = formatComplaintDate('2026-10-03T09:00:00Z');
    expect(out).not.toBeNull();
    expect(out).toContain('2026');
  });

  it('says who is handling it, and never "not assigned" when it is', () => {
    expect(handledByLabel(null, null)).toBe('Not yet assigned');
    expect(handledByLabel(HANDLER, 'Priya R')).toBe('Handled by Priya R');
    expect(handledByLabel(HANDLER, null)).toBe('Assigned (name not available)');
  });

  it('puts statuses in words', () => {
    expect(statusInWords('open')).toBe('Open');
    expect(statusInWords('in_progress')).toBe('Being handled');
    expect(statusInWords('resolved')).toBe('Resolved');
    expect(statusInWords('closed')).toBe('Closed');
  });
});
