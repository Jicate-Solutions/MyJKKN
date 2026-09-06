#!/usr/bin/env node
/**
 * Applies one migration file from supabase/migrations/ and RECORDS it in
 * supabase_migrations.schema_migrations.
 *
 * The recording step is the point. Running DDL through any path that does not
 * register a migration leaves the file on disk and the migration log
 * disagreeing. That is exactly how
 * 20260902160000_hr_leave_accrual_and_pending_reservation.sql ended up
 * declaring a function (fn_hr_leave_monthly_breakdown) that the applied body --
 * recorded as 20260902112409 -- never contained, and which therefore did not
 * exist in the database at all while the file claimed otherwise. This script
 * stores the whole file body as the recorded statement and then reads back its
 * length, so file and log can always be diffed.
 *
 * Transport is public.exec_sql(query text), which is SECURITY DEFINER and
 * granted to service_role only (anon and authenticated are both denied, and the
 * body re-checks auth.role() itself). Two consequences:
 *
 *   - exec_sql RETURNS its failure as {ok:false,error,sqlstate} instead of
 *     throwing, so a caller that ignores the payload sees every failure as
 *     success. Every call here checks `ok`.
 *   - EXECUTE runs inside a function, so the migration must not contain
 *     BEGIN/COMMIT. It is still atomic: the whole file runs in the one
 *     PostgREST request transaction, and exec_sql's own EXCEPTION handler
 *     rolls it back before reporting.
 *
 * Usage:
 *   node scripts/apply-migration-file.mjs 20260905120000_hr_leave_monthly_ledger.sql
 */
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

for (const file of ['.env', '.env.local']) {
  let body;
  try {
    body = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env');
  process.exit(2);
}

const fileArg = process.argv[2];
if (!fileArg) {
  console.error('Usage: node scripts/apply-migration-file.mjs <file.sql>');
  process.exit(2);
}
const path = fileArg.includes('/') ? fileArg : `supabase/migrations/${fileArg}`;
const base = path.split('/').pop();
const m = base.match(/^(\d{14})_(.+)\.sql$/);
if (!m) {
  console.error(`✗ Filename must be <14-digit version>_<name>.sql, got: ${base}`);
  process.exit(2);
}
const [, version, name] = m;
const sql = readFileSync(path, 'utf8');

if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im.test(sql)) {
  console.error('✗ File contains transaction control; exec_sql cannot run BEGIN/COMMIT inside a function.');
  process.exit(2);
}

async function exec(query, label) {
  const r = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${label}: HTTP ${r.status} — ${text}`);
  let out;
  try {
    out = JSON.parse(text);
  } catch {
    throw new Error(`${label}: unparseable response — ${text}`);
  }
  // exec_sql reports failure in the payload, not by throwing.
  if (!out || out.ok !== true) {
    throw new Error(`${label}: ${out?.sqlstate ?? '?'} ${out?.error ?? JSON.stringify(out)}`);
  }
  return out;
}

console.log(`Applying ${base} (${sql.length} chars) …`);
await exec(sql, 'migration');
console.log('✓ SQL applied');

// Dollar-quote the body so the file's own quotes need no escaping. The tag is
// random and asserted absent, so it cannot terminate the literal early.
const tag = `mig_${randomBytes(6).toString('hex')}`;
if (sql.includes(`$${tag}$`)) {
  console.error('✗ Dollar-quote tag collides with file content; re-run.');
  process.exit(1);
}
await exec(
  `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
   VALUES ('${version}', '${name}', ARRAY[$${tag}$${sql}$${tag}$])
   ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name, statements = EXCLUDED.statements;`,
  'record',
);
console.log(`✓ Recorded as ${version} (${name}) — verify length with list_migrations / a SELECT`);
