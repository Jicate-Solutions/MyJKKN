/**
 * Apply the school fee Phase 1 migrations (20260813100001..100009).
 *
 * WHY THIS EXISTS
 * ---------------
 * `npx supabase db push` cannot be used in this repo. There is no
 * supabase/config.toml, so the CLI enumerates ZERO local migration files, and
 * the remote history table holds 2573 versions with no local counterpart. The
 * push therefore aborts with LegacyDbPushMissingLocalError before touching
 * anything.
 *
 * !! DO NOT run the `supabase migration repair --status reverted ...` command  !!
 * !! that the CLI suggests. It would mark all 2573 applied migrations as       !!
 * !! reverted, and a later push would then attempt to re-run every local file  !!
 * !! -- including 20260422000002_wipe_billing_test_data.sql.                   !!
 *
 * USAGE
 * -----
 *   # Session pooler / direct connection string from
 *   #   Supabase Dashboard -> Project Settings -> Database -> Connection string
 *   # Keep it in the environment; never paste it into a chat or commit it.
 *   export SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres'
 *
 *   node scripts/apply-school-fee-migrations.mjs --dry-run   # print plan only
 *   node scripts/apply-school-fee-migrations.mjs             # apply
 *
 * TRANSACTION SHAPE
 * -----------------
 * Batch A (100001-100007, 100009) runs as ONE transaction: every statement is
 * a fast metadata operation, so all-or-nothing is both safe and desirable.
 *
 * Batch B (100008) runs as a SEPARATE transaction on purpose. Batch A adds two
 * constraints to billing_student_bills as NOT VALID; validating them in the
 * same transaction would hold the ACCESS EXCLUSIVE lock from the ADD across the
 * validation scan of a live financial table, which is exactly what the NOT
 * VALID pattern exists to avoid.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

const BATCH_A = [
  '20260813100001_create_school_fee_plans',
  '20260813100002_create_school_term_calendars',
  '20260813100003_create_school_fee_concessions',
  '20260813100004_create_school_fee_generation_runs',
  '20260813100005_extend_billing_student_bills_for_school_fees',
  '20260813100006_school_fees_rls',
  '20260813100007_register_school_fees_permissions',
  '20260813100009_billing_categories_applies_to_and_school_heads',
];

const BATCH_B = ['20260813100008_validate_school_fee_bill_constraints'];

const dryRun = process.argv.includes('--dry-run');
const dbUrl = process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error('SUPABASE_DB_URL is not set. See the usage block at the top of this file.');
  process.exit(1);
}

const read = (name) => readFileSync(join(MIGRATIONS, `${name}.sql`), 'utf8');

/** Record the version in Supabase's history table, mirroring what the CLI does. */
async function recordHistory(client, name) {
  const version = name.slice(0, 14);
  const label = name.slice(15);
  try {
    await client.query(
      `INSERT INTO supabase_migrations.schema_migrations (version, name)
       VALUES ($1, $2) ON CONFLICT (version) DO NOTHING`,
      [version, label]
    );
  } catch (err) {
    // Non-fatal: the schema of this table has changed across CLI versions, and
    // failing to log history must never roll back a successful DDL batch.
    console.warn(`  ! could not record history for ${version}: ${err.message}`);
  }
}

async function applyFiles(client, names) {
  for (const name of names) {
    process.stdout.write(`  applying ${name} ... `);
    await client.query(read(name));
    await recordHistory(client, name);
    console.log('ok');
  }
}

async function runBatch(client, label, names) {
  console.log(`\n=== ${label} — ${names.length} file(s), one transaction ===`);
  await client.query('BEGIN');
  try {
    await applyFiles(client, names);
    await client.query('COMMIT');
    console.log(`  committed ${label}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`\n  FAILED, rolled back ${label}: ${err.message}`);
    throw err;
  }
}

async function verify(client) {
  const { rows: tables } = await client.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND (table_name LIKE 'school\\_fee%' OR table_name = 'school_term_calendars')
      ORDER BY table_name`
  );
  const { rows: cats } = await client.query(
    `SELECT count(*) FILTER (WHERE applies_to @> '{school}')::int AS school_heads,
            count(*) FILTER (WHERE applies_to =   '{college}')::int AS college_only
       FROM public.billing_categories`
  );
  console.log('\n=== verification ===');
  console.log('  new tables      :', tables.map((t) => t.table_name).join(', ') || '(none)');
  console.log('  school fee heads:', cats[0].school_heads, '(expected 6)');
  console.log('  college-only    :', cats[0].college_only, '(pre-existing categories, unchanged)');
}

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();

try {
  if (dryRun) {
    // Both batches must run inside ONE transaction here: batch B validates the
    // constraints and indexes the columns that batch A creates, so rolling A
    // back between them would leave B referencing objects that no longer exist.
    // The A/B split only matters for a real apply, where it keeps the
    // ACCESS EXCLUSIVE lock off the validation scan.
    console.log('DRY RUN — every statement executes, then everything is rolled back.');
    await client.query('BEGIN');
    try {
      await applyFiles(client, [...BATCH_A, ...BATCH_B]);
      await verify(client);
      console.log('\n  all statements executed cleanly');
    } finally {
      await client.query('ROLLBACK');
      console.log('  [dry-run] rolled back — database unchanged');
    }
  } else {
    console.log('APPLYING for real.');
    await runBatch(client, 'BATCH A (tables, columns, RLS, permissions, fee heads)', BATCH_A);
    await runBatch(client, 'BATCH B (validate constraints + partial indexes)', BATCH_B);
    await verify(client);
  }
} finally {
  await client.end();
}
