#!/usr/bin/env node
/**
 * scripts/ci/check-migration-replaces-newer-definition.mjs
 *
 * CI guard: a PR may not `CREATE OR REPLACE` a function or trigger that the base
 * branch ALREADY redefines in a migration with a HIGHER version.
 *
 * WHY (this has now happened three times to one function):
 *   `CREATE OR REPLACE FUNCTION` does not merge. It replaces the whole body. So a
 *   migration written against an OLD copy of a function silently deletes every
 *   change made to that function since the copy was taken — no conflict, no error,
 *   nothing in the diff to look at, because the diff shows one added file.
 *
 *     20260914210000  added the attendance_day branch and pointed learner links
 *                     at '/cdc/drives/<id>/willingness'.
 *     20260915100000  rebuilt fn_cdc_emit_drive_notification from the MAY body.
 *                     The attendance_day branch vanished; that transition
 *                     notified nobody. Green CI, merged, live.
 *     20260919100000  restored it, and said so in its own header.
 *     PR #3892        was authored from the body 20260915100000 had left in
 *                     production and would have dropped the same three
 *                     behaviours a THIRD time. Caught by a human reading the
 *                     restore migration's header, not by any check.
 *
 *   Nothing in CI could see it. The migration-version guards compare FILENAMES,
 *   the secdef guard reads GRANTS, and the test suites test the migration FILE
 *   the PR ships — never the file main already has.
 *
 * WHAT IT FAILS, precisely:
 *   The PR adds  supabase/migrations/<Va>_x.sql  containing
 *       CREATE OR REPLACE FUNCTION public.f(...)
 *   and the base branch contains
 *       supabase/migrations/<Vb>_y.sql  with Vb > Va
 *   which also defines `public.f`.
 *
 *   Both orderings that produces are wrong, which is why this is a hard failure:
 *     · fresh apply       — files run in version order, so <Vb> runs LAST and the
 *                           PR's body is thrown away. The PR ships nothing.
 *     · incremental apply — <Vb> already ran, so the PR's file runs last and
 *                           REVERTS main's newer definition. The PR ships a
 *                           regression.
 *
 * WHAT IT DOES NOT FAIL:
 *   · A redefinition numbered ABOVE every definition on the base branch. That is
 *     the fix, not the defect — and it is what the message tells you to do.
 *   · `CREATE FUNCTION` / `CREATE TRIGGER` without OR REPLACE. Those fail loudly
 *     on apply if the object exists; the silent-overwrite class needs OR REPLACE.
 *   · A base-branch definition at the SAME version. That is a duplicate-version
 *     collision and belongs to check-migration-version-collision.mjs, which
 *     reports it with the right message. Two guards, two meanings.
 *   · Anything outside top-level supabase/migrations/*.sql — `supabase db push`
 *     never reads nested directories, so those files are not migrations.
 *
 * VERSION COMPARISON is on the filename token before the FIRST underscore,
 * compared as a STRING, which is the order `supabase db push` applies files in
 * and the key `supabase_migrations.schema_migrations.version` holds. It is
 * deliberately not a parsed timestamp and deliberately not a number: 444 live
 * migrations use the short `YYYYMMDD_` form, two carry a trailing letter, and a
 * numeric comparison puts the 8-digit `20270101` BEFORE the 14-digit
 * `20261231090000`, which is backwards. See the header of
 * check-migration-version-collision.mjs for the full census.
 *
 * ESCAPE HATCH, for a deliberate revert:
 *   Put `-- ci:allow-replace-newer <function-name> <reason>` in the migration.
 *   It is per function name, it must carry a reason, and it shows up in the diff
 *   — which is the whole point: reverting a newer definition on purpose is a
 *   decision somebody makes in writing, not a silent side effect.
 *
 * Usage:
 *   node scripts/ci/check-migration-replaces-newer-definition.mjs
 *   node scripts/ci/check-migration-replaces-newer-definition.mjs --base jicate/main
 *   node scripts/ci/check-migration-replaces-newer-definition.mjs --verbose
 *   node scripts/ci/check-migration-replaces-newer-definition.mjs --fixture f.json
 *
 * Auto-base (no --base, no BASE_REF): prefer `jicate/main` when the `jicate`
 * remote is configured locally, otherwise `origin/main` — identical to
 * check-migration-version-collision.mjs and check-table-anon-revoke.mjs, and for
 * the same reason: a stale `origin` yields 0 added migrations, i.e. a FALSE PASS.
 *
 * Sibling of .github/workflows/migration-version-collision.yml and
 * secdef-anon-revoke.yml. Its own workflow and its own status check on purpose,
 * so it cannot change the pass/fail meaning of an existing one.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m', DIM = '\x1b[2m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

const argv = process.argv.slice(2);
const VERBOSE = argv.includes('--verbose');
const baseIdx = argv.indexOf('--base');
const fixtureIdx = argv.indexOf('--fixture');

function sh(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).trim(); }
  catch { return ''; }
}

function defaultBaseRef() {
  const remotes = sh('git remote').split('\n').filter(Boolean);
  if (remotes.includes('jicate') && sh('git rev-parse --verify --quiet jicate/main')) return 'jicate/main';
  return 'origin/main';
}

const MIG_DIR = 'supabase/migrations/';

/** Top-level migrations only — nested dirs are not read by `supabase db push`. */
const isMigration = p =>
  p.startsWith(MIG_DIR) && p.endsWith('.sql') && !p.slice(MIG_DIR.length).includes('/');

const basename = p => p.slice(p.lastIndexOf('/') + 1);

/** The version token: everything before the first underscore. */
function versionOf(p) {
  const b = basename(p);
  const u = b.indexOf('_');
  return u === -1 ? b.replace(/\.sql$/, '') : b.slice(0, u);
}

/** Strip line and block comments so a commented-out CREATE is never counted. */
function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ');
}

const unqualify = n => n.replace(/^public\s*\.\s*/i, '').replace(/"/g, '').trim().toLowerCase();

const IDENT = '(?:"[^"]+"|[A-Za-z_][\\w$]*)';
const QNAME = `(?:${IDENT}\\s*\\.\\s*)?${IDENT}`;

/**
 * Names this SQL `CREATE OR REPLACE`s, as `function:<name>` / `trigger:<name>`.
 * Only OR REPLACE — a plain CREATE cannot silently overwrite anything.
 */
function replacedDefinitions(sqlRaw) {
  const sql = stripComments(sqlRaw);
  const out = new Set();
  for (const m of sql.matchAll(new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+(${QNAME})\\s*\\(`, 'gi'))) {
    out.add(`function:${unqualify(m[1])}`);
  }
  for (const m of sql.matchAll(new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+TRIGGER\\s+(${IDENT})\\b`, 'gi'))) {
    out.add(`trigger:${unqualify(m[1])}`);
  }
  return out;
}

/**
 * Names this SQL DEFINES, with or without OR REPLACE — what a base-branch file
 * has to contain to be the newer definition that would be clobbered.
 */
function definedDefinitions(sqlRaw) {
  const sql = stripComments(sqlRaw);
  const out = new Set();
  for (const m of sql.matchAll(new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(${QNAME})\\s*\\(`, 'gi'))) {
    out.add(`function:${unqualify(m[1])}`);
  }
  for (const m of sql.matchAll(new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?TRIGGER\\s+(${IDENT})\\b`, 'gi'))) {
    out.add(`trigger:${unqualify(m[1])}`);
  }
  return out;
}

/**
 * `-- ci:allow-replace-newer <name> <reason>` — per name, reason mandatory.
 *
 * The separators are [ \t], never \s: `\s` matches a newline, so a bare
 * `-- ci:allow-replace-newer <name>` with nothing after it would swallow the
 * NEXT LINE as its reason and hand out a free pass. The reason has to be on the
 * same line as the name.
 */
function allowances(sqlRaw) {
  const out = new Set();
  for (const m of sqlRaw.matchAll(/--[ \t]*ci:allow-replace-newer[ \t]+(\S+)[ \t]+(\S[^\n]*)/gi)) {
    out.add(unqualify(m[1]));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Input: either a fixture (the guard's own tests) or the real git history.
// ---------------------------------------------------------------------------
let added = [];     // { path, sql }
let baseFiles = []; // { path, sql }  — lazily loaded in git mode
let baseLabel = '';

if (fixtureIdx !== -1) {
  const fx = JSON.parse(readFileSync(argv[fixtureIdx + 1], 'utf8'));
  added = (fx.added || []).filter(f => isMigration(f.path));
  baseFiles = (fx.base || []).filter(f => isMigration(f.path));
  baseLabel = fx.baseLabel || 'fixture';
} else {
  let base = baseIdx !== -1 ? argv[baseIdx + 1] : (process.env.BASE_REF || defaultBaseRef());
  for (const cand of [base, 'jicate/main', 'origin/main', 'main']) {
    if (sh(`git rev-parse --verify --quiet ${cand}`)) { base = cand; break; }
  }
  baseLabel = base;

  const mergeBase = sh(`git merge-base ${base} HEAD`) || base;
  const addedPaths = sh(`git diff --name-only --diff-filter=AM ${mergeBase}...HEAD -- ${MIG_DIR}`)
    .split('\n').filter(isMigration);
  added = addedPaths.map(p => ({ path: p, sql: sh(`git show HEAD:${p}`) }));

  // Candidate base files are found by a cheap fixed-string grep for each name,
  // then read individually. Scanning all ~2,800 migrations would cost minutes.
  const wanted = new Set();
  for (const f of added) for (const d of replacedDefinitions(f.sql)) wanted.add(d.split(':')[1]);
  const seen = new Set();
  for (const name of wanted) {
    const hits = sh(`git grep -l -i -F -- ${JSON.stringify(name)} ${base} -- ${MIG_DIR}`)
      .split('\n').filter(Boolean)
      .map(line => line.slice(line.indexOf(':') + 1))
      .filter(isMigration);
    for (const p of hits) {
      if (seen.has(p)) continue;
      seen.add(p);
      baseFiles.push({ path: p, sql: sh(`git show ${base}:${p}`) });
    }
  }
}

// ---------------------------------------------------------------------------
// The check.
// ---------------------------------------------------------------------------
const findings = []; // { name, culprit, culpritVersion, newer, newerVersion }
let replacedCount = 0;

for (const file of added) {
  const culpritVersion = versionOf(file.path);
  const allowed = allowances(file.sql);
  for (const def of replacedDefinitions(file.sql)) {
    replacedCount++;
    const [, name] = [def.slice(0, def.indexOf(':')), def.slice(def.indexOf(':') + 1)];
    if (allowed.has(name)) {
      if (VERBOSE) console.log(`  ${DIM}allowed by ci:allow-replace-newer — ${name}${RESET}`);
      continue;
    }
    for (const other of baseFiles) {
      // Strictly HIGHER. An equal version is a duplicate-version collision and
      // belongs to the sibling guard, which reports it with the right message.
      if (versionOf(other.path) <= culpritVersion) continue;
      if (added.some(a => a.path === other.path)) continue; // the PR's own file
      if (!definedDefinitions(other.sql).has(def)) continue;
      findings.push({
        name,
        kind: def.slice(0, def.indexOf(':')),
        culprit: file.path,
        culpritVersion,
        newer: other.path,
        newerVersion: versionOf(other.path),
      });
    }
  }
}

console.log(`\n${BOLD}Migration replaces-a-newer-definition guard${RESET} — base ${DIM}${baseLabel}${RESET}, ${added.length} migration file(s) added by this PR, ${replacedCount} CREATE OR REPLACE target(s) checked.`);

if (VERBOSE) {
  for (const f of added) console.log(`  ${DIM}+ ${basename(f.path)}${RESET}`);
}

if (findings.length > 0) {
  console.error(`\n${RED}${BOLD}✗ ${findings.length} definition(s) would overwrite a NEWER definition on ${baseLabel}:${RESET}`);
  for (const f of findings) {
    console.error(`  ${RED}•${RESET} ${BOLD}${f.kind} ${f.name}${RESET}`);
    console.error(`      ${DIM}this PR:${RESET}  ${basename(f.culprit)}  ${DIM}(version ${f.culpritVersion})${RESET}`);
    console.error(`      ${DIM}${baseLabel}:${RESET} ${basename(f.newer)}  ${DIM}(version ${f.newerVersion} — HIGHER)${RESET}`);
  }
  const first = findings[0];
  console.error(`
${YELLOW}Fix:${RESET} rebuild from main's current body, then renumber past it.

  1. Read ${DIM}${first.newer}${RESET} — it holds the
     definition of ${BOLD}${first.name}${RESET} that ${baseLabel} carries today, and its header
     usually says which behaviours it added or restored.
  2. Re-apply your change ON TOP of that body. Do not start from an older copy,
     a production dump taken before it, or the migration you were reading.
  3. Rename your migration to a version HIGHER than ${first.newerVersion} and higher
     than every version on ${baseLabel} and on every open pull request
     ${DIM}(scripts/ci/check-migration-version-cross-pr.sh --as-pr <n> lists what others claim)${RESET},
     then update ${DIM}supabase/SQL_FILE_INDEX.md${RESET} and any comment naming the old path.
  4. Say in the PR body which behaviours you carried over and where each came from.

${YELLOW}Why this is a hard failure and not a warning:${RESET} ${DIM}CREATE OR REPLACE${RESET} does not merge —
it replaces the entire body. On a fresh apply the higher version runs last and
throws your change away; on an incremental apply yours runs last and reverts
${baseLabel}. Either way nothing errors, nothing appears in the diff, and the loss
surfaces weeks later as "that branch of the function is just gone".

${DIM}Deliberately reverting a newer definition? Put a line
  -- ci:allow-replace-newer ${first.name} <why>
in the migration. Per name, reason required, visible in the diff.${RESET}`);
  process.exit(1);
}

console.log(`${GREEN}✓ No migration in this PR overwrites a newer definition on ${baseLabel}.${RESET}`);
process.exit(0);
