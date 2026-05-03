#!/usr/bin/env tsx
/* eslint-disable no-console */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { websiteSupabase } from './lib/website-supabase';
import { mapFacultyToStaffUpdate } from './lib/field-mapper';

const DRY_RUN = process.argv.includes('--dry-run');

function myjkknSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('MyJKKN Supabase env missing — load .env.local first');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function main() {
  console.log(`[import] Starting (DRY_RUN=${DRY_RUN})`);
  const ws = websiteSupabase();
  const my = myjkknSupabase();

  const { data: faculty, error } = await ws.from('faculty').select('*');
  if (error) throw error;
  console.log(`[import] Fetched ${faculty?.length ?? 0} website faculty rows`);

  // Set up per-run log file
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const logDir = path.resolve(process.cwd(), 'scripts/import/runs');
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `run-${runId}.log`);
  const log = (line: string) => {
    console.log(line);
    fs.appendFileSync(logPath, line + '\n');
  };

  let matched = 0;
  let skipped = 0;
  let unmatched = 0;

  for (const fac of faculty ?? []) {
    const email = (fac.email ?? '').toLowerCase().trim();
    if (!email) {
      log(`[skip] no email: ${fac.full_name ?? '(unknown)'}`);
      skipped++;
      continue;
    }

    const { data: staffRow, error: lookupErr } = await my
      .from('staff')
      .select('id, first_name, last_name')
      .ilike('email', email)
      .maybeSingle();

    if (lookupErr) {
      log(`[error] lookup failed for ${email}: ${lookupErr.message}`);
      skipped++;
      continue;
    }

    if (!staffRow) {
      log(`[unmatched] ${email} — no staff with this email`);
      unmatched++;
      if (!DRY_RUN) {
        const { error: insErr } = await my.from('staff_import_unmatched').insert({
          source_table: 'faculty',
          source_row: fac,
          reason: 'no email match in MyJKKN staff',
        });
        if (insErr) log(`[error] failed to record unmatched row: ${insErr.message}`);
      }
      continue;
    }

    const update = mapFacultyToStaffUpdate(fac);
    log(`[match] ${email} → staff.id=${staffRow.id}`);
    if (!DRY_RUN) {
      const { error: updErr } = await my.from('staff').update(update).eq('id', staffRow.id);
      if (updErr) {
        log(`[error] update failed for ${email}: ${updErr.message}`);
        skipped++;
        continue;
      }
    }
    matched++;
  }

  log(`[summary] matched=${matched} unmatched=${unmatched} skipped=${skipped}`);
  log(`[summary] log written to ${logPath}`);

  // TODO(p7.29): faculty_achievements second pass goes here

  console.log('[import] Done');
}

main().catch((e) => {
  console.error('[import] FAILED', e);
  process.exit(1);
});
