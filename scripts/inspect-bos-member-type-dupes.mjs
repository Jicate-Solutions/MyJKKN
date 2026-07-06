#!/usr/bin/env node
// Inspect bos_member_types for CAS-sibling "duplicates".
// Read-only — does NOT delete or modify anything.
//
// The per-institution unique index (institutions_id, lower(name)) already
// blocks true duplicates. What shows up doubled in the /bos/member-types UI
// is one member type per CAS-sibling institution UUID (Aided + Self-financing
// share a counselling_code + display name), fanned out by the GET route's
// .in('institutions_id', ids).
//
// Usage:  node scripts/inspect-bos-member-type-dupes.mjs

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

// 1. All member types + their institution
const { data: types, error: tErr } = await SUPA
  .from('bos_member_types')
  .select('id, institutions_id, name, base_type, sort_order, is_active, created_at')
  .order('created_at', { ascending: true });
if (tErr) { console.error('member_types error:', tErr); process.exit(1); }

const instIds = [...new Set(types.map((t) => t.institutions_id))];
const { data: insts } = await SUPA
  .from('institutions')
  .select('id, name, counselling_code')
  .in('id', instIds);
const instById = new Map((insts ?? []).map((i) => [i.id, i]));

// 2. member linkage counts per member_type_id
const { data: links } = await SUPA
  .from('bos_members')
  .select('member_type_id')
  .not('member_type_id', 'is', null);
const linkCount = new Map();
for (const l of links ?? []) {
  linkCount.set(l.member_type_id, (linkCount.get(l.member_type_id) ?? 0) + 1);
}

console.log(`\nTotal bos_member_types rows: ${types.length}`);
console.log(`Distinct institution UUIDs holding member types: ${instIds.length}\n`);

// 3. Group by counselling_code (CAS bucket), then by lower(name)
const byCode = new Map();
for (const t of types) {
  const inst = instById.get(t.institutions_id);
  const code = inst?.counselling_code ?? `(no-code:${t.institutions_id})`;
  if (!byCode.has(code)) byCode.set(code, []);
  byCode.get(code).push({ t, inst });
}

for (const [code, rows] of byCode) {
  const instName = rows[0].inst?.name ?? '(unknown)';
  const uuids = [...new Set(rows.map((r) => r.t.institutions_id))];
  console.log(`\n═══ counselling_code=${code} — ${instName}`);
  console.log(`    ${uuids.length} institution UUID(s): ${uuids.join(', ')}`);

  const byName = new Map();
  for (const r of rows) {
    const key = r.t.name.trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(r.t);
  }
  for (const [name, group] of byName) {
    const tag = group.length > 1 ? `  ⚠ x${group.length} (CAS dupe)` : '';
    console.log(`    • ${name}${tag}`);
    for (const g of group) {
      const links = linkCount.get(g.id) ?? 0;
      console.log(
        `        id=${g.id}  inst=${g.institutions_id}  base=${g.base_type}` +
        `  order=${g.sort_order}  active=${g.is_active}  linkedMembers=${links}`
      );
    }
  }
}
console.log('');
