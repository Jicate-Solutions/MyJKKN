// @vitest-environment jsdom
/**
 * /meetings/inbox — the "Meeting type" filter (8 Oct 2026).
 * Renders the server page with an in-memory stand-in for the session client,
 * so the same filters the page sends are applied to fixture rows.
 */
import '@testing-library/jest-dom';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const T_INTERVIEW = 'abcdef11-1111-4111-8111-11111111abcd';
const T_REVIEW = '22222222-2222-4222-8222-222222222222';
const past = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const future = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

const BOOKINGS = [
  { id: 'b1', uid: 'u1', status: 'confirmed', start_time: future(1), meeting_type_id: T_INTERVIEW, attendee_name: 'Candidate One', attendee_email: 'c1@x.in' },
  { id: 'b2', uid: 'u2', status: 'confirmed', start_time: future(2), meeting_type_id: T_INTERVIEW, attendee_name: 'Candidate Two', attendee_email: 'c2@x.in' },
  { id: 'b3', uid: 'u3', status: 'confirmed', start_time: future(3), meeting_type_id: T_REVIEW, attendee_name: 'Reviewer', attendee_email: 'r@x.in' },
  { id: 'b4', uid: 'u4', status: 'confirmed', start_time: future(4), meeting_type_id: null, attendee_name: 'Direct Guest', attendee_email: 'd@x.in' },
  { id: 'b5', uid: 'u5', status: 'cancelled', start_time: past(5), meeting_type_id: T_INTERVIEW, attendee_name: 'Cancelled One', attendee_email: 'x@x.in' },
];
const TYPES = [
  { id: T_INTERVIEW, title: 'Job Interview Meeting with Director Inperson' },
  { id: T_REVIEW, title: 'Weekly Review' },
];

/** Extra bookings for the paging tests, and a table whose reads fail. */
let extraBookings: typeof BOOKINGS = [];
let failingTable: string | null = null;
/** Raw booking-row reads (the chips must never need them) and type-count calls. */
let bookingRowReads = 0;
let countCalls: Array<Record<string, unknown>> = [];
/** Makes the type-count call never answer (until its abort signal fires). */
let countHangs = false;
/** Makes the meeting_types name lookup (.in) never answer until its abort signal fires. */
let namesHang = false;
/** Hides these types' rows, as RLS would. */
let hiddenTypes: string[] = [];

function makeQuery(table: string) {
  const preds: Array<(r: any) => boolean> = [];
  let head = false;
  let range: [number, number] | null = null;
  let cap: number | null = null;
  let signal: AbortSignal | undefined;
  let usedIn = false;
  const q: any = {
    select: (_c: string, opts?: { head?: boolean }) => ((head = Boolean(opts?.head)), q),
    order: () => q,
    limit: (n: number) => ((cap = n), q),
    range: (from: number, to: number) => ((range = [from, to]), q),
    abortSignal: (sg: AbortSignal) => ((signal = sg), q),
    maybeSingle: () => ({
      then: (ok: (v: unknown) => unknown) =>
        q.then((r: { data: unknown[] | null; error: unknown }) => ok({ data: r.data?.[0] ?? null, error: r.error })),
    }),
    in: (col: string, vals: unknown[]) => ((usedIn = true), preds.push((r) => vals.includes(r[col])), q),
    eq: (col: string, v: unknown) => (preds.push((r) => r[col] === v), q),
    is: (col: string, v: unknown) => (preds.push((r) => r[col] === v), q),
    gte: (col: string, v: string) => (preds.push((r) => r[col] >= v), q),
    lt: (col: string, v: string) => (preds.push((r) => r[col] < v), q),
    then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => {
      if (namesHang && table === 'meeting_types' && usedIn) {
        return new Promise((_, reject) => {
          if (signal?.aborted) return reject(new Error('aborted'));
          signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }).then(ok, bad);
      }
      if (failingTable === table) {
        return Promise.resolve({ data: null, count: null, error: { message: 'timeout' } }).then(ok);
      }
      if (table === 'meeting_bookings' && !head) bookingRowReads += 1;
      const src = table === 'meeting_types' ? TYPES.filter((t) => !hiddenTypes.includes(t.id)) : [...BOOKINGS, ...extraBookings];
      const all = src.filter((r) => preds.every((p) => p(r)));
      const data = range ? all.slice(range[0], range[1] + 1) : cap !== null ? all.slice(0, cap) : all;
      return Promise.resolve(head ? { count: all.length, error: null } : { data, error: null }).then(ok);
    },
  };
  return q;
}
/** fn_meeting_inbox_type_counts, evaluated on the fixtures with the same filters the SQL applies. */
function countRpc(args: { p_statuses: string[] | null; p_from: string | null; p_before: string | null }) {
  countCalls.push(args);
  let signal: AbortSignal | undefined;
  const run = () => {
    if (failingTable === 'rpc') return { data: null, error: { message: 'timeout' } };
    // The migration is not applied yet: PostgREST answers PGRST202.
    if (failingTable === 'rpc-missing') {
      return {
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function public.fn_meeting_inbox_type_counts' },
      };
    }
    const by = new Map<string | null, number>();
    for (const b of [...BOOKINGS, ...extraBookings]) {
      if (args.p_statuses && !args.p_statuses.includes(b.status)) continue;
      if (args.p_from && !(b.start_time >= args.p_from)) continue;
      if (args.p_before && !(b.start_time < args.p_before)) continue;
      by.set(b.meeting_type_id, (by.get(b.meeting_type_id) ?? 0) + 1);
    }
    const data = [...by].map(([id, n]) => ({
      meeting_type_id: id,
      title: id && !hiddenTypes.includes(id) ? TYPES.find((t) => t.id === id)?.title ?? null : null,
      bookings: n,
    }));
    return { data, error: null };
  };
  const b: any = {
    abortSignal: (sg: AbortSignal) => ((signal = sg), b),
    then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => {
      if (!countHangs) return Promise.resolve(run()).then(ok, bad);
      return new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted')))).then(ok, bad);
    },
  };
  return b;
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: (t: string) => makeQuery(t), rpc: (_fn: string, a: any) => countRpc(a) }),
}));
vi.mock('next/link', () => ({ default: (p: any) => <a href={p.href} className={p.className}>{p.children}</a> }));
vi.mock('@/components/layout/content-layout', () => ({ ContentLayout: (p: any) => <main>{p.children}</main> }));
vi.mock('@/components/navigation', () => ({ PageBreadcrumb: () => null }));
vi.mock('@/components/page-header', () => ({ PageHeader: (p: any) => <h1>{p.title}</h1> }));

import MeetingsInboxPage from '@/app/(routes)/meetings/inbox/page';

async function renderInbox(params: { status?: string; type?: string }) {
  render(await MeetingsInboxPage({ searchParams: Promise.resolve(params) }));
}
afterEach(() => {
  cleanup();
  extraBookings = [];
  failingTable = null;
  bookingRowReads = 0;
  countCalls = [];
  countHangs = false;
  namesHang = false;
  hiddenTypes = [];
});

const manyInterviews = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `m${String(i).padStart(6, '0')}`,
    uid: `um${i}`,
    status: 'confirmed',
    start_time: future(10),
    meeting_type_id: T_INTERVIEW as string | null,
    attendee_name: `Bulk ${i}`,
    attendee_email: `bulk${i}@x.in`,
  }));

const typeGroup = () => screen.getByRole('group', { name: 'Filter by meeting type' });
const listedPeople = () =>
  screen.queryAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/meetings/u')).map((a) => a.textContent);

describe('meeting type filter', () => {
  it('lists each type with its count under the current tab, busiest first, plus "no type"', async () => {
    await renderInbox({});
    const chips = within(typeGroup()).getAllByRole('link').map((a) => a.textContent);
    // Upcoming tab: 2 interviews, 1 review, 1 direct (the cancelled interview is not counted)
    expect(chips).toEqual([
      'All types',
      'Job Interview Meeting with Director Inperson2',
      'Weekly Review1',
      'Scheduled directly (no type)1',
    ]);
  });

  it('filters the list to one type and keeps the status tab', async () => {
    await renderInbox({ type: T_INTERVIEW });
    const people = listedPeople();
    expect(people).toHaveLength(2);
    expect(people.every((t) => t?.includes('Candidate'))).toBe(true);
    // the status tabs keep the type
    expect(screen.getByRole('link', { name: /Cancelled/ })).toHaveAttribute(
      'href',
      `/meetings/inbox?status=cancelled&type=${T_INTERVIEW}`
    );
    // the active chip is marked
    expect(within(typeGroup()).getByRole('button', { pressed: true })).toHaveTextContent('Job Interview');
  });

  it('"Scheduled directly" shows meetings with no type', async () => {
    await renderInbox({ type: 'none' });
    expect(listedPeople()).toEqual([expect.stringContaining('Direct Guest')]);
  });

  it('the type chips keep the status tab, and "All types" clears only the type', async () => {
    await renderInbox({ status: 'cancelled', type: T_INTERVIEW });
    expect(listedPeople()).toEqual([expect.stringContaining('Cancelled One')]);
    expect(within(typeGroup()).getByRole('link', { name: 'All types' })).toHaveAttribute(
      'href',
      '/meetings/inbox?status=cancelled'
    );
  });

  it('shows each meeting\'s type name on its row', async () => {
    await renderInbox({});
    expect(screen.getByRole('link', { name: /Candidate One/ })).toHaveTextContent('Job Interview Meeting with Director Inperson');
    expect(screen.getByRole('link', { name: /Direct Guest/ })).toHaveTextContent('Scheduled directly');
  });

  it('an empty result under a type says which type, and how to clear it', async () => {
    await renderInbox({ status: 'awaiting', type: T_REVIEW });
    expect(screen.getByText(/Nothing awaiting you of type "Weekly Review"/)).toBeInTheDocument();
    expect(screen.getByText(/Choose "All types"/)).toBeInTheDocument();
  });

  it('ignores a type that is not a meeting type id', async () => {
    await renderInbox({ type: "x' or 1=1" });
    expect(listedPeople()).toHaveLength(4);
  });
});

describe('type counts come from one grouped database count', () => {
  it('counts exactly, with no raw row reads, however many meetings there are', async () => {
    extraBookings = manyInterviews(12_000);
    await renderInbox({});
    expect(within(typeGroup()).getByRole('link', { name: /Job Interview/ })).toHaveTextContent('12002');
    // only the 50-row list reads booking rows
    expect(bookingRowReads).toBe(1);
    expect(countCalls).toHaveLength(1);
  });

  it('sends the tab\'s own filters', async () => {
    await renderInbox({ status: 'past' });
    expect(countCalls[0]).toMatchObject({ p_statuses: ['confirmed', 'completed', 'no_show'], p_from: null });
    expect(typeof countCalls[0].p_before).toBe('string');
    countCalls = [];
    cleanup();
    await renderInbox({ status: 'cancelled' });
    expect(countCalls[0]).toEqual({ p_statuses: ['cancelled'], p_from: null, p_before: null });
  });

  it('a failed count shows no numbers and a note, and leaves the list alone', async () => {
    failingTable = 'rpc';
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await renderInbox({});
    expect(screen.getByRole('status')).toHaveTextContent('The meeting type filter could not load just now');
    expect(screen.queryByRole('group', { name: 'Filter by meeting type' })).not.toBeInTheDocument();
    expect(listedPeople()).toHaveLength(4);
    // rows still carry their type names, from a small lookup over the listed rows
    expect(screen.getByRole('link', { name: /Candidate One/ })).toHaveTextContent('Job Interview Meeting with Director Inperson');
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('when the count times out, the rows still get their type names', async () => {
    countHangs = true;
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await renderInbox({});
    expect(screen.getByRole('status')).toHaveTextContent('could not load just now');
    expect(screen.getByRole('link', { name: /Candidate One/ })).toHaveTextContent('Job Interview Meeting with Director Inperson');
    err.mockRestore();
  }, 15_000);

  it('a hanging count AND a hanging name lookup still end within 4.5 s (never 6 s)', async () => {
    countHangs = true;
    namesHang = true;
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const started = Date.now();
    await renderInbox({});
    const took = Date.now() - started;
    expect(took).toBeGreaterThanOrEqual(4_300);
    expect(took).toBeLessThan(5_200);
    expect(listedPeople()).toHaveLength(4);
    err.mockRestore();
  }, 15_000);

  it('before the count function is applied, the page still renders with the note', async () => {
    failingTable = 'rpc-missing';
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await renderInbox({ type: T_INTERVIEW });
    expect(screen.getByRole('status')).toHaveTextContent('The meeting type filter could not load just now');
    // the selected type still filters the list
    expect(listedPeople()).toHaveLength(2);
    err.mockRestore();
  });

  it('a count that never answers gives up after 3 s and the list still renders', async () => {
    countHangs = true;
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const started = Date.now();
    await renderInbox({});
    expect(Date.now() - started).toBeLessThan(6_000);
    expect(screen.getByRole('status')).toHaveTextContent('could not load just now');
    expect(listedPeople()).toHaveLength(4);
    err.mockRestore();
  }, 10_000);

  it('a type whose name cannot be read gets a short distinguishable label', async () => {
    hiddenTypes = [T_REVIEW];
    await renderInbox({});
    expect(within(typeGroup()).getByRole('link', { name: /Meeting type 2222/ })).toHaveTextContent('1');
  });

  it('clicking the chip of a type whose name cannot be read filters to that type', async () => {
    hiddenTypes = [T_REVIEW];
    await renderInbox({ type: T_REVIEW });
    expect(listedPeople()).toEqual([expect.stringContaining('Reviewer')]);
    expect(within(typeGroup()).getByRole('button', { pressed: true })).toHaveTextContent('Meeting type 2222');
  });

  it('a well-formed id that is not a meeting type is ignored', async () => {
    await renderInbox({ type: '99999999-9999-4999-8999-999999999999' });
    expect(listedPeople()).toHaveLength(4);
    expect(within(typeGroup()).getByRole('button', { pressed: true })).toHaveTextContent('All types');
  });

  it('an upper-case type id in the link still selects its chip', async () => {
    await renderInbox({ type: T_INTERVIEW.toUpperCase() });
    expect(listedPeople()).toHaveLength(2);
    expect(within(typeGroup()).getByRole('button', { pressed: true })).toHaveTextContent('Job Interview');
  });
});
