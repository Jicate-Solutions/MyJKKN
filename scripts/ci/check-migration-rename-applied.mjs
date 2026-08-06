#!/usr/bin/env node
/**
 * scripts/ci/check-migration-rename-applied.mjs
 *
 * CI guard: a PR may not RENAME a migration to a new version when the SOURCE
 * version has already been applied to production.
 *
 * WHY THIS EXISTS — the sibling guard checks the wrong end of the rename.
 *   scripts/ci/check-migration-version-collision.mjs answers "is the TARGET
 *   version free?". That is necessary and it is not sufficient. It says nothing
 *   about whether the file being renamed has already run. Renaming an applied
 *   migration does not move anything in the database; it only changes what the
 *   repo claims about it. `supabase db push` keys the applied ledger on the
 *   version token in the filename, so after a rename:
 *
 *       old version → recorded (or not) against a name nothing points at
 *       new version → not recorded, therefore reported as PENDING
 *
 *   The file now looks like work still to do. The next session — human or agent —
 *   applies it. Whatever the file DROPs and re-CREATEs is silently rolled back to
 *   whatever it said on the day it was written.
 *
 * THE INCIDENT THIS WAS WRITTEN FOR (verified live 2026-08-04).
 *   PR #2782 renames 32 migrations to break August version collisions. 17 of them
 *   are already applied to production. One is
 *   20260801002300_ims_transfer_stock_engine.sql, which contains:
 *
 *       DROP POLICY IF EXISTS ims_stock_movements_insert ON public.ims_stock_movements;
 *       CREATE POLICY ims_stock_movements_insert ON public.ims_stock_movements
 *         FOR INSERT TO authenticated WITH CHECK (true);
 *
 *   Production enforces `super_admin OR institution_id = the caller's own
 *   institution` on that policy — installed later, by
 *   20260801002800_ims_transfer_engine_auth_hardening.sql. Applying the renamed
 *   file on its own replaces a tenant boundary with `WITH CHECK (true)`. The same
 *   file also re-added a FOR ALL USING(true) policy on
 *   ims_supply_shipment_item_batches, which `authenticated` holds SELECT on.
 *
 * WHY THE LEDGER ALONE CANNOT ANSWER THIS.
 *   supabase_migrations.schema_migrations is NOT an index of this repo. On
 *   2026-08-04 it held no row for 20260801002300 and none for the proposed
 *   20260801002301 — yet pg_class, pg_proc and pg_policies all carry that
 *   migration's objects. Much of this repo's SQL reached production by hand
 *   through the Management API, which records nothing. So:
 *
 *       ledger HIT  → applied. Definitive, trust it.
 *       ledger MISS → says NOTHING. Roughly 96% of this repo's migrations miss.
 *
 *   The load-bearing signal is therefore OBJECT EXISTENCE: does production
 *   already carry the tables, policies, functions, indexes, triggers, types and
 *   columns this file creates? That is what catches "applied under a different
 *   version number", which is exactly the shape of the 17.
 *
 * WHAT IT CHECKS, per version-changing rename in the PR diff:
 *   1. Ledger row for the SOURCE version           → APPLIED, hard fail.
 *   2. Ledger row for the TARGET version           → APPLIED, hard fail
 *                                                    (renaming ONTO a version
 *                                                    that already ran is the
 *                                                    same trap facing the other
 *                                                    way).
 *   3. Objects the file declares already exist     → APPLIED-BY-OBJECT, fail.
 *      Some but not all exist                      → PARTIAL, fail — a half-
 *                                                    applied migration is worse
 *                                                    than either end state and
 *                                                    must be looked at by a human.
 *      None exist                                  → the rename is safe.
 *
 * WHAT IT DELIBERATELY DOES NOT DO:
 *   · It does not look at migrations the PR merely ADDS or EDITS. Renames only.
 *   · It does not police the historical backlog. Like the collision guard, it is
 *     scoped to what this PR does, so the 192 pre-existing duplicate versions on
 *     main stay silent and no unrelated PR is reddened.
 *   · It does not read SQL semantics. "The objects exist" is not "the file is
 *     equivalent to production" — it is only "re-running this is not free".
 *   · It never writes. Catalog SELECTs only.
 *
 * COST TO AN ORDINARY PR: zero database round-trips. Rename detection is pure git;
 * the database is contacted only when a version-changing rename is actually found,
 * which on this repo is a handful of PRs a year.
 *
 * FAIL-CLOSED ON MISSING CREDENTIALS, with one narrow escape.
 *   If a rename is found and there is no way to reach production, the guard FAILS.
 *   A gate that cannot see and reports success is the failure mode the whole file
 *   exists to prevent. The single escape is an attestation line in the renamed
 *   file's own header:
 *
 *       -- RENAME-SAFE: 20260801002300 -> 20260801002301 — <evidence>
 *
 *   It suppresses ONLY the "no credentials" failure. It can never suppress a
 *   positive finding: if production says the source is applied, the guard fails
 *   with or without the marker. The marker's real job is to leave the claim, and
 *   its author, in the diff where a reviewer can argue with it.
 *
 * Usage:
 *   node scripts/ci/check-migration-rename-applied.mjs                    # PR-scoped (auto-base)
 *   node scripts/ci/check-migration-rename-applied.mjs --base jicate/main
 *   node scripts/ci/check-migration-rename-applied.mjs --fixture f.json   # no DB, for tests
 *   node scripts/ci/check-migration-rename-applied.mjs --print-sql        # emit the probe SQL
 *   node scripts/ci/check-migration-rename-applied.mjs --verbose
 *
 * Credentials (either transport, DB_URL wins):
 *   SUPABASE_DB_URL                                (direct Postgres — CI)
 *   SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF   (Management API — this Mac)
 *
 * Sibling of check-migration-version-collision.mjs and check-anon-exposure-live.mjs.
 * Kept as its own workflow and its own status check so it cannot change the
 * pass/fail meaning of an existing one.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m',
      DIM = '\x1b[2m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

const argv = process.argv.slice(2);
const VERBOSE = argv.includes('--verbose');
const PRINT_SQL = argv.includes('--print-sql');
const baseIdx = argv.indexOf('--base');
const fixtureIdx = argv.indexOf('--fixture');
/**
 * --fixture <file>: run the decision logic against a JSON description of the
 * world instead of git + production, so every verdict is testable without
 * credentials. A gate that cannot be tested is a gate that quietly stops gating.
 *
 *   { "renames": [ { "from": "supabase/migrations/A.sql",
 *                    "to":   "supabase/migrations/B.sql",
 *                    "sql":  "CREATE TABLE public.t (...);",   // file body
 *                    "header": "-- RENAME-SAFE: ..." } ],      // optional
 *     "ledger":  ["20260801002300"],                            // applied versions
 *     "existing": ["table:public.t", "policy:public.t.p"],      // objects in prod
 *     "credentials": true }                                     // default true
 */
const FIXTURE = fixtureIdx !== -1 ? argv[fixtureIdx + 1] : null;

const MIG_DIR = 'supabase/migrations/';

function sh(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch { return ''; }
}

/** Top-level migrations only — `supabase db push` never reads nested dirs. */
const isMigration = p =>
  p.startsWith(MIG_DIR) && p.endsWith('.sql') && !p.slice(MIG_DIR.length).includes('/');

const basename = p => p.slice(p.lastIndexOf('/') + 1);

/**
 * The version token is everything before the FIRST underscore — what the
 * Supabase CLI keys schema_migrations.version on. Deliberately not a 14-digit
 * match: 522 live files use the short `YYYYMMDD_` form and two carry a trailing
 * letter (`...000008a`). See check-migration-version-collision.mjs for the count.
 */
function versionOf(p) {
  const b = basename(p);
  const u = b.indexOf('_');
  return u === -1 ? b.replace(/\.sql$/, '') : b.slice(0, u);
}

/** Prefer jicate/main when the remote exists — a stale origin yields a false pass. */
function defaultBaseRef() {
  const remotes = sh('git remote').split('\n').filter(Boolean);
  if (remotes.includes('jicate') && sh('git rev-parse --verify --quiet jicate/main')) return 'jicate/main';
  return 'origin/main';
}

// ---------------------------------------------------------------------------
// 1. Rename detection — pure git, no database.
// ---------------------------------------------------------------------------

/**
 * Renames introduced by this PR whose VERSION TOKEN changed.
 *
 * A rename that keeps its version (foo.sql → foo_better_name.sql) is not a
 * concern here: the ledger key is unchanged, so nothing is re-armed. Only a
 * changed version can turn an applied migration back into a pending one.
 */
export function detectRenames(base) {
  const mergeBase = sh(`git merge-base ${base} HEAD`) || base;
  // -M with an explicit similarity floor: a rename that also rewrote most of the
  // file is not reliably a rename, and treating an unrecognisable pair as one
  // would attach the wrong source version to the finding.
  const raw = sh(`git diff --find-renames=50% --diff-filter=R --name-status ${mergeBase} HEAD -- ${MIG_DIR}`);
  const out = [];
  for (const line of raw.split('\n').filter(Boolean)) {
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const [, from, to] = parts;
    if (!isMigration(from) || !isMigration(to)) continue;
    if (versionOf(from) === versionOf(to)) continue;
    out.push({ from, to, fromVersion: versionOf(from), toVersion: versionOf(to) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2. Object extraction — what does this file claim to create?
// ---------------------------------------------------------------------------

/** Strip line and block comments so a commented-out CREATE is not counted. */
function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*--.*$/gm, ' ')
    .replace(/--.*$/gm, ' ');
}

const unqualify = n => n.replace(/^public\./i, '').replace(/"/g, '').toLowerCase();

/**
 * Objects the file declares, as `kind:identifier` strings.
 *
 * Conservative on purpose. Only forms whose target is unambiguous from the text
 * are extracted; anything read out of a DO block, a string literal or a
 * dynamically-built statement is skipped rather than guessed at. Under-reading
 * costs a missed signal on one object; over-reading costs a false failure on a
 * PR that did nothing wrong, and false failures are how guards get deleted.
 */
export function extractObjects(sqlRaw) {
  const sql = stripComments(sqlRaw);
  const objs = new Set();
  const add = (kind, id) => { if (id) objs.add(`${kind}:${unqualify(id)}`); };

  const ident = '(?:"[^"]+"|[A-Za-z_][\\w$]*)';
  const qname = `(?:${ident}\\s*\\.\\s*)?${ident}`;

  for (const m of sql.matchAll(new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${qname})`, 'gi'))) add('table', m[1]);
  for (const m of sql.matchAll(new RegExp(`CREATE\\s+(?:MATERIALIZED\\s+)?VIEW\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${qname})`, 'gi'))) add('view', m[1]);
  for (const m of sql.matchAll(new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+(?:MATERIALIZED\\s+)?VIEW\\s+(${qname})`, 'gi'))) add('view', m[1]);
  for (const m of sql.matchAll(new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(${qname})\\s*\\(`, 'gi'))) add('function', m[1]);
  for (const m of sql.matchAll(new RegExp(`CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:CONCURRENTLY\\s+)?(?:IF\\s+NOT\\s+EXISTS\\s+)?(${ident})\\s+ON`, 'gi'))) add('index', m[1]);
  for (const m of sql.matchAll(new RegExp(`CREATE\\s+TYPE\\s+(${qname})`, 'gi'))) add('type', m[1]);
  // Policies and triggers are per-table, so the identifier must carry the table.
  for (const m of sql.matchAll(new RegExp(`CREATE\\s+POLICY\\s+(${ident})\\s+ON\\s+(${qname})`, 'gi'))) add('policy', `${unqualify(m[2])}.${unqualify(m[1])}`);
  for (const m of sql.matchAll(new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?TRIGGER\\s+(${ident})[\\s\\S]{0,400}?\\sON\\s+(${qname})`, 'gi'))) add('trigger', `${unqualify(m[2])}.${unqualify(m[1])}`);
  // ADD COLUMN / ADD CONSTRAINT — one ALTER TABLE can carry several, comma separated.
  for (const m of sql.matchAll(new RegExp(`ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?(${qname})([\\s\\S]*?);`, 'gi'))) {
    const table = unqualify(m[1]);
    for (const c of m[2].matchAll(new RegExp(`ADD\\s+COLUMN\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${ident})`, 'gi'))) {
      add('column', `${table}.${unqualify(c[1])}`);
    }
    for (const c of m[2].matchAll(new RegExp(`ADD\\s+CONSTRAINT\\s+(${ident})`, 'gi'))) {
      add('constraint', `${table}.${unqualify(c[1])}`);
    }
  }
  return [...objs].sort();
}

/** Body of the renamed file as it stands at HEAD. */
function fileBody(path) {
  const fromGit = sh(`git show HEAD:${path}`);
  if (fromGit) return fromGit;
  try { return readFileSync(resolve(process.cwd(), path), 'utf8'); } catch { return ''; }
}

/** The RENAME-SAFE attestation, if the file carries one. Never suppresses a positive finding. */
export function attestation(sqlRaw, fromVersion, toVersion) {
  const re = new RegExp(`^\\s*--\\s*RENAME-SAFE:\\s*${fromVersion}\\s*->\\s*${toVersion}\\b(.*)$`, 'mi');
  const m = sqlRaw.match(re);
  return m ? m[0].trim() : null;
}

// ---------------------------------------------------------------------------
// 3. Production probes — catalog SELECTs only.
// ---------------------------------------------------------------------------

/**
 * One statement, one round trip: every object the PR's renamed files declare,
 * answered as exists / does not exist.
 *
 * Written as a VALUES list joined against the catalogs rather than N queries so
 * a 400-object rename batch is still one probe, and so --print-sql can show a
 * reviewer the exact text that runs.
 */
export function buildExistenceSql(objects) {
  if (objects.length === 0) return null;
  const rows = objects
    .map(o => {
      const i = o.indexOf(':');
      return `(${lit(o.slice(0, i))}, ${lit(o.slice(i + 1))})`;
    })
    .join(',\n    ');
  return `
WITH wanted(kind, id) AS (
  VALUES
    ${rows}
)
SELECT w.kind, w.id, CASE w.kind
  WHEN 'table'    THEN EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                                WHERE n.nspname='public' AND c.relname=w.id AND c.relkind IN ('r','p'))
  WHEN 'view'     THEN EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                                WHERE n.nspname='public' AND c.relname=w.id AND c.relkind IN ('v','m'))
  WHEN 'index'    THEN EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                                WHERE n.nspname='public' AND c.relname=w.id AND c.relkind IN ('i','I'))
  WHEN 'function' THEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                                WHERE n.nspname='public' AND p.proname=w.id)
  WHEN 'type'     THEN EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
                                WHERE n.nspname='public' AND t.typname=w.id)
  WHEN 'policy'   THEN EXISTS (SELECT 1 FROM pg_policies
                                WHERE schemaname='public'
                                  AND tablename=split_part(w.id,'.',1)
                                  AND policyname=split_part(w.id,'.',2))
  WHEN 'trigger'  THEN EXISTS (SELECT 1 FROM pg_trigger tg JOIN pg_class c ON c.oid=tg.tgrelid
                                JOIN pg_namespace n ON n.oid=c.relnamespace
                                WHERE n.nspname='public' AND NOT tg.tgisinternal
                                  AND c.relname=split_part(w.id,'.',1)
                                  AND tg.tgname=split_part(w.id,'.',2))
  WHEN 'constraint' THEN EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
                                JOIN pg_namespace n ON n.oid=c.relnamespace
                                WHERE n.nspname='public'
                                  AND c.relname=split_part(w.id,'.',1)
                                  AND con.conname=split_part(w.id,'.',2))
  WHEN 'column'   THEN EXISTS (SELECT 1 FROM information_schema.columns
                                WHERE table_schema='public'
                                  AND table_name=split_part(w.id,'.',1)
                                  AND column_name=split_part(w.id,'.',2))
  ELSE false
END AS present
FROM wanted w`.trim();
}

/** Applied-ledger probe. A HIT is definitive; a MISS proves nothing (see header). */
export function buildLedgerSql(versions) {
  if (versions.length === 0) return null;
  return `SELECT version FROM supabase_migrations.schema_migrations WHERE version IN (${versions.map(lit).join(', ')})`;
}

function lit(s) { return `'${String(s).replace(/'/g, "''")}'`; }

async function queryViaMgmtApi(sql, token, ref) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      // Required — the endpoint refuses a request without a browser-ish UA.
      'User-Agent': 'Mozilla/5.0 (Macintosh)',
    },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(body)) {
    // An empty result and a failed request must never look the same to a gate.
    throw new Error(`Management API query failed (HTTP ${res.status}): ${JSON.stringify(body)?.slice(0, 300)}`);
  }
  return body;
}

async function runQuery(sql, transport, env) {
  if (transport === 'mgmt-api') return queryViaMgmtApi(sql, env.MGMT_TOKEN, env.MGMT_REF);
  const client = new pg.Client({ connectionString: env.DB_URL });
  await client.connect();
  try { return (await client.query(sql)).rows; } finally { await client.end(); }
}

// ---------------------------------------------------------------------------
// 4. Verdict — pure, so the tests can drive it directly.
// ---------------------------------------------------------------------------

/**
 * @param rename       { from, to, fromVersion, toVersion }
 * @param objects      string[] kind:id declared by the file
 * @param presentSet   Set of kind:id that production already carries
 * @param ledgerSet    Set of versions present in schema_migrations
 * @param attested     string|null RENAME-SAFE marker text
 * @param credentials  boolean — could production be reached at all
 */
export function verdictFor({ rename, objects, presentSet, ledgerSet, attested, credentials }) {
  if (ledgerSet.has(rename.fromVersion)) {
    return { level: 'fail', reason: 'ledger-source',
      detail: `schema_migrations carries version ${rename.fromVersion}. That migration has run; renaming it re-arms it as pending.` };
  }
  if (ledgerSet.has(rename.toVersion)) {
    return { level: 'fail', reason: 'ledger-target',
      detail: `schema_migrations already carries the TARGET version ${rename.toVersion}. After the rename this file is reported as applied without ever having run — the collision failure, facing the other way.` };
  }
  if (!credentials) {
    return attested
      ? { level: 'pass', reason: 'attested', detail: `Production unreachable; proceeding on the attestation in the file: ${attested}` }
      : { level: 'fail', reason: 'no-credentials',
          detail: 'Production could not be reached, so "is the source applied?" is unanswered. Refusing to pass an unchecked rename.' };
  }
  if (objects.length === 0) {
    return { level: 'fail', reason: 'nothing-parsed',
      detail: 'No CREATE/ADD COLUMN statement could be read out of this file, so object existence cannot decide the question. A human has to say whether the source version already ran.' };
  }
  const present = objects.filter(o => presentSet.has(o));
  if (present.length === objects.length) {
    return { level: 'fail', reason: 'applied-by-object',
      detail: `All ${objects.length} declared object(s) already exist in production. The source version has been applied — under some other version number, since the ledger has neither. Renaming it makes applied work look pending.`,
      present };
  }
  if (present.length > 0) {
    return { level: 'fail', reason: 'partially-applied',
      detail: `${present.length} of ${objects.length} declared object(s) already exist. A half-applied migration is worse than either end state and must not be quietly re-armed by a rename.`,
      present };
  }
  return { level: 'pass', reason: 'not-applied',
    detail: `None of the ${objects.length} declared object(s) exist in production — the source version has not run, so the rename is safe.` };
}

// ---------------------------------------------------------------------------
// 5. Drive it.
// ---------------------------------------------------------------------------

async function main() {
  const fixture = FIXTURE ? JSON.parse(readFileSync(resolve(process.cwd(), FIXTURE), 'utf8')) : null;

  if (PRINT_SQL) {
    console.log(buildLedgerSql(['20260101000000']));
    console.log('\n-- ---\n');
    console.log(buildExistenceSql(['table:public.t', 'policy:public.t.p']));
    process.exit(0);
  }

  let base = baseIdx !== -1 ? argv[baseIdx + 1] : (process.env.BASE_REF || defaultBaseRef());
  if (!fixture) {
    for (const cand of [base, 'jicate/main', 'origin/main', 'main']) {
      if (sh(`git rev-parse --verify --quiet ${cand}`)) { base = cand; break; }
    }
  }

  // Same filter both ways: a rename that KEEPS its version changes no ledger key
  // and re-arms nothing, so it is out of scope here (the collision guard owns it).
  const renames = fixture
    ? fixture.renames
        .map(r => ({ ...r, fromVersion: versionOf(r.from), toVersion: versionOf(r.to) }))
        .filter(r => r.fromVersion !== r.toVersion)
    : detectRenames(base);

  console.log(`\n${BOLD}Migration rename / applied-source guard${RESET}${fixture ? ` ${DIM}(fixture)${RESET}` : ` — base ${DIM}${base}${RESET}`}`);
  console.log(`${DIM}${renames.length} migration file(s) renamed to a different version by this PR.${RESET}`);

  if (renames.length === 0) {
    console.log(`${GREEN}✓ No migration renamed to a new version — nothing to verify, database not contacted.${RESET}`);
    process.exit(0);
  }

  const bodies = new Map();
  for (const r of renames) bodies.set(r.to, fixture ? (r.sql ?? '') : fileBody(r.to));

  const objectsFor = new Map();
  for (const r of renames) objectsFor.set(r.to, extractObjects(bodies.get(r.to) || ''));

  const DB_URL = process.env.SUPABASE_DB_URL;
  const MGMT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
  const MGMT_REF = process.env.SUPABASE_PROJECT_REF;
  const transport = DB_URL ? 'postgres' : (MGMT_TOKEN && MGMT_REF ? 'mgmt-api' : null);
  const credentials = fixture ? (fixture.credentials !== false) : Boolean(transport);

  let ledgerSet = new Set();
  let presentSet = new Set();

  if (fixture) {
    ledgerSet = new Set(fixture.ledger || []);
    presentSet = new Set((fixture.existing || []).map(o => {
      const i = o.indexOf(':');
      return `${o.slice(0, i)}:${unqualify(o.slice(i + 1))}`;
    }));
  } else if (credentials) {
    const versions = [...new Set(renames.flatMap(r => [r.fromVersion, r.toVersion]))];
    const allObjects = [...new Set([...objectsFor.values()].flat())];
    const env = { DB_URL, MGMT_TOKEN, MGMT_REF };
    // A transport error must abort, never degrade into "found nothing".
    const ledgerRows = await runQuery(buildLedgerSql(versions), transport, env);
    ledgerSet = new Set(ledgerRows.map(r => String(r.version)));
    if (allObjects.length > 0) {
      const rows = await runQuery(buildExistenceSql(allObjects), transport, env);
      for (const r of rows) if (r.present === true || r.present === 't') presentSet.add(`${r.kind}:${r.id}`);
    }
    console.log(`${DIM}Probed production: ${versions.length} version(s) against the ledger, ${allObjects.length} declared object(s) against the catalogs.${RESET}`);
  }

  const findings = [];
  for (const r of renames) {
    const objects = objectsFor.get(r.to);
    const v = verdictFor({
      rename: r,
      objects,
      presentSet,
      ledgerSet,
      attested: attestation(bodies.get(r.to) || '', r.fromVersion, r.toVersion),
      credentials,
    });
    if (VERBOSE || v.level === 'fail') {
      const tick = v.level === 'fail' ? `${RED}✗${RESET}` : `${GREEN}✓${RESET}`;
      console.log(`  ${tick} ${basename(r.from)} → ${basename(r.to)}  ${DIM}[${v.reason}]${RESET}`);
      if (VERBOSE) console.log(`      ${DIM}${objects.length} object(s): ${objects.slice(0, 8).join(', ')}${objects.length > 8 ? ', …' : ''}${RESET}`);
    }
    if (v.level === 'fail') findings.push({ rename: r, verdict: v });
  }

  if (findings.length === 0) {
    console.log(`${GREEN}✓ Every renamed migration's source version is unapplied — safe to renumber.${RESET}`);
    process.exit(0);
  }

  console.error(`\n${RED}${BOLD}✗ ${findings.length} migration rename(s) would re-arm work production has already done:${RESET}`);
  for (const { rename: r, verdict: v } of findings) {
    console.error(`\n  ${RED}•${RESET} ${BOLD}${basename(r.from)}${RESET} → ${BOLD}${basename(r.to)}${RESET}`);
    console.error(`      ${DIM}version ${r.fromVersion} → ${r.toVersion} · ${v.reason}${RESET}`);
    console.error(`      ${v.detail}`);
    if (v.present?.length) {
      console.error(`      ${DIM}already in production: ${v.present.slice(0, 10).join(', ')}${v.present.length > 10 ? ` (+${v.present.length - 10} more)` : ''}${RESET}`);
    }
  }

  console.error(`
${YELLOW}What to do instead of renaming:${RESET}

  ${BOLD}1. Leave the applied file's version alone.${RESET} Renaming it does not move
     anything in the database. It only makes finished work look pending, and the
     next session applies it — rolling every DROP + CREATE in that file back to
     whatever it said the day it was written. On 2026-08-04 that would have
     replaced a live tenant boundary with ${DIM}WITH CHECK (true)${RESET}.

  ${BOLD}2. If the collision must be broken, renumber the OTHER file${RESET} — the one
     that has not run — and record the pairing in ${DIM}supabase/SQL_FILE_INDEX.md${RESET}.

  ${BOLD}3. If you are certain the source never ran${RESET} and the database is simply
     unreachable from here, state it in the file header where a reviewer sees it:
     ${DIM}-- RENAME-SAFE: ${findings[0].rename.fromVersion} -> ${findings[0].rename.toVersion} — <how you know>${RESET}
     That marker only clears a "could not reach production" failure. It cannot and
     will not clear a positive finding like the ones above.

${DIM}Why this is a hard failure: the applied-migrations ledger is not an index of
this repo — much of this SQL reached production through the Management API, which
records nothing. So "not in the ledger" is not evidence of "not applied", and the
only honest test is whether the objects are already there. They are.${RESET}`);
  process.exit(1);
}

// Importable for tests without executing.
const invokedDirectly = process.argv[1] && process.argv[1].endsWith('check-migration-rename-applied.mjs');
if (invokedDirectly) {
  main().catch(err => {
    console.error(`${RED}✗ ${err?.message || err}${RESET}`);
    console.error(`${DIM}Aborting rather than reporting a clean run: an unanswered probe is not a pass.${RESET}`);
    process.exit(1);
  });
}
