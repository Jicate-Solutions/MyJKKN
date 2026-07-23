#!/usr/bin/env node
/**
 * One-time backfill: link/populate MyJKKN courses + course_mappings from COE for
 * COE-mastered institutions (institutions.course_master_source = 'coe', i.e. CAS
 * + Engineering), so the timetable keeps working without anyone re-entering data.
 *
 * Direction: COE → MyJKKN only. (MyJKKN-mastered colleges keep authoring locally;
 * pushing those up to COE for BOS is a separate flow via the existing BOS import.)
 *
 * Mirrors the logic in lib/services/coe-sync/* in plain JS — same precedent as
 * backfill-bos-board-type-from-coe.mjs, which also reimplements service logic
 * because the TS service modules aren't importable from a standalone .mjs script.
 * Keep the two in sync if the resolution rules change.
 *
 * CAS fan-out: one COE institution → both myjkkn_institution_ids (Aided + Self);
 * each course/mapping is written once per MyJKKN UUID, sharing one coe_course_id.
 *
 * Flow per institution:
 *   1. Resolve COE institution via /api/v1/institutions (myjkkn_institution_ids).
 *   2. Fetch COE active courses; classify vs local courses (link / create / linked).
 *   3. Upsert courses on (institution_id, course_code) [live mode].
 *   4. Fetch COE course-mapping; resolve program_code→programs.program_id,
 *      semester_code→semesters, course_code→courses; upsert course_mappings.
 *   5. Write reconciliation CSVs (courses + mapping skips).
 *
 * Idempotent. Re-runs are safe.
 *
 * Required .env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *                COE_API_URL, COE_API_KEY_ID, COE_API_SECRET
 *
 * Run:  node scripts/backfill-coe-course-link.mjs --dry-run
 *       node scripts/backfill-coe-course-link.mjs
 *       node scripts/backfill-coe-course-link.mjs --institution=<myjkkn_uuid>
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';

// ── .env loader ──────────────────────────────────────────────────────────────
for (const rawLine of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const eq = line.indexOf('=');
  if (eq < 1) continue;
  const k = line.slice(0, eq).trim();
  let v = line.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  if (!process.env[k]) process.env[k] = v;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const coeUrl = process.env.COE_API_URL;
const coeKeyId = process.env.COE_API_KEY_ID;
const coeSecret = process.env.COE_API_SECRET;

if (!supabaseUrl || !serviceKey) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env');
  process.exit(2);
}
if (!coeUrl || !coeKeyId || !coeSecret) {
  console.error('✗ COE_API_URL / COE_API_KEY_ID / COE_API_SECRET missing from .env');
  process.exit(2);
}

const dryRun = process.argv.includes('--dry-run');
const onlyInst = process.argv.find((a) => a.startsWith('--institution='))?.split('=')[1];
const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const coeBase = coeUrl.replace(/\/$/, '');

console.log(`Project: ${supabaseUrl.match(/https:\/\/([a-z0-9]+)\./i)?.[1] ?? '(unknown)'}`);
console.log(`COE:     ${coeBase}`);
console.log(`Mode:    ${dryRun ? 'DRY RUN — no writes' : 'LIVE — writes will be applied'}`);

// ── COE GET helper (retries transient 5xx / network blips) ───────────────────
async function coeGet(path, params = {}) {
  const url = new URL(`${coeBase}${path}`);
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== '') url.searchParams.set(key, String(val));
  }
  const headers = {
    'X-API-Key-Id': coeKeyId,
    'X-API-Secret': coeSecret,
    'Content-Type': 'application/json',
  };
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url.toString(), { headers });
      if (res.ok) {
        const json = await res.json();
        return Array.isArray(json) ? json : (json?.data ?? []);
      }
      // 4xx (except 429) is not worth retrying — fail fast.
      if (res.status < 500 && res.status !== 429) {
        throw new Error(`COE ${path} → HTTP ${res.status}`);
      }
      lastErr = new Error(`COE ${path} → HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  throw lastErr ?? new Error(`COE ${path} → failed`);
}

const PAGE = 500;
async function coeAllCourses(coeInstId) {
  const all = [];
  for (let p = 0; p < 20; p++) {
    const rows = (await coeGet('/api/v1/courses', {
      institutions_id: coeInstId, is_active: 'true', limit: PAGE, offset: p * PAGE,
    })).filter((c) => !c.institutions_id || c.institutions_id === coeInstId);
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

// ── 1. COE-mastered institutions ──────────────────────────────────────────────
let instQ = sb.from('institutions').select('id, name, counselling_code').eq('course_master_source', 'coe');
if (onlyInst) instQ = instQ.eq('id', onlyInst);
const { data: institutions, error: instErr } = await instQ;
if (instErr) { console.error('✗ list institutions:', instErr.message); process.exit(1); }

if (!institutions || institutions.length === 0) {
  console.log('\nNo COE-mastered institutions (course_master_source=\'coe\').');
  console.log('Seed them first:  UPDATE institutions SET course_master_source=\'coe\' WHERE counselling_code IN (...);');
  process.exit(0);
}
console.log(`\n▸ ${institutions.length} COE-mastered institution(s) to process`);

// ── 2. COE institution map (myjkkn_institution_ids → coe_id) ─────────────────
console.log('▸ Fetching COE /api/v1/institutions for myjkkn_institution_ids mapping…');
const coeInsts = await coeGet('/api/v1/institutions');

// ── CSV accumulators ──────────────────────────────────────────────────────────
const courseCsv = [['institution_id', 'myjkkn_institution_id', 'course_code', 'course_name', 'coe_course_id', 'action']];
const mapSkipCsv = [['institution_id', 'myjkkn_institution_id', 'program_code', 'semester_code', 'course_code', 'reason']];

const totals = {
  courses_create: 0, courses_link: 0, courses_already: 0, courses_written: 0, courses_deactivated: 0,
  mappings_upserted: 0, mappings_skipped: 0, errors: 0,
};

const stamp = () => new Date().toISOString();

// Dedup CAS: both Aided + Self rows are course_master_source='coe' and resolve to
// the SAME COE institution; each fans out to both MyJKKN UUIDs in one pass. Process
// each COE institution once so we don't double-fetch from COE / double-count.
const processedCoeIds = new Set();

for (const inst of institutions) {
  console.log(`\n── ${inst.name ?? inst.id} (${inst.counselling_code ?? 'no code'}) ──`);

  const coe = coeInsts.find((c) => (c.myjkkn_institution_ids ?? []).includes(inst.id))
    ?? coeInsts.find((c) => c.institution_code === inst.counselling_code || c.counselling_code === inst.counselling_code);
  if (!coe?.id) {
    console.log('  ✗ not mapped in COE (no coe_id) — skipping');
    totals.errors++;
    continue;
  }
  if (processedCoeIds.has(coe.id)) {
    console.log('  ↳ COE institution already processed via its sibling — skipping');
    continue;
  }
  processedCoeIds.add(coe.id);
  const targetIds = (coe.myjkkn_institution_ids?.length ? coe.myjkkn_institution_ids : [inst.id]);
  if (targetIds.length > 1) console.log(`  CAS fan-out → ${targetIds.length} MyJKKN UUIDs`);

  // ── Courses ────────────────────────────────────────────────────────────────
  let coeCourses;
  try { coeCourses = await coeAllCourses(coe.id); }
  catch (e) { console.log(`  ✗ COE courses fetch failed: ${e.message}`); totals.errors++; continue; }
  console.log(`  COE courses: ${coeCourses.length}`);
  const liveCoeIds = new Set(coeCourses.map((c) => c.id));

  for (const institutionId of targetIds) {
    const { data: localCourses, error: lcErr } = await sb
      .from('courses').select('id, course_code, coe_course_id, is_active').eq('institution_id', institutionId);
    if (lcErr) { console.log(`  ✗ local courses (${institutionId}): ${lcErr.message}`); totals.errors++; continue; }
    const localByCode = new Map((localCourses ?? []).map((c) => [c.course_code, c]));

    const rows = [];
    for (const c of coeCourses) {
      const existing = localByCode.get(c.course_code);
      const action = !existing ? 'create'
        : existing.coe_course_id === c.id ? 'already-linked' : 'link';
      if (action === 'create') totals.courses_create++;
      else if (action === 'link') totals.courses_link++;
      else totals.courses_already++;
      courseCsv.push([institutionId, institutionId, c.course_code, c.course_name ?? c.course_title ?? '', c.id, action]);
      rows.push({
        institution_id: institutionId,
        course_code: c.course_code,
        course_name: c.course_name ?? c.course_title ?? c.course_code,
        theory_hours: c.theory_hours ?? 0,
        practical_hours: c.practical_hours ?? 0,
        is_active: true,
        coe_course_id: c.id,
        coe_synced_at: stamp(),
      });
    }

    if (!dryRun && rows.length) {
      const { error } = await sb.from('courses').upsert(rows, { onConflict: 'institution_id,course_code' });
      if (error) { console.log(`  ✗ upsert courses (${institutionId}): ${error.message}`); totals.errors++; }
      else totals.courses_written += rows.length;
    }

    // soft-deactivate previously-mirrored courses no longer in COE
    const stale = (localCourses ?? []).filter((c) => c.coe_course_id && c.is_active && !liveCoeIds.has(c.coe_course_id));
    for (const s of stale) courseCsv.push([institutionId, institutionId, s.course_code, '', s.coe_course_id, 'soft-deactivate']);
    if (!dryRun && stale.length) {
      const { error } = await sb.from('courses')
        .update({ is_active: false, coe_synced_at: stamp() })
        .in('id', stale.map((s) => s.id));
      if (error) { console.log(`  ✗ soft-deactivate (${institutionId}): ${error.message}`); totals.errors++; }
      else totals.courses_deactivated += stale.length;
    } else { totals.courses_deactivated += stale.length; }
  }

  // ── Mappings (needs courses present; in dry-run, resolve against whatever exists) ──
  let coeMaps;
  try { coeMaps = await coeGet('/api/v1/course-mapping', { institutions_id: coe.id, is_active: 'true', details: 'false', limit: 2000 }); }
  catch (e) { console.log(`  ✗ COE course-mapping fetch failed: ${e.message}`); totals.errors++; continue; }
  console.log(`  COE mappings: ${coeMaps.length}`);

  for (const institutionId of targetIds) {
    const [{ data: programs }, { data: semesters }, { data: courses }] = await Promise.all([
      sb.from('programs').select('id, program_id, degree_id, department_id').eq('institution_id', institutionId),
      sb.from('semesters').select('id, program_id, semester_code').eq('institution_id', institutionId),
      sb.from('courses').select('id, course_code').eq('institution_id', institutionId),
    ]);
    const programByCode = new Map((programs ?? []).filter((p) => p.program_id).map((p) => [String(p.program_id), p]));
    const semByKey = new Map((semesters ?? []).filter((s) => s.program_id && s.semester_code).map((s) => [`${s.program_id}|${s.semester_code}`, s.id]));
    const courseByCode = new Map((courses ?? []).filter((c) => c.course_code).map((c) => [c.course_code, c.id]));

    const upserts = [];
    for (const m of coeMaps) {
      const pc = m.program_code ?? null, sc = m.semester_code ?? null, cc = m.course_code ?? null;
      let reason = null;
      let prog, semId, courseId;
      if (!pc || !sc || !cc) reason = 'incomplete COE row';
      else if (!(prog = programByCode.get(pc))) reason = 'program_code unmatched';
      else if (!(semId = semByKey.get(`${prog.id}|${sc}`))) reason = 'semester_code unmatched';
      else if (!(courseId = courseByCode.get(cc))) reason = 'course not mirrored';

      if (reason) {
        mapSkipCsv.push([institutionId, institutionId, pc ?? '', sc ?? '', cc ?? '', reason]);
        totals.mappings_skipped++;
        continue;
      }
      upserts.push({
        institution_id: institutionId,
        degree_id: prog.degree_id,
        department_id: prog.department_id,
        program_id: prog.id,
        semester_id: semId,
        course_id: courseId,
        is_active: true,
      });
    }

    if (!dryRun && upserts.length) {
      const { error } = await sb.from('course_mappings').upsert(upserts, {
        onConflict: 'institution_id,degree_id,department_id,program_id,semester_id,course_id',
      });
      if (error) { console.log(`  ✗ upsert mappings (${institutionId}): ${error.message}`); totals.errors++; }
      else totals.mappings_upserted += upserts.length;
    } else { totals.mappings_upserted += upserts.length; }
  }
}

// ── CSV output ─────────────────────────────────────────────────────────────────
const toCsv = (rows) => rows.map((r) => r.map((v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}).join(',')).join('\n');

const coursesFile = 'coe-backfill-courses.csv';
const skipsFile = 'coe-backfill-mapping-skips.csv';
writeFileSync(coursesFile, toCsv(courseCsv), 'utf8');
writeFileSync(skipsFile, toCsv(mapSkipCsv), 'utf8');

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n── Summary ──────────────────────────────────────────────────────────`);
console.log(`  Courses to create:        ${totals.courses_create}`);
console.log(`  Courses to link (code existed, relink coe_course_id): ${totals.courses_link}`);
console.log(`  Courses already linked:   ${totals.courses_already}`);
console.log(`  ${dryRun ? 'Would write' : 'Wrote'} course rows:    ${dryRun ? totals.courses_create + totals.courses_link + totals.courses_already : totals.courses_written}`);
console.log(`  ${dryRun ? 'Would soft-deactivate' : 'Soft-deactivated'}: ${totals.courses_deactivated}`);
console.log(`  ${dryRun ? 'Would upsert' : 'Upserted'} mappings: ${totals.mappings_upserted}`);
console.log(`  Mappings skipped (unresolved): ${totals.mappings_skipped}`);
if (totals.errors) console.log(`  Errors: ${totals.errors}`);
console.log(`\n  Reports written:`);
console.log(`    ${coursesFile}  (${courseCsv.length - 1} rows)`);
console.log(`    ${skipsFile}  (${mapSkipCsv.length - 1} rows)  ← review unresolved program/semester/course`);
if (dryRun) console.log('\n  Re-run without --dry-run to apply.');

process.exit(totals.errors === 0 ? 0 : 1);
