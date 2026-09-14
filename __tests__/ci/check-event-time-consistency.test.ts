/**
 * Regression tests for scripts/ci/check-event-time-consistency.mjs.
 *
 * A gate that is not itself tested is a gate that quietly stops gating, and this
 * one already did it once: its first version reported 10/10 self-test cases
 * green while silently skipping three real production divergences, because every
 * fixture had been built from a shape that already passed. The cases below are
 * therefore anchored to the shapes that FAILED on that version — a row carrying
 * event_date and a start timestamptz but no start_time, and an end date landing
 * before event_date.
 *
 * Like the sibling gates, these drive the real script as a subprocess against
 * fixture rows (--fixture) and a fixture ledger (--baseline), so the decision
 * logic is exercised with no production credentials, and assert on the EXIT CODE
 * — the only signal a scheduled run actually reports.
 *
 * Exit codes: 0 clean (or ledgered only) · 2 new divergence · 1 operational error.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SCRIPT = path.resolve(process.cwd(), 'scripts/ci/check-event-time-consistency.mjs');

let dir: string;

type Row = {
  id: string;
  name: string;
  status: string;
  event_date: string | null;
  clock_start: string | null;
  clock_end: string | null;
  tz_start_date: string | null;
  tz_start_clock: string | null;
  tz_end_date: string | null;
  tz_end_clock: string | null;
};

type Entry = { id: string; field: string; name?: string; status?: string; observed?: string };

/** A consistent single-day event; override only what the case is about. */
const row = (over: Partial<Row> & { id: string }): Row => ({
  name: 'test event',
  status: 'live',
  event_date: '2026-09-09',
  clock_start: '10:30:00',
  clock_end: '14:00:00',
  tz_start_date: '2026-09-09',
  tz_start_clock: '10:30:00',
  tz_end_date: '2026-09-09',
  tz_end_clock: '14:00:00',
  ...over,
});

function run(rows: Row[], ledger: Entry[] = [], extra: string[] = []): { code: number; out: string } {
  const tag = Math.random().toString(36).slice(2);
  const rowsFile = path.join(dir, `rows-${tag}.json`);
  const baseFile = path.join(dir, `base-${tag}.json`);
  writeFileSync(rowsFile, JSON.stringify(rows), 'utf8');
  writeFileSync(baseFile, JSON.stringify({ divergent: ledger }), 'utf8');
  // spawnSync, not execFileSync: execFileSync surfaces stderr only on a non-zero
  // exit, and several of these cases exit 0 on purpose.
  const r = spawnSync('node', [SCRIPT, '--fixture', rowsFile, '--baseline', baseFile, ...extra], {
    encoding: 'utf8',
  });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

beforeAll(() => { dir = mkdtempSync(path.join(tmpdir(), 'event-time-')); });
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

describe('the gate\'s own self-test', () => {
  it('passes, and reports how many cases it actually ran', () => {
    const r = spawnSync('node', [SCRIPT, '--self-test'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    // The printed count, not just the exit code — a self-test that silently ran
    // zero cases would exit 0 too.
    const m = `${r.stdout}`.match(/(\d+)\/(\d+) self-test cases passed/);
    expect(m).not.toBeNull();
    expect(m![1]).toBe(m![2]);
    expect(Number(m![2])).toBeGreaterThanOrEqual(16);
  });
});

describe('the blind spot that shipped: a calendar check vetoed by a clock it does not read', () => {
  it('FAILS a row with event_date + start timestamptz and NO start_time', () => {
    // The exact shape of JKKN School of Influencer (live, 4 Aug vs 29 Jul).
    // The first version skipped this as "nothing to compare" and exited 0.
    const { code, out } = run([
      row({
        id: '84a49ec4-8fc8-44f9-a6a1-e84df5330f07',
        name: 'JKKN School of Influencer',
        event_date: '2026-08-04',
        clock_start: null, clock_end: null,
        tz_start_date: '2026-07-29', tz_start_clock: '10:00:00',
        tz_end_date: '2026-09-30', tz_end_clock: '17:00:00',
      }),
    ]);
    expect(code).toBe(2);
    expect(out).toContain('start_calendar_day');
    expect(out).toContain('JKKN School of Influencer');
  });

  it('counts such a row as COMPARED, never as skipped', () => {
    const { out } = run([
      row({
        id: 'agrees', event_date: '2026-08-20',
        clock_start: null, clock_end: null,
        tz_start_date: '2026-08-20', tz_start_clock: '09:00:00',
        tz_end_date: '2026-08-20', tz_end_clock: '17:00:00',
      }),
    ]);
    expect(out).toMatch(/events compared\s+1/);
    expect(out).toMatch(/skipped not-comparable\s+0/);
  });

  it('compares TIME OF DAY even when event_date is missing entirely', () => {
    const { code, out } = run([
      row({
        id: 'dateless', event_date: null,
        tz_start_date: null, tz_end_date: null,
        clock_end: '17:00:00', tz_end_clock: '16:00:00',
      }),
    ]);
    expect(code).toBe(2);
    expect(out).toContain('end_time_of_day');
  });
});

describe('the multi-day carve-out, in both directions', () => {
  it('does NOT flag a LATER end date when the clock times match', () => {
    const { code, out } = run([
      row({
        id: 'certs', name: 'CERTIFICATE COURSES',
        event_date: '2026-08-01',
        clock_start: '09:00:00', clock_end: '15:30:00',
        tz_start_date: '2026-08-01', tz_start_clock: '09:00:00',
        tz_end_date: '2026-09-15', tz_end_clock: '15:30:00',
      }),
    ]);
    expect(code).toBe(0);
    expect(out).toMatch(/multi-day recognised\s+1/);
  });

  it('STILL flags a multi-day event whose end clock drifted', () => {
    const { code, out } = run([
      row({
        id: 'certs-drift',
        event_date: '2026-08-01',
        clock_start: '09:00:00', clock_end: '15:30:00',
        tz_start_date: '2026-08-01', tz_start_clock: '09:00:00',
        tz_end_date: '2026-09-15', tz_end_clock: '11:00:00',
      }),
    ]);
    expect(code).toBe(2);
    expect(out).toContain('end_time_of_day');
  });

  it('FAILS an end date EARLIER than event_date — no multi-day reading explains it', () => {
    const { code, out } = run([
      row({
        id: '582f0d38-b909-49b7-89f6-e8527dadef6c',
        name: 'Government job fair', status: 'draft',
        event_date: '2026-07-22',
        clock_start: null, clock_end: null,
        tz_start_date: '2026-07-22', tz_start_clock: '10:00:00',
        tz_end_date: '2026-07-21', tz_end_clock: '16:30:00',
      }),
    ]);
    expect(code).toBe(2);
    expect(out).toContain('end_calendar_day');
    expect(out).toContain('BEFORE');
  });
});

describe('the ledger never pardons a live event', () => {
  const seminar = row({
    id: 'dceeef19-de9f-49a5-be29-c40cca696ee3',
    name: 'SEMINAR - LOGISTICS SUPPLY CHAIN MANAGEMENT',
    status: 'live',
    tz_end_clock: '13:00:00', // page says 14:00
  });
  const entry: Entry = { id: seminar.id, field: 'end_time_of_day' };

  it('FAILS a LIVE event even when it is listed in the ledger', () => {
    const { code, out } = run([seminar], [entry]);
    expect(code).toBe(2);
    expect(out).toContain('never pardoned');
  });

  it('PARDONS the identical divergence on a draft', () => {
    const { code, out } = run([{ ...seminar, status: 'draft' }], [entry]);
    expect(code).toBe(0);
    expect(out).toMatch(/divergent \(baselined\)\s+1/);
  });

  it('PARDONS an archived event too — nobody is being shown its time', () => {
    const { code } = run([{ ...seminar, status: 'archived' }], [entry]);
    expect(code).toBe(0);
  });

  it('treats an UNRECOGNISED status as live, so the gate gets louder not quieter', () => {
    const { code } = run([{ ...seminar, status: 'published' }], [entry]);
    expect(code).toBe(2);
  });

  it('still fails a ledgered draft that starts diverging in a SECOND field', () => {
    const { code, out } = run(
      [{ ...seminar, status: 'draft', tz_start_clock: '18:30:00' }],
      [entry],
    );
    expect(code).toBe(2);
    expect(out).toContain('start_time_of_day');
  });
});

describe('silence is never mistaken for a pass', () => {
  it('exits 1 — not 0 — when the query returns no rows at all', () => {
    const { code, out } = run([]);
    expect(code).toBe(1);
    expect(out).toContain('no rows at all');
  });

  it('reports findings but exits 0 under --report-only', () => {
    const { code, out } = run([row({ id: 'x', tz_end_clock: '13:00:00' })], [], ['--report-only']);
    expect(code).toBe(0);
    expect(out).toContain('end_time_of_day');
  });
});
