/**
 * Work-signals emitter parity — the guard for a bug that is ALREADY LIVE.
 *
 * `fn_work_signals_for` emits chips by INNER JOINing `work_signal_types`
 * against an inline VALUES list. A key registered in the table with no matching
 * VALUES row is therefore dropped by the join — no error, no log, no chip. It
 * simply never appears, and nothing in the estate notices.
 *
 * That has already happened once: `marks_coverage` has been registered and
 * active since 20260717170852 and has never had a VALUES row, so it has been
 * dark for its entire life. The existing SQL battery could not catch it because
 * that battery asserts a HARDCODED list of keys — a hardcoded list can only ever
 * confirm the keys someone remembered to write down, which is precisely the set
 * that is not at risk.
 *
 * So these tests derive both sides from the migrations themselves and compare
 * them. `marks_coverage` is pinned as the single known gap: any NEW dark key
 * fails, and whoever eventually gives marks_coverage an emitter will also fail
 * this test until they shrink the list — which is the point. A known bug that
 * is written down stays visible; a known bug that is excluded by a wildcard
 * disappears again.
 *
 * Deliberately static (no database, no credentials): the join is a property of
 * the SQL, so it is checkable from the SQL. Live counts are NOT asserted
 * anywhere here — two such counts in this repo drifted within three hours,
 * because roughly nine sessions write this database concurrently. Where a
 * relationship between counts matters, it is proved STRUCTURALLY (one WHERE
 * clause containing another) rather than sampled, which makes it true for all
 * data rather than true for today's.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(process.cwd(), 'supabase/migrations');

/** Keys that are registered and active but have NO emitter, and are known to be
 *  dark. Shrink this list when one is fixed; never grow it silently. */
const KNOWN_DARK_KEYS = new Set(['marks_coverage']);

/** The signal this migration adds. */
const NEW_KEY = 'sessions_marked_same_day';

let _files: { name: string; sql: string }[] | null = null;

/** Read once. This directory holds thousands of files; re-reading it per
 *  assertion turns the suite quadratic and it stops finishing at all. */
function migrationFiles(): { name: string; sql: string }[] {
  if (_files) return _files;
  _files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(path.join(MIGRATIONS, name), 'utf8'),
    }));
  return _files;
}

/**
 * The LAST VERSIONED migration that defines fn_work_signals_for — the one that
 * wins. The `^\d{14}_` filter is load-bearing and was found the hard way: this
 * directory also holds un-versioned files (`faculty_metrics_*.sql`,
 * `work_signal_types_action_route_deeplinks.sql`) which sort AFTER every
 * timestamped file in ASCII, so a naive "last file" picks a historical artifact
 * and this whole suite silently grades the wrong definition. Reality agrees with
 * the filter: production's live body was verified byte-identical to
 * 20260731190000 on 2026-08-08, not to either un-versioned file.
 */
let _engine: { name: string; body: string } | null = null;

function newestEngineDefinition(): { name: string; body: string } {
  if (_engine) return _engine;
  const hits = migrationFiles().filter(
    (f) =>
      /^\d{14}_/.test(f.name) &&
      /CREATE OR REPLACE FUNCTION public\.fn_work_signals_for/.test(f.sql),
  );
  expect(hits.length, 'no migration defines fn_work_signals_for').toBeGreaterThan(0);
  const last = hits[hits.length - 1];
  const m = last.sql.match(
    /CREATE OR REPLACE FUNCTION public\.fn_work_signals_for[\s\S]*?\$function\$;/,
  );
  expect(m, `could not extract the function body from ${last.name}`).toBeTruthy();
  _engine = { name: last.name, body: m![0] };
  return _engine;
}

/** Signal keys the engine actually EMITS (the inline VALUES list). */
function emittedKeys(body: string): Set<string> {
  const values = body.match(/JOIN \(VALUES([\s\S]*?)\) AS v\(key, value, value_personal\)/);
  expect(values, 'could not locate the inline VALUES list').toBeTruthy();
  return new Set(
    [...values![1].matchAll(/\(\s*'([a-z0-9_]+)'\s*,/g)].map((m) => m[1]),
  );
}

/** Signal keys REGISTERED as active across every migration. A row is treated as
 *  active unless that same statement explicitly sets is_active to false. */
function registeredActiveKeys(): Set<string> {
  const keys = new Set<string>();
  for (const { sql } of migrationFiles()) {
    const inserts = sql.matchAll(
      /INSERT INTO public\.work_signal_types[\s\S]*?(?=\n\s*(?:NOTIFY|REVOKE|GRANT|CREATE|ALTER|INSERT|COMMENT|--\s*-{3,})|$)/g,
    );
    for (const ins of inserts) {
      const stmt = ins[0];
      if (/is_active\s*=?\s*false/i.test(stmt)) continue;
      for (const m of stmt.matchAll(/\(\s*'([a-z0-9_]+)'\s*,\s*'/g)) keys.add(m[1]);
    }
  }
  // Deactivations elsewhere win over the seed that created the row.
  for (const { sql } of migrationFiles()) {
    for (const m of sql.matchAll(
      /UPDATE public\.work_signal_types[\s\S]{0,400}?is_active\s*=\s*false[\s\S]{0,200}?signal_key\s*=\s*'([a-z0-9_]+)'/g,
    )) {
      keys.delete(m[1]);
    }
  }
  return keys;
}

describe('work-signals: every registered key has an emitter', () => {
  it('drops no registered key except the documented known-dark ones', () => {
    const { body } = newestEngineDefinition();
    const emitted = emittedKeys(body);
    const registered = registeredActiveKeys();

    const dark = [...registered].filter((k) => !emitted.has(k)).sort();
    expect(
      dark,
      'these keys are registered + active but have no VALUES row, so the engine ' +
        'inner-join silently drops them and they render nowhere',
    ).toEqual([...KNOWN_DARK_KEYS].sort());
  });

  it('emits no key that was never registered (the mirror failure)', () => {
    const { body } = newestEngineDefinition();
    const registered = registeredActiveKeys();
    const orphans = [...emittedKeys(body)].filter((k) => !registered.has(k)).sort();
    expect(orphans, 'computed but never registered — the join drops these too').toEqual([]);
  });

  it('the known-dark list is a real gap, not a blanket excuse', () => {
    // A wildcard would make the first test vacuous. Pin the size.
    expect(KNOWN_DARK_KEYS.size).toBe(1);
  });
});

describe(`work-signals: ${NEW_KEY} lands on BOTH sides`, () => {
  it('is emitted by the engine', () => {
    expect(emittedKeys(newestEngineDefinition().body).has(NEW_KEY)).toBe(true);
  });

  it('is registered in work_signal_types', () => {
    expect(registeredActiveKeys().has(NEW_KEY)).toBe(true);
  });
});

describe('work-signals: the same-day count is a subset of the personal count', () => {
  /**
   * The relationship same_day <= personal_marked is not asserted against live
   * rows — it is guaranteed by the SHAPE of the query, which is stronger. Both
   * counters come out of ONE scan: the personal count is `count(*)` and the
   * same-day count is `count(*) FILTER (...)` over the same aggregate, so the
   * second can never exceed the first for any data, ever.
   *
   * The shape also settles SCOPE. The marker test lives in the WHERE and the
   * day test in the FILTER, and FILTER only sees rows the WHERE admitted — so
   * no other marker's `marked_at` is ever parsed on this caller's behalf. An
   * earlier draft put both tests in the WHERE, where Postgres may evaluate
   * conjuncts in any order; that is the same reordering freedom that makes a
   * bare AND unsafe, and it would have let one malformed value anywhere in the
   * window blank the card for everybody.
   */
  const engine = () => newestEngineDefinition().body;

  function countingBlock(body: string): string {
    const m = body.match(
      /SELECT\s+count\(\*\)::int,[\s\S]*?INTO v_personal_marked, v_personal_same_day[\s\S]*?;/,
    );
    expect(
      m,
      'the folded two-aggregate counting block is missing — both counters must ' +
        'come from ONE scan, or the subset relation stops being structural',
    ).toBeTruthy();
    return m![0];
  }

  it('fills both counters from a single scan of a single predicate', () => {
    const block = countingBlock(engine());
    expect(block).toContain(
      'FROM public.student_attendance sa, jsonb_each(sa.attendance_data) AS period',
    );
    expect(block).toContain('WHERE sa.attendance_date BETWEEN v_from AND v_to');
    expect(block).toContain(
      "AND period.value->'marked_by_details'->>'marker_id' = v_uid::text",
    );
    // Exactly ONE reference to the table — a second scan would mean two
    // predicates to keep in step by hand. Counting the TABLE rather than the
    // `FROM` keyword is deliberate: a mutation that comma-joins a second copy
    // into the same FROM clause survives a `FROM …` count, and did.
    expect(block.match(/public\.student_attendance/g)!.length).toBe(1);
    expect(block.match(/jsonb_each\(/g)!.length).toBe(1);
  });

  it('derives same-day as a FILTER over that scan, not a second query', () => {
    const block = countingBlock(engine());
    expect(block).toMatch(/count\(\*\) FILTER \(/);
    expect(block).toContain('= sa.attendance_date');
  });

  it('keeps the marker test in the WHERE, so FILTER never sees another marker', () => {
    const block = countingBlock(engine());
    const whereAt = block.indexOf("marker_id' = v_uid::text");
    const filterAt = block.indexOf('FILTER (');
    expect(whereAt).toBeGreaterThan(-1);
    expect(filterAt).toBeGreaterThan(-1);
    // The FILTER clause is part of the select list, which precedes the WHERE.
    expect(filterAt).toBeLessThan(whereAt);
  });

  it('compares days in IST, never UTC', () => {
    // attendance_date is an IST calendar date. Truncating a UTC instant credits
    // a class marked at 02:30 IST to the previous day. Measured on production
    // 2026-08-08, the two readings already disagree on real rows.
    expect(countingBlock(engine())).toContain("AT TIME ZONE 'Asia/Kolkata'");
  });

  it('never casts marked_at directly — a raise there blanks the whole card', () => {
    // A bare `::timestamptz` on client-written text can raise; the service
    // resolves any error to null and the card renders nothing.
    const block = countingBlock(engine());
    expect(block).toContain('public.fn_try_timestamptz_ist(');
    expect(
      block,
      'raw ::timestamptz on marked_at is exactly the failure mode this avoids',
    ).not.toMatch(/marked_at'\)::timestamptz/);
  });

  it('declares the counter it fills', () => {
    expect(engine()).toContain('v_personal_same_day int := 0;');
  });
});

describe('work-signals: the timestamp helper cannot raise', () => {
  /**
   * A prefix regex was the first attempt and it is NOT sufficient — it tests
   * shape, not validity. Verified against production 2026-08-08: '2026-13-40',
   * '2026-02-30' and '0000-00-00' all satisfy `^\d{4}-\d{2}-\d{2}` and then
   * raise 22008; '2026-08-08junk', '' and 'not a date' raise 22007. No regex
   * can exclude 31 February, so the conversion has to trap instead.
   */
  const helper = (): string => {
    const { sql } = migrationFiles().find(
      (f) => f.name === newestEngineDefinition().name,
    )!;
    const m = sql.match(
      /CREATE OR REPLACE FUNCTION public\.fn_try_timestamptz_ist[\s\S]*?\$function\$;/,
    );
    expect(m, 'fn_try_timestamptz_ist is missing').toBeTruthy();
    return m![0];
  };

  it('traps both datetime SQLSTATEs observed on production', () => {
    const h = helper();
    expect(h).toContain('invalid_datetime_format'); // 22007
    expect(h).toContain('datetime_field_overflow'); // 22008
  });

  it('does NOT swallow query cancellation', () => {
    // WHEN others would also catch query_canceled / statement timeout, turning a
    // timed-out engine into a silently wrong count instead of an error.
    expect(helper()).not.toMatch(/WHEN\s+others/i);
  });

  it('anchors an offset-less timestamp to IST, not to the session zone', () => {
    // The engine sets search_path and statement_timeout but never timezone, so
    // a naive '2026-08-08T23:30:00' would otherwise parse as UTC and land on
    // the 9th.
    const h = helper();
    expect(h).toMatch(/~ '\(Z\|\[\+-\]\[0-9\]\{2\}:\?\[0-9\]\{2\}\)/);
    expect(h).toContain("::timestamp AT TIME ZONE 'Asia/Kolkata'");
  });

  it('is STABLE, never IMMUTABLE', () => {
    // Parsing depends on session state; IMMUTABLE would license the planner to
    // fold or cache it wrongly.
    expect(helper()).toMatch(/\nSTABLE\n/);
    expect(helper()).not.toMatch(/\nIMMUTABLE\n/);
  });

  it('is locked away from anon like every other function here', () => {
    const { sql } = migrationFiles().find(
      (f) => f.name === newestEngineDefinition().name,
    )!;
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.fn_try_timestamptz_ist\(text\) FROM anon, PUBLIC;/,
    );
  });
});

describe('work-signals: the engine stays locked away from anon', () => {
  it('re-asserts the revoke in the same migration that replaces the function', () => {
    const newest = migrationFiles().find(
      (f) => f.name === newestEngineDefinition().name,
    )!;
    expect(
      newest.sql,
      `${newest.name} replaces the function without re-asserting the anon revoke — ` +
        "Supabase's default privileges hand anon EXECUTE on every new function",
    ).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.fn_work_signals_for\(date, ?date\) FROM anon, PUBLIC;/,
    );
    expect(newest.sql).toMatch(
      /GRANT\s+EXECUTE ON FUNCTION public\.fn_work_signals_for\(date, ?date\) TO authenticated, service_role;/,
    );
  });
});
