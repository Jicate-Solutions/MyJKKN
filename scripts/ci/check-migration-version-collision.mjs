#!/usr/bin/env node
/**
 * scripts/ci/check-migration-version-collision.mjs
 *
 * CI guard: a PR may not introduce a NEW duplicate migration version.
 *
 * WHY (the failure this replaces is silent, which is what makes it expensive):
 *   `supabase db push` — the only thing that applies migrations here, driven by
 *   .github/workflows/supabase-migration-apply.yml — records each applied file in
 *   `supabase_migrations.schema_migrations`, keyed on the version taken from the
 *   filename. That column is the PRIMARY KEY. When two files carry the same
 *   version, the second does NOT error in a way anybody sees: the CLI treats the
 *   version as already applied and SKIPS it. The job goes green, the ledger
 *   reports success, and the objects in the skipped file are never created. The
 *   defect surfaces later as "that function does not exist" against a migration
 *   everyone can see merged on main.
 *
 *   Measured on jicate/main 2026-08-01: FOUR files shared `20260808110000`
 *   (learner_360_verdict, learner_risk_staff_notifications,
 *   rcltp_gamification_lock_service_role_only, scf_prepared_pulse_close_window).
 *   Eight independently-authored PRs had each computed "one tick after the newest
 *   version on main" and all landed on the same number. Nothing warned them.
 *
 * WHAT COUNTS AS A "VERSION" — deliberately NOT "the leading 14 digits":
 *   The version is the filename token before the FIRST underscore, which is what
 *   the Supabase CLI keys on. Reading it as a fixed 14-digit timestamp looks
 *   right and is wrong here, in both directions, and both are live on main:
 *
 *     · SHORT FORM. 444 of the 2,767 migrations use `YYYYMMDD_name.sql` with no
 *       time component, and the convention is still in use. Sixteen files share
 *       the bare version `20260725` — the single largest collision in the repo,
 *       and a 14-digit rule cannot see it at all. Fifteen of those sixteen are
 *       skipped on apply.
 *     · LETTERED FORM. `20260419000008a_fix_ohs_acl_leak.sql` and
 *       `20260512100007a_f2_fix_get_campaign_time_series_range_semantics.sql`
 *       carry a trailing letter. Their versions are the full `...008a` /
 *       `...007a` tokens and are genuinely DISTINCT from the plain
 *       `...000008` / `...100007` files. Truncating to 14 digits invents a
 *       collision that does not exist — that mistake is what produced the "194
 *       duplicate groups" figure this guard was first specified against.
 *
 *       CAREFUL WITH THE HEADLINE NUMBER — AND WITH THE OLD CORRECTION TO IT.
 *       This block previously said `--all`'s total was inflated because "8-digit
 *       date prefixes like `20260725_*`" were "not collisions". That was wrong,
 *       and it contradicted the SHORT FORM bullet three lines above, which
 *       correctly calls the sixteen-file `20260725` group the largest collision
 *       in the repo. Both guards key on the token before the FIRST underscore
 *       because that is what the Supabase CLI keys `schema_migrations.version`
 *       on — so `20260725` is a version, and two files carrying it collide
 *       exactly as two files carrying a 14-digit token do. Only tokens that are
 *       not dates at all (`fix_*`, `rls_*`, `scf_*`, `induction_*`, `optimize_*`,
 *       `pde_*`) are a grouping artefact.
 *
 *       Recounted on jicate/main at commit 1dacf18d (2026-09-03), top-level
 *       supabase/migrations/*.sql — `--all` computes these live, so re-run it
 *       rather than trusting this comment:
 *
 *           2,767 migration files
 *             355 duplicate groups reported by `--all`, holding 995 files
 *             349 of those are REAL duplicate versions (261 fourteen-digit +
 *                 88 eight-digit), holding 981 files
 *             632 of those 981 can never own a ledger row and are skipped on
 *                 apply — one file per group wins, every other file loses
 *               6 groups (14 files) are the non-date grouping artefact above
 *
 *       The full per-version census, and what a cleanup would cost, is in
 *       docs/architecture/2026-09-03-MIGRATION-duplicate-version-backlog.md.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ 🛑 THE BASELINE — READ THIS BEFORE "FIXING" THIS GUARD INTO A FULL SCAN. │
 * └──────────────────────────────────────────────────────────────────────────┘
 *   Duplicate versions here are ENDEMIC, not a one-off, and the backlog is
 *   GROWING. Counted on jicate/main at commit 134d1caf (2026-08-01) and again at
 *   1dacf18d (2026-09-03), top-level supabase/migrations/*.sql:
 *
 *                                          2026-08-01   2026-09-03
 *       migration files                         2,177        2,767
 *       leading tokens held by 2+ files           283          355
 *       files inside one of those groups          830          995
 *       files on the worst version, `20260725`     16           16
 *
 *   One month, +590 files and +72 duplicate groups. Nothing in CI was stopping
 *   the backlog from growing until this guard landed; nothing shrinks it now.
 *
 *   A guard that flags every duplicate in the repo would therefore fail EVERY
 *   pull request from its first run, including PRs that touch no SQL at all. It
 *   would be reverted within the hour and the class of bug would go unguarded
 *   again. That is not a hypothetical trade-off — it is the reason this file is
 *   written the way it is.
 *
 *   So the guard is BASELINE-AWARE. It reports only collisions the PR itself
 *   NEWLY INTRODUCES and stays completely silent about the historical backlog.
 *   That backlog is a separate, deliberately-deferred cleanup; `--all` audits it
 *   on demand and is NOT wired into CI.
 *
 *   If you are reading this because you want the repo fully deduplicated: do the
 *   renames first, watch the pre-existing count in this guard's output fall to 0,
 *   and only then consider tightening. Tightening first breaks every build.
 *
 * WHAT COUNTS AS "NEWLY INTRODUCED":
 *   added      = files present at HEAD but not at merge-base(base, HEAD)
 *                → exactly what this PR contributes, and nothing else. A stale
 *                  branch cannot inflate this: HEAD only contains what the branch
 *                  contains, so migrations that landed on main after the branch
 *                  point are in neither set.
 *   removed    = files present at merge-base but not at HEAD
 *                → subtracted, so a pure rename that KEEPS its version (foo.sql →
 *                  foo_better_name.sql) is not read as a self-collision.
 *   post-merge = (base branch tip − removed) ∪ added
 *                → the file set that will exist once this PR merges. Collision
 *                  partners are looked up HERE, not in HEAD, and that is the one
 *                  non-obvious choice in this file. It is what lets the guard
 *                  catch the exact incident above: when a sibling PR merges a new
 *                  version to main first, the loser's next CI run compares against
 *                  the UPDATED main tip and reds, even though the winner's file
 *                  never appears in the loser's branch.
 *
 *   A finding is raised only when an ADDED file shares its version with some
 *   other file in the post-merge set. Versions the PR did not touch are never
 *   enumerated, so all 355 pre-existing groups pass in silence (349 real versions
 *   + 6 non-date grouping artefacts).
 *
 * LIMITATION, stated plainly because it is the same shape as the original bug:
 *   Two PRs open at the same time, each adding the same brand-new version, both
 *   pass — neither branch contains the other's file and neither is on main yet.
 *   The first to merge is fine; the second reds only when its checks re-run
 *   against the new main tip. Enabling "Require branches to be up to date before
 *   merging" on the main branch protection rule is what closes that window; this
 *   guard cannot. Do not read a green tick here as proof that no sibling PR is
 *   about to claim your version.
 *
 * OTHER LIMITATIONS:
 *   - Filename-only. It does not read SQL, so it says nothing about whether the
 *     migration is correct, ordered sensibly, or safe to apply.
 *   - Ordering intent is not checked. Two files can be uniquely versioned and
 *     still run in the wrong order relative to each other.
 *   - TOP-LEVEL supabase/migrations/*.sql only. `supabase/migrations/admission/`
 *     holds 24 further .sql files; `supabase db push` never reads nested
 *     directories, so they are not migrations and must not be version-checked.
 *     Recursing into them (the obvious `git ls-files supabase/migrations/`) is a
 *     false-positive source, not a thoroughness win.
 *   - Naming conventions are NOT policed. This guard fails collisions, nothing
 *     else. A deliberate no-op on filename shape is the point: 444 live files use
 *     the short `YYYYMMDD_` form, 2 use a lettered suffix and 76 carry no version
 *     token at all, so any style rule added here would red PRs against
 *     established, working precedent.
 *
 * Usage:
 *   node scripts/ci/check-migration-version-collision.mjs                  # PR-scoped (auto-base)
 *   node scripts/ci/check-migration-version-collision.mjs --base jicate/main
 *   node scripts/ci/check-migration-version-collision.mjs --all            # audit the backlog (355 tokens; 349 real versions) — regenerates the census in docs/architecture/2026-09-03-MIGRATION-duplicate-version-backlog.md
 *   node scripts/ci/check-migration-version-collision.mjs --verbose
 *
 * Auto-base (no --base, no BASE_REF env): prefer `jicate/main` when the `jicate`
 * remote is configured locally, otherwise `origin/main` — identical to
 * check-table-anon-revoke.mjs, and for the same reason: local clones often carry
 * a stale `origin`, and a stale base silently yields 0 added migrations, i.e. a
 * FALSE PASS.
 *
 * Sibling of .github/workflows/table-anon-revoke.yml / secdef-anon-revoke.yml.
 * Kept as its own workflow and its own status check on purpose so it cannot
 * change the pass/fail meaning of an existing one.
 */
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

/** Top-level migrations only — nested dirs are not read by `supabase db push`. */
const isMigration = p =>
  p.startsWith(MIG_DIR) && p.endsWith('.sql') && !p.slice(MIG_DIR.length).includes('/');

/** Migration paths at a given tree-ish. */
function filesAt(ref) {
  return new Set(sh(`git ls-tree -r --name-only ${ref} -- ${MIG_DIR}`).split('\n').filter(isMigration));
}

/** Migration paths as they exist in the checked-out tree (tracked + staged). */
function filesAtHead() {
  return new Set(sh(`git ls-files ${MIG_DIR}`).split('\n').filter(isMigration));
}

const basename = p => p.slice(p.lastIndexOf('/') + 1);

/**
 * The version token — everything before the first underscore, which is what the
 * Supabase CLI keys `schema_migrations.version` on. See the header: this is
 * deliberately not a 14-digit match.
 */
function versionOf(p) {
  const b = basename(p);
  const u = b.indexOf('_');
  return u === -1 ? b.replace(/\.sql$/, '') : b.slice(0, u);
}

/** version -> sorted list of paths. */
function groupByVersion(paths) {
  const m = new Map();
  for (const p of paths) {
    const v = versionOf(p);
    if (!m.has(v)) m.set(v, []);
    m.get(v).push(p);
  }
  for (const list of m.values()) list.sort();
  return m;
}

// Resolve a usable base ref; fall back across common names.
let base = BASE;
for (const cand of [BASE, 'jicate/main', 'origin/main', 'main']) {
  if (sh(`git rev-parse --verify --quiet ${cand}`)) { base = cand; break; }
}

const headFiles = filesAtHead();
const headGroups = groupByVersion(headFiles);

// The historical backlog, measured live every run so a future reader sees drift
// from the counts recorded in the header rather than trusting a stale number.
const preExisting = [...headGroups.values()].filter(l => l.length > 1);

// ---------------------------------------------------------------------------
// Audit mode: enumerate the backlog. Never used by CI — see the baseline note.
// ---------------------------------------------------------------------------
if (ALL) {
  const inGroups = preExisting.reduce((n, l) => n + l.length, 0);
  console.log(`\n${BOLD}Migration version collision — AUDIT of the full repo${RESET}`);
  console.log(`${headFiles.size} migration file(s), ${preExisting.length} duplicate version group(s), ${inGroups} file(s) inside one.\n`);
  for (const list of preExisting.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]))) {
    console.log(`  ${YELLOW}${versionOf(list[0])}${RESET}  ${DIM}(${list.length} files)${RESET}`);
    for (const p of list) console.log(`      ${basename(p)}`);
  }
  console.log(`\n${DIM}Audit mode is informational and always exits 0. CI runs PR-scoped.${RESET}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// PR-scoped mode.
// ---------------------------------------------------------------------------
const mergeBase = sh(`git merge-base ${base} HEAD`) || base;
const mergeBaseFiles = filesAt(mergeBase);
const baseTipFiles = filesAt(base);

const added = [...headFiles].filter(f => !mergeBaseFiles.has(f)).sort();
const removed = new Set([...mergeBaseFiles].filter(f => !headFiles.has(f)));

// The file set that will exist once this PR merges. Partners are looked up here
// so a version already claimed on main is caught even when the branch predates it.
const postMerge = new Set([...baseTipFiles].filter(f => !removed.has(f)));
for (const f of added) postMerge.add(f);
const postMergeGroups = groupByVersion(postMerge);

const collisions = [];   // { version, culprit, partners[] }
for (const f of added) {
  const partners = (postMergeGroups.get(versionOf(f)) || []).filter(p => p !== f);
  if (partners.length > 0) collisions.push({ version: versionOf(f), culprit: f, partners });
}

console.log(`\n${BOLD}Migration version collision guard${RESET} — base ${DIM}${base}${RESET}, ${added.length} migration file(s) added by this PR.`);
console.log(`${DIM}Pre-existing duplicate version groups on this branch: ${preExisting.length} — deliberately NOT checked (see script header).${RESET}`);

if (VERBOSE) {
  for (const f of added) console.log(`  ${DIM}+ ${basename(f)}${RESET}`);
  for (const f of removed) console.log(`  ${DIM}- ${basename(f)}${RESET}`);
}

if (collisions.length > 0) {
  console.error(`\n${RED}${BOLD}✗ ${collisions.length} migration file(s) introduce a NEW duplicate version:${RESET}`);
  for (const c of collisions) {
    console.error(`  ${RED}•${RESET} ${BOLD}${basename(c.culprit)}${RESET}  ${DIM}version ${c.version}${RESET}`);
    for (const p of c.partners) {
      const where = added.includes(p) ? 'also added by this PR' : `already on ${base}`;
      console.error(`      ${DIM}collides with ${basename(p)} — ${where}${RESET}`);
    }
  }
  const first = collisions[0];
  const suggested = /^\d+$/.test(first.version) ? String(BigInt(first.version) + 1n) : `${first.version}b`;
  console.error(`
${YELLOW}Fix:${RESET} rename your file to an unused version, e.g.
  ${DIM}git mv ${first.culprit} \\${RESET}
  ${DIM}       ${MIG_DIR}${suggested}_${basename(first.culprit).slice(first.version.length + 1)}${RESET}
then update ${DIM}supabase/SQL_FILE_INDEX.md${RESET} and any code comment naming the old path.

Check the number is free first — do not just add one blindly, another open PR may
already have taken it:
  ${DIM}ls ${MIG_DIR} | grep '^${suggested}_'${RESET}

${YELLOW}Why this is a hard failure and not a warning:${RESET} ${DIM}supabase db push${RESET} keys the applied-
migrations ledger on the version token before the first underscore, and that
column is the PRIMARY KEY. The second file to arrive at a duplicate version is
treated as ALREADY APPLIED and silently skipped — the workflow reports success
while the SQL never runs. There is no error to find later; there is only a
missing object.

${DIM}This guard only ever looks at what YOUR PR adds. Pre-existing duplicate version
groups on this branch: ${preExisting.length} — a known backlog, intentionally not your problem here.
See the baseline note in scripts/ci/check-migration-version-collision.mjs.${RESET}`);
  process.exit(1);
}

console.log(`${GREEN}✓ No new duplicate migration versions introduced by this PR.${RESET}`);
process.exit(0);
