#!/usr/bin/env node
/**
 * scripts/ci/check-secdef-anon-revoke.mjs
 *
 * CI guard: every NEW SECURITY DEFINER function added in a migration must
 * explicitly lock anon access — either REVOKE EXECUTE ... FROM anon, or an
 * explicit GRANT EXECUTE ... TO anon (the documented intentional-public escape
 * hatch). Enforces the CLAUDE.md rule "Lock new RPCs from anon" deterministically.
 *
 * WHY (root cause this guard replaces):
 *   PostgreSQL grants EXECUTE to PUBLIC by default on every function, and
 *   Supabase additionally runs ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON
 *   FUNCTIONS TO anon. anon is a member of PUBLIC. So a new function is callable
 *   by any holder of the public anon key (embedded in every Next.js bundle)
 *   unless BOTH anon and PUBLIC are revoked. The standard
 *   "REVOKE FROM PUBLIC + GRANT TO authenticated" is INSUFFICIENT — the explicit
 *   anon grant survives. Attempting to fix this at the database default level
 *   (ALTER DEFAULT PRIVILEGES) does NOT work reliably on hosted Supabase: the
 *   built-in PUBLIC grant persists and the supabase_admin owner default cannot
 *   be altered ("must be member of role supabase_admin"). The reliable fix is
 *   this per-migration guard. (2026-06-16 security session.)
 *
 * SCOPE — PR-scoped, NOT a full-history scan:
 *   Hundreds of pre-existing SECURITY DEFINER functions lack revokes (the very
 *   backlog the 2026-06 sweep addressed via the Management API). A full scan
 *   would fail every PR forever. So this guard inspects ONLY migration files
 *   ADDED relative to the base branch.
 *
 * PASS criteria for each new SECURITY DEFINER function `fn`:
 *   (a) the same migration contains  REVOKE [EXECUTE] ON FUNCTION ...fn... FROM ... anon
 *       (PUBLIC alongside anon is recommended; a bare anon revoke still passes), OR
 *   (b) the same migration contains  GRANT EXECUTE ON FUNCTION ...fn... TO ... anon
 *       (intentional-public RPC — e.g. admission-landing community/caste reads,
 *       fn_get_policy* config lookups), OR
 *   (c) the migration file carries the line-comment marker
 *           -- ci:allow-secdef-anon <reason>
 *       (whole-file escape hatch for legitimate edge cases; the reason is the
 *       audit-trail signal).
 *
 * LIMITATIONS (static SQL-text scan, like check-radix-select-empty-values):
 *   - Matches function names textually; does not parse SQL. A revoke/grant that
 *     names the function anywhere in the same file satisfies the check.
 *   - Trigger functions (RETURNS trigger) are exempt: anon EXECUTE is not checked
 *     by PostgreSQL when a trigger fires, and they cannot be meaningfully called
 *     via PostgREST RPC.
 *
 * Usage:
 *   node scripts/ci/check-secdef-anon-revoke.mjs                 # PR-scoped (auto-base, see below)
 *   node scripts/ci/check-secdef-anon-revoke.mjs --base jicate/main
 *   node scripts/ci/check-secdef-anon-revoke.mjs --all          # scan every migration (audit mode)
 *   node scripts/ci/check-secdef-anon-revoke.mjs --verbose
 *
 * Auto-base (no --base, no BASE_REF env): prefer `jicate/main` when the `jicate`
 * remote is configured locally, otherwise fall back to `origin/main`. Local clones
 * often have `origin` pointing at a stale fork (e.g. JKKN-Institutions/MyJKKN.git
 * for some contributors) — defaulting to a stale base silently returns 0 added
 * migrations and the gate FALSE-PASSES. Detecting `jicate` first restores fidelity.
 * GitHub Actions sets BASE_REF explicitly, so CI behaviour is unchanged.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m', DIM = '\x1b[2m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

const argv = process.argv.slice(2);
const VERBOSE = argv.includes('--verbose');
const ALL = argv.includes('--all');
const baseIdx = argv.indexOf('--base');

function sh(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch { return ''; }
}

/**
 * Pick the canonical base ref. Prefers `jicate/main` when the `jicate` remote is
 * configured locally — otherwise falls back to `origin/main`. CI explicitly sets
 * BASE_REF, so this only fires for local invocations.
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

/** Migration files to inspect: added vs base (PR mode) or all (audit mode). */
function targetFiles() {
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

/**
 * Extract SECURITY DEFINER, non-trigger function names defined in the SQL text.
 * Returns array of bare function names (without schema / args).
 */
function secdefFunctions(sql) {
  const names = [];
  // Split on CREATE [OR REPLACE] FUNCTION to bound each definition.
  const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?("?[a-zA-Z0-9_]+"?)\s*\(/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const name = m[1].replace(/"/g, '');
    // Body = from this CREATE up to the next CREATE FUNCTION (or EOF).
    const start = m.index;
    re.lastIndex; // keep scanning
    const nextRe = /create\s+(?:or\s+replace\s+)?function\s+/gi;
    nextRe.lastIndex = m.index + m[0].length;
    const nm = nextRe.exec(sql);
    const end = nm ? nm.index : sql.length;
    const body = sql.slice(start, end);
    const isSecDef = /security\s+definer/i.test(body);
    const isTrigger = /returns\s+trigger/i.test(body);
    if (isSecDef && !isTrigger) names.push(name);
  }
  return [...new Set(names)];
}

function hasAnonRevoke(sql, fn) {
  // REVOKE ... ON FUNCTION ...<fn>... FROM ... anon   (within one statement)
  const re = new RegExp(
    `revoke\\b[\\s\\S]{0,200}?\\bon\\s+function\\b[\\s\\S]{0,300}?\\b${fn}\\b[\\s\\S]{0,300}?\\bfrom\\b[\\s\\S]{0,120}?\\banon\\b`,
    'i'
  );
  return re.test(sql);
}
function hasAnonGrant(sql, fn) {
  const re = new RegExp(
    `grant\\s+execute\\b[\\s\\S]{0,200}?\\bon\\s+function\\b[\\s\\S]{0,300}?\\b${fn}\\b[\\s\\S]{0,300}?\\bto\\b[\\s\\S]{0,120}?\\banon\\b`,
    'i'
  );
  return re.test(sql);
}
function hasDynamicRevoke(sql) {
  // DO-block / dynamic lockdown that revokes anon on a computed set (e.g. the
  // 2026-06-16 sweep migrations). If a file revokes anon from functions
  // dynamically, treat its secdef functions as covered.
  return /revoke\s+execute\s+on\s+function[\s\S]{0,400}?from[\s\S]{0,120}?anon/i.test(sql)
      && /\bexecute\s+'revoke|for\s+r\s+in|loop\b/i.test(sql);
}

const files = targetFiles().filter(Boolean);
if (files.length === 0) {
  console.log(`${GREEN}✓${RESET} No added migration files to check (base: ${BASE}).`);
  process.exit(0);
}

const violations = [];
let checked = 0, passed = 0;

for (const file of files) {
  if (!existsSync(file)) continue;
  const sql = readFileSync(file, 'utf8');
  if (/--\s*ci:allow-secdef-anon\b/i.test(sql)) {
    if (VERBOSE) console.log(`${DIM}skip (ci:allow-secdef-anon marker): ${file}${RESET}`);
    continue;
  }
  const fns = secdefFunctions(sql);
  const dyn = hasDynamicRevoke(sql);
  for (const fn of fns) {
    checked++;
    const ok = dyn || hasAnonRevoke(sql, fn) || hasAnonGrant(sql, fn);
    if (ok) {
      passed++;
      if (VERBOSE) console.log(`${GREEN}✓${RESET} ${fn} ${DIM}(${file})${RESET}`);
    } else {
      violations.push({ file, fn });
    }
  }
}

console.log(`\n${BOLD}SECURITY DEFINER anon-lock guard${RESET} — ${checked} new secdef function(s) checked, ${passed} locked.`);

if (violations.length > 0) {
  console.error(`\n${RED}${BOLD}✗ ${violations.length} new SECURITY DEFINER function(s) missing an explicit anon lock:${RESET}`);
  for (const v of violations) {
    console.error(`  ${RED}•${RESET} ${BOLD}${v.fn}${RESET}  ${DIM}${v.file}${RESET}`);
  }
  console.error(`
${YELLOW}Fix:${RESET} in the SAME migration, add for each function:
  ${DIM}REVOKE EXECUTE ON FUNCTION public.${violations[0].fn}(...) FROM anon, PUBLIC;${RESET}
  ${DIM}GRANT  EXECUTE ON FUNCTION public.${violations[0].fn}(...) TO authenticated;${RESET}

If the function is INTENTIONALLY public (e.g. admission-landing reads, fn_get_policy*):
  ${DIM}GRANT EXECUTE ON FUNCTION public.${violations[0].fn}(...) TO anon;  -- + a comment saying why${RESET}

Whole-file escape hatch (rare, audited): add a line comment
  ${DIM}-- ci:allow-secdef-anon <reason>${RESET}

Why: Postgres grants EXECUTE to PUBLIC by default and Supabase grants anon directly;
without an explicit revoke the function is callable by any unauthenticated client.
See CLAUDE.md "Lock new RPCs from anon" + reference_myjkkn_live_anon_exposure_2026_06_07.`);
  process.exit(1);
}

console.log(`${GREEN}✓ All new SECURITY DEFINER functions explicitly lock anon (or are documented public).${RESET}`);
process.exit(0);
