/**
 * What's New — ruling 1: the backlog cut-off is a FIXED DATE, and the per-run
 * cap that drains it stays.
 *
 * "Write up only changes from the last month — roughly 800 of the 4,957
 * entries — then stop." The Director rejected both "only from now on" and
 * "work backwards through everything", and the ruling says in as many words
 * that the cut-off must be recorded in code, not as a rolling thirty days, so
 * a re-run months from now cannot creep back through the ~4,100 entries he
 * excluded.
 *
 * A rolling window is the regression these tests are here to catch. It looks
 * identical in a diff, passes every other test in the suite, and only shows
 * itself as the writer quietly working through history at two runs an hour.
 */
import { describe, it, expect } from 'vitest';
import {
  selectHighlights,
  WEEKLY_CAP,
  WRITEUP_BACKLOG_FLOOR,
} from '@/lib/changelog/highlights';
import type { ChangelogEntry, ChangelogModule } from '@/lib/changelog/types';

const MODULES: Record<string, ChangelogModule> = {
  billing: { label: 'Billing', perm: ['billing'], href: '/billing' },
};

function entry(over: Partial<ChangelogEntry> & { h: string }): ChangelogEntry {
  return {
    d: '2026-09-01',
    t: 'new',
    m: 'billing',
    s: 'a change',
    a: 'Someone',
    ...over,
  } as ChangelogEntry;
}

describe('WRITEUP_BACKLOG_FLOOR', () => {
  it('is a literal calendar date, not something computed from the clock', () => {
    // The point of the ruling. A value derived from Date.now() would satisfy
    // "a month" today and mean something different every day after.
    expect(WRITEUP_BACKLOG_FLOOR).toBe('2026-08-13');
    expect(WRITEUP_BACKLOG_FLOOR).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('does not move between calls', () => {
    const first = WRITEUP_BACKLOG_FLOOR;
    const second = WRITEUP_BACKLOG_FLOOR;
    expect(first).toBe(second);
  });
});

describe('selection against the backlog floor', () => {
  it('offers changes on or after the floor', () => {
    const entries = [
      entry({ h: 'onfloor', d: WRITEUP_BACKLOG_FLOOR }),
      entry({ h: 'after', d: '2026-09-01' }),
    ];
    const picked = selectHighlights(entries, MODULES, { from: WRITEUP_BACKLOG_FLOOR });
    expect(picked.map((p) => p.entry.h).sort()).toEqual(['after', 'onfloor']);
  });

  it('never offers a change older than the floor', () => {
    // The ~4,100 the Director excluded. They keep their plain list, their
    // grouping and their links; they are simply never rewritten.
    const entries = [
      entry({ h: 'ancient', d: '2026-01-04' }),
      entry({ h: 'daybefore', d: '2026-08-12' }),
      entry({ h: 'inwindow', d: '2026-08-14' }),
    ];
    const picked = selectHighlights(entries, MODULES, { from: WRITEUP_BACKLOG_FLOOR });
    expect(picked.map((p) => p.entry.h)).toEqual(['inwindow']);
  });

  it('still caps each run, so a month-wide window drains gradually', () => {
    // Ruling 2 explicitly keeps this. Without it the widened window would
    // enqueue the whole backlog into one run and spike the shared Max seat that
    // PDE, SCF, OneMark and AI Pulse also draw on.
    const entries = Array.from({ length: WEEKLY_CAP * 5 }, (_, i) =>
      entry({ h: `sha${i}`, d: '2026-08-20' })
    );
    const picked = selectHighlights(entries, MODULES, { from: WRITEUP_BACKLOG_FLOOR });
    expect(picked).toHaveLength(WEEKLY_CAP);
  });

  it('leaves already-decided changes out, however wide the window is', () => {
    // Ruling 5's half of the contract at the selection layer: a hidden write-up
    // is 'skipped', and a skipped change is never offered again.
    const entries = [
      entry({ h: 'hidden', d: '2026-08-20' }),
      entry({ h: 'fresh', d: '2026-08-21' }),
    ];
    const picked = selectHighlights(entries, MODULES, {
      from: WRITEUP_BACKLOG_FLOOR,
      alreadyDecided: new Set(['hidden']),
    });
    expect(picked.map((p) => p.entry.h)).toEqual(['fresh']);
  });
});
