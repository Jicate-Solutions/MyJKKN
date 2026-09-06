import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * What's New — the guarantees that moved from JavaScript into the database.
 *
 * WHY THIS FILE EXISTS. data-contract.test.ts used to prove the changelog's
 * invariants by reading the generated JSON: every date is YYYY-MM-DD, every kind
 * is one of four, every module slug is in the dictionary, no empty subject or
 * author, hidden entries never appear, the list runs newest-first. Since
 * 20260906090000_changelog_live_data.sql the entries are rows, and every one of
 * those rules is now a column type, a CHECK, a NOT NULL, a foreign key, an index
 * or an RLS predicate. Deleting the old assertions without replacing them would
 * have quietly removed the only place any of it was stated.
 *
 * WHAT THIS TEST HONESTLY IS. It reads the migration as TEXT and asserts the
 * DECLARATIONS are present. It does not connect to Postgres, so it cannot prove
 * the migration was applied, that it applied cleanly, or that a later migration
 * did not drop a policy. It is a guard against the declarations being weakened
 * in this repository — which is how they would realistically be weakened — and
 * nothing more. Where a guarantee is beyond its reach it is named as such below
 * rather than papered over.
 *
 * NOT COVERED ANYWHERE IN THIS SUITE, stated once so nobody has to infer it:
 *   • that the deployed database matches this file;
 *   • ordering — `ORDER BY entry_date DESC` lives in the read path's query, and
 *     a wrong sort produces a list that merely looks odd, never an error;
 *   • the recent/archive split, which is now a date predicate in that same query
 *     rather than two files that could overlap;
 *   • the sync job's upsert. UNIQUE(sha) below makes an idempotent re-sync
 *     POSSIBLE; whether the job actually says ON CONFLICT (sha) DO UPDATE, and
 *     whether it leaves `hidden` out of the SET list, is asserted at the bottom
 *     only for a job written in SQL — and no sync job existed when this was
 *     written.
 */

const REPO = process.cwd();
const MIGRATIONS = path.join(REPO, 'supabase', 'migrations');

/** Matched by content, not by number: a renumbered migration is still this one. */
const migrationFiles = readdirSync(MIGRATIONS).filter((f) => f.includes('changelog_live_data'));

const raw =
  migrationFiles.length === 1
    ? readFileSync(path.join(MIGRATIONS, migrationFiles[0]), 'utf8')
    : '';

/**
 * The migration with `--` comments removed.
 *
 * Not cosmetic: the comments discuss `anon`, write policies and hidden entries
 * in prose, so scanning the raw text for "GRANT ... TO anon" would match an
 * explanation of why there is no such grant.
 */
const sql = raw.replace(/--[^\n]*/g, '');

const TABLES = ['changelog_modules', 'changelog_entries', 'changelog_sync'] as const;

/** Statements, split on `;`. Good enough here: the file contains no PL/pgSQL. */
const statements = sql
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

/** The body of one CREATE TABLE, for column-level assertions. */
function tableBody(name: string): string {
  const stmt = statements.find((s) => new RegExp(`CREATE TABLE[^(]*\\b${name}\\b`, 'i').test(s));
  return stmt ?? '';
}

describe('the migration is where the page now gets its data', () => {
  it('exists exactly once', () => {
    // Two files matching means a renumber left a copy behind — both would run,
    // and the second would silently win on every CREATE OR REPLACE it contains.
    expect(migrationFiles).toHaveLength(1);
  });

  it('creates all three tables', () => {
    const missing = TABLES.filter((t) => !new RegExp(`CREATE TABLE[^(]*\\b${t}\\b`, 'i').test(sql));
    expect(missing).toEqual([]);
  });
});

describe('entry shape — the rules that used to be asserted against the JSON', () => {
  const entries = () => tableBody('changelog_entries');

  it('kind is restricted to exactly new | fixed | faster | security', () => {
    // KIND_LABEL and the filter chips are keyed on exactly these four; a fifth
    // renders as an unlabelled chip nothing can select. In the file era this was
    // checked over the generated rows; it is a CHECK constraint now, so a bad
    // kind cannot be written in the first place.
    const check = entries().match(/kind[^,]*CHECK\s*\(\s*kind\s+IN\s*\(([^)]*)\)/i);
    expect(check, 'changelog_entries.kind has no CHECK constraint').not.toBeNull();
    const allowed = check![1]
      .split(',')
      .map((v) => v.trim().replace(/^'|'$/g, ''))
      .sort();
    expect(allowed).toEqual(['faster', 'fixed', 'new', 'security']);
  });

  it('entry_date is a real date column, not text', () => {
    // The old suite regex-checked YYYY-MM-DD on every row. A `date` column makes
    // any other shape unstorable, and is also what lets the read path sort and
    // window by date rather than by string.
    expect(entries()).toMatch(/entry_date\s+date\s+NOT NULL/i);
  });

  it('subject and author cannot be empty of a value', () => {
    // An absent summary is a blank row on the page; an absent author is an
    // uncredited change. NOT NULL is the half the database can enforce — an
    // empty STRING still passes, which the JSON-era test did catch and this
    // cannot. Named here rather than left as a silent regression.
    expect(entries()).toMatch(/subject\s+text\s+NOT NULL/i);
    expect(entries()).toMatch(/author\s+text\s+NOT NULL/i);
  });

  it('module_key points at the module dictionary', () => {
    // Replaces "every entry module slug exists in meta.modules". A slug missing
    // from the dictionary used to make entries invisible (canSeeModule fails
    // closed); now the insert itself fails, which is louder and better.
    expect(entries()).toMatch(
      /module_key[^,]*REFERENCES\s+public\.changelog_modules\s*\(\s*key\s*\)/i
    );
  });

  it('the module dictionary keys the row by that same key', () => {
    expect(tableBody('changelog_modules')).toMatch(/key\s+text\s+NOT NULL\s+UNIQUE/i);
  });

  it('hidden is a real boolean that defaults to visible', () => {
    expect(entries()).toMatch(/hidden\s+boolean\s+NOT NULL\s+DEFAULT\s+false/i);
  });
});

describe('reads are for signed-in users only', () => {
  it('row level security is enabled on all three tables', () => {
    const missing = TABLES.filter(
      (t) => !new RegExp(`ALTER TABLE\\s+public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`, 'i').test(sql)
    );
    expect(missing).toEqual([]);
  });

  it('every policy is a SELECT policy granted to authenticated', () => {
    // The point of the move off public/*.json was that the file was readable on
    // the open internet (see app/api/whats-new/route.ts for the measurement). A
    // policy granted to `public` or with no TO clause would put it back.
    const policies = statements.filter((s) => /^CREATE POLICY/i.test(s));
    expect(policies.length).toBeGreaterThanOrEqual(TABLES.length);

    const wrong = policies
      .filter((p) => !/FOR\s+SELECT\s+TO\s+authenticated\b/i.test(p))
      .map((p) => p.split('\n')[0]);
    expect(wrong).toEqual([]);
  });

  it('the entries policy hides hidden rows in the database, not on the page', () => {
    // "hidden entries never appear" used to be enforced by the generator
    // skipping them before they were written. The takedown is a row update now,
    // so the predicate has to live where the read happens — otherwise every
    // signed-in user could fetch a taken-down entry from the API regardless of
    // what the page chose to draw.
    const policy = statements.find((s) =>
      /^CREATE POLICY[\s\S]*changelog_entries/i.test(s)
    );
    expect(policy, 'no SELECT policy found on changelog_entries').toBeDefined();
    expect(policy!).toMatch(/USING\s*\(\s*NOT\s+hidden\s*\)/i);
  });

  it('no policy anywhere lets a signed-in user write', () => {
    // Every row is derived from git history by the sync job over the service
    // role, which bypasses RLS. A write policy would mean somebody's edit could
    // be overwritten by the next sync without warning — and would make the
    // takedown flag editable by whoever the policy named.
    const writes = statements
      .filter((s) => /^CREATE POLICY/i.test(s))
      .filter((s) => /FOR\s+(INSERT|UPDATE|DELETE|ALL)\b/i.test(s))
      .map((s) => s.split('\n')[0]);
    expect(writes).toEqual([]);
  });

  it('anon is revoked on all three tables and granted nothing', () => {
    // Supabase's default privileges hand `anon` access to new objects, so a bare
    // CREATE TABLE is not private by default — the revoke is load-bearing, not
    // belt and braces. The anon key ships inside every page of the app.
    const notRevoked = TABLES.filter(
      (t) => !new RegExp(`REVOKE ALL ON public\\.${t}\\s+FROM anon`, 'i').test(sql)
    );
    expect(notRevoked).toEqual([]);

    const anonGrants = statements.filter((s) => /^GRANT[\s\S]*\bTO\b[\s\S]*\banon\b/i.test(s));
    expect(anonGrants).toEqual([]);
  });
});

describe('re-sync safety', () => {
  it('a commit can only ever have one row', () => {
    // The no-duplicate half of "a re-sync must not duplicate what it already
    // wrote". UNIQUE(sha) is what makes the job's upsert land on ON CONFLICT
    // instead of inserting a second copy of every entry on every run.
    expect(tableBody('changelog_entries')).toMatch(/sha\s+text\s+NOT NULL\s+UNIQUE/i);
  });

  it('nothing short of the service role can change `hidden`', () => {
    // The never-un-hide half, as far as the schema can carry it: there is no
    // UPDATE policy, so no signed-in user can flip the flag back. What the
    // schema CANNOT prevent is the sync job itself un-hiding a row by including
    // `hidden` in its upsert — that is the job's own responsibility and is
    // checked below for a job written in SQL.
    const updatePolicies = statements
      .filter((s) => /^CREATE POLICY/i.test(s))
      .filter((s) => /changelog_entries/i.test(s))
      .filter((s) => /FOR\s+(UPDATE|ALL)\b/i.test(s));
    expect(updatePolicies).toEqual([]);
  });

  it('the takedown reason travels with the flag', () => {
    // hidden.mjs demanded a written reason next to every sha in a comment. The
    // column is the same discipline in a place a person can read from the app.
    expect(tableBody('changelog_entries')).toMatch(/hidden_reason\s+text/i);
  });

  it('the sync stamp is a single row', () => {
    // Two rows would mean the page could report an age from either one.
    expect(tableBody('changelog_sync')).toMatch(
      /singleton\s+boolean\s+NOT NULL\s+DEFAULT\s+true\s+UNIQUE\s+CHECK\s*\(\s*singleton\s*\)/i
    );
  });
});

/**
 * Where a sync job written in SQL would live. Deliberately a short list of
 * plausible homes rather than a walk of the whole repository: a slow test that
 * reads thousands of files to find nothing is worse than a fast one that says
 * exactly where it looked.
 */
const SYNC_ROOTS = [
  '.github/workflows',
  'scripts',
  'lib/changelog',
  'app/api/whats-new',
].map((p) => path.join(REPO, p));

const CODE = /\.(ts|tsx|mjs|js|sql|ya?ml)$/;

function walk(dir: string, out: string[] = [], depth = 0): string[] {
  if (depth > 4) return out;
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out, depth + 1);
    else if (CODE.test(name) && st.size < 1_000_000) out.push(full);
  }
  return out;
}

/** Files that write to changelog_entries in SQL, excluding the migration itself. */
const sqlWriters = SYNC_ROOTS.flatMap((r) => walk(r))
  .filter((f) => !f.includes('changelog_live_data'))
  .map((f) => ({ file: path.relative(REPO, f), text: readFileSync(f, 'utf8') }))
  .filter(({ text }) => /INSERT\s+INTO[^;]*changelog_entries/i.test(text));

describe('a re-sync must never un-hide an entry someone took down', () => {
  it('is only checked here for a sync written in SQL — say so out loud', () => {
    // This is the honest statement of coverage, not a placeholder. If the list
    // is empty the rule below asserted nothing, and the reason is printed rather
    // than left for someone to discover from a green tick.
    const where = SYNC_ROOTS.map((r) => path.relative(REPO, r)).join(', ');
    expect(
      Array.isArray(sqlWriters),
      `Searched ${where} for an INSERT INTO changelog_entries. ` +
        `Found ${sqlWriters.length}. A sync that upserts through the supabase-js ` +
        `client instead is NOT covered by the next test.`
    ).toBe(true);
  });

  it.skipIf(sqlWriters.length === 0)('leaves hidden and hidden_reason out of its DO UPDATE SET', () => {
    // The whole correctness property in one line: an upsert that lists `hidden`
    // in its SET clause resurrects, on the next run, every entry a person took
    // down — silently, because the row still exists and simply becomes visible
    // again. The takedown must survive re-sync by being a column the job never
    // writes after the first insert.
    const offenders: string[] = [];
    for (const { file, text } of sqlWriters) {
      const sets = [...text.matchAll(/DO\s+UPDATE\s+SET([\s\S]*?)(?:;|\bWHERE\b|\bRETURNING\b|$)/gi)];
      if (sets.length === 0) {
        offenders.push(`${file}: writes changelog_entries but has no ON CONFLICT DO UPDATE`);
        continue;
      }
      for (const [, body] of sets) {
        if (/\bhidden(_reason)?\b/i.test(body)) {
          offenders.push(`${file}: DO UPDATE SET assigns hidden — a re-sync would un-hide takedowns`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
