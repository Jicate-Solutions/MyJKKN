#!/usr/bin/env tsx
/* eslint-disable no-console */

import { createClient } from '@supabase/supabase-js';
import { websiteSupabase } from './lib/website-supabase';

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

  // TODO(p7.28): per-faculty match loop goes here
  // TODO(p7.29): faculty_achievements second pass goes here

  console.log('[import] Done');
}

main().catch((e) => {
  console.error('[import] FAILED', e);
  process.exit(1);
});
