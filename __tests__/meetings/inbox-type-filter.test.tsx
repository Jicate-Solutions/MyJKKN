// @vitest-environment jsdom
/**
 * /meetings/inbox — the "Meeting type" filter (8 Oct 2026).
 * Renders the server page with an in-memory stand-in for the session client,
 * so the same filters the page sends are applied to fixture rows.
 */
import '@testing-library/jest-dom';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const T_INTERVIEW = '11111111-1111-4111-8111-111111111111';
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
/** Reads that returned rows, with the range each asked for (PostgREST would cap an unranged read). */
let rangeReads: Array<[number, number]> = [];

function makeQuery(table: string) {
  const preds: Array<(r: any) => boolean> = [];
  let head = false;
  let range: [number, number] | null = null;
  let cap: number | null = null;
  const q: any = {
    select: (_c: string, opts?: { head?: boolean }) => ((head = Boolean(opts?.head)), q),
    order: () => q,
    limit: (n: number) => ((cap = n), q),
    range: (from: number, to: number) => ((range = [from, to]), rangeReads.push([from, to]), q),
    in: (col: string, vals: unknown[]) => (preds.push((r) => vals.includes(r[col])), q),
    eq: (col: string, v: unknown) => (preds.push((r) => r[col] === v), q),
    is: (col: string, v: unknown) => (preds.push((r) => r[col] === v), q),
    gte: (col: string, v: string) => (preds.push((r) => r[col] >= v), q),
    lt: (col: string, v: string) => (preds.push((r) => r[col] < v), q),
    then: (ok: (v: unknown) => unknown) => {
      if (failingTable === table) {
        return Promise.resolve({ data: null, count: null, error: { message: 'timeout' } }).then(ok);
      }
      const src = table === 'meeting_types' ? TYPES : [...BOOKINGS, ...extraBookings];
      const all = src.filter((r) => preds.every((p) => p(r)));
      const data = range ? all.slice(range[0], range[1] + 1) : cap !== null ? all.slice(0, cap) : all;
      return Promise.resolve(head ? { count: all.length, error: null } : { data, error: null }).then(ok);
    },
  };
  return q;
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: (t: string) => makeQuery(t) }),
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
  rangeReads = [];
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

describe('type counts are exact, or say they are not', () => {
  it('counts past one 1,000-row page', async () => {
    extraBookings = manyInterviews(2_300);
    await renderInbox({});
    expect(within(typeGroup()).getByRole('link', { name: /Job Interview/ })).toHaveTextContent('2302');
    // three pages of at most 1,000 rows each, none overlapping
    expect(rangeReads).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(screen.queryByText(/Counts cover the first/)).not.toBeInTheDocument();
  });

  it('beyond 10,000 meetings the page says the counts are partial', async () => {
    extraBookings = manyInterviews(10_050);
    await renderInbox({});
    expect(rangeReads).toHaveLength(10);
    expect(screen.getByText(/Counts cover the first 10,000 of 10,054 meetings in this tab/)).toBeInTheDocument();
  });

  it('a failed type lookup says so and leaves the list alone', async () => {
    failingTable = 'meeting_types';
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await renderInbox({});
    expect(screen.getByRole('status')).toHaveTextContent('The meeting type filter could not load just now');
    expect(listedPeople()).toHaveLength(4);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('an upper-case type id in the link still selects its chip', async () => {
    await renderInbox({ type: T_INTERVIEW.toUpperCase() });
    expect(listedPeople()).toHaveLength(2);
    expect(within(typeGroup()).getByRole('button', { pressed: true })).toHaveTextContent('Job Interview');
  });
});
