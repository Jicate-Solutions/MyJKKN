// The cohort transition map exists TWICE — once in TypeScript, once in SQL —
// and this is the test that stops the two copies drifting apart.
//
// WHY THERE ARE TWO. The screen has to know which moves to offer before it asks
// the database for anything, and the database has to refuse an illegal move
// whatever asks for it. COHORT_TRANSITIONS (lib/services/cohort-core/lifecycle.ts)
// answers the first; fn_cohort_next_statuses
// (supabase/migrations/20261115043000_cohort_status_change_control.sql) answers
// the second. Neither can be deleted in favour of the other.
//
// WHAT DRIFT WOULD LOOK LIKE, AND WHY NOTHING ELSE WOULD CATCH IT. If somebody
// adds an edge to the TypeScript map alone, the screen offers a button whose
// press is refused by the database with a message about a move it just offered.
// If somebody adds it to the SQL alone, the move is legal and unreachable. Both
// compile, both typecheck, both pass every other gate, and both are only visible
// to a person clicking the button.
//
// The SQL is read off disk as TEXT rather than executed: this suite has no
// database, and the failure being guarded is a text-level disagreement between
// two files, which text is enough to see.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { COHORT_TRANSITIONS } from '@/lib/services/cohort-core/lifecycle';
import type { CohortStatus } from '@/lib/types/cohort-core';

const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/20261115043000_cohort_status_change_control.sql'
);

/**
 * Pull the CASE arms out of fn_cohort_next_statuses.
 *
 * Deliberately strict: it reads only the arms of that one function's CASE
 * expression, so an unrelated CASE elsewhere in the file cannot pad the result
 * and make a missing arm look present.
 */
function nextStatusesFromSql(sql: string): Record<string, string[]> {
  const fnStart = sql.indexOf('FUNCTION public.fn_cohort_next_statuses');
  expect(fnStart, 'fn_cohort_next_statuses is not in the migration').toBeGreaterThan(-1);

  const body = sql.slice(fnStart, sql.indexOf('$$;', fnStart));
  const arms: Record<string, string[]> = {};

  const armPattern = /WHEN\s+'([a-z_]+)'\s+THEN\s+ARRAY\[([^\]]*)\]/g;
  let match: RegExpExecArray | null;
  while ((match = armPattern.exec(body)) !== null) {
    const from = match[1];
    const to = match[2]
      .split(',')
      .map((token) => token.trim().replace(/^'|'$/g, ''))
      .filter((token) => token.length > 0);
    arms[from] = to;
  }
  return arms;
}

describe('cohort status transition map — TypeScript and SQL agree', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  const fromSql = nextStatusesFromSql(sql);

  it('names every non-terminal status the TypeScript map names', () => {
    const tsNonTerminal = (Object.keys(COHORT_TRANSITIONS) as CohortStatus[])
      .filter((status) => COHORT_TRANSITIONS[status].length > 0)
      .sort();

    expect(Object.keys(fromSql).sort()).toEqual(tsNonTerminal);
  });

  it('offers exactly the same moves from each status', () => {
    for (const status of Object.keys(COHORT_TRANSITIONS) as CohortStatus[]) {
      const expected = [...COHORT_TRANSITIONS[status]].sort();
      // A terminal status has no CASE arm; the SQL falls through to the ELSE,
      // which is an empty array — the same answer, written differently.
      const actual = [...(fromSql[status] ?? [])].sort();
      expect(actual, `moves out of "${status}"`).toEqual(expected);
    }
  });

  it('falls through to an empty array rather than to a guess', () => {
    // The ELSE arm is what a terminal status and an unknown status both land on.
    // If it ever returned anything but an empty array, an archived cohort would
    // sprout a move out of the last stage.
    expect(sql).toMatch(/ELSE\s+ARRAY\[\]::text\[\]/);
  });

  it('is the map the writer checks, not a second one', () => {
    // fn_cohort_set_status must decide legality by calling the map above. If it
    // ever inlines its own list of statuses, this whole test guards nothing.
    const setStart = sql.indexOf('FUNCTION public.fn_cohort_set_status');
    expect(setStart).toBeGreaterThan(-1);
    const setBody = sql.slice(setStart, sql.indexOf('$$;', setStart));
    expect(setBody).toContain('public.fn_cohort_next_statuses(v_from)');
  });
});
