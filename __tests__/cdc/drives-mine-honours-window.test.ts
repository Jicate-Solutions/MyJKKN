/**
 * The learner's dashboard card never lists a drive whose window has shut.
 *
 * `/api/cdc/drives/mine` feeds the "Campus drives open to you" card. It used to
 * select on `status = 'willingness_open'` alone, while the learner's own page —
 * and the declaration guard behind it — also honour the drive's optional
 * `willingness_window_open_at` / `_close_at`. The gap was a card that offered a
 * drive whose page then said the window had closed: exactly the mismatch the
 * shared-predicate rule exists to prevent.
 *
 * Auth and the Supabase reads are faked; only the route's filtering is under
 * test. The window predicate itself is pinned in willingness-window.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared before the handler is imported (vitest hoists vi.mock).
// ---------------------------------------------------------------------------

const USER = 'user-1';
const LEARNER = 'learner-1';
const PROGRAM = 'prog-1';

const PAST = '2026-09-01T00:00:00Z';
const FUTURE = '2099-01-01T00:00:00Z';

/** Two drives, both willingness_open by status. Only the window differs. */
function drive(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    title: id,
    status: 'willingness_open',
    drive_date: '2026-10-01',
    job_role_title: null,
    job_location: null,
    expected_package_lpa: null,
    willingness_window_open_at: null,
    willingness_window_close_at: null,
    recruiter_id: null,
    ...over,
  };
}

let drives: Record<string, unknown>[] = [];

const ROWS: Record<string, () => unknown[]> = {
  profiles: () => [{ learner_id: LEARNER }],
  learners_profiles: () => [{ id: LEARNER, program_id: PROGRAM, lifecycle_status: 'active' }],
  cdc_drives: () => drives,
  cdc_drive_eligibility: () => drives.map((d) => ({ drive_id: d.id, program_ids: [PROGRAM] })),
  cdc_recruiters: () => [],
  cdc_drive_willingness: () => [],
};

/** Chainable PostgREST fake: builder calls return itself; awaiting yields rows. */
function chain(rows: unknown[]) {
  const q: any = {};
  for (const m of ['select', 'order', 'eq', 'in']) q[m] = () => q;
  q.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
  q.then = (res: any, rej: any) => Promise.resolve({ data: rows, error: null }).then(res, rej);
  return q;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: USER } }, error: null }) },
      from: (table: string) => chain(ROWS[table]?.() ?? []),
    }),
}));

import { GET } from '@/app/api/cdc/drives/mine/route';

async function listed(): Promise<string[]> {
  const res = await GET();
  const body = (await res.json()) as { drives: { id: string }[] };
  return body.drives.map((d) => d.id).sort();
}

/** id → is_open, which is how the window reaches the learner's screens now. */
async function openness(): Promise<Record<string, boolean>> {
  const res = await GET();
  const body = (await res.json()) as { drives: { id: string; is_open: boolean }[] };
  return Object.fromEntries(body.drives.map((d) => [d.id, d.is_open]));
}

beforeEach(() => {
  drives = [];
});

describe('/api/cdc/drives/mine honours the willingness window', () => {
  it('lists a drive with no window at all — the state every production drive is in', async () => {
    drives = [drive('no-window')];
    expect(await listed()).toEqual(['no-window']);
  });

  // ── The contract changed on 15 Sep (760f08e180) ──────────────────────────
  // This route used to DROP a drive whose window had shut. It now returns every
  // visible drive and marks each one with is_open, so a learner can still see a
  // drive they missed. The guarantee that nobody is OFFERED a shut drive did not
  // disappear with the filter — it moved to the screens, and is pinned there in
  // __tests__/cdc/campus-drives-student-card.test.tsx. These tests follow the
  // contract to where it actually lives now.

  it('still lists a drive whose closing date has passed, and marks it shut', async () => {
    // Both together: the open one must stay open through the same pass that
    // marks the closed one shut, or "closed is marked" could be true because
    // everything is marked.
    drives = [drive('no-window'), drive('closed-yesterday', { willingness_window_close_at: PAST })];
    expect(await listed()).toEqual(['closed-yesterday', 'no-window']);
    expect(await openness()).toEqual({ 'no-window': true, 'closed-yesterday': false });
  });

  it('marks a drive whose window has not started yet as shut', async () => {
    drives = [drive('no-window'), drive('opens-later', { willingness_window_open_at: FUTURE })];
    expect(await openness()).toEqual({ 'no-window': true, 'opens-later': false });
  });

  it('keeps a drive that is inside its window open', async () => {
    drives = [drive('inside', { willingness_window_open_at: PAST, willingness_window_close_at: FUTURE })];
    expect(await listed()).toEqual(['inside']);
    expect(await openness()).toEqual({ inside: true });
  });

  it('returns the drive, marked shut, rather than an empty list, when every one is outside its window', async () => {
    drives = [drive('closed-yesterday', { willingness_window_close_at: PAST })];
    expect(await openness()).toEqual({ 'closed-yesterday': false });
  });
});
