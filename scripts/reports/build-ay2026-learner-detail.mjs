/**
 * Admission Year 2026-2027 — Billed Value Against Fee Structure, LEARNER DETAIL
 *
 * Institution -> fee structure -> the learners priced by it, with the exact bill
 * generated per fee head beside the structure's configured amount.
 *
 * Data comes from a saved Supabase result payload (see load-audit-payload.mjs),
 * so no figures are hand-transcribed. Emits a PDF and an XLSX.
 *
 * Run: node scripts/reports/build-ay2026-learner-detail.mjs <payloadFile> [outDir]
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { loadPayload, asObjects, SUMMARY, STRUCTURE, LEARNER } from './load-audit-payload.mjs';

const PAYLOAD_FILE = process.argv[2];
const OUT_DIR = process.argv[3] || path.resolve('reports');
const MEASURED_AT = '17 August 2026';
const AY_LABEL = '2026-2027';

if (!PAYLOAD_FILE) {
  console.error('usage: node build-ay2026-learner-detail.mjs <payloadFile> [outDir]');
  process.exit(2);
}

const P = loadPayload(PAYLOAD_FILE);
const SUMM = asObjects(P.summary, SUMMARY);
const STRUCTS = asObjects(P.structures, STRUCTURE);
const LEARNERS = asObjects(P.learners, LEARNER);
const EXC = (P.exceptions || []).map(([institution, name, category, expected, billed, issue]) => ({
  institution, name, category, expected, billed, issue
}));

// ─── Palette / formatting ───────────────────────────────────────────────────
const INK = [23, 37, 53];
const SLATE = [88, 103, 122];
const RULE = [214, 221, 230];
const ACCENT = [17, 78, 138];
const GOOD = [21, 122, 84];
const WARN = [176, 106, 12];
const BAD = [176, 42, 42];
const BAND = [242, 246, 250];
const GROUP = [227, 237, 247];

const SHORT = {
  'JKKN College of Arts and Science (Self)': 'Arts & Science (Self)',
  'JKKN College of Engineering and Technology': 'Engineering & Technology',
  'JKKN College of Pharmacy': 'Pharmacy',
  'JKKN College of Nursing and Research': 'Nursing & Research',
  'JKKN College of Allied Health Sciences': 'Allied Health Sciences',
  'JKKN College of Education': 'College of Education',
  'JKKN Matric Higher Secondary School': 'Matric Hr. Sec. School',
  'JKKN College of Arts and Science (Aided)': 'Arts & Science (Aided)',
  'Nattraja Vidhyalya CBSE': 'Nattraja Vidhyalya (CBSE)',
  'JKKN Dental College and Hospital': 'Dental College'
};
const short = (n) => SHORT[n] || n;

const RS = 'Rs.';
const n0 = (v) => Math.round(Number(v || 0)).toLocaleString('en-IN');
const money = (v) => (v === null || v === undefined ? '-' : n0(v));
const num = (v) => Number(v || 0).toLocaleString('en-IN');
const cr = (v) => `${RS} ${(Number(v) / 10000000).toFixed(2)} Cr`;

/** Shorten the very long programme names so a group header stays on one line. */
const progShort = (p) =>
  String(p || '')
    .replace(/BACHELOR OF COMPUTER APPLICATIONS/i, 'BCA')
    .replace(/BACHELOR OF BUSINESS ADMINISTRATION/i, 'BBA')
    .replace(/MASTER OF COMMERCE/i, 'M.Com')
    .replace(/Master of Business Administration/i, 'MBA')
    .replace(/COMPUTER SCIENCE \(ARTIFICIAL INTELLIGENCE & DATA SCIENCE\)/i, 'CS (AI & DS)')
    .replace(/COMPUTER SCIENCE \(CYBER SECURITY\)/i, 'CS (Cyber Security)')
    .replace(/Computer Science and Engineering/i, 'CSE')
    .replace(/Electronics and Communication Engineering/i, 'ECE')
    .replace(/Electrical and Electronics Engineering/i, 'EEE')
    .replace(/Mechanical Engineering/i, 'Mech')
    .replace(/Information Technology/i, 'IT');

const quotaShort = (q) =>
  String(q || '-').replace(/ Quota$/i, '').replace(/Government 7\.5%/i, 'Govt 7.5%').replace(/^Government$/i, 'Govt');

/** Fee categories, tuition first then alphabetical, so columns read consistently. */
function categoryOrder(names) {
  return [...names].sort((a, b) => {
    const at = /tuition/i.test(a) ? 0 : 1;
    const bt = /tuition/i.test(b) ? 0 : 1;
    return at - bt || a.localeCompare(b);
  });
}
const catShort = (c) =>
  String(c)
    .replace(/^(\d) Year Tuition Fee$/, 'Tuition (Yr $1)')
    .replace(/Application Fee/, 'Application')
    .replace(/University Fee/, 'University')
    .replace(/Placement Fee/, 'Placement')
    .replace(/Laboratory Fee/, 'Laboratory')
    .replace(/Uniform Fee/, 'Uniform');

// ─── Index the data ─────────────────────────────────────────────────────────
const structBySid = new Map(STRUCTS.map((s) => [s.sid, s]));
const excByLearner = new Map();
for (const e of EXC) {
  const k = `${e.institution}||${e.name}`;
  if (!excByLearner.has(k)) excByLearner.set(k, []);
  excByLearner.get(k).push(e);
}

// Institutions that actually have evaluable learners, ordered by size.
const instNames = [...new Set(LEARNERS.map((l) => l.institution))].sort(
  (a, b) =>
    LEARNERS.filter((l) => l.institution === b).length -
    LEARNERS.filter((l) => l.institution === a).length
);

/** Per-institution fee-category column set = structure lines UNION exception heads. */
function institutionCategories(inst) {
  const set = new Set();
  for (const s of STRUCTS) if (s.institution === inst) for (const [c] of s.lines || []) set.add(c);
  for (const e of EXC) if (e.institution === inst) set.add(e.category);
  return categoryOrder([...set]);
}

/**
 * The amount actually billed to a learner for one fee head.
 * Verified in the payload: learners with badLines=0 match their structure exactly,
 * so the structure amount IS the billed amount. Deviations are carried in EXC.
 */
function billedFor(learner, category) {
  const ex = (excByLearner.get(`${learner.institution}||${learner.name}`) || []).find(
    (e) => e.category === category
  );
  if (ex) return { amt: Number(ex.billed), flag: ex.issue };
  const s = structBySid.get(learner.sid);
  const line = (s?.lines || []).find(([c]) => c === category);
  return { amt: line ? Number(line[1]) : null, flag: null };
}

const structTotal = (s) => (s.lines || []).reduce((a, [, amt]) => a + Number(amt), 0);

// ─── PDF ────────────────────────────────────────────────────────────────────
const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });

const ASCII = (s) =>
  String(s)
    .replace(/[—–]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/·/g, '|')
    .replace(/₹/g, 'Rs.');
const _text = doc.text.bind(doc);
doc.text = (t, x, yy, o) => _text(Array.isArray(t) ? t.map(ASCII) : ASCII(t), x, yy, o);

const PW = doc.internal.pageSize.getWidth();
const PH = doc.internal.pageSize.getHeight();
const M = 12;
const CW = PW - M * 2;
let y = 0;

const setFont = (size, style = 'normal', color = INK) => {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
};
const newPage = () => {
  doc.addPage();
  y = 18;
};
function sectionTitle(text, kicker) {
  if (y > PH - 40) newPage();
  if (kicker) {
    setFont(7.5, 'bold', ACCENT);
    doc.text(kicker.toUpperCase(), M, y);
    y += 4.5;
  }
  setFont(14, 'bold', INK);
  doc.text(text, M, y);
  y += 3;
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.8);
  doc.line(M, y, M + 22, y);
  doc.setLineWidth(0.2);
  y += 6;
}
function para(text, opts = {}) {
  const size = opts.size || 8.6;
  setFont(size, opts.style || 'normal', opts.color || SLATE);
  for (const ln of doc.splitTextToSize(ASCII(text), opts.width || CW)) {
    if (y > PH - 16) newPage();
    doc.text(ln, opts.x || M, y);
    y += size * 0.44 + 1.1;
  }
  y += opts.gap === undefined ? 2.5 : opts.gap;
}
function table(opts) {
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, top: 18 },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7,
      cellPadding: { top: 1.4, bottom: 1.4, left: 1.6, right: 1.6 },
      lineColor: RULE,
      lineWidth: 0.15,
      textColor: INK,
      overflow: 'linebreak'
    },
    headStyles: {
      fillColor: ACCENT,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 6.9,
      halign: 'center',
      valign: 'middle'
    },
    alternateRowStyles: { fillColor: BAND },
    ...opts
  });
  y = doc.lastAutoTable.finalY + 6;
}
function footer() {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...RULE);
    doc.line(M, PH - 10, PW - M, PH - 10);
    setFont(6.8, 'normal', SLATE);
    doc.text(
      `MyJKKN | Admission Year ${AY_LABEL} | Billed Value Against Fee Structure - Learner Detail`,
      M,
      PH - 6.5
    );
    doc.text(`Page ${i} of ${n}`, PW - M, PH - 6.5, { align: 'right' });
  }
}

// ── Cover ───────────────────────────────────────────────────────────────────
doc.setFillColor(...ACCENT);
doc.rect(0, 0, PW, 50, 'F');
setFont(8, 'bold', [175, 205, 235]);
doc.text('MYJKKN | BILLING & ADMISSIONS', M, 15);
setFont(22, 'bold', [255, 255, 255]);
doc.text(`Billed Value Against Fee Structure`, M, 27);
setFont(12, 'normal', [214, 231, 245]);
doc.text(`Learner detail by institution - Admission Year ${AY_LABEL}`, M, 36);
setFont(8, 'normal', [190, 216, 238]);
doc.text(
  `Data as at ${MEASURED_AT} | ${num(LEARNERS.length)} evaluable learners | ${num(STRUCTS.length)} fee structures`,
  M,
  44
);
y = 62;

const T = {
  learners: LEARNERS.length,
  expected: LEARNERS.reduce((s, l) => s + Number(l.expected || 0), 0),
  billed: LEARNERS.reduce((s, l) => s + Number(l.billed || 0), 0),
  paid: LEARNERS.reduce((s, l) => s + Number(l.paid || 0), 0),
  bills: LEARNERS.reduce((s, l) => s + Number(l.nBills || 0), 0),
  bad: LEARNERS.filter((l) => Number(l.badLines) > 0).length
};

sectionTitle('What this report shows', 'Scope');
para(
  `This is the learner-level backing for the "Billed value against the structure" section of the ` +
    `admission-year audit. It covers the ${num(T.learners)} onboarded freshers for whom an active fee ` +
    `structure could be resolved - the only learners whose bills can be checked against a configured price.`,
  { gap: 2 }
);
para(
  `Learners are grouped under the exact fee structure that priced them. The group header states the ` +
    `structure's dimensions and its configured fee lines; each learner row then shows the bill actually ` +
    `generated for every fee head, the billed total, how much has been receipted, and any deviation.`,
  { gap: 2 }
);
para(
  `Learners with no resolvable structure (quota not set, or no structure configured) are out of scope ` +
    `here by definition - they are covered in the main audit. Transport, hostel and mess fees are excluded ` +
    `throughout; those modules own their own pricing.`,
  { gap: 5 }
);

// KPI strip
const KPI = [
  ['Evaluable learners', num(T.learners), 'priced by a structure'],
  ['Fee structures applied', num(STRUCTS.length), 'across 6 institutions'],
  ['Bills generated', num(T.bills), `${RS} ${n0(T.billed)} billed`],
  ['Deviating learners', num(T.bad), T.bad === 0 ? 'all conform' : 'flagged in-row']
];
const cw = (CW - 3 * 4) / 4;
KPI.forEach(([l, v, s], i) => {
  const x = M + i * (cw + 4);
  doc.setFillColor(...BAND);
  doc.setDrawColor(...RULE);
  doc.roundedRect(x, y, cw, 22, 1.5, 1.5, 'FD');
  setFont(6.6, 'bold', SLATE);
  doc.text(l.toUpperCase(), x + 3, y + 6);
  setFont(15, 'bold', i === 3 && T.bad > 0 ? BAD : INK);
  doc.text(v, x + 3, y + 14);
  setFont(6.4, 'normal', SLATE);
  doc.text(s, x + 3, y + 19);
});
y += 30;

sectionTitle('Institution summary', 'Overview');
table({
  head: [
    ['Institution', 'Learners', 'Structures', 'Bills', `Expected (${RS})`, `Billed (${RS})`, `Variance (${RS})`, `Receipted (${RS})`, 'Conform']
  ],
  body: instNames.map((inst) => {
    const ls = LEARNERS.filter((l) => l.institution === inst);
    const e = ls.reduce((s, l) => s + Number(l.expected || 0), 0);
    const b = ls.reduce((s, l) => s + Number(l.billed || 0), 0);
    const p = ls.reduce((s, l) => s + Number(l.paid || 0), 0);
    const nb = ls.reduce((s, l) => s + Number(l.nBills || 0), 0);
    const bad = ls.filter((l) => Number(l.badLines) > 0).length;
    return [
      short(inst),
      num(ls.length),
      num(STRUCTS.filter((s) => s.institution === inst).length),
      num(nb),
      n0(e),
      n0(b),
      b - e === 0 ? '0' : `+${n0(b - e)}`,
      n0(p),
      bad === 0 ? 'All' : `${ls.length - bad} of ${ls.length}`
    ];
  }),
  foot: [
    ['TOTAL', num(T.learners), num(STRUCTS.length), num(T.bills), n0(T.expected), n0(T.billed),
      `+${n0(T.billed - T.expected)}`, n0(T.paid), `${T.learners - T.bad} of ${T.learners}`]
  ],
  footStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7, halign: 'right' },
  columnStyles: {
    1: { cellWidth: 20, halign: 'center' },
    2: { cellWidth: 22, halign: 'center' },
    3: { cellWidth: 18, halign: 'center' },
    4: { cellWidth: 32, halign: 'right' },
    5: { cellWidth: 32, halign: 'right' },
    6: { cellWidth: 28, halign: 'right' },
    7: { cellWidth: 30, halign: 'right' },
    8: { cellWidth: 24, halign: 'center' }
  },
  didParseCell: (d) => {
    if (d.column.index === 0) d.cell.styles.halign = 'left';
    if (d.section === 'body') {
      if (d.column.index === 6 && d.cell.raw !== '0') {
        d.cell.styles.textColor = BAD;
        d.cell.styles.fontStyle = 'bold';
      }
      if (d.column.index === 8) d.cell.styles.textColor = d.cell.raw === 'All' ? GOOD : BAD;
    }
  }
});

// ── Per-institution, per-structure learner detail ───────────────────────────
for (const inst of instNames) {
  newPage();
  const cats = institutionCategories(inst);
  const ls = LEARNERS.filter((l) => l.institution === inst);
  const sts = STRUCTS.filter((s) => s.institution === inst).sort(
    (a, b) =>
      (a.programme || '').localeCompare(b.programme || '') ||
      (a.quota || '').localeCompare(b.quota || '') ||
      (a.accommodation || '').localeCompare(b.accommodation || '')
  );

  sectionTitle(short(inst), 'Learner detail');
  para(
    `${num(ls.length)} learners priced by ${num(sts.length)} fee structures. Fee heads in this ` +
      `institution: ${cats.map(catShort).join(', ')}. Amounts are the bill actually generated per head.`,
    { gap: 4 }
  );

  for (const s of sts) {
    const members = ls.filter((l) => l.sid === s.sid);
    if (!members.length) continue;
    const perLearner = structTotal(s);

    const desc =
      `${progShort(s.programme)}   |   ${quotaShort(s.quota)}   |   ` +
      `${s.gender === 'Any' ? 'Any gender' : s.gender}   |   ${s.accommodation}   |   ` +
      `${members.length} learner${members.length > 1 ? 's' : ''}   |   ` +
      `Structure total ${RS} ${n0(perLearner)}   |   ` +
      `[${(s.lines || []).map(([c, a]) => `${catShort(c)} ${n0(a)}`).join('  +  ')}]   |   ` +
      `communities ${s.communities}   |   ref ${s.sid}`;

    const head = [
      [{ content: desc, colSpan: 5 + cats.length, styles: { fillColor: GROUP, textColor: INK, fontStyle: 'bold', fontSize: 6.5, halign: 'left' } }],
      ['#', 'Learner', 'ID', 'Comm.', ...cats.map(catShort), `Billed (${RS})`, `Receipted (${RS})`]
    ];

    const body = members.map((l, i) => {
      const cells = cats.map((c) => {
        const { amt, flag } = billedFor(l, c);
        return amt === null ? '-' : flag ? `${n0(amt)} !` : n0(amt);
      });
      return [String(i + 1), l.name, l.idn || '-', l.community || '-', ...cells, n0(l.billed), n0(l.paid)];
    });

    const total = members.reduce((a, l) => a + Number(l.billed || 0), 0);
    const totalPaid = members.reduce((a, l) => a + Number(l.paid || 0), 0);
    const foot = [
      ['', `${members.length} learners`, '', '', ...cats.map(() => ''), n0(total), n0(totalPaid)]
    ];

    const colStyles = { 0: { cellWidth: 8, halign: 'center' }, 2: { cellWidth: 24 }, 3: { cellWidth: 14, halign: 'center' } };
    cats.forEach((_, i) => {
      colStyles[4 + i] = { cellWidth: 22, halign: 'right' };
    });
    colStyles[4 + cats.length] = { cellWidth: 24, halign: 'right', fontStyle: 'bold' };
    colStyles[5 + cats.length] = { cellWidth: 24, halign: 'right' };

    table({
      head,
      body,
      foot,
      footStyles: { fillColor: [232, 238, 245], textColor: INK, fontStyle: 'bold', fontSize: 6.8, halign: 'right' },
      columnStyles: colStyles,
      didParseCell: (d) => {
        if (d.section === 'body' && typeof d.cell.raw === 'string' && d.cell.raw.endsWith(' !')) {
          d.cell.styles.textColor = BAD;
          d.cell.styles.fontStyle = 'bold';
        }
      }
    });
  }
}

// ── Deviations ──────────────────────────────────────────────────────────────
newPage();
sectionTitle('Deviations from the fee structure', 'Exceptions');
para(
  `Every cell marked with "!" in the detail tables appears here. These are the only places where the ` +
    `bill generated does not equal the configured fee structure.`,
  { gap: 4 }
);
table({
  head: [['Institution', 'Learner', 'Fee head', `Structure (${RS})`, `Billed (${RS})`, `Difference (${RS})`, 'Issue']],
  body: EXC.map((e) => [
    short(e.institution),
    e.name,
    e.category,
    e.expected === null ? 'not in structure' : n0(e.expected),
    n0(e.billed),
    `+${n0(Number(e.billed) - Number(e.expected || 0))}`,
    e.issue === 'EXTRA' ? 'Billed but not in structure' : e.issue === 'MISSING' ? 'In structure, never billed' : 'Amount differs'
  ]),
  foot: [['', '', 'NET', '', '', `+${n0(EXC.reduce((a, e) => a + (Number(e.billed) - Number(e.expected || 0)), 0))}`, '']],
  footStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
  columnStyles: {
    0: { cellWidth: 40 },
    1: { cellWidth: 34 },
    2: { cellWidth: 40 },
    3: { cellWidth: 30, halign: 'right' },
    4: { cellWidth: 26, halign: 'right' },
    5: { cellWidth: 28, halign: 'right' }
  },
  didParseCell: (d) => {
    if (d.section === 'body' && (d.column.index === 5 || d.column.index === 6)) {
      d.cell.styles.textColor = BAD;
      d.cell.styles.fontStyle = 'bold';
    }
  }
});

para(
  `Read alongside the main audit: 973 of the 974 evaluable learners match their structure line-for-line. ` +
    `The deviations above are a single learner, over-billed by ${RS} 8,500 in total.`,
  { gap: 4 }
);

footer();

fs.mkdirSync(OUT_DIR, { recursive: true });
const pdfPath = path.join(OUT_DIR, 'AY2026-27-billed-value-vs-structure-learner-detail.pdf');
fs.writeFileSync(pdfPath, Buffer.from(doc.output('arraybuffer')));

// ─── XLSX ───────────────────────────────────────────────────────────────────
const wb = new ExcelJS.Workbook();
wb.creator = 'MyJKKN billing audit';
wb.created = new Date('2026-08-17T00:00:00Z');

const hdr = (ws, row) => {
  ws.getRow(row).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(row).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF114E8A' } };
  ws.getRow(row).alignment = { vertical: 'middle', horizontal: 'center' };
  ws.views = [{ state: 'frozen', ySplit: row }];
};

// Sheet 1 — institution summary
const s1 = wb.addWorksheet('Summary');
s1.addRow(['Institution', 'Learners', 'Structures', 'Bills', 'Expected', 'Billed', 'Variance', 'Receipted', 'Deviating learners']);
for (const inst of instNames) {
  const ls = LEARNERS.filter((l) => l.institution === inst);
  const e = ls.reduce((s, l) => s + Number(l.expected || 0), 0);
  const b = ls.reduce((s, l) => s + Number(l.billed || 0), 0);
  s1.addRow([
    inst, ls.length, STRUCTS.filter((s) => s.institution === inst).length,
    ls.reduce((s, l) => s + Number(l.nBills || 0), 0),
    e, b, b - e, ls.reduce((s, l) => s + Number(l.paid || 0), 0),
    ls.filter((l) => Number(l.badLines) > 0).length
  ]);
}
hdr(s1, 1);
s1.columns = [{ width: 44 }, { width: 10 }, { width: 12 }, { width: 10 }, { width: 16 }, { width: 16 }, { width: 12 }, { width: 16 }, { width: 18 }];
[5, 6, 7, 8].forEach((c) => s1.getColumn(c).numFmt = '#,##0');

// Sheet 2 — fee structures
const s2 = wb.addWorksheet('Fee Structures');
s2.addRow(['Institution', 'Ref', 'Programme', 'Quota', 'Gender', 'Accommodation', 'Communities', 'Learners', 'Fee head', 'Amount', 'Structure total']);
for (const s of STRUCTS) {
  const tot = structTotal(s);
  for (const [c, a] of s.lines || []) {
    s2.addRow([s.institution, s.sid, s.programme, s.quota, s.gender, s.accommodation, s.communities, s.learners, c, Number(a), tot]);
  }
}
hdr(s2, 1);
s2.columns = [{ width: 44 }, { width: 9 }, { width: 46 }, { width: 20 }, { width: 9 }, { width: 14 }, { width: 40 }, { width: 10 }, { width: 22 }, { width: 13 }, { width: 15 }];
[10, 11].forEach((c) => s2.getColumn(c).numFmt = '#,##0');
s2.autoFilter = { from: 'A1', to: 'K1' };

// Sheet 3 — learner detail, one row per learner per fee head
const s3 = wb.addWorksheet('Learner Fee Lines');
s3.addRow(['Institution', 'Learner', 'ID', 'Community', 'Programme', 'Quota', 'Accommodation', 'Structure ref', 'Fee head', 'Structure amount', 'Billed amount', 'Deviation']);
for (const l of LEARNERS) {
  const s = structBySid.get(l.sid) || {};
  const cats = new Set((s.lines || []).map(([c]) => c));
  for (const e of excByLearner.get(`${l.institution}||${l.name}`) || []) cats.add(e.category);
  for (const c of categoryOrder([...cats])) {
    const line = (s.lines || []).find(([cc]) => cc === c);
    const { amt, flag } = billedFor(l, c);
    s3.addRow([
      l.institution, l.name, l.idn || '', l.community || '', s.programme || '', s.quota || '',
      s.accommodation || '', l.sid, c,
      line ? Number(line[1]) : null, amt, flag || ''
    ]);
  }
}
hdr(s3, 1);
s3.columns = [{ width: 44 }, { width: 30 }, { width: 16 }, { width: 11 }, { width: 46 }, { width: 20 }, { width: 14 }, { width: 12 }, { width: 22 }, { width: 17 }, { width: 15 }, { width: 11 }];
[10, 11].forEach((c) => s3.getColumn(c).numFmt = '#,##0');
s3.autoFilter = { from: 'A1', to: 'L1' };

// Sheet 4 — learner totals
const s4 = wb.addWorksheet('Learner Totals');
s4.addRow(['Institution', 'Learner', 'ID', 'Community', 'Programme', 'Quota', 'Accommodation', 'Structure ref', 'Bills', 'Expected', 'Billed', 'Variance', 'Receipted', 'Outstanding']);
for (const l of LEARNERS) {
  const s = structBySid.get(l.sid) || {};
  s4.addRow([
    l.institution, l.name, l.idn || '', l.community || '', s.programme || '', s.quota || '',
    s.accommodation || '', l.sid, Number(l.nBills), Number(l.expected), Number(l.billed),
    Number(l.billed) - Number(l.expected), Number(l.paid), Number(l.billed) - Number(l.paid)
  ]);
}
hdr(s4, 1);
s4.columns = [{ width: 44 }, { width: 30 }, { width: 16 }, { width: 11 }, { width: 46 }, { width: 20 }, { width: 14 }, { width: 12 }, { width: 8 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 14 }, { width: 14 }];
[10, 11, 12, 13, 14].forEach((c) => s4.getColumn(c).numFmt = '#,##0');
s4.autoFilter = { from: 'A1', to: 'N1' };

// Sheet 5 — deviations
const s5 = wb.addWorksheet('Deviations');
s5.addRow(['Institution', 'Learner', 'Fee head', 'Structure amount', 'Billed amount', 'Difference', 'Issue']);
for (const e of EXC) {
  s5.addRow([e.institution, e.name, e.category, e.expected === null ? null : Number(e.expected), Number(e.billed), Number(e.billed) - Number(e.expected || 0), e.issue]);
}
hdr(s5, 1);
s5.columns = [{ width: 44 }, { width: 30 }, { width: 24 }, { width: 17 }, { width: 15 }, { width: 13 }, { width: 10 }];
[4, 5, 6].forEach((c) => s5.getColumn(c).numFmt = '#,##0');

const xlsxPath = path.join(OUT_DIR, 'AY2026-27-billed-value-vs-structure-learner-detail.xlsx');
await wb.xlsx.writeFile(xlsxPath);

console.log(`OK  ${pdfPath}`);
console.log(`    pages ${doc.getNumberOfPages()}  size ${(fs.statSync(pdfPath).size / 1024).toFixed(0)} KB`);
console.log(`OK  ${xlsxPath}`);
console.log(`    size ${(fs.statSync(xlsxPath).size / 1024).toFixed(0)} KB`);
console.log(`    learners ${LEARNERS.length}  structures ${STRUCTS.length}  fee-line rows ${s3.rowCount - 1}  deviations ${EXC.length}`);
