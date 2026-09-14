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
 * ONE-OFF REWRITE, 2026-09-13, same shape again. `href` joined the fingerprint
 * when each entry started carrying the screen the change happened on, so that a
 * reader can open it rather than go hunting. Every stored row holds NULL for it;
 * the first run after this ships writes the ~1,300 that have a link and leaves
 * the rest as they are. It MUST be in the fingerprint: a column the upsert sets
 * but the fingerprint ignores can never be corrected, because the row carrying
 * the stale value would always look unchanged — a page renamed six months from
 * now would keep its dead link forever.
 *
 * The skip changes what is WRITTEN, never what is COMPARED. The prune below is
 * still handed git's full sha list, not the short list of changed rows: prune it
 * against the changed rows and the first quiet day deletes the entire changelog.
 *
 * ONE SCRIPT, MANY APPLICATIONS, 2026-09-13. The Director ruled "one shared list,
 * seen from every app", and migration 20260907183500 already re-keyed the table on
 * (app_key, sha) so it can hold more than one repository's history. This script was
 * the other half of that and was hardwired to `myjkkn`. It now takes the app key as
 * a parameter, and every guard that used to reason about "the table" reasons about
 * ONE APP'S SLICE of it: the prune, the staleness ratio, the first-seed floor and
 * the row count. An unscoped guard here is not a smaller bug than an unscoped
 * DELETE — the count guard would have aborted MyJKKN's own sync forever once other
 * apps held ~11% of the rows, daily, with an error message about shallow clones.
 *
 * WHAT AN APP MUST DECLARE BEFORE IT CAN WRITE — see APP_PROFILES. Its own seed
 * floor (small apps are in, so the floor relaxes per app and is never removed) and
 * the day it joined (a joining app brings only changes from that day forward).
 *
 * Run:  SUPABASE_DB_URL=… node scripts/sync-changelog-db.mjs
 *       CHANGELOG_REF=jicate/main   which history to read (default: whichever of
 *                                  origin/main, jicate/main, main, HEAD is newest)
 *       CHANGELOG_APP_KEY=library   whose slice to write (default: myjkkn)
 *       --app-key=library           the same thing as a flag; the flag wins
 *       --dry-run                   parse and report, touch no database
 *       --emit-json=<path>          write the parsed history to a file and stop.
 *                                  How a sibling repository's CI hands its history
 *                                  to MyJKKN without ever holding SUPABASE_DB_URL —
 *                                  see .github/workflows/changelog-sync-reusable.yml
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

/** Which application this job writes when nothing says otherwise. changelog_entries
 *  is keyed by (app_key, sha), so this value is what keeps MyJKKN's entries from
 *  colliding with — or being pruned by — any other application that syncs into the
 *  same table. It must match the column's DEFAULT in the migration.
 *
 *  IT MUST ALSO STAY THE DEFAULT. The daily job in whats-new-refresh.yml passes no
 *  app key, so changing this silently changes which history the live page shows. */
export const DEFAULT_APP_KEY = 'myjkkn';

/**
 * Which applications may write into the shared list, and on what terms.
 *
 * An app_key that is not in here is REFUSED rather than defaulted. A typo would
 * otherwise open a brand-new slice nobody is reading, seed it with a sibling's
 * history, and look like a success — and the two things every app must declare
 * (how small its history may legitimately be, and the day it joined) have no
 * safe default at all.
 *
 *   firstSeedFloor  Below this many parsed entries, a sync is refused. It is a
 *                   BROKEN-IMPORT guard, not a quality bar: a wrong ref reads a
 *                   handful of commits and, unguarded, would seed the slice with
 *                   the wrong history. MyJKKN's 1,000 protects the 4,957 entries
 *                   already published and does not move. The Director ruled small
 *                   apps are in "even with 40 changes" (rulings 2026-09-13, #3),
 *                   so a joining app declares its own, lower, floor HERE — the
 *                   floor relaxes per app, it is never removed.
 *
 *   startDate       'YYYY-MM-DD', or null for "everything this repository holds".
 *                   Ruling #8: a joining app brings only changes from the day it
 *                   joins, never its back-history, so there is no day-one flood.
 *                   null for MyJKKN alone, whose whole history was published
 *                   before the programme existed.
 *
 * A joining app adds ONE line here, in a pull request against this repository.
 * The spec's recommendation 1 (an `app_key` column on `applications`, so the Hub
 * screen is where an app declares itself) replaces this map later; until that
 * column exists, a reviewed line of code is the registry.
 */
export const APP_PROFILES = {
  myjkkn: { firstSeedFloor: 1000, startDate: null },
};

/** The terms this app syncs on, or null if it is not registered. */
export function profileFor(appKey) {
  return Object.prototype.hasOwnProperty.call(APP_PROFILES, appKey)
    ? APP_PROFILES[appKey]
    : null;
}

/**
 * Which application's history this run writes: `--app-key=x`, else CHANGELOG_APP_KEY,
 * else MyJKKN.
 *
 * The shape is checked because this value reaches a WHERE clause that decides what
 * gets deleted. It is always parameterised, never interpolated, so this is a
 * legibility guard rather than an injection one — but an app key with a space or a
 * capital in it would still write a second, near-invisible slice beside the real one.
 */
export function resolveAppKey(argv = process.argv, env = process.env) {
  const flag = argv.find((a) => a.startsWith('--app-key='));
  const raw = flag ? flag.slice('--app-key='.length) : env.CHANGELOG_APP_KEY;
  const appKey = (raw ?? DEFAULT_APP_KEY).trim();
  if (!/^[a-z][a-z0-9_-]{1,62}$/.test(appKey)) {
    fail(`Not a usable app key: ${JSON.stringify(appKey)}.`,
      'Lower-case letters, digits, hyphen and underscore; 2-63 characters, starting with a letter.');
    return null;
  }
  return appKey;
}

/** Rows per INSERT. 12 columns × 500 = 6,000 parameters, well inside Postgres's
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
  'href', 'pr_number', 'breaking', 'ordinal',
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
 *  entries that share a date — see assignOrdinals and the INSERT for why.
 *
 *  The @param is load-bearing, not decoration. This is a .mjs with no .d.ts, so
 *  TypeScript infers the parameter's shape from the first call site it sees — and
 *  one test calls `entryRow({ ...LATE, at: undefined })`, which narrowed `e` to
 *  `{ at: string }` and made every `e.h` / `e.d` below a TS2339. Declaring the
 *  shape here fixes it for every caller instead of contorting the test.
 *
 * @param {{ h: string, d: string, at?: string | null, t?: string, m?: string,
 *           s?: string, a?: string, e?: string, l?: string | null, p?: number,
 *           b?: number | boolean }} e
 * @param {number} ordinal
 */
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
    // The screen this change happened on, or null when the commit touched no
    // still-existing static page. NULL is the ordinary case (roughly three
    // quarters of entries) and the page falls back to the module's own href for
    // it — see supabase/migrations/20261206120000_changelog_entries_href.sql.
    href: e.l ?? null,
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
  const APP_KEY = resolveAppKey();
  if (!APP_KEY) return;
  const profile = profileFor(APP_KEY);
  if (!profile) {
    // Refused, never defaulted. Defaulting a typo to MyJKKN would let a sibling's
    // history be written into MyJKKN's slice and then prune MyJKKN's own entries.
    fail(`${APP_KEY} is not a registered application — nothing was read or written.`,
      `Add it to APP_PROFILES in this file, declaring its first-seed floor and the ` +
      `date it joins, then re-run. Registered today: ${Object.keys(APP_PROFILES).join(', ')}.`);
    return;
  }
  const DRY_RUN = process.argv.includes('--dry-run');
  const emitFlag = process.argv.find((a) => a.startsWith('--emit-json='));
  const { entries, modules, gitFailed, skipped, recovered, links } = collectChangelog({ ref: REF });

  console.log(`Writing the slice for app_key=${APP_KEY}` +
    `${profile.startDate ? `, from ${profile.startDate} onwards` : ' (whole history)'}.`);
  console.log(`Read ${entries.length} entries from ${REF}, across ${Object.keys(modules).length} modules.`);
  console.log(`  ${entries[entries.length - 1]?.d ?? '—'} → ${entries[0]?.d ?? '—'}`);
  console.log(`  skipped: ${skipped.nonUserFacing} non-user-facing, ${skipped.internal} internal-scope, ` +
    `${skipped.engineering} build-toolchain, ${skipped.contentFree} content-free`);
  console.log(`  module recovered from changed files: ${recovered}`);
  // Said out loud every run, because the honest shape of this feature is that
  // most entries do NOT get their own screen and fall back to their module. A
  // silent 26% would read as a bug the first time somebody counted the links.
  console.log(`  deep links: ${links.precise} open their own screen, ` +
    `${entries.length - links.precise} fall back to their module` +
    (links.dropped ? `, ${links.dropped} dropped (the page no longer exists)` : ''));

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

  if (emitFlag) {
    // The sibling-repository path. That repository parses its own history with
    // MyJKKN's rules — one copy of the rules, which is the whole reason the
    // reusable workflow checks this repository out — and hands the RESULT over
    // HTTPS. It never receives SUPABASE_DB_URL, which is a superuser connection
    // string shared by five workflows here and is not going to ten repositories.
    //
    // The start-date cut is applied HERE as well as in writeChangelog. Not
    // belt-and-braces: this file leaves the sibling's CI and is the payload, so a
    // change from before the app joined must not be in it in the first place.
    const { writable } = applyStartDate(entries, profile.startDate);
    const out = emitFlag.slice('--emit-json='.length);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(out, JSON.stringify(
      { app_key: APP_KEY, ref: REF, start_date: profile.startDate, entries: writable, modules },
      null, 2,
    ));
    console.log(`\n--emit-json: wrote ${writable.length} entries and ` +
      `${Object.keys(modules).length} modules to ${out}. No database connection was opened.`);
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
    await writeChangelog({ client, entries, modules, ref: REF, appKey: APP_KEY });
  } finally {
    await client.end();
  }
}

/**
 * Split a parsed history at the day this application joined.
 *
 * Ruling #8, 2026-09-13: a joining app brings only changes from the day it joins.
 * Everything older is not "not yet imported", it is NEVER imported, so the page
 * does not open on day one with nine apps' back-catalogues on top of MyJKKN's.
 *
 * Returns both halves because the prune needs the cut as badly as the write does:
 * a start date that could DELETE the rows before it would turn "we only take it
 * from Friday" into "we threw away everything before Friday" the first time one
 * was set on an app that already had history. The prune below is fenced to the
 * same window for that reason, and this is the value it is fenced with.
 */
export function applyStartDate(entries, startDate) {
  if (!startDate) return { writable: entries, excluded: 0 };
  const writable = entries.filter((e) => toDateKey(e.d) >= startDate);
  return { writable, excluded: entries.length - writable.length };
}

/**
 * The database half of the run, against a client that is already connected.
 *
 * Split out of main() so the part that touches rows — the guards, the skip, the
 * takedown omission, the prune, the single transaction — can be exercised
 * without a Postgres to point at. main() keeps the parsing, the dry run and the
 * connection; nothing below reads git or the environment.
 */
export async function writeChangelog({ client, entries, modules, ref, appKey = DEFAULT_APP_KEY }) {
  try {
    const profile = profileFor(appKey);
    if (!profile) {
      fail(`${appKey} is not a registered application — nothing was written.`,
        `Add it to APP_PROFILES in this file. Registered today: ${Object.keys(APP_PROFILES).join(', ')}.`);
      return null;
    }
    // Everything from here down works on THIS APP'S history and THIS APP'S rows.
    // `entries` is the full parse; `mine` is the part this app is allowed to
    // publish. Using the wrong one below is how a start date becomes a deletion.
    const cut = applyStartDate(entries, profile.startDate);
    const mine = cut.writable;
    if (cut.excluded) {
      console.log(`Held back ${cut.excluded} entries from before ${appKey} joined on ${profile.startDate}.`);
    }

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

    // SCOPED TO THIS APP, and that scoping is what stops MyJKKN's own sync from
    // aborting forever. This count feeds the staleness ratio below; unscoped, it
    // is the whole table across every application, so once siblings held more
    // than ~11% of the rows MyJKKN's 4,957 entries would fall below 90% of it and
    // the job would refuse to write, every morning, with an error message about
    // shallow clones that sends the reader in precisely the wrong direction.
    const before = await client.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE hidden)::int AS hidden
         FROM public.changelog_entries
        WHERE app_key = $1`,
      [appKey]
    );
    const { total: existing, hidden: hiddenBefore } = before.rows[0];
    console.log(`${appKey} currently holds ${existing} entries (${hiddenBefore} hidden).`);

    // A first seed has nothing to compare against, so the ratio guard below is
    // inert exactly when a wrong ref would do the most damage — it would fill an
    // empty table with the wrong history and report success. This floor is the
    // backstop. It is deliberately far below any real history (the changelog has
    // held 4,700+ entries since it was built) and only ever fires on a ref that
    // is plainly not this project's main line.
    // Unconditional, not `existing === 0`. Gating it on an empty table left the
    // band 0 < existing < 1000 covered by neither guard: with existing = 2, three
    // entries pass the ratio check, get written, and the two real rows are pruned.
    //
    // PER APP, not global. The Director ruled small apps are in "even with 40
    // changes" (2026-09-13, ruling 3), and relaxing this number for everyone
    // would have thrown away the guard that protects MyJKKN's 4,957 entries. So
    // each application declares its own floor in APP_PROFILES and MyJKKN's 1,000
    // stays exactly where it was.
    if (mine.length < profile.firstSeedFloor) {
      fail(
        `Refusing to write only ${mine.length} entries from ${ref} for ${appKey}.`,
        `${appKey} declares a first-seed floor of ${profile.firstSeedFloor} in APP_PROFILES, and a ` +
        `first sync should clear it. ${ref} is probably a stale or wrong remote — check it, then ` +
        `re-run with CHANGELOG_REF set explicitly. If ${appKey}'s history genuinely is this short, ` +
        `lower ITS floor in APP_PROFILES; never lower another application's.`
      );
      return null;
    }

    if (existing > 0 && mine.length < existing * STALENESS_FLOOR) {
      fail(
        `Git gave ${mine.length} entries but ${existing} are already stored for ${appKey} — refusing to write.`,
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
              href, pr_number, breaking, ordinal
         FROM public.changelog_entries
        WHERE app_key = $1`,
      [appKey]
    );
    const entryFingerprints = new Map(
      storedEntries.rows.map((r) => [r.sha, fingerprint(r, ENTRY_COLUMNS)])
    );

    const modulePlan = planModuleWrites(modules, moduleFingerprints);
    const entryPlan = planEntryWrites(mine, entryFingerprints);

    // Modules first: changelog_entries.module_key is a foreign key onto them.
    //
    // A JOINING APP MAY ADD A MODULE, NEVER REWRITE ONE. changelog_modules is
    // keyed by `key` alone — the 2026-09-07 migration keyed the ENTRIES by
    // application and left this dictionary global — and `perm` is the namespace
    // fn_changelog_visible_modules() gates on. So a sibling that also calls one
    // of its areas "billing" would, under DO UPDATE, silently rewrite MyJKKN's
    // Billing label, href AND permission namespace: a dictionary collision would
    // be a permissions change, arriving through a CI job nobody was watching.
    // DO NOTHING makes the collision inert instead. Keying the dictionary by
    // (app_key, key) is the real fix and it needs a migration; this is the guard
    // that holds until then, and it is deliberately the conservative direction —
    // the sibling's entries inherit the existing module rather than commandeering it.
    const moduleConflict = appKey === DEFAULT_APP_KEY
      ? `DO UPDATE
           SET label = EXCLUDED.label,
               perm  = EXCLUDED.perm,
               href  = EXCLUDED.href,
               updated_at = now()`
      : 'DO NOTHING';
    for (const m of modulePlan.toWrite) {
      await client.query(
        `INSERT INTO public.changelog_modules (key, label, perm, href)
         VALUES ($1, $2, $3::text[], $4)
         ON CONFLICT (key) ${moduleConflict}`,
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
    // app_key IS listed in the INSERT now. It used to be left to the column's
    // DEFAULT because this job only ever wrote MyJKKN's history; the moment it
    // writes anybody else's, relying on a default means every sibling's entry
    // silently lands in MyJKKN's slice — and the next MyJKKN sync prunes them.
    //
    // `hidden` and `hidden_reason` are ABSENT from the SET list on purpose. That
    // omission is the takedown guarantee — read the header before adding them.
    const changed = entryPlan.toWrite;
    for (let i = 0; i < changed.length; i += BATCH) {
      const slice = changed.slice(i, i + BATCH);
      const values = [];
      const rows = slice.map((e, n) => {
        // TWELVE columns per row since app_key joined them — eleven when href
        // did, ten when entry_at did, nine before that. This stride is the one
        // number that must move with the column list: leave it behind and every
        // row after the first reads its neighbour's parameters — valid SQL, no
        // error, entirely wrong data.
        const b = n * 12;
        // e.ordinal was assigned by assignOrdinals over the WHOLE read, not by
        // position in this batch or in the changed list — it is the only thing
        // that preserves git's order for the dozen-odd changes sharing a date.
        values.push(appKey, e.sha, e.entry_date, e.entry_at, e.kind, e.module_key, e.subject, e.author,
          e.href, e.pr_number, e.breaking, e.ordinal);
        return `($${b + 1}, $${b + 2}, $${b + 3}::date, $${b + 4}::timestamptz, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}, $${b + 10}::int, $${b + 11}::boolean, $${b + 12}::int)`;
      });
      await client.query(
        `INSERT INTO public.changelog_entries
           (app_key, sha, entry_date, entry_at, kind, module_key, subject, author, href, pr_number, breaking, ordinal)
         VALUES ${rows.join(', ')}
         ON CONFLICT (app_key, sha) DO UPDATE
           SET entry_date = EXCLUDED.entry_date,
               entry_at   = EXCLUDED.entry_at,
               kind       = EXCLUDED.kind,
               module_key = EXCLUDED.module_key,
               subject    = EXCLUDED.subject,
               author     = EXCLUDED.author,
               href       = EXCLUDED.href,
               pr_number  = EXCLUDED.pr_number,
               breaking   = EXCLUDED.breaking,
               ordinal    = EXCLUDED.ordinal,
               updated_at = now()`,
        values
      );
    }
    console.log(`Entries: ${mine.length} read, ${entryPlan.unchanged} unchanged, ` +
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
    //
    // $2 is now THIS RUN'S app key rather than a constant, which is the whole
    // point of this change and also its sharpest edge: hand it the wrong value
    // and one application's sync deletes another's entire archive, inside a
    // transaction that then commits and reports success. __tests__/lib/changelog/
    // sync-multi-app.test.ts exists to prove it does not.
    //
    // FENCED TO THE START DATE TOO. `mine` is already cut at the day the app
    // joined, so without $3 every entry from before that day would be "a row I
    // did not just write" and would be deleted — turning "we only take it from
    // Friday" into "we threw away everything before Friday". NULL means no cut,
    // which is MyJKKN's case and leaves this statement exactly as it was.
    const pruned = await client.query(
      `DELETE FROM public.changelog_entries
        WHERE app_key = $2 AND NOT hidden AND NOT (sha = ANY($1::text[]))
          AND ($3::date IS NULL OR entry_date >= $3::date)
        RETURNING sha, entry_date, subject`,
      [mine.map((e) => e.h), appKey, profile.startDate]
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
    //
    // ONLY THE DEFAULT APP WRITES IT. changelog_sync is one row by construction
    // (`singleton boolean … UNIQUE CHECK (singleton)`), so if every application
    // stamped it, "last synced" would mean "whichever app ran most recently" and
    // `last_ref` would name a repository the reader has never heard of. Until
    // that row is keyed per app — which needs a migration — the honest thing is
    // for the stamp to keep meaning what it has always meant: when MyJKKN's own
    // history was last confirmed current. A joining app's freshness is simply
    // not yet expressible, and saying so beats overwriting a true fact.
    if (appKey === DEFAULT_APP_KEY) {
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
    } else {
      console.log(`Left the freshness stamp alone — it is a single row and it speaks for ` +
        `${DEFAULT_APP_KEY}. Per-app freshness needs changelog_sync keyed by app_key.`);
    }

    await client.query('COMMIT');

    const wrote = modulePlan.toWrite.length + changed.length + (pruned.rowCount ?? 0);
    if (wrote === 0) {
      console.log('\nNothing had changed — no entry or module row was written.');
    }
    console.log(`\nDone. ${visible} entries readable on /whats-new (${total - visible} hidden, kept).`);

    return {
      appKey,
      // What this app was allowed to publish, not what git handed over — they
      // differ by the entries held back from before the app joined.
      read: mine.length,
      heldBack: cut.excluded,
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
