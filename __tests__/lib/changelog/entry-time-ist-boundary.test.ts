/**
 * What's New — the IST-midnight seam, which this page has already been cut on.
 *
 * THE BUG THIS GUARDS AGAINST ITS RETURN. The recent/archive split is drawn on
 * dates. A single day once rendered in BOTH halves through IST-midnight drift;
 * the fix was pinning the cutoff to `meta.recentFrom` on the client. Commits
 * carry a `+05:30` offset, and adding a timestamp re-opens exactly that seam:
 * the moment a time is displayed, a row can show a time belonging to one day
 * underneath a header naming another.
 *
 * THE REQUIRED ASSERTION, from the spec, verbatim: "an entry committed 23:50 IST
 * and one at 00:10 IST the next day each appear in exactly one half, and the
 * date header each sits under matches the time shown on its row."
 *
 * HOW "the header matches the time" IS EXPRESSED HERE. The header is
 * `formatDay(entry.d)` in components/changelog/whats-new-view.tsx and the time is
 * `formatEntryTime(entry.at)`. Both are pure functions of one row, so the header
 * and the time agree exactly when `istDayOf(at) === d` — they are then two
 * readings of one instant in one timezone. That equality is what is asserted
 * below, at every step the value takes: out of the generator, through the row
 * the sync builds, and back from PostgREST as UTC.
 *
 * NO DATABASE. Postgres stores `timestamptz` as an instant and discards the
 * `+05:30`, handing the value back as `...+00:00` — the round trip is
 * reproduced here by converting to UTC, which is exactly what it does.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { istDayOf, formatEntryTime, CHANGELOG_TZ } from '@/lib/changelog/entry-time';
import { entryRow } from '@/scripts/sync-changelog-db.mjs';

const REPO = process.cwd();

/** The two entries the spec names, as collectChangelog emits them. */
const LATE = {
  h: 'aaaaaaaaaaaa',
  d: '2026-06-08',
  at: '2026-06-08T23:50:00+05:30',
  t: 'fixed',
  m: 'platform',
  s: 'Something shipped just before midnight',
  a: 'A Person',
};
const EARLY = {
  h: 'bbbbbbbbbbbb',
  d: '2026-06-09',
  at: '2026-06-09T00:10:00+05:30',
  t: 'new',
  m: 'platform',
  s: 'Something shipped just after midnight',
  a: 'A Person',
};

/** What PostgREST hands back: the same instant, rendered in UTC, offset gone. */
function throughPostgres(at: string): string {
  return new Date(at).toISOString();
}

describe('the two entries either side of IST midnight', () => {
  it('sit under the date header their displayed time belongs to', () => {
    // 23:50 on the 8th is the 8th; 00:10 on the 9th is the 9th. If either of
    // these flips, the page prints a time from a day its own header denies.
    expect(istDayOf(LATE.at)).toBe(LATE.d);
    expect(istDayOf(EARLY.at)).toBe(EARLY.d);
  });

  it('still do after the round trip through a timestamptz column', () => {
    // This is the step that actually loses the offset, and the one a test that
    // only exercised the generator's own string would never reach.
    expect(throughPostgres(LATE.at)).toBe('2026-06-08T18:20:00.000Z');
    expect(throughPostgres(EARLY.at)).toBe('2026-06-08T18:40:00.000Z');

    // Twenty minutes apart, on opposite sides of IST midnight, and BOTH stamped
    // 18:xx on the 8th in UTC. A reader who took the UTC day would put them on
    // the same date and contradict one of the two headers.
    expect(istDayOf(throughPostgres(LATE.at))).toBe(LATE.d);
    expect(istDayOf(throughPostgres(EARLY.at))).toBe(EARLY.d);
  });

  it('show the time they were actually committed at', () => {
    expect(formatEntryTime(throughPostgres(LATE.at))).toBe('11:50 pm');
    expect(formatEntryTime(throughPostgres(EARLY.at))).toBe('12:10 am');
  });

  it('do all of the above from a machine that is not in IST', () => {
    // The reader's browser is the uncontrolled variable: a Vercel server runs in
    // UTC and a phone can be anywhere. Both functions name the timezone rather
    // than taking the ambient one, so the process TZ must not change a single
    // answer above.
    const before = process.env.TZ;
    try {
      for (const tz of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
        process.env.TZ = tz;
        expect(istDayOf(throughPostgres(LATE.at)), tz).toBe(LATE.d);
        expect(istDayOf(throughPostgres(EARLY.at)), tz).toBe(EARLY.d);
        expect(formatEntryTime(throughPostgres(LATE.at)), tz).toBe('11:50 pm');
      }
    } finally {
      process.env.TZ = before;
    }
  });
});

describe('each of the two lands in exactly one half of the page', () => {
  /**
   * The route's own window predicates, read out of the route rather than
   * remembered. A mirror of a rule is only worth having if it cannot drift from
   * the rule — so the strings are asserted present first, and the test fails
   * loudly if the route ever expresses its window differently.
   */
  const routeSrc = readFileSync(
    path.join(REPO, 'app', 'api', 'whats-new', 'route.ts'),
    'utf8'
  );

  it('the route still windows on entry_date, which is what this mirrors', () => {
    expect(routeSrc).toContain("scoped.gte('entry_date', cutoff)");
    expect(routeSrc).toContain("scoped.lt('entry_date', cutoff)");
  });

  /** recent = entry_date >= cutoff, archive = entry_date < cutoff. */
  const halves = (d: string, cutoff: string) => ({
    recent: d >= cutoff,
    archive: d < cutoff,
  });

  it('exactly one half, for every cutoff that could fall between them', () => {
    // The interesting cutoff is the 9th: it is the boundary itself, the case
    // where a day previously appeared in both lists.
    for (const cutoff of ['2026-06-08', '2026-06-09', '2026-06-10']) {
      for (const entry of [LATE, EARLY]) {
        const { recent, archive } = halves(entry.d, cutoff);
        expect([recent, archive].filter(Boolean), `${entry.h} at cutoff ${cutoff}`).toHaveLength(1);
      }
    }
  });

  it('and the boundary cutoff separates them rather than duplicating either', () => {
    // The 9th as cutoff: the 00:10 entry is recent, the 23:50 entry is archive,
    // and neither is both. This is the exact shape of the bug that was fixed.
    expect(halves(EARLY.d, '2026-06-09')).toEqual({ recent: true, archive: false });
    expect(halves(LATE.d, '2026-06-09')).toEqual({ recent: false, archive: true });
  });
});

describe('the row the sync writes carries both readings of the same instant', () => {
  it('entry_date is entry_at’s IST day, so the two cannot disagree', () => {
    for (const entry of [LATE, EARLY]) {
      const row = entryRow(entry, 0);
      expect(row.entry_date).toBe(entry.d);
      expect(row.entry_at).toBe(entry.at);
      expect(istDayOf(row.entry_at)).toBe(row.entry_date);
    }
  });

  it('a row from before the column existed has no time, and no invented one', () => {
    // Every one of the 4,933 stored rows is in this state until the first sync
    // after this ships. `null` must survive as null: a fallback to "now" would
    // stamp six months of history with today's clock.
    const row = entryRow({ ...LATE, at: undefined }, 0);
    expect(row.entry_at).toBeNull();
    expect(istDayOf(row.entry_at)).toBeNull();
    expect(formatEntryTime(row.entry_at)).toBeNull();
  });

  it('an unreadable timestamp reads as no timestamp, not as a wrong one', () => {
    expect(istDayOf('not a date')).toBeNull();
    expect(formatEntryTime('not a date')).toBeNull();
  });
});

describe('the generator reads BOTH call sites in the same clock', () => {
  /**
   * The named trap: scripts/generate-changelog.mjs runs `git log` twice — the
   * `ref` path and the HEAD fallback — and changing only the first is a half-fix
   * that works on every machine where the ref resolves and fails silently on the
   * shallow CI clone where it does not. That is precisely the machine nobody
   * checks by hand.
   */
  const generatorSrc = readFileSync(
    path.join(REPO, 'scripts', 'generate-changelog.mjs'),
    'utf8'
  );

  /**
   * The file with its comments removed.
   *
   * Not cosmetic, and the same precaution live-data-schema.test.ts takes: this
   * file explains at length WHY `--date=short` was wrong, so scanning the raw
   * text for that flag matches the explanation of its removal and reports the
   * fix as the fault.
   */
  const generator = generatorSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/[^\n]*$/gm, '');

  it('has exactly two git log reads', () => {
    const reads = generator.match(/git log /g) ?? [];
    expect(reads).toHaveLength(2);
  });

  it('neither of them truncates the time away any more', () => {
    // `--date=short` is what threw the time out. If it comes back at either call
    // site, entry_at silently stops being written for whichever path uses it.
    expect(generator).not.toContain('--date=short');
    expect(generator).toContain("const GIT_DATE_FORMAT = '--date=iso-strict-local'");
  });

  it('both pin the timezone rather than inheriting the machine’s', () => {
    // `iso-strict-local` means "the local zone", so without TZ pinned, CI (UTC)
    // and a developer's Mac (IST) would write different days for the same commit.
    expect(generator).toContain(`const CHANGELOG_TZ = '${CHANGELOG_TZ}'`);
    const withEnv = generator.match(/env: GIT_ENV/g) ?? [];
    expect(withEnv).toHaveLength(2);
  });
});
