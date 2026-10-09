/**
 * The Director list must stay closed in the generic policy readers.
 *
 * 20270520090000 (section 7) patches fn_get_policy(text, uuid) and
 * fn_internship_evaluate_policy(text, jsonb) IN PLACE: it adds a guard after
 * every `policy_key = p_key`, so the key 'platform.the_director_profile_ids'
 * is returned only to a super admin or someone on the list. A later
 * CREATE OR REPLACE of either function replaces the whole body. If that body
 * does not carry the guard, every signed-in account can read the list again.
 *
 * This test fails any migration sorted after 20270520090000 that re-creates
 * either reader without the guard at every key filter, and requires the
 * setup mirror of fn_get_policy to carry it too. It reads the repo only: SQL
 * run by hand outside a migration is not seen here.
 *
 * Run: npx vitest run __tests__/hr/the-director-list-reader-guard.test.ts
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const MIG_DIR = join(ROOT, 'supabase', 'migrations');
const DIRECTOR_LIST_FILE = '20270520090000_the_director_list.sql';
const GUARD =
  " AND (p_key IS DISTINCT FROM 'platform.the_director_profile_ids'" +
  ' OR (SELECT public.is_super_admin()) OR (SELECT public.fn_is_the_director()))';

/** The readers section 7 patches, as a CREATE statement names them. */
const READERS: Array<{ name: string; create: RegExp }> = [
  {
    name: 'fn_get_policy',
    create: /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?fn_get_policy\s*\(/i,
  },
  {
    name: 'fn_internship_evaluate_policy',
    create:
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?fn_internship_evaluate_policy\s*\(/i,
  },
];

const read = (p: string) => readFileSync(p, 'utf8');
const stripSqlComments = (sql: string) => sql.replace(/--[^\n]*/g, '');
const squash = (s: string) => s.replace(/\s+/g, ' ');

/**
 * Every CREATE of `create` in `sql`, each cut at the end of its function body
 * (the dollar-quote tag that opened it, closed again).
 */
function definitions(sql: string, create: RegExp): string[] {
  const out: string[] = [];
  const re = new RegExp(create.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const rest = sql.slice(m.index);
    const tag = /AS\s+(\$[A-Za-z_]*\$)/i.exec(rest);
    expect(tag, `no dollar-quoted body after ${m[0]}`).not.toBeNull();
    const open = rest.indexOf(tag![1], tag!.index) + tag![1].length;
    const close = rest.indexOf(tag![1], open);
    expect(close, `unterminated body after ${m[0]}`).toBeGreaterThan(open);
    out.push(rest.slice(0, close + tag![1].length));
  }
  return out;
}

/** How many `policy_key = p_key` filters, and how many carry the guard right after. */
function guardCoverage(def: string): { filters: number; guarded: number } {
  const body = squash(stripSqlComments(def)).replace(/policy_key\s*=\s*p_key\b/g, 'policy_key = p_key');
  const filters = body.split('policy_key = p_key').length - 1;
  const guarded = body.split(`policy_key = p_key${GUARD}`).length - 1;
  return { filters, guarded };
}

/** Migrations sorted after the Director list that re-create `create`. */
function laterCreates(create: RegExp, files: string[]): Array<{ file: string; def: string }> {
  return files
    .filter((f) => f > DIRECTOR_LIST_FILE)
    .flatMap((f) =>
      definitions(stripSqlComments(read(join(MIG_DIR, f))), create).map((def) => ({ file: f, def })),
    );
}

const migrationFiles = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

describe('the Director list stays closed in the generic policy readers', () => {
  it('20270520090000 is on disk and patches both readers with this exact guard', () => {
    const patch = read(join(MIG_DIR, DIRECTOR_LIST_FILE));
    expect(patch).toContain("'public.fn_get_policy(text, uuid)'");
    expect(patch).toContain("'public.fn_internship_evaluate_policy(text, jsonb)'");
    const split = GUARD.indexOf(' OR (SELECT');
    expect(patch).toContain(`'${GUARD.slice(0, split).replace(/'/g, "''")}'`);
    expect(patch).toContain(`'${GUARD.slice(split)}'`);
  });

  for (const reader of READERS) {
    it(`every migration after 20270520090000 that re-creates ${reader.name} carries the guard at every key filter`, () => {
      const offenders = laterCreates(reader.create, migrationFiles)
        .map(({ file, def }) => ({ file, ...guardCoverage(def) }))
        .filter((c) => c.filters === 0 || c.guarded !== c.filters);
      expect(
        offenders,
        `re-creating ${reader.name} without the Director-list guard re-opens the list to every signed-in account. ` +
          'Add the guard after every "policy_key = p_key" (copy it from 20270520090000 section 7).',
      ).toEqual([]);
    });
  }

  it('the setup mirror of fn_get_policy carries the guard at every key filter', () => {
    const setup = read(join(ROOT, 'supabase', 'setup', '02_functions.sql'));
    const defs = definitions(stripSqlComments(setup), READERS[0].create);
    expect(defs).toHaveLength(1);
    const { filters, guarded } = guardCoverage(defs[0]);
    expect(filters).toBeGreaterThan(0);
    expect(guarded).toBe(filters);
  });

  it('the checker sees an unguarded re-create (it would not pass vacuously)', () => {
    const unguarded = `CREATE OR REPLACE FUNCTION public.fn_get_policy(p_key text, p_scope_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER AS $function$
  SELECT value FROM platform_policies WHERE policy_key = p_key AND is_active = true LIMIT 1;
$function$;`;
    const half = unguarded.replace(
      'WHERE policy_key = p_key AND',
      `WHERE policy_key = p_key${GUARD} AND policy_key = p_key AND`,
    );
    const [u] = definitions(unguarded, READERS[0].create);
    const [h] = definitions(half, READERS[0].create);
    expect(guardCoverage(u)).toEqual({ filters: 1, guarded: 0 });
    expect(guardCoverage(h)).toEqual({ filters: 2, guarded: 1 });
  });
});
