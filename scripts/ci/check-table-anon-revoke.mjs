#!/usr/bin/env node
/**
 * scripts/ci/check-table-anon-revoke.mjs
 *
 * CI guard: every NEW table added in a migration must explicitly lock `anon` —
 * either REVOKE ... FROM anon, or an explicit GRANT ... TO anon (the documented
 * intentional-public escape hatch). The table-level sibling of
 * check-secdef-anon-revoke.mjs, enforcing the same CLAUDE.md rule one level
 * down: "Every new table needs explicit REVOKE ALL ... FROM anon, PUBLIC".
 *
 * WHY (root cause this guard replaces):
 *   Supabase ships `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON
 *   TABLES TO anon, authenticated, service_role`. So EVERY new table in schema
 *   public is created with `anon=arwdDxt` — SELECT, INSERT, UPDATE, DELETE,
 *   TRUNCATE, REFERENCES and TRIGGER — granted to the public anon key that ships
 *   inside every page of https://www.jkkn.ai. Nothing in the migration has to
 *   ask for that; it is the default.
 *
 *   RLS is NOT a substitute. Two live counter-examples from prod, both measured:
 *     - CREATE TABLE AS never enables RLS. That is how 37 `_bak_*` tables ended
 *       up publicly readable AND deletable (2,702 real learner rows) — the
 *       exposure migration 20260726180000 closes.
 *     - RLS-on is only as strong as the weakest policy. Four tables added on
 *       2026-07-26 (sustainability_meter_readings, sustainability_naac_evidence,
 *       accreditation_meeting_drafts, accreditation_meeting_proposals) have RLS
 *       on, every policy `TO PUBLIC`, and anon holds the full default grant. The
 *       only reason PostgREST answers 401 instead of 200 is that anon happens to
 *       lack EXECUTE on ONE helper — user_has_permission(text). Rewrite a policy
 *       without that helper, or grant anon EXECUTE on it, and all four open with
 *       no migration touching the tables. The table-level revoke is the defence
 *       that does not depend on that accident.
 *
 * SCOPE — PR-scoped, NOT a full-history scan (same reason as the secdef guard):
 *   jicate/main carries ~1,100 CREATE TABLE statements across ~440 migrations
 *   and only a small minority carry an explicit anon table revoke. A full scan
 *   would fail every PR forever. This guard inspects ONLY migration files
 *   added/modified relative to the base branch. `--all` exists for audit runs,
 *   not for CI.
 *
 * PASS criteria for each new table `t`:
 *   (a) the same migration contains a REVOKE statement naming `t` (or
 *       `ON ALL TABLES IN SCHEMA public`) whose FROM list includes anon, OR
 *   (b) the same migration contains a GRANT statement naming `t` whose TO list
 *       includes anon — an intentionally-public table (e.g. the community /
 *       caste lists read by the unauthenticated admission landing page). Say why
 *       in a comment; the grant is the audit-trail signal that it is deliberate.
 *   (c) the migration file carries the line-comment marker
 *           -- ci:allow-anon-table <reason>
 *       (whole-file escape hatch; the reason is the audit trail).
 *
 * HOW IT DIFFERS FROM THE SECDEF GUARD (deliberately — both are real defects there):
 *   1. It strips SQL comments before matching. The secdef guard does not, and a
 *      commented-out revoke satisfies it — verified, not inferred: a fixture
 *      whose ONLY revoke is `-- REVOKE EXECUTE ON FUNCTION ... FROM anon;` exits
 *      0 there. A dead comment must never satisfy a security gate.
 *   2. It matches per-STATEMENT, not with a character-window regex, so a
 *      `REVOKE EXECUTE ON FUNCTION ...` elsewhere in the same file can never be
 *      mistaken for a table revoke (the exact false-positive that made a
 *      first-pass audit score far more files "covered" than really were).
 *
 * LIMITATIONS (static SQL-text scan, like check-radix-select-empty-values):
 *   - Textual, not a parser. A revoke naming the table anywhere in the same file
 *     satisfies the check; it does not verify the revoke actually runs.
 *   - Only schema `public` (bare or explicitly `public.`) is gated. Supabase's
 *     default privileges are scoped to public, so other schemas are out of scope.
 *   - TEMP / TEMPORARY tables are exempt (session-local, never reachable via
 *     PostgREST).
 *   - VIEWs and MATERIALIZED VIEWs are NOT checked, though the same default
 *     privileges reach them. Deliberately out of scope for this first cut.
 *   - It does NOT check that RLS was enabled. Complementary property, separate
 *     gate; see the PR body.
 *   - CI can only see DDL that lands in supabase/migrations/. Production DDL
 *     applied out-of-band via the Management API bypasses this gate entirely
 *     (supabase_migrations.schema_migrations is stale by several versions on
 *     prod today). Pair this with a scheduled catalog assertion.
 *
 * Usage:
 *   node scripts/ci/check-table-anon-revoke.mjs                 # PR-scoped (auto-base)
 *   node scripts/ci/check-table-anon-revoke.mjs --base jicate/main
 *   node scripts/ci/check-table-anon-revoke.mjs --all           # audit mode (expect failures)
 *   node scripts/ci/check-table-anon-revoke.mjs --verbose
 *   node scripts/ci/check-table-anon-revoke.mjs --files a.sql b.sql   # explicit files (fixtures)
 *
 * Auto-base (no --base, no BASE_REF env): prefer `jicate/main` when the `jicate`
 * remote is configured locally, otherwise `origin/main` — identical to the
 * secdef guard, and for the same reason (local clones often have a stale
 * `origin`, and a stale base silently returns 0 added migrations = FALSE PASS).
 */
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m', DIM = '\x1b[2m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

const argv = process.argv.slice(2);
const VERBOSE = argv.includes('--verbose');
const ALL = argv.includes('--all');
const baseIdx = argv.indexOf('--base');
const filesIdx = argv.indexOf('--files');

function sh(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch { return ''; }
}

/**
 * Pick the canonical base ref. Prefers `jicate/main` when the `jicate` remote is
 * configured locally — otherwise falls back to `origin/main`. CI passes --base
 * explicitly, so this only fires for local invocations.
 */
function defaultBaseRef() {
  const remotes = sh('git remote').split('\n').filter(Boolean);
  if (remotes.includes('jicate') && sh('git rev-parse --verify --quiet jicate/main')) {
    return 'jicate/main';
  }
  return 'origin/main';
}

const BASE = baseIdx !== -1 ? argv[baseIdx + 1] : (process.env.BASE_REF || defaultBaseRef());
const MIG_DIR = 'supabase/migrations/';

/** Migration files to inspect: explicit list, all (audit mode), or added-vs-base (PR mode). */
function targetFiles() {
  if (filesIdx !== -1) {
    return argv.slice(filesIdx + 1).filter(a => !a.startsWith('--'));
  }
  if (ALL) {
    return sh(`git ls-files ${MIG_DIR}`).split('\n').filter(f => f.endsWith('.sql'));
  }
  // Resolve a usable base ref; fall back across common names.
  let base = BASE;
  for (const cand of [BASE, 'jicate/main', 'origin/main', 'main']) {
    if (sh(`git rev-parse --verify --quiet ${cand}`)) { base = cand; break; }
  }
  const merge = sh(`git merge-base ${base} HEAD`) || base;
  const added = sh(`git diff --name-only --diff-filter=AM ${merge}...HEAD -- ${MIG_DIR}`);
  return added.split('\n').filter(f => f.endsWith('.sql'));
}

const DOLLAR_TAG = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/;

/**
 * Remove SQL comments while preserving string literals and quoted identifiers
 * verbatim. Comments INSIDE a dollar-quoted body are stripped too (recursively) —
 * a comment is a comment wherever it lives, and the header prose of a migration
 * is exactly where a stray "CREATE TABLE" or a commented-out REVOKE hides.
 *
 * Block comments nest in PostgreSQL, so the depth counter is not decorative.
 */
function stripSqlComments(sql) {
  let out = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i], c2 = sql[i + 1];
    if (c === '-' && c2 === '-') {                 // line comment
      while (i < n && sql[i] !== '\n') i++;
      continue;                                    // the \n itself is copied next loop
    }
    if (c === '/' && c2 === '*') {                 // block comment (nestable)
      let depth = 1; i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') { depth++; i += 2; }
        else if (sql[i] === '*' && sql[i + 1] === '/') { depth--; i += 2; }
        else i++;
      }
      out += ' ';
      continue;
    }
    if (c === "'" || c === '"') {                  // string literal / quoted ident
      const q = c;
      out += q; i++;
      while (i < n) {
        if (sql[i] === q && sql[i + 1] === q) { out += q + q; i += 2; continue; }
        out += sql[i];
        if (sql[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === '$') {                               // dollar-quoted body
      const m = DOLLAR_TAG.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        const inner = end === -1 ? sql.slice(i + tag.length) : sql.slice(i + tag.length, end);
        out += tag + stripSqlComments(inner) + tag;
        i = end === -1 ? n : end + tag.length;
        continue;
      }
    }
    out += c; i++;
  }
  return out;
}

/**
 * Split comment-stripped SQL into statements on top-level `;`.
 * Strings, quoted identifiers and dollar-quoted bodies never split.
 */
function splitStatements(sql) {
  const stmts = [];
  let cur = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (c === "'" || c === '"') {
      const q = c; cur += q; i++;
      while (i < n) {
        if (sql[i] === q && sql[i + 1] === q) { cur += q + q; i += 2; continue; }
        cur += sql[i];
        if (sql[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === '$') {
      const m = DOLLAR_TAG.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? n : end + tag.length;
        cur += sql.slice(i, stop);
        i = stop;
        continue;
      }
    }
    if (c === ';') { stmts.push(cur); cur = ''; i++; continue; }
    cur += c; i++;
  }
  if (cur.trim()) stmts.push(cur);
  return stmts.map(s => s.trim()).filter(Boolean);
}

const CREATE_TABLE_RE = new RegExp(
  'create\\s+' +
  '(?:(?:global|local)\\s+)?' +
  '(temp|temporary|unlogged)?\\s*' +
  'table\\s+' +
  '(?:if\\s+not\\s+exists\\s+)?' +
  '(?:("?[A-Za-z0-9_]+"?)\\s*\\.\\s*)?' +   // optional schema
  '("?[A-Za-z0-9_]+"?)',                    // table name
  'gi'
);

/**
 * Names of tables CREATEd in schema public.
 *
 * Covers CREATE TABLE, CREATE UNLOGGED TABLE, IF NOT EXISTS, quoted names,
 * `CREATE TABLE x AS SELECT` (CTAS — the exact leak vector behind the 37 `_bak_*`
 * tables: it inherits the anon default grant AND never enables RLS) and
 * `PARTITION OF`.
 *
 * Excludes TEMP / TEMPORARY (session-local, unreachable via PostgREST) and any
 * explicitly non-public schema.
 */
function createdTables(sqlNoComments) {
  const names = [];
  CREATE_TABLE_RE.lastIndex = 0;
  let m;
  while ((m = CREATE_TABLE_RE.exec(sqlNoComments)) !== null) {
    const kind = (m[1] || '').toLowerCase();
    if (kind === 'temp' || kind === 'temporary') continue;
    const schema = (m[2] || '').replace(/"/g, '').toLowerCase();
    if (schema && schema !== 'public') continue;
    names.push(m[3].replace(/"/g, ''));
  }
  return [...new Set(names)];
}

/** Does this statement name `table` (quotes normalised away)? */
function statementNamesTable(stmt, table) {
  return new RegExp(`\\b${table}\\b`, 'i').test(stmt.replace(/"/g, ''));
}

/** REVOKE/GRANT statements targeting FUNCTIONs, schemas, sequences… are not table ACL changes. */
const NON_TABLE_OBJECT =
  /\bon\s+(?:all\s+)?(?:function|routine|procedure|sequence|schema|database|type|domain|language|tablespace|large\s+object|foreign\s+(?:data\s+wrapper|server))s?\b/i;

/** True when the role list after the LAST `from` / `to` keyword mentions anon. */
function roleListMentionsAnon(stmt, keyword) {
  const re = new RegExp(`\\b${keyword}\\b`, 'gi');
  let last = -1, m;
  while ((m = re.exec(stmt)) !== null) last = m.index + m[0].length;
  if (last === -1) return false;
  return /\banon\b/i.test(stmt.slice(last));
}

/** (a) explicit REVOKE of anon on this table, or a blanket ON ALL TABLES IN SCHEMA public. */
function hasAnonTableRevoke(stmts, table) {
  return stmts.some(s => {
    if (!/^revoke\b/i.test(s)) return false;
    if (NON_TABLE_OBJECT.test(s)) return false;
    if (!roleListMentionsAnon(s, 'from')) return false;
    if (/\bon\s+all\s+tables\s+in\s+schema\s+public\b/i.test(s)) return true;
    return statementNamesTable(s, table);
  });
}

/** (b) explicit GRANT to anon — documented-public table. */
function hasAnonTableGrant(stmts, table) {
  return stmts.some(s => {
    if (!/^grant\b/i.test(s)) return false;
    if (NON_TABLE_OBJECT.test(s)) return false;
    if (!roleListMentionsAnon(s, 'to')) return false;
    return statementNamesTable(s, table);
  });
}

// ---------------------------------------------------------------------------

const files = targetFiles().filter(Boolean);
if (files.length === 0) {
  console.log(`${GREEN}✓${RESET} No added migration files to check (base: ${BASE}).`);
  process.exit(0);
}

const violations = [];
let checked = 0, passed = 0;

for (const file of files) {
  if (!existsSync(file)) continue;
  const raw = readFileSync(file, 'utf8');
  // The escape-hatch marker IS a comment, so it must be read BEFORE stripping.
  if (/--\s*ci:allow-anon-table\b/i.test(raw)) {
    if (VERBOSE) console.log(`${DIM}skip (ci:allow-anon-table marker): ${file}${RESET}`);
    continue;
  }
  const sql = stripSqlComments(raw);
  const stmts = splitStatements(sql);
  for (const t of createdTables(sql)) {
    checked++;
    if (hasAnonTableRevoke(stmts, t) || hasAnonTableGrant(stmts, t)) {
      passed++;
      if (VERBOSE) console.log(`${GREEN}✓${RESET} ${t} ${DIM}(${file})${RESET}`);
    } else {
      violations.push({ file, table: t });
    }
  }
}

console.log(`\n${BOLD}New-table anon-lock guard${RESET} — ${checked} new table(s) checked, ${passed} locked.`);

if (violations.length > 0) {
  console.error(`\n${RED}${BOLD}✗ ${violations.length} new table(s) missing an explicit anon lock:${RESET}`);
  for (const v of violations) {
    console.error(`  ${RED}•${RESET} ${BOLD}${v.table}${RESET}  ${DIM}${v.file}${RESET}`);
  }
  console.error(`
${YELLOW}Fix:${RESET} in the SAME migration, for each table add:
  ${DIM}REVOKE ALL ON TABLE public.${violations[0].table} FROM anon, PUBLIC;${RESET}
  ${DIM}GRANT  SELECT ON TABLE public.${violations[0].table} TO authenticated;   -- or whatever it needs${RESET}
  ${DIM}ALTER TABLE public.${violations[0].table} ENABLE ROW LEVEL SECURITY;    -- strongly recommended, not checked here${RESET}

If the table is INTENTIONALLY public (e.g. the community / caste lists read by
the unauthenticated admission landing page):
  ${DIM}GRANT SELECT ON TABLE public.${violations[0].table} TO anon;  -- + a comment saying why${RESET}

Whole-file escape hatch (rare, audited): add a line comment
  ${DIM}-- ci:allow-anon-table <reason>${RESET}

Why: Supabase runs ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon, so a
new public-schema table is created with SELECT/INSERT/UPDATE/DELETE granted to the
anon key embedded in every page of https://www.jkkn.ai. RLS is not a substitute —
CREATE TABLE AS never enables it, and an RLS policy written TO PUBLIC still applies
to anon. See CLAUDE.md + supabase/migrations/20260726180000_revoke_anon_on_unprotected_backup_tables.sql.`);
  process.exit(1);
}

console.log(`${GREEN}✓ All new tables explicitly lock anon (or are documented public).${RESET}`);
process.exit(0);
