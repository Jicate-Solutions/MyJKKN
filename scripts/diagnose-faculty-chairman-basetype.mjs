#!/usr/bin/env node
// Read-only: find the base_type of the "Faculty Members" / "Chairman" member
// types for the institution behind composition 2f96f838-9205-481e-a071-d5bbb4d1c8bb.
// Usage: node scripts/diagnose-faculty-chairman-basetype.mjs

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

for (const rawLine of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const eq = line.indexOf('=');
  if (eq < 1) continue;
  const k = line.slice(0, eq).trim();
  let v = line.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}

const SUPA = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const COMP_ID = '2f96f838-9205-481e-a071-d5bbb4d1c8bb';

const { data: comp, error: cErr } = await SUPA
  .from('bos_compositions')
  .select('id, institutions_id, board_id')
  .eq('id', COMP_ID)
  .maybeSingle();
if (cErr) { console.error('composition error:', cErr); }
console.log('composition:', comp);

const instId = comp?.institutions_id;
let counsel = null;
if (instId) {
  const { data: inst } = await SUPA
    .from('institutions')
    .select('id, name, counselling_code')
    .eq('id', instId)
    .maybeSingle();
  console.log('institution:', inst);
  counsel = inst?.counselling_code ?? null;
}

// CAS-expand: all institution UUIDs sharing this counselling_code
let instIds = instId ? [instId] : [];
if (counsel) {
  const { data: sibs } = await SUPA
    .from('institutions')
    .select('id, name')
    .eq('counselling_code', counsel);
  instIds = [...new Set((sibs ?? []).map((s) => s.id))];
  console.log(`CAS siblings for counselling_code=${counsel}:`, sibs?.map((s) => s.id));
}

const { data: types, error: tErr } = await SUPA
  .from('bos_member_types')
  .select('id, institutions_id, name, base_type, sort_order, is_active')
  .in('institutions_id', instIds.length ? instIds : ['00000000-0000-0000-0000-000000000000'])
  .order('sort_order', { ascending: true });
if (tErr) { console.error('member_types error:', tErr); process.exit(1); }

console.log(`\n── bos_member_types for this institution (${types.length} rows) ──`);
for (const t of types) {
  console.log(`  • ${t.name.padEnd(38)} base_type=${t.base_type}  order=${t.sort_order}  active=${t.is_active}  inst=${t.institutions_id}`);
}
console.log('');
