#!/usr/bin/env node
// Diagnose why /bos/compositions shows "—" for the Board column.
// Walks the same chain the API does: composition row → institutions_id →
// COE institution_code → COE /api/public/boards → match stored board_id.

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

const COE_URL = process.env.COE_API_URL;
const COE_KEY = process.env.COE_API_KEY_ID;
const COE_SECRET = process.env.COE_API_SECRET;

async function coeGet(path) {
  const res = await fetch(`${COE_URL}${path}`, {
    headers: { 'X-API-Key-Id': COE_KEY, 'X-API-Secret': COE_SECRET },
  });
  if (!res.ok) throw new Error(`COE ${path} → HTTP ${res.status}`);
  return res.json();
}

console.log(`\nCOE_API_URL = ${COE_URL}\n`);

// 1. Pull all active compositions
const { data: comps } = await SUPA
  .from('bos_compositions')
  .select('id, composition_title, board_id, institutions_id')
  .eq('is_active', true)
  .order('created_at', { ascending: false })
  .limit(20);

console.log('═══ 1. Active compositions (max 20) ═══');
console.table(comps);

// 2. COE /api/v1/institutions → mapping table
const coeInstitutions = await coeGet('/api/v1/institutions');
console.log(`\n═══ 2. COE institutions (${coeInstitutions.length} total) ═══`);

// 3. Resolve each composition's institutions_id → COE institution_code
const resolveCode = (myjkknId) => {
  const match = coeInstitutions.find((i) => i.myjkkn_institution_ids?.includes(myjkknId));
  return match?.institution_code ?? null;
};

const uniqInstIds = [...new Set(comps.map((c) => c.institutions_id).filter(Boolean))];
const codeByInstId = Object.fromEntries(
  uniqInstIds.map((id) => [id, resolveCode(id)])
);

console.log('\n═══ 3. MyJKKN institutions_id → COE institution_code ═══');
console.table(
  uniqInstIds.map((id) => ({
    myjkkn_id: id,
    institution_code: codeByInstId[id] ?? 'NO MATCH',
  }))
);

// 4. For each unique COE institution_code, fetch boards
const uniqCodes = [...new Set(Object.values(codeByInstId).filter(Boolean))];
const boardsByCode = {};
for (const code of uniqCodes) {
  try {
    const raw = await coeGet(`/api/public/boards?institution_code=${code}`);
    const boards = Array.isArray(raw) ? raw : raw?.data ?? raw?.boards ?? [];
    boardsByCode[code] = boards;
    console.log(`\n═══ 4.${code}: COE returned ${boards.length} board(s) ═══`);
    console.table(boards.map((b) => ({ id: b.id, board_code: b.board_code, board_name: b.board_name })));
  } catch (e) {
    boardsByCode[code] = [];
    console.log(`\n═══ 4.${code}: FAILED — ${e.message} ═══`);
  }
}

// 5. Match check per composition
console.log('\n═══ 5. Match check (the answer) ═══');
const rows = comps.map((c) => {
  const code = codeByInstId[c.institutions_id];
  const list = boardsByCode[code] ?? [];
  const hit = list.find((b) => b.id === c.board_id);
  return {
    composition: c.composition_title.slice(0, 40),
    stored_board_id: c.board_id?.slice(0, 8) + '…',
    institution_code: code ?? '∅',
    coe_boards_returned: list.length,
    matched: hit ? `✓ ${hit.board_name}` : '✗ NOT FOUND',
  };
});
console.table(rows);

const misses = rows.filter((r) => r.matched.startsWith('✗')).length;
console.log(`\nResult: ${rows.length - misses}/${rows.length} compositions resolve their board.`);
if (misses > 0) {
  console.log(`${misses} composition(s) have a board_id that COE doesn't return for the matched institution_code — drift between stored ID and live COE.`);
}
