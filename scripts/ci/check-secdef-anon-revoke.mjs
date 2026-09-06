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
 *       (intentional-public RPC — e.g. admission-landing community/caste reads),
 *       OR
 *
 *       NOT an example of this: fn_get_policy*. It was listed here until
 *       2026-07-31, and that listing is how a real leak got re-approved. Those
 *       overloads can return ANY platform_policies value, including the Meta
 *       webhook verify tokens, and they leaked those tokens to anonymous
 *       callers twice. The two unauthenticated routes that read policy values
 *       use service-role clients and never needed anon. Treat a config lookup
 *       as intentional-public only if you can name the unauthenticated caller
 *       AND confirm it is not using a service-role client. OR
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
 * ---------------------------------------------------------------------------
 * ASSERTION 2 (added 2026-08-19) — a guard-less function must not be callable
 * by EVERY signed-in user.
 *
 * WHY (receipt, not hypothesis): PR #3130 shipped three SECURITY DEFINER
 * functions — fn_calendar_lock_set_enabled, fn_calendar_lock_sweep,
 * fn_calendar_lock_record_failure — each correctly REVOKEd from anon, PUBLIC
 * (so assertion 1 above passed them), each GRANTed to `authenticated`, and each
 * with NO authorization check in its body. Any of 7,317 signed-in users could
 * arm or disarm a platform-wide meeting lockout, or permanently exempt any
 * host. All 28 CI checks were green; a human caught it afterwards and it was
 * fixed in 20260901140000 (PR #3132). This gate had no opinion on the grant it
 * was steering authors toward — `authenticated` appeared in this file only in
 * comments and help text, never in an assertion. Now it does.
 *
 * A function is IN SCOPE for assertion 2 when a signed-in caller can reach it:
 *   - an explicit GRANT ... TO authenticated that is not later revoked, OR
 *   - an explicit GRANT ... TO PUBLIC that is not later revoked, OR
 *   - the built-in PUBLIC EXECUTE default was never revoked in this file
 *     (Postgres grants EXECUTE to PUBLIC on every new function; `authenticated`
 *     is a member of PUBLIC, exactly as anon is — see assertion 1's root cause).
 * The two grantee slots are tracked INDEPENDENTLY, in file order: REVOKE
 * removes only the grantee it names, so revoking `authenticated` does not undo
 * a grant to PUBLIC and revoking PUBLIC does not undo a direct grant to
 * `authenticated`.
 *
 * PASS criteria for an in-scope function:
 *   (a) its body shows an authorization CHECK — a canonical predicate
 *       (is_super_admin / is_admin / user_has_permission /
 *       role_has_institution_access / a per-domain fn_<x>_can_<verb>() helper /
 *       auth.role() / auth.jwt() / current_setting('request.jwt…')) used in a
 *       decision position (an IF/WHEN/WHERE/CASE/NOT condition, or feeding a
 *       THEN/RAISE, or as the expression of a LANGUAGE sql body), OR
 *   (b) the migration carries the line-comment marker
 *           -- ci:allow-secdef-authenticated <reason>
 *       naming why every authenticated user may legitimately call it. This is a
 *       SEPARATE hatch from ci:allow-secdef-anon: one waives "who unauthenticated
 *       can call this", the other waives "who signed-in can call this", and a
 *       file that waives one still answers the other.
 *
 * DELIBERATELY NOT a guard — `auth.uid()`. It is dual-use: the #3130 functions
 * called it to RECORD who acted (`updated_by = auth.uid()`), and an earlier
 * attempt at this detector matched exactly that and reported has_guard:true on
 * a function with no guard. `auth.uid() IS NOT NULL` is likewise not an
 * authorization check for a function granted to `authenticated` — every
 * authenticated caller passes it. Same reasoning excludes the institution
 * helpers (auth_institution_id / get_current_user_institution_id: they scope,
 * but they are just as happily used to populate a column) and the policy
 * readers (fn_get_policy_bool: a feature flag is not an authorization check).
 * The detector is deliberately NARROW: a missed guard costs the author one
 * comment line, a missed leak costs another #3130.
 *
 * KNOWN, ACCEPTED FALSE POSITIVE — a guard expressed as a profile COLUMN rather
 * than a predicate function. fn_cluster_rank_private (20260419000008) authorizes
 * correctly via `SELECT ... is_super_admin INTO v_caller_is_super_admin` and then
 * `IF NOT v_caller_is_super_admin AND ... THEN RETURN`, and this gate still flags
 * it. Admitting a bare `is_super_admin` identifier would also admit a function
 * that merely SELECTs the column and returns it — a false NEGATIVE, the one
 * direction this gate must not have. Such a function takes the hatch with a
 * reason. Audit mode counted 1,050 such flags across the historical corpus (693
 * via an explicit authenticated grant, 483 via a residual PUBLIC default, some
 * overlapping); the gate is PR-scoped, so none of that backlog fails a PR.
 *
 * TEXT BASE: assertion 2 works on COMMENT-STRIPPED SQL, because a commented-out
 * GRANT must not raise a flag and a commented-out guard must not clear one —
 * 20260901140000's own header prose contains the words "GRANTed to
 * `authenticated`". Assertion 1 is left reading the raw text so its behaviour is
 * byte-identical to before this change; tightening it is a separate change with
 * its own blast radius.
 *
 * Usage:
 *   node scripts/ci/check-secdef-anon-revoke.mjs                 # PR-scoped (auto-base, see below)
 *   node scripts/ci/check-secdef-anon-revoke.mjs --base jicate/main
 *   node scripts/ci/check-secdef-anon-revoke.mjs --all          # scan every migration (audit mode)
 *   node scripts/ci/check-secdef-anon-revoke.mjs --files a.sql b.sql   # explicit files (fixtures)
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
const filesIdx = argv.indexOf('--files');

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

/**
 * Extract SECURITY DEFINER, non-trigger functions defined in the SQL text.
 * Returns [{ name, body }] — `name` is the bare function name (no schema / args),
 * `body` is the dollar-quoted body only, so a CREATE POLICY or a GRANT sitting
 * between two definitions cannot be mistaken for the function's own code.
 * Deduped by name, keeping the LAST definition: a file may CREATE OR REPLACE the
 * same function twice and the final body is the one that ships.
 */
function functionBody(segment) {
  const m = /\bas\s+(\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$)/i.exec(segment);
  if (m) {
    const tag = m[1];
    const start = m.index + m[0].length;
    const end = segment.indexOf(tag, start);
    return end === -1 ? segment.slice(start) : segment.slice(start, end);
  }
  // `AS 'literal'` or PG14 `RETURN expr` — fall back to the CREATE statement text.
  const semi = segment.indexOf(';');
  return semi === -1 ? segment : segment.slice(0, semi);
}

function secdefFunctions(sql) {
  const defs = [];
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
    // The declared LANGUAGE decides whether branch (c) below may apply: only a
    // one-expression `LANGUAGE sql` body makes `SELECT <pred>` a genuine gate.
    const lang = (/\blanguage\s+([a-z_]+)/i.exec(body)?.[1] || '').toLowerCase();
    if (isSecDef && !isTrigger) defs.push({ name, body: functionBody(body), lang });
  }
  const byName = new Map();
  for (const d of defs) byName.set(d.name, d);
  return [...byName.values()];
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

// ─────────────────────────────────────────────────────────────────────────────
// Assertion 2 — "granted to every signed-in user, and nothing in the body says no"
// ─────────────────────────────────────────────────────────────────────────────

const DOLLAR_TAG = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/;

/**
 * Remove SQL comments while preserving string literals, quoted identifiers and
 * dollar-quoted bodies (comments inside a dollar body are stripped recursively).
 * Same routine as check-table-anon-revoke.mjs; kept local so widening this gate
 * does not touch a working one. Block comments nest in PostgreSQL, hence depth.
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

/** Split comment-stripped SQL into statements on top-level `;`. */
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

/**
 * Canonical authorization predicates, grounded in a census of supabase/migrations
 * (is_super_admin 4,642 call sites; user_has_permission 4,185; is_admin 3,762;
 * role_has_institution_access 2,501) plus the per-domain `fn_<domain>_can_<verb>()`
 * helper family (fn_live_poll_can_manage, fn_induction_can_manage_training,
 * fn_college_leadership_can_manage, fn_settle_can_manage, …).
 *
 * `auth.uid()` is absent ON PURPOSE — see the header. So are the institution
 * helpers and the policy/feature-flag readers.
 */
const AUTHZ_PREDICATE = [
  String.raw`(?:public\s*\.\s*)?is_super_admin\s*\(`,
  String.raw`(?:public\s*\.\s*)?is_admin\s*\(`,
  String.raw`(?:public\s*\.\s*)?user_has_permission\s*\(`,
  String.raw`(?:public\s*\.\s*)?role_has_institution_access\s*\(`,
  String.raw`(?:public\s*\.\s*)?is_service_role\s*\(`,
  String.raw`(?:public\s*\.\s*)?(?:user_)?has_role\s*\(`,
  String.raw`(?:public\s*\.\s*)?get_current_user_role\s*\(`,
  String.raw`(?:public\s*\.\s*)?get_my_role\s*\(`,
  String.raw`auth\s*\.\s*role\s*\(`,
  String.raw`auth\s*\.\s*jwt\s*\(`,
  // PostgREST claim reads only — current_setting('my.var') is not authorization.
  String.raw`current_setting\s*\(\s*'request\.`,
  String.raw`(?:public\s*\.\s*)?_?fn_[a-z0-9_]*_can_[a-z0-9_]+\s*\(`,
  String.raw`(?:public\s*\.\s*)?can_[a-z0-9_]+\s*\(`,
].join('|');

/** Keywords that put whatever follows them in a decision position. */
const DECISION_KEYWORD = String.raw`\b(?:if|elsif|elseif|when|while|and|or|not|where|case|assert|having|check|using|exists|coalesce)\b`;

/**
 * Does this body actually CHECK the caller's authority? Narrow on purpose:
 * a canonical predicate must also sit in a decision position, so a predicate
 * merely assigned or logged does not clear the gate.
 */
function hasAuthorizationGuard(body, lang = '') {
  const pred = `(?:${AUTHZ_PREDICATE})`;
  // (a) reached from a decision keyword, without crossing a statement boundary
  if (new RegExp(`${DECISION_KEYWORD}[^;]{0,200}?${pred}`, 'i').test(body)) return true;
  // (b) feeding a THEN / RAISE in the same statement
  if (new RegExp(`${pred}[^;]{0,200}?\\b(?:then|raise)\\b`, 'i').test(body)) return true;
  // (c) LANGUAGE sql one-expression body: RETURN / SELECT <expr with predicate>.
  //
  // ONLY for `LANGUAGE sql`. This branch used to run for every language, which
  // made the gate fail OPEN on the one shape it exists to catch: plpgsql's
  //     SELECT is_super_admin() INTO v_flag;   -- records
  //     UPDATE ...;                            -- unguarded
  // reads as a guard to a bare `select … <pred>` regex while gating nothing. A
  // predicate that is ASSIGNED is not a predicate that is CHECKED — the same
  // trap as `COALESCE(granted_by, auth.uid())`, which records the actor and
  // authorises no one. In a true one-expression sql body the predicate IS the
  // returned value, so there it genuinely decides.
  //
  // `SELECT … INTO` is refused outright as well: it is plpgsql-only syntax, so
  // its presence means this is not a one-expression body whatever the header says.
  if (lang === 'sql'
      && !/\bselect\b[\s\S]{0,300}?\binto\b/i.test(body)
      && new RegExp(`\\b(?:return|select)\\b[^;]{0,300}?${pred}`, 'i').test(body)) return true;
  return false;
}

/** The grantee clause of a GRANT/REVOKE — the tail after the last TO / FROM. */
function granteeSlots(stmt) {
  const kw = /^\s*revoke\b/i.test(stmt) ? 'from' : 'to';
  const re = new RegExp(`\\b${kw}\\b`, 'gi');
  let m, last = -1;
  while ((m = re.exec(stmt)) !== null) last = m.index + m[0].length;
  if (last === -1) return { authenticated: false, public: false };
  const tail = stmt.slice(last);            // never includes the `ON FUNCTION public.x` schema
  return {
    authenticated: /\bauthenticated\b/i.test(tail),
    public: /\bpublic\b/i.test(tail),
  };
}

const IS_ACL_STMT = /^\s*(grant|revoke)\b/i;
const MENTIONS_EXECUTE = /\bexecute\b|\ball\s+privileges\b|\ball\b/i;
const ALL_FUNCTIONS_IN_SCHEMA = /\bon\s+all\s+functions\s+in\s+schema\b/i;

/**
 * Which broad grantees can reach `fn` after this file runs, evaluated in FILE
 * ORDER. PUBLIC starts GRANTED because Postgres grants EXECUTE to PUBLIC on every
 * new function — a file that never revokes PUBLIC leaves the function callable by
 * every role, `authenticated` included, whoever else it was granted to. That is
 * the same asymmetry assertion 1 exists for, applied one role up.
 */
function broadExecuteGrantees(stmts, fn) {
  const namesFn = new RegExp(`\\bon\\s+function\\b[\\s\\S]{0,300}?\\b${fn}\\b`, 'i');
  let authenticated = false;
  let publicRole = true;                    // Postgres default
  for (const stmt of stmts) {
    const head = IS_ACL_STMT.exec(stmt);
    if (!head) continue;
    if (!MENTIONS_EXECUTE.test(stmt)) continue;
    if (!namesFn.test(stmt) && !ALL_FUNCTIONS_IN_SCHEMA.test(stmt)) continue;
    const slots = granteeSlots(stmt);
    const granting = head[1].toLowerCase() === 'grant';
    if (slots.authenticated) authenticated = granting;
    if (slots.public) publicRole = granting;
  }
  const out = [];
  if (authenticated) out.push('authenticated');
  if (publicRole) out.push('PUBLIC (Postgres default, never revoked here)');
  return out;
}

const files = targetFiles().filter(Boolean);
if (files.length === 0) {
  console.log(`${GREEN}✓${RESET} No added migration files to check (base: ${BASE}).`);
  process.exit(0);
}

const violations = [];       // assertion 1 — anon not locked
const guardViolations = [];  // assertion 2 — reachable by every signed-in user, no authz check
let checked = 0, passed = 0;
let guardChecked = 0, guardPassed = 0;

for (const file of files) {
  if (!existsSync(file)) continue;
  const raw = readFileSync(file, 'utf8');

  // ── Assertion 1: anon lock. Reads the RAW text, exactly as before. ────────
  if (/--\s*ci:allow-secdef-anon\b/i.test(raw)) {
    if (VERBOSE) console.log(`${DIM}skip anon-lock (ci:allow-secdef-anon marker): ${file}${RESET}`);
  } else {
    const dyn = hasDynamicRevoke(raw);
    for (const { name: fn } of secdefFunctions(raw)) {
      checked++;
      const ok = dyn || hasAnonRevoke(raw, fn) || hasAnonGrant(raw, fn);
      if (ok) {
        passed++;
        if (VERBOSE) console.log(`${GREEN}✓${RESET} ${fn} ${DIM}(${file})${RESET}`);
      } else {
        violations.push({ file, fn });
      }
    }
  }

  // ── Assertion 2: a broadly-granted function must show an authz check. ─────
  // Comment-stripped, so neither a commented-out GRANT nor a commented-out
  // guard can move the answer.
  if (/--\s*ci:allow-secdef-authenticated\b/i.test(raw)) {
    if (VERBOSE) console.log(`${DIM}skip authz-guard (ci:allow-secdef-authenticated marker): ${file}${RESET}`);
    continue;
  }
  const stmts = splitStatements(stripSqlComments(raw));
  for (const def of secdefFunctions(stripSqlComments(raw))) {
    const grantees = broadExecuteGrantees(stmts, def.name);
    if (grantees.length === 0) continue;   // reachable only by service_role / postgres
    guardChecked++;
    if (hasAuthorizationGuard(def.body, def.lang)) {
      guardPassed++;
      if (VERBOSE) console.log(`${GREEN}✓${RESET} ${def.name} ${DIM}(authz check present — ${file})${RESET}`);
    } else {
      guardViolations.push({ file, fn: def.name, grantees });
    }
  }
}

console.log(`\n${BOLD}SECURITY DEFINER anon-lock guard${RESET} — ${checked} new secdef function(s) checked, ${passed} locked.`);
console.log(`${BOLD}SECURITY DEFINER authz-guard${RESET} — ${guardChecked} broadly-granted function(s) checked, ${guardPassed} guarded.`);

if (violations.length > 0) {
  console.error(`\n${RED}${BOLD}✗ ${violations.length} new SECURITY DEFINER function(s) missing an explicit anon lock:${RESET}`);
  for (const v of violations) {
    console.error(`  ${RED}•${RESET} ${BOLD}${v.fn}${RESET}  ${DIM}${v.file}${RESET}`);
  }
  console.error(`
${YELLOW}Fix:${RESET} in the SAME migration, add for each function:
  ${DIM}REVOKE EXECUTE ON FUNCTION public.${violations[0].fn}(...) FROM anon, PUBLIC;${RESET}
  ${DIM}GRANT  EXECUTE ON FUNCTION public.${violations[0].fn}(...) TO authenticated;${RESET}

If the function is INTENTIONALLY public (e.g. admission-landing reads) — first
confirm a real unauthenticated caller exists AND is not on a service-role client,
because "a route calls it" is not the same as "a route needs anon" (see 2026-07-31):
  ${DIM}GRANT EXECUTE ON FUNCTION public.${violations[0].fn}(...) TO anon;  -- + a comment saying why${RESET}

Whole-file escape hatch (rare, audited): add a line comment
  ${DIM}-- ci:allow-secdef-anon <reason>${RESET}

Why: Postgres grants EXECUTE to PUBLIC by default and Supabase grants anon directly;
without an explicit revoke the function is callable by any unauthenticated client.
See CLAUDE.md "Lock new RPCs from anon" + reference_myjkkn_live_anon_exposure_2026_06_07.`);
}

if (guardViolations.length > 0) {
  console.error(`\n${RED}${BOLD}✗ ${guardViolations.length} SECURITY DEFINER function(s) callable by every signed-in user with no authorization check:${RESET}`);
  for (const v of guardViolations) {
    console.error(`  ${RED}•${RESET} ${BOLD}${v.fn}${RESET} ${DIM}reachable via ${v.grantees.join(' + ')} — ${v.file}${RESET}`);
  }
  console.error(`
${YELLOW}Fix (pick one):${RESET}
  1. Check the caller's authority INSIDE the function, e.g.
     ${DIM}IF auth.uid() IS NOT NULL AND NOT is_super_admin() THEN${RESET}
     ${DIM}  RAISE EXCEPTION '${guardViolations[0].fn}: super-admin only';${RESET}
     ${DIM}END IF;${RESET}
     (auth.uid() IS NULL means postgres / service_role — the cron and operator
     paths keep working; the check bites when there IS a logged-in caller.)
  2. Narrow the grant so no signed-in user reaches it:
     ${DIM}REVOKE EXECUTE ON FUNCTION public.${guardViolations[0].fn}(...) FROM anon, authenticated, PUBLIC;${RESET}
     ${DIM}-- service_role keeps EXECUTE independently, so cron/server routes are unaffected${RESET}
  3. If every authenticated user genuinely may call it, say why:
     ${DIM}-- ci:allow-secdef-authenticated <reason naming the caller and why it is safe>${RESET}

${YELLOW}Note on PUBLIC:${RESET} Postgres grants EXECUTE to PUBLIC on every new function, and
authenticated is a member of PUBLIC — so "granted only to service_role" is not a
lock unless the file also revokes PUBLIC. Revoking authenticated alone does not
undo a PUBLIC grant, and revoking PUBLIC alone does not undo a direct
authenticated grant; name both.

Why this gate exists: PR #3130 shipped three functions in exactly this shape —
correctly revoked from anon, granted to authenticated, no check in the body — and
all 28 CI checks were green. See 20260901140000 for the fix.`);
}

if (violations.length > 0 || guardViolations.length > 0) process.exit(1);

console.log(`${GREEN}✓ All new SECURITY DEFINER functions lock anon, and none is callable by every signed-in user without an authorization check.${RESET}`);
process.exit(0);
