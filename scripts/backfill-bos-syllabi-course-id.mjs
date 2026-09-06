// scripts/backfill-bos-syllabi-course-id.mjs
//
// Standalone backfill of bos_course_syllabi.course_id from COE. Mirrors
// app/api/bos/syllabus/backfill-course-id/route.ts but runnable from the CLI
// (the route needs a super-admin session; this needs service-role + COE env).
//
// Run dry-run (no writes):
//   COE_API_URL=http://localhost:3000 node --env-file=.env scripts/backfill-bos-syllabi-course-id.mjs
// Apply:
//   COE_API_URL=http://localhost:3000 node --env-file=.env scripts/backfill-bos-syllabi-course-id.mjs --apply
//   (add --all to also refresh rows that already have a course_id)

import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const REFRESH_ALL = process.argv.includes('--all');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const COE_URL = (process.env.COE_API_URL || '').replace(/\/$/, '');
const COE_KEY_ID = process.env.COE_API_KEY_ID;
const COE_SECRET = process.env.COE_API_SECRET;

for (const [k, v] of Object.entries({ SUPABASE_URL, SERVICE_KEY, COE_URL, COE_KEY_ID, COE_SECRET })) {
  if (!v) { console.error(`Missing env: ${k}`); process.exit(1); }
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function coeGet(path, params = {}) {
  const url = new URL(`${COE_URL}${path}`);
  for (const [k, val] of Object.entries(params)) {
    if (val !== undefined && val !== '') url.searchParams.set(k, String(val));
  }
  const res = await fetch(url, {
    headers: { 'X-API-Key-Id': COE_KEY_ID, 'X-API-Secret': COE_SECRET, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`COE ${res.status} ${path}`);
  return res.json();
}

function unwrap(raw) {
  return Array.isArray(raw) ? raw : (raw?.data ?? []);
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (writing)' : 'DRY-RUN (no writes)'}${REFRESH_ALL ? ' + refresh-all' : ''}`);
  console.log(`COE: ${COE_URL}`);

  // 1. COE institutions → map myjkkn id → coe id.
  const coeInsts = unwrap(await coeGet('/api/v1/institutions'));
  const myjkknToCoe = new Map();
  for (const i of coeInsts) {
    for (const m of i.myjkkn_institution_ids ?? []) myjkknToCoe.set(m, i.id);
  }
  console.log(`COE institutions: ${coeInsts.length}`);

  // 2. Candidate rows.
  let q = db.from('bos_course_syllabi').select('id, institutions_id, regulation_id, course_code');
  if (!REFRESH_ALL) q = q.is('course_id', null);
  const { data: rows, error } = await q;
  if (error) throw error;
  console.log(`Candidate rows: ${rows.length}`);

  // 3. Group by (institutions_id, regulation_id).
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.institutions_id}|${r.regulation_id ?? ''}`;
    if (!groups.has(key)) groups.set(key, { institutions_id: r.institutions_id, regulation_id: r.regulation_id, items: [] });
    groups.get(key).items.push(r);
  }
  console.log(`Groups: ${groups.size}`);

  let updated = 0;
  const unmatched = [];

  for (const g of groups.values()) {
    const coeInstId = myjkknToCoe.get(g.institutions_id);
    if (!coeInstId) {
      g.items.forEach((i) => unmatched.push({ id: i.id, course_code: i.course_code, reason: 'institution not mapped in COE' }));
      continue;
    }

    let regulationCode;
    if (g.regulation_id) {
      const { data: reg } = await db.from('regulations').select('regulation_code').eq('id', g.regulation_id).maybeSingle();
      regulationCode = reg?.regulation_code ?? undefined;
    }

    // Paginate COE courses → code→id.
    const codeToId = new Map();
    const PAGE = 200, MAX = 25;
    for (let p = 0; p < MAX; p++) {
      let list;
      try {
        list = unwrap(await coeGet('/api/v1/courses', {
          institutions_id: coeInstId, regulation_code: regulationCode,
          is_active: 'true', limit: String(PAGE), offset: String(p * PAGE),
        }));
      } catch (e) { console.warn(`  courses fetch failed inst=${coeInstId} p=${p}: ${e.message}`); break; }
      for (const c of list) if (c.course_code && c.id) codeToId.set(c.course_code, c.id);
      if (list.length < PAGE) break;
    }

    for (const item of g.items) {
      const coeCourseId = codeToId.get(item.course_code);
      if (!coeCourseId) {
        unmatched.push({ id: item.id, course_code: item.course_code, reason: 'course_code not in COE (possibly renamed)' });
        continue;
      }
      if (APPLY) {
        const { error: upErr } = await db.from('bos_course_syllabi').update({ course_id: coeCourseId }).eq('id', item.id);
        if (upErr) { unmatched.push({ id: item.id, course_code: item.course_code, reason: `update failed: ${upErr.message}` }); continue; }
      }
      updated++;
    }
  }

  console.log('\n===== RESULT =====');
  console.log(JSON.stringify({
    mode: APPLY ? 'apply' : 'dry-run',
    totalCandidates: rows.length,
    groups: groups.size,
    [APPLY ? 'updated' : 'wouldUpdate']: updated,
    unmatchedCount: unmatched.length,
  }, null, 2));
  if (unmatched.length) {
    console.log('\n--- unmatched (first 50) ---');
    for (const u of unmatched.slice(0, 50)) console.log(`  ${u.course_code}  (${u.reason})  [${u.id}]`);
    // Distinct reasons summary
    const byReason = {};
    for (const u of unmatched) byReason[u.reason] = (byReason[u.reason] ?? 0) + 1;
    console.log('\n--- unmatched by reason ---');
    console.log(JSON.stringify(byReason, null, 2));
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL:', e); process.exit(1); });
