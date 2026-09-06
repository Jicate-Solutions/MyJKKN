/** Verifies the generated learner-detail PDF and XLSX against known totals. */
import fs from 'node:fs';
import zlib from 'node:zlib';
import ExcelJS from 'exceljs';

const PDF = process.argv[2];
const XLSX = process.argv[3];
let fail = 0;
const chk = (label, got, want) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}: ${got}${ok ? '' : ` (expected ${want})`}`);
};

// ── PDF text layer ──────────────────────────────────────────────────────────
const buf = fs.readFileSync(PDF);
const chunks = [];
let i = 0;
while (true) {
  const s = buf.indexOf('stream', i);
  if (s < 0) break;
  let p = s + 6;
  if (buf[p] === 13) p++;
  if (buf[p] === 10) p++;
  const e = buf.indexOf('endstream', p);
  if (e < 0) break;
  try { chunks.push(zlib.inflateSync(buf.subarray(p, e)).toString('latin1')); }
  catch { chunks.push(buf.subarray(p, e).toString('latin1')); }
  i = e + 9;
}
const all = chunks.join('\n');
const runs = [];
const re = /\(((?:\\.|[^\\()])*)\)/g;
let m;
while ((m = re.exec(all)) !== null) {
  const t = m[1].replace(/\\([()\\])/g, '$1');
  if (t.trim()) runs.push(t);
}
const joined = runs.join('\n');

console.log('PDF');
console.log(`  streams ${chunks.length}  text runs ${runs.length}`);
// jsPDF standard fonts are single-byte. Assert every drawn character is plain
// ASCII rather than testing for specific "bad" glyphs — an exotic literal in the
// test is itself a source of false positives.
const nonAscii = new Map();
for (const r of runs) {
  for (const ch of r) {
    const c = ch.charCodeAt(0);
    if (c > 126 || c < 9) nonAscii.set(c, (nonAscii.get(c) || 0) + 1);
  }
}
if (nonAscii.size) {
  console.log('        offending codepoints:', [...nonAscii.entries()]
    .map(([c, n]) => `U+${c.toString(16).padStart(4, '0')}(${n})`).join(' '));
}
chk('distinct non-ASCII codepoints in drawn text', nonAscii.size, 0);
for (const probe of [
  'Billed Value Against Fee Structure',
  'Institution summary',
  'Deviations from the fee structure',
  'VENNILA P',
  'Arts & Science (Self)',
  'Engineering & Technology',
  'Structure total',
  'Rs.'
]) {
  const ok = joined.includes(probe);
  if (!ok) fail++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  contains "${probe}"`);
}

// ── XLSX ────────────────────────────────────────────────────────────────────
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(XLSX);
console.log('\nXLSX');
console.log('  sheets:', wb.worksheets.map((w) => `${w.name}(${w.rowCount - 1})`).join(', '));

const totals = wb.getWorksheet('Learner Totals');
let expected = 0, billed = 0, paid = 0, bills = 0, rows = 0;
totals.eachRow((row, n) => {
  if (n === 1) return;
  rows++;
  bills += Number(row.getCell(9).value || 0);
  expected += Number(row.getCell(10).value || 0);
  billed += Number(row.getCell(11).value || 0);
  paid += Number(row.getCell(13).value || 0);
});
chk('Learner Totals rows', rows, 974);
chk('expected sum', Math.round(expected), 73965100);
chk('billed sum', Math.round(billed), 73973600);
chk('bills sum', bills, 3580);

const lines = wb.getWorksheet('Learner Fee Lines');
chk('Learner Fee Lines rows', lines.rowCount - 1, 3580);
let lineBilled = 0;
lines.eachRow((row, n) => { if (n > 1) lineBilled += Number(row.getCell(11).value || 0); });
chk('fee-line billed sum == learner billed sum', Math.round(lineBilled), 73973600);

// One row per (structure, fee head) — 101 structures, not one row per learner.
chk('Fee Structures rows', wb.getWorksheet('Fee Structures').rowCount - 1, 337);
chk('Deviations rows', wb.getWorksheet('Deviations').rowCount - 1, 3);
chk('Summary rows', wb.getWorksheet('Summary').rowCount - 1, 6);

console.log(fail === 0 ? '\nALL CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
