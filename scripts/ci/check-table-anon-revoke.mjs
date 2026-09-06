#!/usr/bin/env node
/**
 * scripts/ci/check-table-anon-revoke.mjs
 *
 * ###########################################################################
 * ## READ THIS BEFORE TRUSTING THIS GUARD WITH A BACKUP RELATION           ##
 * ##                                                                       ##
 * ## THIS GUARD SEES MIGRATIONS. IT DOES NOT SEE PRODUCTION.               ##
 * ##                                                                       ##
 * ## On 2026-07-31 a `_bak_learner_section_repair_20260731` table exposed   ##
 * ## 179 learners' identities to the anon key. This guard had ALREADY been  ##
 * ## shipping for four days (PR #2488, 2026-07-27) and its header already   ##
 * ## named both the CTAS vector and the `_bak_*` family by name. It did not ##
 * ## stop that leak, and no tightening of it could have, because           ##
 * ## NO MIGRATION EVER CREATED THAT TABLE. Grep every file under            ##
 * ## supabase/migrations/ for `_bak_learner_section_repair_20260731` and    ##
 * ## you get exactly one hit —                                             ##
 * ##   20260731210000_lock_repair_backups_and_hod_leaderboard.sql —         ##
 * ## the migration that LOCKED it after the fact. The table was created by  ##
 * ## hand through the Supabase Management API during a live repair, so it   ##
 * ## never passed through CI at all.                                       ##
 * ##                                                                       ##
 * ## So the backup-relation rule below is a genuine SECOND line of defence  ##
 * ## and is STRUCTURALLY INCAPABLE of preventing the vector that actually   ##
 * ## caused the incident. A green tick here is NOT evidence that no         ##
 * ## unprotected backup relation exists in production.                     ##
 * ##                                                                       ##
 * ## The only COMPLETE prevention is at the database level: an             ##
 * ##   ON ddl_command_end                                                   ##
 * ## event trigger that revokes anon (and refuses the DDL, or enables RLS)  ##
 * ## for any relation created in schema public regardless of how it got     ##
 * ## there — Management API, psql, Studio or migration. That is a           ##
 * ## PRODUCTION DDL CHANGE requiring separate Director approval and is      ##
 * ## DELIBERATELY NOT DONE HERE. Do not close this gap silently; it is      ##
 * ## open on purpose and needs a decision, not a patch.                     ##
 * ##                                                                       ##
 * ## Complementary (also not a substitute): scripts/ci/                    ##
 * ## check-anon-exposure-live.mjs probes the live catalog over the wire.    ##
 * ## It DETECTS after the fact; it does not PREVENT. Detection leaves the   ##
 * ## exposure window that the 2026-07-31 incident happened inside.          ##
 * ###########################################################################
 *
 * CI guard, two independent dimensions:
 *
 *   1. ANON LOCK — every NEW table, VIEW or MATERIALIZED VIEW added in a
 *      migration must explicitly lock `anon`: either REVOKE ... FROM anon, or an
 *      explicit GRANT ... TO anon (the documented intentional-public hatch).
 *   2. RLS ENABLED — every NEW table must also turn row level security on.
 *
 * They fail separately because they defend different doors. The revoke closes the
 * public anon key; RLS is what stops one signed-in college reading another's rows.
 * A table can pass either while failing the other, so neither substitutes.
 *
 * The relation-level sibling of check-secdef-anon-revoke.mjs, enforcing the same
 * CLAUDE.md rule one level down: "Every new table needs explicit
 * REVOKE ALL ... FROM anon, PUBLIC".
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
 * BACKUP RELATIONS — criterion (a) ONLY. NO EXEMPTION, NO HATCH:
 *   A relation whose name carries a `bak`, `backup` or `rollback` segment is held
 *   to the anon revoke AND (for tables) the RLS rule with no way out. For these,
 *   and only these, criteria (b) and (c) do not apply:
 *     - `-- ci:allow-anon-table` / `-- ci:allow-no-rls` do not skip it. The hatch
 *       is a whole-FILE marker, so one legitimate scratch table in a repair
 *       migration silently exempted every backup relation beside it.
 *     - `GRANT ... TO anon` does not satisfy it. That criterion means "public on
 *       purpose"; a copy of learner rows is never public on purpose. Measured
 *       before this change: a `_bak_` CTAS carrying `GRANT SELECT ... TO anon`
 *       exited 0 and printed `✓ ... 1 locked` — the guard certified the leak as
 *       a lock, and the anon grant ALSO exempted it from the RLS check, so both
 *       dimensions reported clean on a table published to the public key.
 *   A blanket `REVOKE ... ON ALL TABLES IN SCHEMA public FROM anon` still counts:
 *   that is a revoke that genuinely executes, not an exemption.
 *
 *   Why these relations and not others: they hold a verbatim copy of production
 *   rows, they are created under time pressure during a live repair, they are
 *   born via CREATE TABLE AS (which never enables RLS), and nobody reads them
 *   again — so an exposure on one is both maximally sensitive and maximally
 *   long-lived. That is the exact 2026-07-31 shape.
 *
 *   Pattern is SEGMENT-matched — /(?:^|_)(?:bak|backup|rollback)(?:_|$)/i —
 *   calibrated against every relation this repo's migrations create (1,257 names
 *   on 2026-08-01):
 *     - `bak` alone catches the 60+ house-convention `_bak_<what>_<yyyymmdd>`.
 *     - `backup` was added on evidence: `hr_leave_applications_backup_20260728`,
 *       `ims_rls_policy_backup_20260728`, `student_attendance_backup_20250109`
 *       and `_staff_scope_lockdown_backup_20260511` are real repair backups the
 *       `bak` pattern alone misses. No legitimate feature table in the repo uses
 *       the word.
 *     - `snapshot` was DELIBERATELY EXCLUDED. It is a legitimate domain word here
 *       (accreditation_iiqa_snapshots, cdc_placement_snapshots,
 *       hostel_occupancy_snapshots, sh_paradigm_shift_snapshots …), and gating
 *       real feature tables with no available hatch would make the gate a
 *       nuisance and get it disabled.
 *   A false positive costs one line of SQL that a new table should carry anyway;
 *   a false negative costs learner identities. The asymmetry is why the segment
 *   match errs inclusive.
 *
 * WHAT COUNTS AS "CREATED BY THIS MIGRATION" (scripts/ci/lib/sql-relation-parser.mjs):
 *   The test is EXECUTION, not quoting. Those are different questions and they come
 *   apart in both directions, so a parser that conflates them is wrong twice:
 *
 *     quoted but EXECUTES  -> DO $$ BEGIN CREATE TABLE ... END $$;   CAUGHT
 *                             (and DDL a DO block runs via EXECUTE of a string —
 *                             20260530150000 builds a view exactly that way)
 *     quoted and INERT     -> 'CREATE TABLE AS' in a command-tag list  IGNORED
 *                             CREATE TABLE inside a CREATE FUNCTION body -> DEFERRED
 *
 *   This USED TO BE WRONG in the inert direction and it cost real money. The old
 *   parser kept string literals and dollar-quoted bodies verbatim, so it invented
 *   relations out of prose and command tags. Receipt, by name:
 *   20260808220000_autolock_new_public_relations.sql — the migration that installs
 *   the ddl_command_end event trigger, i.e. the DATABASE half of this very defence
 *   and the only complete fix for the 2026-07-31 leak — creates NO relations at
 *   all, yet had to burn BOTH escape hatches on itself because the guard read the
 *   `AS` in the required literal `'CREATE TABLE AS'` as a table name. Its header
 *   asks for this fix in as many words. Measured after the fix: that file passes
 *   with both hatch markers deleted. A gate that can only be satisfied by its own
 *   escape hatch teaches people to reach for the hatch, and a hatch reached for by
 *   habit is a gate that has stopped gating.
 *
 *   DEFERRED DDL — a CREATE TABLE/VIEW inside a function body — is reported, never
 *   silently dropped. It creates nothing today, so demanding a same-migration
 *   REVOKE was the bug; but the relation is real once the function is called and it
 *   is born with the same anon default grant. So it is ADVISORY for ordinary
 *   relations, and still BLOCKING for backup relations, which have no hatch
 *   anywhere in this guard. The satisfiable fix is a REVOKE inside the same body —
 *   20260616000000 already does that, and a body that does is scored as locked.
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
 *   3. A revoke that is merely QUOTED does not satisfy it either. String literals
 *      are redacted at the migration's top level, so a REVOKE sitting inside an
 *      INSERT payload is not a REVOKE. This is the string-literal twin of defect
 *      1, and it is deliberately NOT relaxed: the only place literals are unwrapped
 *      is inside a function body, where `EXECUTE 'REVOKE ...'` is how a revoke is
 *      genuinely spelled.
 *
 * LIMITATIONS (static SQL-text scan, like check-radix-select-empty-values):
 *   - A lexer, not a SQL grammar. It tracks comments, string literals, quoted
 *     identifiers and dollar-quoted bodies exactly, which is what the phantom bug
 *     needed; it does not understand statement semantics. A revoke naming the table
 *     anywhere in the same file satisfies the check; it does not verify the revoke
 *     actually runs (e.g. inside an IF that is false at apply time).
 *   - A string literal inside a DO body is treated as executable, because
 *     `EXECUTE 'CREATE TABLE ...'` there is real. So a DO block that merely MENTIONS
 *     "CREATE TABLE" in a RAISE NOTICE will be flagged. That false positive is
 *     deliberate and is the documented asymmetry: it costs one line of SQL a new
 *     table should carry anyway, whereas the false negative costs learner
 *     identities. `-- ci:allow-anon-table` covers it for any non-backup relation.
 *   - CREATE FOREIGN TABLE is not matched. It is reachable by `GRANT ... ON ALL
 *     TABLES`, so this is a real (if unused-in-this-repo) gap, not a decision.
 *   - Only schema `public` (bare or explicitly `public.`) is gated. Supabase's
 *     default privileges are scoped to public, so other schemas are out of scope.
 *   - TEMP / TEMPORARY tables and views are exempt (session-local, never
 *     reachable via PostgREST).
 *   - A blanket `REVOKE ... ON ALL TABLES IN SCHEMA public` is accepted for views
 *     and materialised views as well as tables. That is not a concession: it was
 *     measured against this project's live PostgreSQL on 2026-07-28, in an
 *     isolated schema inside BEGIN … ROLLBACK —
 *       GRANT SELECT ON ALL TABLES IN SCHEMA s TO anon
 *     leaves has_table_privilege('anon', …, 'SELECT') true for the table, the
 *     view AND the materialised view. Worth stating because the PostgreSQL GRANT
 *     docs enumerate only "tables, views, and foreign tables" for ALL TABLES, so
 *     reading the docs alone suggests matviews escape it. They do not.
 *   - The RLS check covers TABLES only. Views and materialised views cannot carry
 *     a policy at all, so requiring it of them would be an unsatisfiable gate.
 *   - A table with an explicit GRANT ... TO anon is exempt from the RLS check:
 *     that grant is already the audited "public on purpose" signal.
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
import { analyzeSql, statementNamesRelation } from './lib/sql-relation-parser.mjs';

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

/**
 * Backup / rollback relations, matched on a whole name SEGMENT.
 *
 * Segment-matched rather than substring-matched so `bak` cannot fire on an
 * unrelated word. See the BACKUP RELATIONS block in the file header for the
 * calibration evidence and for why `snapshot` is deliberately not in this list.
 */
// Whitespace and `-` join `_` as segment separators. Only a QUOTED identifier can
// contain either, so this is a no-op on every unquoted name in the repo and costs
// nothing — but without it, fixing the name parser would have LOST strictness:
// `CREATE TABLE public."Bak Copy 20260802"` used to be truncated to `Bak`, which
// matched `^bak$` and got the strict no-hatch treatment. Parsing the full name
// correctly would otherwise have quietly demoted it to an ordinary relation.
const BACKUP_RELATION_RE = /(?:^|[_\s-])(?:bak|backup|rollback)(?:[_\s-]|$)/i;

/** True for a relation held to the anon-revoke + RLS rule with no exemption. */
function isBackupRelation(name) {
  return BACKUP_RELATION_RE.test(name);
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
    return statementNamesRelation(s, table);
  });
}

/** (b) explicit GRANT to anon — documented-public table. */
function hasAnonTableGrant(stmts, table) {
  return stmts.some(s => {
    if (!/^grant\b/i.test(s)) return false;
    if (NON_TABLE_OBJECT.test(s)) return false;
    if (!roleListMentionsAnon(s, 'to')) return false;
    return statementNamesRelation(s, table);
  });
}

/**
 * Was RLS turned ON for this table in the same migration?
 *
 * Only ENABLE counts. `FORCE ROW LEVEL SECURITY` without a prior ENABLE protects
 * nothing — it changes how RLS applies to the table owner, it does not switch RLS
 * on — so accepting it would be accepting a no-op.
 *
 * A blanket form does not exist for RLS (there is no ALTER ALL TABLES), so unlike
 * the revoke check there is no schema-wide shortcut to honour.
 */
function hasRlsEnabled(stmts, table) {
  return stmts.some(s => {
    if (!/^alter\s+table\b/i.test(s)) return false;
    if (!/\benable\s+row\s+level\s+security\b/i.test(s)) return false;
    return statementNamesRelation(s, table);
  });
}

// ---------------------------------------------------------------------------

const files = targetFiles().filter(Boolean);
if (files.length === 0) {
  console.log(`${GREEN}✓${RESET} No added migration files to check (base: ${BASE}).`);
  process.exit(0);
}

const violations = [];
const rlsViolations = [];
const backupViolations = [];      // anon lock, backup relations — reported separately
const backupRlsViolations = [];   // RLS,       backup tables    — reported separately
const deferredWarnings = [];      // DDL inside a function body — advisory, see below
let checked = 0, passed = 0;
let rlsChecked = 0, rlsPassed = 0;

for (const file of files) {
  if (!existsSync(file)) continue;
  const raw = readFileSync(file, 'utf8');
  // The escape-hatch markers ARE comments, so they must be read BEFORE stripping.
  const skipAnon = /--\s*ci:allow-anon-table\b/i.test(raw);
  const skipRls = /--\s*ci:allow-no-rls\b/i.test(raw);
  if (skipAnon && VERBOSE) console.log(`${DIM}skip anon-lock (ci:allow-anon-table marker): ${file}${RESET}`);
  if (skipRls && VERBOSE) console.log(`${DIM}skip RLS (ci:allow-no-rls marker): ${file}${RESET}`);
  // NOTE: no early `continue` even when BOTH markers are set. A backup relation is
  // checked regardless of either hatch, so skipping the file wholesale here would
  // reinstate exactly the exemption this guard exists to remove.

  // ONE parse per file. `stmts` are the statements that genuinely execute (top
  // level plus DO-block bodies); `tables` / `views` are the relations this
  // migration creates when it runs; `deferred` is DDL that lives inside a
  // function body and therefore creates nothing today. See
  // scripts/ci/lib/sql-relation-parser.mjs for why those three are different.
  const { statements: stmts, tables, views, deferred } = analyzeSql(raw);

  // --- anon lock: tables AND views/matviews share one rule and one counter -----
  const relations = [
    ...tables.map(name => ({ name, kind: 'table' })),
    ...views,
  ];
  for (const rel of relations) {
    const backup = isBackupRelation(rel.name);
    if (skipAnon && !backup) continue;   // whole-file hatch — never covers a backup relation
    checked++;
    // Criterion (b), the documented-public GRANT, is withdrawn for backup
    // relations: a copy of production rows is never public on purpose, and
    // accepting it let the guard print "locked" over a live anon grant.
    const locked = hasAnonTableRevoke(stmts, rel.name)
      || (!backup && hasAnonTableGrant(stmts, rel.name));
    if (locked) {
      passed++;
      if (VERBOSE) {
        const tag = backup ? ` ${YELLOW}[backup relation — strict]${RESET}` : '';
        console.log(`${GREEN}✓${RESET} ${rel.name} ${DIM}(${rel.kind}, ${file})${RESET}${tag}`);
      }
    } else if (backup) {
      backupViolations.push({ file, table: rel.name, kind: rel.kind, hatched: skipAnon });
    } else {
      violations.push({ file, table: rel.name, kind: rel.kind });
    }
  }

  // --- RLS enabled: TABLES only ----------------------------------------------
  // Views and matviews are skipped because they cannot carry RLS at all — the
  // policy lives on the underlying table. Requiring it of them would be an
  // unsatisfiable gate. That holds for a backup VIEW too: it stays fully gated on
  // the anon revoke above, which is the actual exposure path for a view.
  //
  // A table published to anon on purpose is exempt: the explicit GRANT is already
  // the audited "this is public" signal, and demanding RLS on top would fail the
  // documented-public pattern (the community / caste lists) that criterion (b)
  // exists to bless. A backup table gets neither that exemption nor the hatch.
  for (const t of tables) {
    const backup = isBackupRelation(t);
    if (skipRls && !backup) continue;
    if (!backup && hasAnonTableGrant(stmts, t)) continue;
    rlsChecked++;
    if (hasRlsEnabled(stmts, t)) {
      rlsPassed++;
    } else if (backup) {
      backupRlsViolations.push({ file, table: t, hatched: skipRls });
    } else {
      rlsViolations.push({ file, table: t });
    }
  }

  // --- DEFERRED DDL: relations created inside a FUNCTION body ------------------
  // These used to be counted as created BY THIS MIGRATION, which is the phantom
  // bug: the migration only DEFINES the function, so a same-migration REVOKE was
  // being demanded for a relation that does not exist yet — an unsatisfiable
  // failure, and unsatisfiable failures are what teach people to reach for the
  // escape hatch.
  //
  // They are not dropped either, because the relation is real once the function
  // runs and it is born with Supabase's default anon grant just the same. The
  // satisfiable fix is a REVOKE inside the SAME body, which is exactly what
  // 20260616000000 already does for v_privilege_memberships_effective, so this
  // reports only when that revoke is absent.
  //
  // Advisory (non-blocking) for ordinary relations — the migration itself creates
  // nothing, so failing the build would be claiming more than the evidence
  // supports. BLOCKING for backup relations, because those have no hatch anywhere
  // else in this guard and a function that copies learner rows into a `_bak_` is
  // the 2026-07-31 shape with one extra call in front of it.
  for (const d of deferred) {
    const deferredRels = [
      ...d.tables.map(name => ({ name, kind: 'table' })),
      ...d.views,
    ];
    for (const rel of deferredRels) {
      const backup = isBackupRelation(rel.name);
      if (hasAnonTableRevoke(d.statements, rel.name)) {
        if (VERBOSE) {
          console.log(`${GREEN}✓${RESET} ${rel.name} ${DIM}(${rel.kind}, deferred — revoked inside the body, ${file})${RESET}`);
        }
        continue;
      }
      if (backup) {
        backupViolations.push({ file, table: rel.name, kind: rel.kind, hatched: false, deferred: true });
        if (rel.kind === 'table' && !hasRlsEnabled(d.statements, rel.name)) {
          backupRlsViolations.push({ file, table: rel.name, hatched: false, deferred: true });
        }
      } else {
        deferredWarnings.push({ file, table: rel.name, kind: rel.kind, construct: d.construct });
      }
    }
  }
}

console.log(`\n${BOLD}New-relation anon-lock guard${RESET} — ${checked} new table(s)/view(s) checked, ${passed} locked.`);
console.log(`${BOLD}New-table RLS guard${RESET} — ${rlsChecked} new table(s) checked, ${rlsPassed} with RLS enabled.`);

// --- deferred DDL: advisory, NOT a build failure -----------------------------
// Printed before the failures so it cannot be mistaken for one, and worded so a
// reader can tell at a glance that nothing here blocks the merge.
if (deferredWarnings.length > 0) {
  console.log(`\n${YELLOW}${BOLD}⚠ ${deferredWarnings.length} relation(s) created inside a FUNCTION body — advisory, not blocking.${RESET}`);
  for (const w of deferredWarnings) {
    console.log(`  ${YELLOW}•${RESET} ${BOLD}${w.table}${RESET} ${DIM}[${w.kind}] in ${w.construct} — ${w.file}${RESET}`);
  }
  console.log(`
${DIM}This migration does not create these relations; it defines a function that will,
whenever something calls it. So a REVOKE in this migration would name a relation
that does not exist yet, and demanding one is the phantom-table failure this guard
used to produce. It is reported rather than dropped because the relation is real
once the function runs, and it is born with Supabase's default anon grant exactly
like any other.

The satisfiable fix is a revoke in the SAME function body, right after the create:
  ${RESET}${DIM}EXECUTE 'REVOKE ALL ON ' || quote_ident(v_name) || ' FROM anon, PUBLIC';${RESET}${DIM}
20260616000000_lock_privilege_resolver_views_and_fns_from_anon.sql is the worked
example; a body that already does this is scored as locked and never printed here.

A backup relation created this way is NOT advisory — it is a hard failure above.${RESET}`);
}

// --- backup relations: reported FIRST, and separately ------------------------
// Separate from the generic buckets on purpose. The fix text differs (there is no
// hatch to offer) and the reason differs (these hold verbatim production rows), so
// folding them into the generic message would hand the reader an escape hatch that
// does not apply to them.
if (backupViolations.length > 0 || backupRlsViolations.length > 0) {
  const n = backupViolations.length + backupRlsViolations.length;
  console.error(`\n${RED}${BOLD}✗ BACKUP RELATION NOT LOCKED — ${n} finding(s). No escape hatch applies.${RESET}`);
  for (const v of backupViolations) {
    const why = v.hatched
      ? ` ${YELLOW}(ci:allow-anon-table does NOT cover a backup relation)${RESET}`
      : '';
    const when = v.deferred ? ` ${YELLOW}(created inside a function body — revoke inside that same body)${RESET}` : '';
    console.error(`  ${RED}•${RESET} ${BOLD}${v.table}${RESET} ${DIM}[${v.kind}] no anon revoke — ${v.file}${RESET}${why}${when}`);
  }
  for (const v of backupRlsViolations) {
    const why = v.hatched
      ? ` ${YELLOW}(ci:allow-no-rls does NOT cover a backup relation)${RESET}`
      : '';
    const when = v.deferred ? ` ${YELLOW}(created inside a function body)${RESET}` : '';
    console.error(`  ${RED}•${RESET} ${BOLD}${v.table}${RESET} ${DIM}[table] no ENABLE ROW LEVEL SECURITY — ${v.file}${RESET}${why}${when}`);
  }
  const example = backupViolations[0]?.table ?? backupRlsViolations[0]?.table;
  console.error(`
${YELLOW}Fix — in the SAME migration, all three lines:${RESET}
  ${DIM}REVOKE ALL ON TABLE public.${example} FROM anon, PUBLIC;${RESET}
  ${DIM}GRANT  SELECT ON TABLE public.${example} TO service_role;      -- nothing else should read a backup${RESET}
  ${DIM}ALTER  TABLE public.${example} ENABLE ROW LEVEL SECURITY;      -- tables only; a view cannot carry a policy${RESET}

${YELLOW}Why there is no hatch here.${RESET} A relation named *_bak_* / *_backup_* / *_rollback_*
holds a verbatim copy of production rows, is created under time pressure during a
live repair, is normally born via CREATE TABLE AS (which NEVER enables RLS), and is
then never looked at again. Maximally sensitive and maximally long-lived. On
2026-07-31 exactly one such table published 179 learners' identities to the anon key
that ships in every page of https://www.jkkn.ai.

Both ordinary exemptions are withdrawn for these relations:
  - ${DIM}-- ci:allow-anon-table${RESET} / ${DIM}-- ci:allow-no-rls${RESET} are whole-FILE markers, so one
    legitimate scratch table in a repair migration silently exempted every backup
    relation sitting beside it.
  - ${DIM}GRANT ... TO anon${RESET} means "public on purpose". A copy of learner rows is never
    public on purpose. Before this rule that grant made the guard print
    "✓ 1 locked" over a live anon grant, and exempted the table from the RLS check
    as well — both dimensions green on a published table.

${RED}${BOLD}And note what this guard CANNOT do.${RESET} It reads migration files. The 2026-07-31
table was created by hand through the Supabase Management API and never appeared in
any migration, so this guard would not have caught it and a green tick here is NOT
evidence that production is clean. Complete prevention needs an ON ddl_command_end
event trigger in the database — a production DDL change, Director-gated, and
deliberately not done in this PR. See this script's header.`);
}

if (rlsViolations.length > 0) {
  console.error(`\n${RED}${BOLD}✗ ${rlsViolations.length} new table(s) never enable row level security:${RESET}`);
  for (const v of rlsViolations) {
    console.error(`  ${RED}•${RESET} ${BOLD}${v.table}${RESET}  ${DIM}${v.file}${RESET}`);
  }
  console.error(`
${YELLOW}Fix:${RESET} in the SAME migration, for each table add:
  ${DIM}ALTER TABLE public.${rlsViolations[0].table} ENABLE ROW LEVEL SECURITY;${RESET}
  ${DIM}CREATE POLICY ... ON public.${rlsViolations[0].table} FOR SELECT TO authenticated USING (...);${RESET}

Whole-file escape hatch (rare, audited): add a line comment
  ${DIM}-- ci:allow-no-rls <reason>${RESET}

Why this is a SEPARATE failure from the anon lock: revoking anon closes the public
key, but every signed-in role still reaches the table through PostgREST. Without
RLS there is no row-level boundary between institutions at all, so any
authenticated user of any college can read every other college's rows. The revoke
and the policy defend different doors; passing one is not passing the other.

Note a table published on purpose (an explicit GRANT ... TO anon) is exempt here —
that is the documented-public pattern, and it is audited by the grant itself.`);
}

if (violations.length > 0) {
  const tables = violations.filter(v => v.kind === 'table');
  const views = violations.filter(v => v.kind !== 'table');
  console.error(`\n${RED}${BOLD}✗ ${violations.length} new relation(s) missing an explicit anon lock:${RESET}`);
  for (const v of violations) {
    const tag = v.kind === 'table' ? '' : ` ${DIM}[${v.kind}]${RESET}`;
    console.error(`  ${RED}•${RESET} ${BOLD}${v.table}${RESET}${tag}  ${DIM}${v.file}${RESET}`);
  }
  if (views.length > 0) {
    console.error(`
${YELLOW}${views.length} of these are views.${RESET} A view needs the revoke as much as a table does,
and arguably more: it does not inherit the underlying table's RLS. Unless it is
declared WITH (security_invoker = true), a view runs as ITS OWNER, so a view over a
correctly locked table will happily serve that table's rows to anon.
  ${DIM}REVOKE ALL ON TABLE public.${views[0].table} FROM anon, PUBLIC;${RESET}
  ${DIM}-- REVOKE ... ON TABLE also covers views and materialised views.${RESET}`);
  }
  if (tables.length > 0) console.error(`
${YELLOW}Fix:${RESET} in the SAME migration, for each table add:
  ${DIM}REVOKE ALL ON TABLE public.${tables[0].table} FROM anon, PUBLIC;${RESET}
  ${DIM}GRANT  SELECT ON TABLE public.${tables[0].table} TO authenticated;   -- or whatever it needs${RESET}
  ${DIM}ALTER TABLE public.${tables[0].table} ENABLE ROW LEVEL SECURITY;    -- also gated, see the RLS guard above${RESET}

If the table is INTENTIONALLY public (e.g. the community / caste lists read by
the unauthenticated admission landing page):
  ${DIM}GRANT SELECT ON TABLE public.${tables[0].table} TO anon;  -- + a comment saying why${RESET}

Whole-file escape hatch (rare, audited): add a line comment
  ${DIM}-- ci:allow-anon-table <reason>${RESET}

Why: Supabase runs ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon, so a
new public-schema table is created with SELECT/INSERT/UPDATE/DELETE granted to the
anon key embedded in every page of https://www.jkkn.ai. RLS is not a substitute —
CREATE TABLE AS never enables it, and an RLS policy written TO PUBLIC still applies
to anon. See CLAUDE.md + supabase/migrations/20260726180000_revoke_anon_on_unprotected_backup_tables.sql.`);
}

// One exit for EVERY dimension. An RLS-only failure must still fail the build —
// scoping the exit inside the anon block would have let it report and pass. The two
// backup buckets are in the same condition for the same reason, and a backup-only
// finding is the case most likely to be the only finding in a repair migration: miss
// it here and the guard prints a blocking failure and then exits 0, which is this
// repo's documented gate failure mode (a terminology gate shipped exactly that bug).
if (
  violations.length > 0 ||
  rlsViolations.length > 0 ||
  backupViolations.length > 0 ||
  backupRlsViolations.length > 0
) process.exit(1);

console.log(`${GREEN}✓ All new tables and views explicitly lock anon (or are documented public), and every new table enables RLS.${RESET}`);
process.exit(0);
