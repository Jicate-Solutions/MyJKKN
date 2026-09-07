#!/usr/bin/env node
/**
 * Conformance check: does every learner named in the Girls Hostel B / C
 * occupancy sheets now sit in the room that sheet gives them?
 *
 *   node --env-file=.env scripts/cl-girls-bc-sheet-conformance.mjs \
 *     "C:/path/Girls_hostel B.xlsx" "C:/path/Girls_hostel C.xlsx"
 *
 * ROOM-LEVEL, BY DESIGN. The sheet's room number is the instruction; its bed
 * number is not reliable — GHB R25 lists five different learners all on "Bed 1",
 * and where a named bed is held by another learner that learner keeps it and the
 * sheet learner goes to a free bed in the same room (operator decision,
 * 2026-09-07). So a row is CONFORMING when the learner is active in the right
 * block and room; a differing bed number is reported, not failed.
 *
 * Rows whose Email column is blank are matched by name within the row's
 * institution, and a name that matches more than one active learner is reported
 * as UNRESOLVED rather than guessed — guessing has previously attached five
 * Nursing learners to the wrong person.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const XLSX = require_('xlsx');

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error('Run with --env-file=.env'); process.exit(1); }
const files = process.argv.slice(2).filter((a) => a.endsWith('.xlsx'));
if (!files.length) { console.error('Pass the .xlsx paths as arguments.'); process.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/json' };
const pad = (v, n) => String(v ?? '-').padEnd(n).slice(0, n);
const lpad = (v, n) => String(v ?? '').padStart(n);
async function get(p) {
  const r = await fetch(`${URL_}/rest/v1/${p}`, { headers: H });
  const t = await r.text();
  if (!r.ok) throw new Error(`${p.slice(0, 110)} -> ${r.status} ${t.slice(0, 250)}`);
  return JSON.parse(t);
}
async function getIn(table, select, col, values, extra = '') {
  const uniq = [...new Set(values.filter(Boolean))];
  let out = [];
  for (let i = 0; i < uniq.length; i += 90) {
    out = out.concat(await get(`${table}?select=${encodeURIComponent(select)}&${col}=in.(${uniq.slice(i, i + 90).map((v) => `"${String(v).replace(/"/g, '')}"`).join(',')})${extra}`));
  }
  return out;
}
const index = (a, k) => Object.fromEntries(a.map((x) => [x[k], x]));
const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
const toks = (s) => new Set(norm(s).split(' ').filter((t) => t.length > 1));
// The initial is EVIDENCE, not noise. The sheet writes "<initial> <name>"
// (M KAVIYA); the database writes "<name> <initial>" (KAVIYA M). Tokenising on
// words of 2+ letters and discarding the rest is how "M KAVIYA" once matched
// "KAVIYA S" — a different person. Keep them apart.
const words = (s) => norm(s).split(' ').filter((t) => t.length > 1);
const inits = (s) => norm(s).split(' ').filter((t) => t.length === 1);
function nameAgrees(sheetName, dbName) {
  const w = words(sheetName), fw = words(dbName), fi = inits(dbName);
  if (!w.length || !w.every((x) => fw.includes(x))) return false;
  return inits(sheetName).every((c) => fi.includes(c) || fw.some((x) => !w.includes(x) && x[0] === c));
}

const rows = [];
for (const f of files) {
  const wb = XLSX.readFile(f);
  for (const r of XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null, raw: false })) rows.push(r);
}

const BCODE = { 'Girls Hostel A': 'GHA', 'Girls Hostel B': 'GHB', 'Girls Hostel C': 'GHC' };
const INSTHINT = { 'JKKN Nursing College and Hospital': 'Nursing', 'JKKN College of Pharmacy': 'Pharmacy',
  'JKKN Dental College and Hospital': 'Dental', 'JKKN College of Allied Science': 'Allied' };

const [blocks, institutions] = await Promise.all([
  get('hostel_blocks?select=id,name,code,hostel_type'),
  get('institutions?select=id,name'),
]);
const blockByCode = index(blocks, 'code'); const blockById = index(blocks, 'id');
const ghIds = blocks.filter((b) => b.hostel_type === 'girls').map((b) => b.id);
const rooms = await getIn('hostel_rooms', 'id,block_id,room_number', 'block_id', ghIds);
const roomById = index(rooms, 'id');
const beds = await getIn('hostel_beds', 'id,room_id,bed_number', 'room_id', rooms.map((r) => r.id));
const bedById = index(beds, 'id');

const emails = rows.map((r) => (r.Email || '').trim().toLowerCase()).filter(Boolean);
const profs = await getIn('profiles', 'id,email,full_name,learner_id', 'email', emails);
const profByEmail = Object.fromEntries(profs.map((p) => [(p.email || '').toLowerCase(), p]));

// Name-match pool for the blank-email rows: active learners at the institutions those rows name.
const wantInst = [...new Set(rows.filter((r) => !r.Email).map((r) => {
  const hint = INSTHINT[r.Institution];
  return hint ? institutions.find((i) => i.name.includes(hint))?.id : null;
}).filter(Boolean))];
let pool = [];
for (const id of wantInst) {
  // fn_cl_roster_statuses() is {active, reserved, admitted} — an admitted
  // learner can legitimately hold a bed, so an active-only pool reports real
  // residents as "no such learner".
  pool = pool.concat(await get(`learners_profiles?select=id,first_name,last_name&institution_id=eq.${id}&lifecycle_status=in.(active,reserved,admitted)`));
}
let poolProf = [];
for (let i = 0; i < pool.length; i += 90) {
  poolProf = poolProf.concat(await getIn('profiles', 'id,full_name,learner_id', 'learner_id', pool.slice(i, i + 90).map((p) => p.id)));
}
const profByLp = index(poolProf, 'learner_id');

// Every live girls-hostel allocation, so a learner can be located wherever she is.
let live = [];
for (const id of ghIds) live = live.concat(await get(`hostel_allocations?select=id,learner_id,block_id,room_id,bed_id,check_out_date&status=eq.active&block_id=eq.${id}`));
live = live.filter((a) => !a.check_out_date);
const allocByProfile = index(live, 'learner_id');
let liveProf = [];
for (let i = 0; i < live.length; i += 90) liveProf = liveProf.concat(await getIn('profiles', 'id,full_name', 'id', live.slice(i, i + 90).map((a) => a.learner_id)));
const liveProfById = index(liveProf, 'id');
const occByBed = Object.fromEntries(live.map((a) => [a.bed_id, a]));

const out = [];
for (const r of rows) {
  const sheetBlock = BCODE[r.Block];
  const sheetRoom = String(r.Room ?? '').trim();
  const sheetBed = String(r.Bed ?? '').trim();
  const rec = { name: (r.Learner || '').trim(), block: sheetBlock, room: sheetRoom, bed: sheetBed };
  let prof = r.Email ? profByEmail[(r.Email || '').trim().toLowerCase()] : null;

  if (!prof) {
    // Strongest evidence first: whoever actually occupies the sheet's exact bed,
    // if their name agrees. That is how the already-correct blank-email rows resolve.
    const rm = rooms.find((x) => x.block_id === blockByCode[sheetBlock]?.id && String(x.room_number) === sheetRoom);
    const bd = rm ? beds.find((b) => b.room_id === rm.id && String(b.bed_number) === sheetBed) : null;
    const occ = bd ? occByBed[bd.id] : null;
    const occName = occ ? liveProfById[occ.learner_id]?.full_name : null;
    if (occName && nameAgrees(rec.name, occName)) {
      prof = { id: occ.learner_id, full_name: occName };
    } else {
      const cands = pool.filter((lp) => nameAgrees(rec.name, `${lp.first_name || ''} ${lp.last_name || ''}`));
      if (cands.length === 1 && profByLp[cands[0].id]) prof = profByLp[cands[0].id];
      else { rec.status = cands.length ? `UNRESOLVED (${cands.length} same-name candidates)` : 'UNRESOLVED (no candidate)'; out.push(rec); continue; }
    }
  }

  const a = allocByProfile[prof.id];
  rec.dbName = prof.full_name;
  if (!a) { rec.status = 'NOT ALLOCATED'; out.push(rec); continue; }
  rec.at = `${blockById[a.block_id]?.code} R${roomById[a.room_id]?.room_number} B${bedById[a.bed_id]?.bed_number}`;
  const roomOk = blockById[a.block_id]?.code === sheetBlock && String(roomById[a.room_id]?.room_number) === sheetRoom;
  const bedOk = String(bedById[a.bed_id]?.bed_number) === sheetBed;
  rec.status = !roomOk ? 'WRONG ROOM' : bedOk ? 'EXACT' : 'ROOM OK (different bed)';
  out.push(rec);
}

const tally = {};
for (const o of out) tally[o.status] = (tally[o.status] || 0) + 1;
console.log(`SHEET CONFORMANCE — ${out.length} rows across ${files.length} file(s)\n`);
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${lpad(v, 4)}  ${k}`);

const notes = out.filter((o) => o.status !== 'EXACT');
if (notes.length) {
  console.log('\nROWS THAT ARE NOT AN EXACT BED MATCH');
  console.log(`  ${pad('sheet name', 24)}${pad('sheet says', 18)}${pad('actually at', 18)}${'status'}`);
  for (const o of notes) console.log(`  ${pad(o.name, 24)}${pad(`${o.block} R${o.room} B${o.bed}`, 18)}${pad(o.at, 18)}${o.status}`);
}
const placed = out.filter((o) => o.status === 'EXACT' || o.status === 'ROOM OK (different bed)').length;
console.log(`\n  ${placed} of ${out.length} sheet rows are in the room the sheet asks for.`);
