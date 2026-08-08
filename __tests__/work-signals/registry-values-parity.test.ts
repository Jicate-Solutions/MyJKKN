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
   * rows — it is guaranteed structurally. The same-day query repeats every
   * conjunct of the personal-marked query and adds one more, so its result set
   * is a subset by construction, for all data and forever. Sampling today's
   * database would prove strictly less.
   */
  const engine = () => newestEngineDefinition().body;

  const PERSONAL_CONJUNCTS = [
    'FROM public.student_attendance sa, jsonb_each(sa.attendance_data) AS period',
    'WHERE sa.attendance_date BETWEEN v_from AND v_to',
    "AND period.value->'marked_by_details'->>'marker_id' = v_uid::text",
  ];

  function sameDayBlock(body: string): string {
    const m = body.match(
      /SELECT count\(\*\)::int INTO v_personal_same_day[\s\S]*?END;/,
    );
    expect(m, 'the v_personal_same_day block is missing from the engine').toBeTruthy();
    return m![0];
  }

  it('repeats every conjunct of the personal-marked predicate', () => {
    const block = sameDayBlock(engine());
    for (const conjunct of PERSONAL_CONJUNCTS) {
      expect(block, `same-day block does not mirror: ${conjunct}`).toContain(conjunct);
    }
  });

  it('adds exactly the day comparison on top', () => {
    expect(sameDayBlock(engine())).toContain('= sa.attendance_date');
  });

  it('compares days in IST, never UTC', () => {
    // attendance_date is an IST calendar date. Truncating a UTC instant credits
    // a class marked at 02:30 IST to the previous day. Measured on production
    // 2026-08-08, the two readings already disagree on real rows.
    expect(sameDayBlock(engine())).toContain("AT TIME ZONE 'Asia/Kolkata'");
  });

  it('guards the timestamp cast so one malformed value cannot blank the card', () => {
    // marked_at is client-written text inside jsonb. An unguarded cast on a
    // non-ISO value raises, the service resolves any error to null, and the card
    // renders nothing at all — an estate-wide silent disappearance. A CASE (not
    // a sibling AND) is required because Postgres does not guarantee the
    // evaluation order of WHERE conjuncts.
    const block = sameDayBlock(engine());
    expect(block).toContain('CASE');
    expect(block).toMatch(/marked_at' ~ '\^\\d\{4\}-\\d\{2\}-\\d\{2\}'/);
    expect(block).toContain('ELSE false');
  });

  it('declares the counter it fills', () => {
    expect(engine()).toContain('v_personal_same_day int := 0;');
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
