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
 * Run:  SUPABASE_DB_URL=… node scripts/sync-changelog-db.mjs
 *       CHANGELOG_REF=origin/main   which history to read (default origin/main)
 *       --dry-run                   parse and report, touch no database
 *
 * Scheduled by .github/workflows/whats-new-refresh.yml, which is also what the
 * super admin's refresh button dispatches.
 */
import { collectChangelog } from './generate-changelog.mjs';

const REF = process.env.CHANGELOG_REF || 'origin/main';
const DRY_RUN = process.argv.includes('--dry-run');

/** Below this fraction of the rows already stored, refuse to write. */
const STALENESS_FLOOR = 0.9;

/** Rows per INSERT. 8 columns × 500 = 4,000 parameters, well inside Postgres's
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

async function main() {
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
      'Set the repo secret SUPABASE_DB_URL (Supabase Studio → Project Settings → Database → URI).');
    return;
  }

  const pg = (await import('pg')).default;
  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

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
      return;
    }

    const before = await client.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE hidden)::int AS hidden
         FROM public.changelog_entries`
    );
    const { total: existing, hidden: hiddenBefore } = before.rows[0];
    console.log(`Table currently holds ${existing} entries (${hiddenBefore} hidden).`);

    if (existing > 0 && entries.length < existing * STALENESS_FLOOR) {
      fail(
        `Git gave ${entries.length} entries but ${existing} are already stored — refusing to write.`,
        `That is below ${STALENESS_FLOOR * 100}% of what is published and is what a shallow clone looks like. ` +
        `Nothing was changed. Re-run on a full checkout (fetch-depth: 0) reading ${REF}.`
      );
      return;
    }

    await client.query('BEGIN');

    // Modules first: changelog_entries.module_key is a foreign key onto them.
    for (const [key, m] of Object.entries(modules)) {
      await client.query(
        `INSERT INTO public.changelog_modules (key, label, perm, href)
         VALUES ($1, $2, $3::text[], $4)
         ON CONFLICT (key) DO UPDATE
           SET label = EXCLUDED.label,
               perm  = EXCLUDED.perm,
               href  = EXCLUDED.href,
               updated_at = now()`,
        [key, m.label, toPermArray(m.perm), m.href ?? null]
      );
    }
    console.log(`Upserted ${Object.keys(modules).length} modules.`);

    // Entries, in batches. ON CONFLICT (sha) DO UPDATE makes a re-run idempotent:
    // the same commit is written once and then corrected in place, never doubled.
    //
    // `hidden` and `hidden_reason` are ABSENT from the SET list on purpose. That
    // omission is the takedown guarantee — read the header before adding them.
    for (let i = 0; i < entries.length; i += BATCH) {
      const slice = entries.slice(i, i + BATCH);
      const values = [];
      const rows = slice.map((e, n) => {
        const b = n * 8;
        values.push(e.h, e.d, e.t, e.m, e.s, e.a, e.p ?? null, e.b === 1);
        return `($${b + 1}, $${b + 2}::date, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}::int, $${b + 8}::boolean)`;
      });
      await client.query(
        `INSERT INTO public.changelog_entries
           (sha, entry_date, kind, module_key, subject, author, pr_number, breaking)
         VALUES ${rows.join(', ')}
         ON CONFLICT (sha) DO UPDATE
           SET entry_date = EXCLUDED.entry_date,
               kind       = EXCLUDED.kind,
               module_key = EXCLUDED.module_key,
               subject    = EXCLUDED.subject,
               author     = EXCLUDED.author,
               pr_number  = EXCLUDED.pr_number,
               breaking   = EXCLUDED.breaking,
               updated_at = now()`,
        values
      );
    }
    console.log(`Upserted ${entries.length} entries.`);

    // Drop what the rules no longer produce — never a hidden row, see the header.
    const pruned = await client.query(
      `DELETE FROM public.changelog_entries
        WHERE NOT hidden AND NOT (sha = ANY($1::text[]))
        RETURNING sha, entry_date, subject`,
      [entries.map((e) => e.h)]
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
    const after = await client.query(
      `SELECT count(*) FILTER (WHERE NOT hidden)::int AS visible,
              count(*)::int AS total
         FROM public.changelog_entries`
    );
    const { visible, total } = after.rows[0];

    const bumped = await client.query(
      `UPDATE public.changelog_sync
          SET last_synced_at = now(), last_ref = $1, entry_count = $2, updated_at = now()
        WHERE singleton`,
      [REF, visible]
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
        [REF, visible]
      );
    }

    await client.query('COMMIT');
    console.log(`\nDone. ${visible} entries readable on /whats-new (${total - visible} hidden, kept).`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    fail('The sync failed and nothing was written — the whole run is one transaction.', err?.stack ?? String(err));
  } finally {
    await client.end();
  }
}

await main();
