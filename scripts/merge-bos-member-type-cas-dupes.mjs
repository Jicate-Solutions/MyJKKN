#!/usr/bin/env node
// Merge CAS-sibling duplicate bos_member_types into a single set per college.
//
// WHY: A CAS college has two MyJKKN institution UUIDs (Aided + Self-financing)
// that share one counselling_code. The 20260611 seed created a full member-type
// set for EACH UUID, and the /bos/member-types GET route fans out with
// .in('institutions_id', ids), so both sets stack in the list and read as
// duplicates. The per-institution unique index can't catch this — the rows are
// unique within their own UUID.
//
// FIX (per-counselling_code group with >1 institution UUID holding types):
//   1. Keeper = the sibling UUID with the MOST linked members (fewest repoints);
//      ties break on the lexicographically smallest UUID (deterministic).
//   2. For every OTHER sibling's type, find the keeper's type with the same
//      base_type:
//        • match found  → repoint bos_members.member_type_id (loser → keeper),
//                          then DELETE the emptied loser row.
//        • no match     → RE-PARENT the loser row to the keeper UUID
//                          (update institutions_id) so nothing is lost.
//   3. member_type_id is ON DELETE SET NULL, but we repoint FIRST, so zero
//      members are orphaned. The legacy bos_members.member_type (base_type)
//      column is untouched, so behaviour/authorization is unaffected.
//
// Read-only unless run with --apply.
//
// Usage:
//   node scripts/merge-bos-member-type-cas-dupes.mjs           # dry run
//   node scripts/merge-bos-member-type-cas-dupes.mjs --apply   # execute

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

const APPLY = process.argv.includes('--apply');
const S = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const log = (...a) => console.log(...a);

// 1. Load all types + their institution's counselling_code
const { data: types, error: tErr } = await S
  .from('bos_member_types')
  .select('id, institutions_id, name, base_type, sort_order, is_active');
if (tErr) { console.error('member_types error:', tErr); process.exit(1); }

const instIds = [...new Set(types.map((t) => t.institutions_id))];
const { data: insts } = await S
  .from('institutions')
  .select('id, name, counselling_code')
  .in('id', instIds);
const instById = new Map((insts ?? []).map((i) => [i.id, i]));

// 2. member link counts per member_type_id
const { data: links } = await S
  .from('bos_members')
  .select('member_type_id')
  .not('member_type_id', 'is', null);
const linkCount = new Map();
for (const l of links ?? []) linkCount.set(l.member_type_id, (linkCount.get(l.member_type_id) ?? 0) + 1);
const linksOf = (id) => linkCount.get(id) ?? 0;

// 3. Group types by counselling_code
const groups = new Map();
for (const t of types) {
  const code = instById.get(t.institutions_id)?.counselling_code;
  if (!code) continue; // skip types on institutions with no counselling_code
  if (!groups.has(code)) groups.set(code, []);
  groups.get(code).push(t);
}

log(`\n${APPLY ? '🔧 APPLY MODE' : '🔍 DRY RUN'} — CAS member-type dedup\n`);

let totalRepointed = 0, totalDeleted = 0, totalReparented = 0, groupsTouched = 0;

for (const [code, rows] of groups) {
  const uuids = [...new Set(rows.map((r) => r.institutions_id))];
  if (uuids.length < 2) continue; // no sibling split → nothing to merge

  groupsTouched++;

  // Keeper = UUID with most total linked members; tie → smallest UUID string.
  const totalLinksByUuid = new Map();
  for (const u of uuids) {
    const sum = rows.filter((r) => r.institutions_id === u).reduce((n, r) => n + linksOf(r.id), 0);
    totalLinksByUuid.set(u, sum);
  }
  const keeper = [...uuids].sort((a, b) => {
    const d = (totalLinksByUuid.get(b) ?? 0) - (totalLinksByUuid.get(a) ?? 0);
    return d !== 0 ? d : (a < b ? -1 : 1);
  })[0];

  const keeperRows = rows.filter((r) => r.institutions_id === keeper);
  const keeperByBase = new Map(keeperRows.map((r) => [r.base_type, r]));

  log(`═══ counselling_code=${code} — ${instById.get(keeper)?.name}`);
  log(`    keeper UUID = ${keeper} (links=${totalLinksByUuid.get(keeper)})`);

  for (const loserUuid of uuids.filter((u) => u !== keeper)) {
    log(`    loser  UUID = ${loserUuid} (links=${totalLinksByUuid.get(loserUuid)})`);
    const loserRows = rows.filter((r) => r.institutions_id === loserUuid);

    for (const lr of loserRows) {
      const keep = keeperByBase.get(lr.base_type);
      const n = linksOf(lr.id);

      if (keep) {
        // Repoint members, then delete the emptied loser row.
        log(`        • ${lr.name} [${lr.base_type}] repoint ${n} member(s) → ${keep.name}, then delete`);
        if (APPLY) {
          if (n > 0) {
            const { error: upErr } = await S
              .from('bos_members')
              .update({ member_type_id: keep.id })
              .eq('member_type_id', lr.id);
            if (upErr) { console.error('        repoint FAILED:', upErr); process.exit(1); }
          }
          const { error: delErr } = await S.from('bos_member_types').delete().eq('id', lr.id);
          if (delErr) { console.error('        delete FAILED:', delErr); process.exit(1); }
        }
        totalRepointed += n;
        totalDeleted += 1;
      } else {
        // No keeper counterpart — re-parent this row to the keeper so it (and
        // its members) survive as part of the keeper's set.
        log(`        • ${lr.name} [${lr.base_type}] no keeper match → re-parent to keeper (${n} member(s) stay)`);
        if (APPLY) {
          const { error: repErr } = await S
            .from('bos_member_types')
            .update({ institutions_id: keeper })
            .eq('id', lr.id);
          if (repErr) { console.error('        re-parent FAILED:', repErr); process.exit(1); }
        }
        // Now the keeper owns this base_type — future losers match it.
        keeperByBase.set(lr.base_type, { ...lr, institutions_id: keeper });
        totalReparented += 1;
      }
    }
  }
  log('');
}

log('─────────────────────────────────────────────');
log(`Groups merged:        ${groupsTouched}`);
log(`Rows deleted:         ${totalDeleted}`);
log(`Rows re-parented:     ${totalReparented}`);
log(`Member links moved:   ${totalRepointed}`);
log(APPLY ? '\n✅ Applied.' : '\n(dry run — re-run with --apply to execute)');
