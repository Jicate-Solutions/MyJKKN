/**
 * The biometric gates' refusal text names HR (PR #3993, BUG-006101 / BUG-006140).
 *
 * Two database walls refuse an approval while a month's biometric attendance is
 * not uploaded: hr_trig_block_leave_approval_without_biometric (leave) and
 * hr_trig_comp_off_require_biometric (comp-off claims, same approvals screen).
 * Both used to tell the APPROVER to "Import it from HR > Attendance > Import,
 * then approve" — something only HR can do, at a menu path that does not exist.
 *
 * STRUCTURAL, not behavioural: CI has no PostgreSQL. These pin two things:
 *   1. the EFFECTIVE definition of each function (the last migration, in
 *      filename order, that defines it) names HR, not the approver;
 *   2. each re-statement changes only the RAISE text, so the gates admit and
 *      refuse exactly the same rows as before.
 *
 * Migration ORDER is deliberately not asserted: the ship wave applies each
 * version through scripts/ship-wave/apply-migrations.sh, which checks it against
 * schema_migrations and never compares it with the newest applied one.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'supabase/migrations');
/** Filename order; the newest file defining a function holds its effective definition. */
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const code = (f: string) => readFileSync(join(DIR, f), 'utf8').replace(/--[^\n]*/g, '');

const NEW_WORDING = 'HR uploads it from HR Setup › Admin Dashboard › Import Biometric Punches';
const STALE_WORDING = 'Import it from HR > Attendance > Import';

const GATES = [
  'hr_trig_block_leave_approval_without_biometric',
  'hr_trig_comp_off_require_biometric',
] as const;

const defines = (fn: string) =>
  new RegExp(`CREATE\\s+(OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${fn}\\s*\\(`, 'i');

/** Files defining `fn`, in filename order. */
const definitionsOf = (fn: string) => FILES.filter((f) => defines(fn).test(code(f)));

/** The function's body text, from its CREATE to the closing $function$. */
function bodyOf(fn: string, file: string): string {
  const src = code(file);
  const start = src.search(defines(fn));
  expect(start, `${fn} in ${file}`).toBeGreaterThanOrEqual(0);
  const open = src.indexOf('$function$', start);
  const close = src.indexOf('$function$', open + '$function$'.length);
  return src.slice(start, close);
}

/** Body lines with the one RAISE message literal masked out. */
const withoutMessage = (body: string) =>
  body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !(l.startsWith("'") && l.includes('has not been uploaded yet')));

describe('biometric gate refusal text names HR', () => {
  for (const fn of GATES) {
    it(`${fn}: the effective definition names HR, not the approver`, () => {
      const defs = definitionsOf(fn);
      const effective = defs[defs.length - 1];
      const body = bodyOf(fn, effective);
      expect(body, effective).toContain(NEW_WORDING);
      expect(body, effective).not.toContain(STALE_WORDING);
    });

    it(`${fn}: the re-statement changes only the refusal text`, () => {
      const defs = definitionsOf(fn);
      expect(defs.length).toBeGreaterThanOrEqual(2);
      const [previous, effective] = defs.slice(-2);
      expect(withoutMessage(bodyOf(fn, effective))).toEqual(
        withoutMessage(bodyOf(fn, previous)),
      );
    });
  }
});
