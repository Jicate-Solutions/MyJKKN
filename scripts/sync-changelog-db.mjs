#!/usr/bin/env node
/**
 * Reads MyJKKN's git history into the changelog tables that /whats-new renders.
 *
 * WHY THIS EXISTS — the entries used to be a JSON file generated at build time
 * and COMMITTED (lib/changelog/data/). That made the page only as current as the
 * last commit of that file: a new entry needed a daily pull request and a deploy
 * before anybody could read it, and a "refresh" button was impossible, because
 * the running server has no git repository and a read-only filesystem. Since
 * 2026-09-06 the entries live in changelog_entries, this script is the ONLY
 * thing that writes them, and the page reads rows.
 *
 * THE PARSING IS NOT IN THIS FILE. It is collectChangelog() in
 * scripts/generate-changelog.mjs — the same rules that decide which of ~7,000
 * commits a student is shown. Two copies of those rules would drift, and the
 * drift would be invisible until somebody saw a line they should not have.
 *
 * WHAT IT WILL NOT DO
 *   - It never clears `hidden` / `hidden_reason`. Those are a person's takedown
 *     decision (they replaced lib/changelog/hidden.mjs). The upsert's DO UPDATE
 *     list deliberately omits both columns, so a re-sync cannot resurrect an
 *     entry somebody removed. This is the single most important property here.
 *   - It never writes when git hands back a collapsed history. A shallow clone
 *     produces a short, valid-looking changelog; wiping six months of entries
 *     because CI cloned with depth 1 is the worst thing this script could do, so
 *     a count below 90% of what the table already holds ABORTS, loudly, red.
 *
 * WHAT IT DOES DELETE — entries the rules no longer produce, and only those that
 * are not hidden. Without that, tightening a rule (adding an internal scope,
 * widening redactIdentifiers) would silently be a no-op: the offending line
 * would sit in the table forever because nothing ever removed it. Hidden rows
 * are kept even when they fall out of git, so a takedown survives a rule change
 * and its later reversal.
 *
 * WHAT IT NO LONGER WRITES — anything that has not changed. This job runs every
 * morning against a history that usually moved by a handful of commits, and it
 * used to rewrite all 4,923 rows every time ("Upserted 67 modules. Upserted 4923
 * entries." on a day nothing shipped). Each row now carries a fingerprint over
 * exactly the columns the upsert would set, and a row whose fingerprint matches
 * is not sent at all. A day with no new commits now writes zero entry rows and
 * zero module rows.
 *
 * The fingerprint deliberately covers EVERY column in the DO UPDATE list, not
 * just the ones a reader notices. Leaving `kind` or `breaking` out would make a
 * corrected badge unwritable — invisible, permanent, and only findable by
 * someone comparing the page against git by hand.
 *
 * ONE-OFF REWRITE, 2026-09-12. `entry_at` joined that fingerprint when the
 * changelog started keeping the TIME a change landed and not just the day. Every
 * stored row holds NULL for it, so the first run after this ships writes all
 * 4,933 of them once and then goes quiet again — the same shape as the ordinal
 * renumbering before it. A handful of rows also change entry_date by a day: the
 * generator now reads git in Asia/Kolkata rather than in each committer's own
 * offset, which moves 38 of 7,305 commits (0.52%), all of them UTC-stamped
 * GitHub merges that genuinely happened after IST midnight.
 *
 * The skip changes what is WRITTEN, never what is COMPARED. The prune below is
 * still handed git's full sha list, not the short list of changed rows: prune it
 * against the changed rows and the first quiet day deletes the entire changelog.
 *
 * Run:  SUPABASE_DB_URL=… node scripts/sync-changelog-db.mjs
 *       CHANGELOG_REF=jicate/main   which history to read (default: whichever of
 *                                  origin/main, jicate/main, main, HEAD is newest)
 *       --dry-run                   parse and report, touch no database
 *
 * Scheduled by .github/workflows/whats-new-refresh.yml, which is also what the
 * super admin's refresh button dispatches.
 */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';
import { collectChangelog } from './generate-changelog.mjs';

/**
 * Which history to read.
 *
 * NOT a fixed default, because the right answer differs by machine and getting it
 * wrong is silent. In CI, actions/checkout names the production remote `origin`.
 * On a developer's Mac `origin` is often a fork or a stale cache — in the worktree
 * this was written in, `origin/main` was five weeks behind and produced 602
 * entries covering Dec-March instead of 4,741 covering March-September.
 *
 * The staleness guard below would refuse that on any later run, but NOT on the
 * first: an empty table has nothing to compare against, so a wrong ref would have
 * seeded the whole page with the wrong history and looked like a success.
 *
 * So: take the candidate whose newest commit is most recent, and print which one
 * won and what it covers. An explicit CHANGELOG_REF always wins.
 */
function resolveRef() {
  const explicit = process.env.CHANGELOG_REF;
  if (explicit) return explicit;

  // HEAD is deliberately NOT a candidate. On a developer machine mid-work HEAD is
  // by definition the newest commit, so a local run would publish unmerged work —
  // and then the prune below would DELETE every entry that is on main but not on
  // that branch. The staleness guard cannot catch it: a branch two weeks behind
  // main is ~4% short, well inside the 10% tolerance. Only real main lines here.
  const candidates = ['origin/main', 'jicate/main', 'main'];
  let best = null;
  for (const ref of candidates) {
    try {
      const at = execSync(`git log -1 --format=%ct ${ref}`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      const when = Number(at);
      if (Number.isFinite(when) && (best === null || when > best.when)) best = { ref, when };
    } catch {
      // ref does not exist here — normal, candidates differ per machine
    }
  }
  if (!best) {
    fail('No usable git ref.', `Tried: ${candidates.join(', ')}.`);
    process.exit(1);
  }
  return best.ref;
}

/** Below this fraction of the rows already stored, refuse to write. */
const STALENESS_FLOOR = 0.9;

/** Absolute floor for a FIRST sync — see the guard for why a ratio cannot work there. */
const FIRST_SEED_FLOOR = 1000;

/** Which application's history this job writes. changelog_entries is keyed by
 *  (app_key, sha), so this value is what keeps MyJKKN's entries from colliding
 *  with — or being pruned by — any other application that later syncs into the
 *  same table. It must match the column's DEFAULT in the migration. */
const APP_KEY = 'myjkkn';

/** Rows per INSERT. 10 columns × 500 = 5,000 parameters, well inside Postgres's
 *  65,535 limit, and ten round trips for the whole history instead of 4,746. */
const BATCH = 500;

/** The page shows a module's news to anyone holding a permission in its
 *  namespace. modules.mjs stores that as a string, a list of strings, or null
 *  for platform-wide; the column is text[] NULL. Normalise, do not guess. */
function toPermArray(perm) {
  if (perm == null) return null;
  return Array.isArray(perm) ? perm : [perm];
}

function fail(message, detail) {
  console.error(`::error::${message}`);
  if (detail) console.error(detail);
  process.exitCode = 1;
}

/* ───────────────────────────── what changed ──────────────────────────────
 * Everything below decides which rows are worth sending. It is pure — no
 * client, no clock, no git — so the decision can be tested without a database.
 */

/** The entry columns the upsert sets, in the order the INSERT lists them.
 *  The fingerprint covers all of them: a column that can be written but is not
 *  compared is a column that can never be CORRECTED, because the row carrying
 *  the stale value would always look unchanged. */
export const ENTRY_COLUMNS = [
  'sha', 'entry_date', 'entry_at', 'kind', 'module_key', 'subject', 'author',
  'pr_number', 'breaking', 'ordinal',
];

/** The module columns the upsert sets, same reasoning. `key` is the conflict target. */
export const MODULE_COLUMNS = ['key', 'label', 'perm', 'href'];

/**
 * A `date` column, as YYYY-MM-DD, from either side of the wire.
 *
 * The SELECT below casts entry_date to text so this normally receives a string.
 * The Date branch is not decoration: node-postgres parses `date` into a JS Date
 * at LOCAL midnight, and toISOString() on local midnight in IST (UTC+5:30) reads
 * back as the PREVIOUS day. That single off-by-one would make every row in the
 * table look changed on every run, quietly restoring the full rewrite this
 * whole change exists to remove — while every test still passed in UTC.
 */
function toDateKey(value) {
  if (value == null) return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

/**
 * A `timestamptz` as one canonical instant, from either side of the wire.
 *
 * The same class of problem as toDateKey and a sharper version of it. Git hands
 * us `2026-09-12T19:40:00+05:30`; Postgres stores the INSTANT and hands it back
 * with the offset it feels like using — node-postgres parses it into a JS Date,
 * and `entry_at::text` would render it in the session's timezone as
 * `2026-09-12 14:10:00+00`. All three are the same moment and none of them is
 * the same STRING, so comparing them as text marks every row changed on every
 * run — silently restoring the full 4,933-row rewrite the fingerprint exists to
 * remove, while every test still passes.
 *
 * Reduced to UTC ISO, they agree. An unparseable value falls back to its own
 * text rather than to null: null would read as "no timestamp", which is a
 * meaningful state here (a row written before the column existed) and must not
 * be counterfeited by a parse failure.
 */
function toInstantKey(value) {
  if (value == null) return null;
  const at = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(at.getTime()) ? String(value) : at.toISOString();
}

/** One entry as the row the database would hold. `ordinal` breaks ties between
 *  entries that share a date — see assignOrdinals and the INSERT for why. */
export function entryRow(e, ordinal) {
  return {
    sha: e.h,
    entry_date: toDateKey(e.d),
    // Absent until collectChangelog has been re-run against a git that
    // understands `iso-strict-local`, and absent for every row already in the
    // table. null is the honest value, not a placeholder — the page renders the
    // date alone when there is no time, which is what it did before this.
    entry_at: e.at ?? null,
    kind: e.t,
    module_key: e.m,
    subject: e.s,
    author: e.a,
    pr_number: e.p ?? null,
    breaking: e.b === 1,
    ordinal,
  };
}

/** A stable digest of a row's comparable columns. Values are normalised first so
 *  that `1` and `'1'`, `true` and `'t'`, or a Date and its ISO day all agree —
 *  the driver's types on the way out are not the JavaScript types on the way in. */
export function fingerprint(row, columns) {
  const canonical = columns.map((c) => {
    const v = row[c];
    if (v == null) return null;
    if (c === 'entry_date') return toDateKey(v);
    if (c === 'entry_at') return toInstantKey(v);
    if (typeof v === 'boolean') return v;
    if (Array.isArray(v)) return v.map(String);
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && /^-?\d+$/.test(v)) return Number(v);
    return String(v);
  });
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 16);
}

/**
 * Number each entry WITHIN ITS DATE, in git's order.
 *
 * This used to be the entry's index in the whole newest-first read, and that
 * made the number depend on how many entries happened to sit above it. One new
 * commit this morning shifts every index below it by one, every fingerprint
 * changes, and the skip above saves nothing on any day work actually shipped —
 * which is the only kind of day this job has.
 *
 * Per-date numbering renders IDENTICALLY. `ordinal` is compared only between
 * rows that tie on entry_date (app/api/whats-new/route.ts orders by entry_date
 * DESC, then ordinal ASC, then app_key, then sha), and within one date both
 * schemes number the same entries in the same git order. What changes is that a
 * commit landing today no longer renumbers March.
 *
 * The first sync after this ships rewrites every row once, as the stored global
 * indexes are replaced by per-date ones. After that a quiet day writes nothing
 * and a busy day writes the handful of rows that moved.
 */
export function assignOrdinals(entries) {
  const seen = new Map();
  return entries.map((e) => {
    const day = toDateKey(e.d);
    const n = seen.get(day) ?? 0;
    seen.set(day, n + 1);
    return entryRow(e, n);
  });
}

/**
 * Which entries have to be written, and why.
 *
 * `stored` is sha → fingerprint for every row this app already holds, HIDDEN ONES
 * INCLUDED. A hidden row is still a row: if its subject changed in git it must be
 * corrected in place (the upsert's SET list leaves `hidden` alone, so correcting
 * it cannot un-hide it), and if it did not change there is nothing to send.
 */
export function planEntryWrites(entries, stored) {
  const rows = assignOrdinals(entries);
  const toWrite = [];
  let unchanged = 0, inserted = 0, updated = 0;
  for (const row of rows) {
    const before = stored.get(row.sha);
    const now = fingerprint(row, ENTRY_COLUMNS);
    if (before === now) { unchanged += 1; continue; }
    if (before === undefined) inserted += 1; else updated += 1;
    toWrite.push(row);
  }
  return { toWrite, unchanged, inserted, updated };
}

/** The same decision for modules. There are 67 of them against 4,923 entries, so
 *  this saves little time — it is here so that "a quiet day writes nothing" is
 *  literally true rather than nearly true. */
export function planModuleWrites(modules, stored) {
  const toWrite = [];
  let unchanged = 0, inserted = 0, updated = 0;
  for (const [key, m] of Object.entries(modules)) {
    const row = { key, label: m.label, perm: toPermArray(m.perm), href: m.href ?? null };
    const before = stored.get(key);
    const now = fingerprint(row, MODULE_COLUMNS);
    if (before === now) { unchanged += 1; continue; }
    if (before === undefined) inserted += 1; else updated += 1;
    toWrite.push(row);
  }
  return { toWrite, unchanged, inserted, updated };
}

async function main() {
  const REF = resolveRef();
  const DRY_RUN = process.argv.includes('--dry-run');
  const { entries, modules, gitFailed, skipped, recovered } = collectChangelog({ ref: REF });

  console.log(`Read ${entries.length} entries from ${REF}, across ${Object.keys(modules).length} modules.`);
  console.log(`  ${entries[entries.length - 1]?.d ?? '—'} → ${entries[0]?.d ?? '—'}`);
  console.log(`  skipped: ${skipped.nonUserFacing} non-user-facing, ${skipped.internal} internal-scope, ` +
    `${skipped.engineering} build-toolchain, ${skipped.contentFree} content-free`);
  console.log(`  module recovered from changed files: ${recovered}`);

  if (gitFailed) {
    // Not fatal on its own: on a full clone without the remote configured, the
    // HEAD fallback still reads the whole history. It IS the signature of a
    // shallow checkout, so say it plainly — the count guard below is what
    // actually stops a truncated read from reaching the table.
    console.warn(`::warning::${REF} was not reachable; read HEAD instead. On a shallow clone that ` +
      `means a truncated history — the workflow checks out with fetch-depth: 0 for exactly this reason.`);
  }

  if (entries.length === 0) {
    fail('Git yielded no changelog entries at all. Refusing to write.',
      'Either the ref is wrong or this is not a full checkout. The table was left untouched.');
    return;
  }

  if (DRY_RUN) {
    console.log('\n--dry-run: no database connection was opened, nothing was written.');
    console.log(`Would upsert ${Object.keys(modules).length} modules and ${entries.length} entries.`);
    return;
  }

  const DB_URL = process.env.SUPABASE_DB_URL;
  if (!DB_URL) {
    // Never exit 0 here. A sync that wrote nothing and reported success is
    // indistinguishable from a page that is quietly six months out of date.
    fail('SUPABASE_DB_URL is not set — no route to the database.',
      'Set the repo secret SUPABASE_DB_URL (the `changelog_sync` role (see the provisioning block at the foot of supabase/migrations/20260906090000_changelog_live_data.sql) — NOT the superuser URI from Studio, which bypasses RLS on every table).');
    return;
  }


  const pg = (await import('pg')).default;
  // Supabase always needs TLS. A scratch Postgres on a laptop has none, and pg
  // ignores the connection string's own sslmode once an ssl object is passed —
  // so honour sslmode=disable explicitly, which is what makes this script
  // runnable against a throwaway database before it is pointed at production.
  const ssl = /[?&]sslmode=disable\b/.test(DB_URL) ? false : { rejectUnauthorized: false };
  const client = new pg.Client({ connectionString: DB_URL, ssl });
  await client.connect();

  try {
    await writeChangelog({ client, entries, modules, ref: REF });
  } finally {
    await client.end();
  }
}

/**
 * The database half of the run, against a client that is already connected.
 *
 * Split out of main() so the part that touches rows — the guards, the skip, the
 * takedown omission, the prune, the single transaction — can be exercised
 * without a Postgres to point at. main() keeps the parsing, the dry run and the
 * connection; nothing below reads git or the environment.
 */
export async function writeChangelog({ client, entries, modules, ref }) {
  try {
    const present = await client.query(
      `SELECT to_regclass('public.changelog_entries') AS entries,
              to_regclass('public.changelog_modules') AS modules,
              to_regclass('public.changelog_sync')    AS sync`
    );
    const missing = Object.entries(present.rows[0]).filter(([, v]) => v === null).map(([k]) => k);
    if (missing.length) {
      fail(`The changelog tables do not exist yet: ${missing.join(', ')}.`,
        'Apply supabase/migrations/20260906090000_changelog_live_data.sql first.');
      return null;
    }

    const before = await client.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE hidden)::int AS hidden
         FROM public.changelog_entries`
    );
    const { total: existing, hidden: hiddenBefore } = before.rows[0];
    console.log(`Table currently holds ${existing} entries (${hiddenBefore} hidden).`);

    // A first seed has nothing to compare against, so the ratio guard below is
    // inert exactly when a wrong ref would do the most damage — it would fill an
    // empty table with the wrong history and report success. This floor is the
    // backstop. It is deliberately far below any real history (the changelog has
    // held 4,700+ entries since it was built) and only ever fires on a ref that
    // is plainly not this project's main line.
    // Unconditional, not `existing === 0`. Gating it on an empty table left the
    // band 0 < existing < 1000 covered by neither guard: with existing = 2, three
    // entries pass the ratio check, get written, and the two real rows are pruned.
    if (entries.length < FIRST_SEED_FLOOR) {
      fail(
        `Refusing to write only ${entries.length} entries from ${ref}.`,
        `A first sync of this project should carry thousands. ${ref} is probably a stale or ` +
        `wrong remote — check it, then re-run with CHANGELOG_REF set explicitly.`
      );
      return null;
    }

    if (existing > 0 && entries.length < existing * STALENESS_FLOOR) {
      fail(
        `Git gave ${entries.length} entries but ${existing} are already stored — refusing to write.`,
        `That is below ${STALENESS_FLOOR * 100}% of what is published. Nothing was changed.\n` +
        `Usually this means a shallow clone — re-run on a full checkout (fetch-depth: 0) reading ${ref}.\n` +
        `But a deliberate rule change can also cross it: tightening the title rules once dropped 543 ` +
        `entries (11.5%) legitimately. If that is what happened, this guard is doing its job and the ` +
        `drop needs a human eye, not a bypass — confirm the count is intended, then re-run with ` +
        `STALENESS_FLOOR lowered for that run.`
      );
      return null;
    }

    await client.query('BEGIN');

    // What is already stored, read INSIDE the transaction. Reading it before
    // BEGIN would let a concurrent run change a row between the comparison and
    // the write, and the skip would then decide, correctly for a table that no
    // longer exists, that there was nothing to do.
    const storedModules = await client.query(
      `SELECT key, label, perm, href FROM public.changelog_modules`
    );
    const moduleFingerprints = new Map(
      storedModules.rows.map((r) => [r.key, fingerprint(r, MODULE_COLUMNS)])
    );

    // entry_date is cast to text here on purpose — see toDateKey for the
    // timezone off-by-one that a parsed `date` causes east of UTC.
    // Hidden rows are INCLUDED: a hidden row still has to be corrected when its
    // subject changes, and the upsert cannot un-hide it (its SET list omits
    // `hidden`), so there is no reason to exclude it from the comparison.
    const storedEntries = await client.query(
      // entry_at is NOT cast to text, unlike entry_date beside it. A `date` has
      // to be read as text because the driver parses it at LOCAL midnight; a
      // `timestamptz` has no such ambiguity — it is an instant, the driver
      // parses it correctly, and toInstantKey reduces both sides to UTC ISO.
      // `entry_at::text` would instead render in the session's timezone, which
      // is a setting, not a fact.
      `SELECT sha, entry_date::text AS entry_date, entry_at, kind, module_key, subject, author,
              pr_number, breaking, ordinal
         FROM public.changelog_entries
        WHERE app_key = $1`,
      [APP_KEY]
    );
    const entryFingerprints = new Map(
      storedEntries.rows.map((r) => [r.sha, fingerprint(r, ENTRY_COLUMNS)])
    );

    const modulePlan = planModuleWrites(modules, moduleFingerprints);
    const entryPlan = planEntryWrites(entries, entryFingerprints);

    // Modules first: changelog_entries.module_key is a foreign key onto them.
    for (const m of modulePlan.toWrite) {
      await client.query(
        `INSERT INTO public.changelog_modules (key, label, perm, href)
         VALUES ($1, $2, $3::text[], $4)
         ON CONFLICT (key) DO UPDATE
           SET label = EXCLUDED.label,
               perm  = EXCLUDED.perm,
               href  = EXCLUDED.href,
               updated_at = now()`,
        [m.key, m.label, m.perm, m.href]
      );
    }
    console.log(`Modules: ${Object.keys(modules).length} read, ${modulePlan.unchanged} unchanged, ` +
      `${modulePlan.inserted} new, ${modulePlan.updated} changed.`);

    // Entries, in batches, and ONLY the ones the plan says differ. ON CONFLICT
    // (app_key, sha) DO UPDATE makes a re-run idempotent: the same commit is
    // written once and then corrected in place, never doubled. The conflict
    // target is the PAIR, because a bare sha is only unique inside one
    // repository — see the UNIQUE in the migration.
    //
    // app_key is not listed in the INSERT: the column defaults to APP_KEY's value
    // and this job only ever writes MyJKKN's own history.
    //
    // `hidden` and `hidden_reason` are ABSENT from the SET list on purpose. That
    // omission is the takedown guarantee — read the header before adding them.
    const changed = entryPlan.toWrite;
    for (let i = 0; i < changed.length; i += BATCH) {
      const slice = changed.slice(i, i + BATCH);
      const values = [];
      const rows = slice.map((e, n) => {
        // TEN columns per row since entry_at joined them, not nine. This stride
        // is the one number that must move with the column list: leave it at 9
        // and every row after the first reads its neighbour's parameters —
        // valid SQL, no error, entirely wrong data.
        const b = n * 10;
        // e.ordinal was assigned by assignOrdinals over the WHOLE read, not by
        // position in this batch or in the changed list — it is the only thing
        // that preserves git's order for the dozen-odd changes sharing a date.
        values.push(e.sha, e.entry_date, e.entry_at, e.kind, e.module_key, e.subject, e.author,
          e.pr_number, e.breaking, e.ordinal);
        return `($${b + 1}, $${b + 2}::date, $${b + 3}::timestamptz, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}::int, $${b + 9}::boolean, $${b + 10}::int)`;
      });
      await client.query(
        `INSERT INTO public.changelog_entries
           (sha, entry_date, entry_at, kind, module_key, subject, author, pr_number, breaking, ordinal)
         VALUES ${rows.join(', ')}
         ON CONFLICT (app_key, sha) DO UPDATE
           SET entry_date = EXCLUDED.entry_date,
               entry_at   = EXCLUDED.entry_at,
               kind       = EXCLUDED.kind,
               module_key = EXCLUDED.module_key,
               subject    = EXCLUDED.subject,
               author     = EXCLUDED.author,
               pr_number  = EXCLUDED.pr_number,
               breaking   = EXCLUDED.breaking,
               ordinal    = EXCLUDED.ordinal,
               updated_at = now()`,
        values
      );
    }
    console.log(`Entries: ${entries.length} read, ${entryPlan.unchanged} unchanged, ` +
      `${entryPlan.inserted} new, ${entryPlan.updated} changed.`);

    // Drop what the rules no longer produce — never a hidden row, see the header.
    //
    // Handed git's FULL sha list, deliberately not entryPlan.toWrite. The skip
    // above is about what is worth writing; this statement is about what still
    // exists. Narrow it to the changed rows and the first morning with no new
    // commits deletes every entry in the table.
    //
    // SCOPED TO THIS APP, and that is load-bearing rather than tidy. The list
    // being compared against is MyJKKN's git history and nothing else, so
    // without `app_key = $2` this statement reads "delete every entry I did not
    // just write" and a second application's entire changelog disappears on the
    // first MyJKKN sync after it arrives — silently, inside the same transaction
    // that looks like it succeeded.
    const pruned = await client.query(
      `DELETE FROM public.changelog_entries
        WHERE app_key = $2 AND NOT hidden AND NOT (sha = ANY($1::text[]))
        RETURNING sha, entry_date, subject`,
      [entries.map((e) => e.h), APP_KEY]
    );
    if (pruned.rowCount) {
      console.log(`Removed ${pruned.rowCount} entries the rules no longer produce:`);
      for (const r of pruned.rows.slice(0, 10)) {
        console.log(`  ${r.sha}  ${r.entry_date.toISOString?.().slice(0, 10) ?? r.entry_date}  ${r.subject}`);
      }
      if (pruned.rowCount > 10) console.log(`  … and ${pruned.rowCount - 10} more`);
    }

    // What the page can actually show — hidden rows are excluded by the read
    // policy, so counting them here would print a number nobody can reach.
    // Counted across every app_key on purpose: changelog_sync is one row for the
    // whole table, so its entry_count is a platform figure. If a second app ever
    // writes here and the stamp needs to be per-app, that row becomes per-app too.
    const after = await client.query(
      `SELECT count(*) FILTER (WHERE NOT hidden)::int AS visible,
              count(*)::int AS total
         FROM public.changelog_entries`
    );
    const { visible, total } = after.rows[0];

    // This row IS written every run, including a run that changed nothing, and
    // that is the point of it: it is how the page says when the list was last
    // confirmed current. "Nothing changed today" and "nobody has looked since
    // Tuesday" are different facts and the page has to be able to tell them apart.
    const bumped = await client.query(
      `UPDATE public.changelog_sync
          SET last_synced_at = now(), last_ref = $1, entry_count = $2, updated_at = now()
        WHERE singleton`,
      [ref, visible]
    );
    if (bumped.rowCount === 0) {
      // The migration seeds this row, so this only fires if it was deleted. An
      // absent row would make the page unable to say how old the list is.
      await client.query(
        `INSERT INTO public.changelog_sync (singleton, last_synced_at, last_ref, entry_count)
         VALUES (true, now(), $1, $2)
         ON CONFLICT (singleton) DO UPDATE
           SET last_synced_at = EXCLUDED.last_synced_at,
               last_ref = EXCLUDED.last_ref,
               entry_count = EXCLUDED.entry_count,
               updated_at = now()`,
        [ref, visible]
      );
    }

    await client.query('COMMIT');

    const wrote = modulePlan.toWrite.length + changed.length + (pruned.rowCount ?? 0);
    if (wrote === 0) {
      console.log('\nNothing had changed — no entry or module row was written.');
    }
    console.log(`\nDone. ${visible} entries readable on /whats-new (${total - visible} hidden, kept).`);

    return {
      read: entries.length,
      unchanged: entryPlan.unchanged,
      inserted: entryPlan.inserted,
      updated: entryPlan.updated,
      pruned: pruned.rowCount ?? 0,
      modules: modulePlan,
      visible,
      total,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    fail('The sync failed and nothing was written — the whole run is one transaction.', err?.stack ?? String(err));
    return null;
  }
}

/* Run only when this file IS the command. Importing it (the tests do) must not
 * open a connection, shell out to git, or write anything. */
if (process.argv[1] && fileURLToPath(import.meta.url) === resolvePath(process.argv[1])) {
  await main();
}
