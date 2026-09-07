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
 * the SQL, so it is checkable from the SQL.
 *
 * ⚠️ WHAT THIS SUITE IS NOT EVIDENCE ABOUT. It grades migration FILES, never
 * the running database, and the two are not the same thing right now:
 * 20260816020000 IS applied to production (2026-08-08), but what is running is
 * its PRE-CORRECTION body — the version that merged in #2924, whose timestamp
 * guard still raises on four real inputs. Re-applying the file is the remedy.
 * DDL also reaches this database out-of-band, so green here means "the files
 * are internally consistent", never "production is consistent". The live check
 * is A10b in .claude/battery-two-sided-close.sql, which reads the real registry
 * and the real RPC response; this suite cannot replace it and does not try to.
 *
 * Live counts are NOT asserted
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

/**
 * Signal keys REGISTERED as active, derived across every migration in
 * FILENAME ORDER so the last write wins.
 *
 * `is_active` is judged PER ROW, not per statement. Review caught the earlier
 * version doing the latter: a single multi-row seed containing one deactivated
 * key erased every sibling key in that INSERT from the derived registry, so a
 * genuinely dark key sitting beside it would never reach the parity comparison
 * and the no-dark-keys test would report green — the very silent-drop class
 * this file exists to catch. Ordering matters for the same reason: a key
 * deactivated in one migration and re-activated in a later one was being
 * deleted permanently.
 */
function registeredActiveKeys(): Set<string> {
  const active = new Map<string, boolean>();

  // Explicitly sorted: the "last write wins" semantics below depend on it, and
  // depending on readdirSync's incidental order would make the result
  // platform-dependent for no reason.
  const files = [...migrationFiles()].sort((a, b) => a.name.localeCompare(b.name));

  for (const { sql } of files) {
    // Collect INSERTs and UPDATEs with their TEXTUAL OFFSET, then fold them in
    // that order. Folding all INSERTs before all UPDATEs (the earlier shape)
    // meant an `UPDATE … is_active=false` appearing BEFORE a re-activating
    // INSERT in the same file still won — silently dropping a live key from the
    // derived registry and letting a genuinely dark key beside it escape the
    // parity comparison. The ordering only held across files, not within one.
    const effects: { at: number; apply: () => void }[] = [];

    for (const ins of sql.matchAll(
      /INSERT INTO public\.work_signal_types[\s\S]*?(?=\n\s*(?:NOTIFY|REVOKE|GRANT|CREATE|ALTER|INSERT|UPDATE|COMMENT|--\s*-{3,})|$)/g,
    )) {
      const stmt = ins[0];
      const at = ins.index ?? 0;
      // Resolve is_active POSITIONALLY against the statement's column list.
      // Scanning for a bare `false` anywhere in the tuple fires on ANY other
      // boolean column, which drops the key for the wrong reason — the same
      // silent drop, just moved from statement scope to row scope.
      const cols = stmt
        .match(/INSERT INTO public\.work_signal_types\s*\(([^)]*)\)/i)?.[1]
        .split(',')
        .map((c) => c.trim().toLowerCase());
      const activeIdx = cols ? cols.indexOf('is_active') : -1;
      // ON CONFLICT … is_active=true only affects rows that actually conflict,
      // which this static reader cannot know — so it is treated as evidence the
      // author intends the key active, never as an override of an explicit
      // per-row false.
      const conflictForcesActive = /ON CONFLICT[\s\S]*?is_active\s*=\s*true/i.test(stmt);
      const valuesPart = stmt.split(/ON CONFLICT/i)[0];

      for (const tuple of splitTuples(valuesPart)) {
        const key = tuple.match(/^\s*'([a-z0-9_]+)'\s*,/)?.[1];
        if (!key) continue;
        let isActive: boolean;
        if (activeIdx >= 0) {
          const field = splitTopLevel(tuple)[activeIdx]?.trim().toLowerCase();
          isActive = field === undefined ? true : field !== 'false';
        } else {
          // No is_active column named ⇒ the table default (true) applies.
          isActive = true;
        }
        if (!isActive && conflictForcesActive) isActive = false; // explicit false wins
        effects.push({ at, apply: () => active.set(key, isActive) });
      }
    }

    for (const m of sql.matchAll(
      /UPDATE public\.work_signal_types[\s\S]{0,400}?is_active\s*=\s*(true|false)[\s\S]{0,300}?signal_key\s*=\s*'([a-z0-9_]+)'/gi,
    )) {
      const on = m[1].toLowerCase() === 'true';
      const key = m[2];
      effects.push({ at: m.index ?? 0, apply: () => active.set(key, on) });
    }

    effects.sort((a, b) => a.at - b.at).forEach((e) => e.apply());
  }

  return new Set([...active.entries()].filter(([, on]) => on).map(([k]) => k));
}

/** Split one tuple's body into its top-level, comma-separated fields. */
function splitTopLevel(tuple: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inStr = false;
  let cur = '';
  for (let i = 0; i < tuple.length; i++) {
    const c = tuple[i];
    if (c === "'") {
      if (inStr && tuple[i + 1] === "'") { cur += "''"; i++; continue; }
      inStr = !inStr;
      cur += c;
      continue;
    }
    if (!inStr) {
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

/** Blank out single-quoted literals so keyword scans can't read prose.
 *  '' inside a literal is an escaped quote, not a terminator. */
function stripLiterals(sqlFragment: string): string {
  let out = '';
  let inStr = false;
  for (let i = 0; i < sqlFragment.length; i++) {
    const c = sqlFragment[i];
    if (c === "'") {
      if (inStr && sqlFragment[i + 1] === "'") { i++; continue; }
      inStr = !inStr;
      out += ' ';
      continue;
    }
    out += inStr ? ' ' : c;
  }
  return out;
}

/** Split a VALUES list into its top-level parenthesised tuples. */
function splitTuples(sqlFragment: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  for (let i = 0; i < sqlFragment.length; i++) {
    const c = sqlFragment[i];
    if (c === "'") {
      // '' is an escaped quote inside a string literal.
      if (inStr && sqlFragment[i + 1] === "'") { i++; continue; }
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (c === '(') {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (c === ')') {
      depth--;
      if (depth === 0 && start > -1) {
        out.push(sqlFragment.slice(start, i));
        start = -1;
      }
    }
  }
  return out;
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

  /**
   * The statement that fills BOTH counters, and nothing else.
   *
   * The `(?!;)` tempering is load-bearing and was found by review: a plain lazy
   * `[\s\S]*?` matched from the EARLIER assigned/witnessed aggregate and ran
   * 2,030 characters across two statements, so `indexOf('FILTER (')` found the
   * *witnessed* FILTER and the scoping assertion below was grading the wrong
   * SQL entirely. Forbidding a semicolon inside the match pins it to one
   * statement; the `v_assigned_marked` assertion is the belt to that braces.
   */
  function countingBlock(body: string): string {
    const m = body.match(
      /SELECT\s+count\(\*\)::int,(?:(?!;)[\s\S])*?INTO v_personal_marked, v_personal_same_day(?:(?!;)[\s\S])*?;/,
    );
    expect(
      m,
      'the folded two-aggregate counting block is missing — both counters must ' +
        'come from ONE scan, or the subset relation stops being structural',
    ).toBeTruthy();
    expect(
      m![0],
      'the match ran past its own statement into the assigned/witnessed block',
    ).not.toContain('v_assigned_marked');
    return m![0];
  }

  /** The text inside `FILTER ( … )`, and where it ends, by balancing parens.
   *  The end index matters: the FILTER carries its OWN `WHERE`, so anything
   *  searching for the statement's WHERE has to start after this. */
  function filterSpan(block: string): { expr: string; end: number } {
    const start = block.indexOf('FILTER (');
    expect(start, 'no FILTER in the counting block').toBeGreaterThan(-1);
    let depth = 0;
    for (let i = start + 'FILTER '.length; i < block.length; i++) {
      if (block[i] === '(') depth++;
      else if (block[i] === ')') {
        depth--;
        if (depth === 0) {
          return { expr: block.slice(start + 'FILTER ('.length, i), end: i + 1 };
        }
      }
    }
    throw new Error('unbalanced FILTER parentheses');
  }

  const filterExpression = (block: string): string => filterSpan(block).expr;

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
    // Asserted as a NEGATIVE. An earlier version compared the two offsets —
    // which can never fail, because a select-list FILTER always precedes WHERE
    // textually. It asserted grammar, not scoping, and would have passed for a
    // mutant that moved the marker test straight into the FILTER.
    const block = countingBlock(engine());
    const { expr, end } = filterSpan(block);
    expect(
      expr,
      'the marker test belongs in the WHERE; inside the FILTER it stops scoping ' +
        'the scan and another marker\'s row can be parsed on this caller\'s behalf',
    ).not.toContain('marker_id');
    // Search from AFTER the FILTER closes. The FILTER carries its own WHERE, so
    // slicing at the first `WHERE` in the block lands INSIDE it and the
    // assertion degrades to "the marker test exists somewhere" — presence, not
    // scoping, which is the exact vacuity this file keeps having to remove.
    const statementTail = block.slice(end);
    expect(statementTail).toContain('WHERE sa.attendance_date BETWEEN');
    expect(statementTail).toContain(
      "period.value->'marked_by_details'->>'marker_id' = v_uid::text",
    );
  });

  it('resolves the day in IST, never in the session zone', () => {
    // attendance_date is an IST calendar date. Measured on production
    // 2026-08-08, the IST and UTC readings already disagree on real rows.
    // The conversion lives inside fn_try_ist_date, which returns a date.
    expect(filterExpression(countingBlock(engine()))).toContain(
      'public.fn_try_ist_date(',
    );
  });

  it('does no datetime arithmetic on client text outside the trap', () => {
    // The helper returns a DATE precisely so the zone shift happens behind its
    // exception handler. An earlier version shifted the returned instant out
    // here, where a value near the type ceiling overflowed and raised in the
    // engine — defeating the whole point of the helper.
    const block = countingBlock(engine());
    expect(block).not.toContain('::timestamptz');
    expect(block).not.toContain("AT TIME ZONE 'Asia/Kolkata'");
    expect(block).not.toMatch(/marked_at'\)::/);
  });

  it('declares the counter it fills', () => {
    expect(engine()).toContain('v_personal_same_day int := 0;');
  });
});

describe('work-signals: the date helper cannot raise on bad data', () => {
  /**
   * Two earlier drafts got this wrong in the same way — by enumerating.
   *
   * Draft 1 used `~ '^\d{4}-\d{2}-\d{2}'` and claimed that made a raise
   * impossible. It tests shape, not validity: '2026-13-40', '2026-02-30' and
   * '0000-00-00' all satisfy it and raise 22008 (verified on production).
   *
   * Draft 2 trapped 22007 and 22008 by name. Review found '+99:00' raises
   * 22009 and a misspelt zone raises 22023 — both escaped. Verified too.
   *
   * A list that needed extending twice is the wrong shape of rule. The handler
   * now swallows CLASS 22 (data exception) and re-raises everything else, which
   * is complete by the standard's own definition.
   *
   * The re-raise matters too, but NOT for the reason first documented here:
   * verified on production 2026-08-08, plpgsql's OTHERS already excludes
   * QUERY_CANCELED, so a statement timeout propagates without help. What the
   * re-raise actually covers is class 53 (resources), class 40 (deadlock,
   * serialization), and classes 58/XX — swallowing any of those would turn a
   * real failure into "not marked that day".
   */
  const migrationSql = (): string =>
    migrationFiles().find((f) => f.name === newestEngineDefinition().name)!.sql;

  const helper = (): string => {
    const m = migrationSql().match(
      /CREATE OR REPLACE FUNCTION public\.fn_try_ist_date[\s\S]*?\$function\$;/,
    );
    expect(m, 'fn_try_ist_date is missing').toBeTruthy();
    return m![0];
  };

  it('swallows data exceptions by CLASS, not by an enumerated list', () => {
    const h = helper();
    expect(h).toMatch(/left\(SQLSTATE, ?2\) <> '22'/);
    // Naming individual datetime SQLSTATEs is what failed twice.
    expect(h).not.toContain('invalid_datetime_format');
    expect(h).not.toContain('datetime_field_overflow');
  });

  it('re-raises anything that is not a data exception', () => {
    // Without the RAISE, a cancelled or resource-starved query silently becomes
    // "not marked that day" — a wrong number is worse than an error.
    expect(helper()).toMatch(/RAISE;/);
  });

  it('returns a date, so the zone shift happens inside the handler', () => {
    expect(helper()).toMatch(/RETURNS date/);
  });

  it('takes the naive branch for a zone-free value, padded or not', () => {
    // Two failure directions, and BOTH have been walked into here.
    // Too permissive: a "does it look zoned?" test sends anything it fails to
    // recognise to ::timestamp, which SILENTLY DISCARDS the zone — verified,
    // '…T20:00:00z', '…T23:50:00+05' and '… UTC' were re-anchored as IST.
    // Too strict: an exact-width, untrimmed test REJECTS genuinely zone-free
    // values it merely fails to recognise, sending them to the zoned branch to
    // be read as UTC — verified, '2026-08-08 23:30:00 ' and '2026-8-8 23:30:00'
    // landed a day late, a regression against the version already running.
    const h = helper();
    // btrim/1 strips ONLY spaces, so the character set is explicit — a tab, CR
    // or LF would otherwise survive, miss the pattern, take the zoned branch
    // and land a day late. Same bug, just a different whitespace character.
    expect(h, 'input must be trimmed of ALL whitespace, not just spaces').toMatch(
      /btrim\(p_text, E' \\t\\r\\n\\f\\v'\)/,
    );
    // [Tt]: a lowercase separator is zone-free too.
    expect(h).toContain(
      "'^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}([Tt ][0-9]{1,2}:[0-9]{2}(:[0-9]{2}(\\.[0-9]+)?)?)?$'",
    );
    // The doubtful path must be the SAFE one.
    expect(h).toContain("((v_t::timestamptz) AT TIME ZONE 'Asia/Kolkata')::date");
  });

  it('is STABLE, never IMMUTABLE', () => {
    expect(helper()).toMatch(/\nSTABLE\n/);
    expect(helper()).not.toMatch(/\nIMMUTABLE\n/);
  });

  it('is locked away from anon like every other function here', () => {
    expect(migrationSql()).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.fn_try_ist_date\(text\) FROM anon, PUBLIC;/,
    );
  });

  it('retires the superseded helper instead of leaving it callable', () => {
    // An earlier version of this same file shipped fn_try_timestamptz_ist and
    // was APPLIED to production before its corrections merged. It is not merely
    // redundant — it raises on '+99:00' and on a misspelt zone, and silently
    // drops a lowercase 'z'. A retired function that still parses timestamps is
    // an invitation to call it.
    expect(migrationSql()).toMatch(
      /DROP FUNCTION IF EXISTS public\.fn_try_timestamptz_ist\(text\)/,
    );
    // …and it must not still be WIRED IN anywhere in the file.
    const engineBody = newestEngineDefinition().body;
    expect(engineBody).not.toContain('fn_try_timestamptz_ist');
  });

  it('refuses to drop the old helper while anything still calls it', () => {
    // A plpgsql body is stored as TEXT, so Postgres records no dependency and a
    // bare DROP succeeds even while the live engine still calls it — the engine
    // then fails at runtime and My Pulse goes blank for everyone. This file
    // reaches the database out-of-band, statement by statement, so "the replace
    // already ran" is an assumption rather than a fact.
    const sql = migrationSql();
    expect(sql).toContain('REFUSING TO DROP');
    expect(sql).toMatch(/pg_get_functiondef\(p\.oid\) LIKE '%fn_try_timestamptz_ist%'/);
    expect(sql).toMatch(/IF v_refs > 0 THEN/);
    // …and the scan must not walk objects pg_get_functiondef cannot describe.
    // It raises 42809 on aggregates and window functions, so an unfiltered scan
    // aborts this block the day an extension adds one — AFTER the engine was
    // replaced, leaving a half-applied migration and a misleading error.
    expect(
      sql,
      'the caller scan must exclude aggregates/window functions (prokind)',
    ).toMatch(/AND p\.prokind IN \('f', 'p'\)/);
  });
});

describe('work-signals: a late apply cannot silently revert the engine', () => {
  /**
   * This file rewrites the whole engine body from a 2026-08-08 snapshot, but
   * the apply is Director-gated to an unknown later date, six migrations define
   * this function, and DDL reaches production out-of-band. Without a guard, an
   * apply weeks later overwrites whatever shipped in between and says nothing.
   */
  it('refuses to apply on top of a body it did not read', () => {
    const sql = migrationFiles().find(
      (f) => f.name === newestEngineDefinition().name,
    )!.sql;
    expect(sql).toContain('REFUSING TO APPLY');
    expect(sql).toMatch(/md5\(v_def\) <> '[0-9a-f]{32}'/);

    // The idempotency test must be a REVISION TAG, not a feature substring.
    // `position('v_personal_same_day' in v_def) = 0` was the first attempt and
    // it disarms itself: once the feature is applied that substring is present
    // forever, so the guard would pass for every later body containing it and
    // silently overwrite whatever shipped next — while telling the operator the
    // re-apply was safe. A guard that stops guarding the first time it succeeds
    // is worse than no guard.
    // Checked against CODE, not prose — the file documents the discarded
    // approach on purpose, and that explanation must not trip its own guard.
    const code = sql
      .split('\n')
      .filter((l) => !/^\s*--/.test(l))
      .join('\n');
    expect(code).not.toMatch(/position\('v_personal_same_day' in v_def\)/);
    const rev = sql.match(/v_rev constant text := '([^']+)'/)?.[1];
    expect(rev, 'the guard has no revision tag').toBeTruthy();
    expect(sql).toMatch(/position\(v_rev in v_def\) = 0/);
    // …and the tag must actually be present in the body it installs, or the
    // guard can never recognise its own output and every re-run aborts.
    expect(
      newestEngineDefinition().body,
      `the engine body does not carry the revision tag "${rev}" the guard looks for`,
    ).toContain(rev!);
    // The read must be schema-qualified and single-row: an unqualified proname
    // match also finds a same-named function in another schema, and plpgsql
    // SELECT INTO silently takes the first of several rows — so the guard could
    // compare the wrong body and wave a drifted engine through.
    expect(sql).toMatch(/JOIN pg_namespace n ON n\.oid = p\.pronamespace/);
    expect(sql).toMatch(/n\.nspname = 'public' AND p\.proname = 'fn_work_signals_for'/);
    expect(sql).toMatch(/IF v_n <> 1 THEN/);
  });

  it('is one transaction, or the guard cannot stop the write it protects', () => {
    // A RAISE inside a standalone DO aborts that block — it does NOT stop the
    // next statement from being executed, and this file reaches the database
    // out-of-band, statement by statement. Un-wrapped, §0 could refuse and the
    // CREATE OR REPLACE could still overwrite a drifted engine a moment later.
    // Check and write have to be indivisible, not merely adjacent.
    const sql = migrationFiles().find(
      (f) => f.name === newestEngineDefinition().name,
    )!.sql;
    const code = sql.split('\n').filter((l) => !/^\s*--/.test(l));
    expect(code.some((l) => /^BEGIN;\s*$/.test(l)), 'migration is not wrapped in BEGIN').toBe(true);
    expect(code.some((l) => /^COMMIT;\s*$/.test(l)), 'migration is not wrapped in COMMIT').toBe(true);
    // BEGIN must precede the guard, and COMMIT must follow the last write.
    const beginAt = sql.search(/^BEGIN;\s*$/m);
    const guardAt = sql.indexOf('DO $guard$');
    const commitAt = sql.search(/^COMMIT;\s*$/m);
    expect(beginAt).toBeGreaterThan(-1);
    expect(beginAt).toBeLessThan(guardAt);
    expect(commitAt).toBeGreaterThan(sql.indexOf('$retire$;'));
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
