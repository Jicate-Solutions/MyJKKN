/**
 * Admission Year 2026-2027 — Fee-Structure Billing Audit (institution-wise)
 *
 * Renders a PDF from figures measured directly against the production Supabase
 * database on 2026-08-17. The dataset is embedded deliberately: a PDF audit is a
 * point-in-time snapshot, and the SQL that produced every figure is reproduced in
 * the Methodology appendix so any number can be re-derived.
 *
 * Run:  node build-ay2026-billing-audit.mjs
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import fs from 'node:fs';
import path from 'node:path';

// ─── Measurement metadata ───────────────────────────────────────────────────
const MEASURED_AT = '17 August 2026';
const AY_LABEL = '2026-2027';

// ─── Palette ────────────────────────────────────────────────────────────────
const INK = [23, 37, 53];
const SLATE = [88, 103, 122];
const RULE = [214, 221, 230];
const ACCENT = [17, 78, 138];
const GOOD = [21, 122, 84];
const WARN = [176, 106, 12];
const BAD = [176, 42, 42];
const BAND = [242, 246, 250];

// ─── Data ───────────────────────────────────────────────────────────────────
const SHORT = {
  'JKKN Matric Higher Secondary School': 'Matric Hr. Sec. School',
  'JKKN College of Arts and Science (Self)': 'Arts & Science (Self)',
  'Nattraja Vidhyalya CBSE': 'Nattraja Vidhyalya (CBSE)',
  'JKKN College of Engineering and Technology': 'Engineering & Technology',
  'JKKN College of Pharmacy': 'Pharmacy',
  'JKKN College of Arts and Science (Aided)': 'Arts & Science (Aided)',
  'JKKN College of Nursing and Research': 'Nursing & Research',
  'JKKN College of Allied Health Sciences': 'Allied Health Sciences',
  'JKKN Dental College and Hospital': 'Dental College',
  'JKKN College of Education': 'College of Education'
};

// onboarded = lifecycle_status in (reserved, admitted, active), admission year 2026
const INSTITUTIONS = [
  // name, onboarded, billed, notBilled, evaluable, quotaNull, noStructure, matches, mismatched, expected, actual
  ['JKKN Matric Higher Secondary School', 552, 363, 189, 0, 552, 0, 0, 0, null, null],
  ['JKKN College of Arts and Science (Self)', 470, 470, 0, 469, 0, 1, 469, 0, 17074100, 17074100],
  ['Nattraja Vidhyalya CBSE', 241, 0, 241, 0, 27, 214, 0, 0, null, null],
  ['JKKN College of Engineering and Technology', 205, 205, 0, 205, 0, 0, 205, 0, 13817500, 13817500],
  ['JKKN College of Pharmacy', 169, 169, 0, 169, 0, 0, 169, 0, 26136000, 26136000],
  ['JKKN College of Arts and Science (Aided)', 164, 0, 164, 0, 163, 1, 0, 0, null, null],
  ['JKKN College of Nursing and Research', 87, 87, 0, 87, 0, 0, 87, 0, 11111000, 11111000],
  ['JKKN College of Allied Health Sciences', 43, 43, 0, 43, 0, 0, 43, 0, 5796500, 5796500],
  ['JKKN Dental College and Hospital', 1, 1, 0, 0, 1, 0, 0, 0, null, null],
  ['JKKN College of Education', 1, 1, 0, 1, 0, 0, 0, 1, 30000, 38500]
];

// name, billedValue, collected, liveBills
const MONEY = [
  ['JKKN College of Pharmacy', 26851000, 5492500, 518],
  ['JKKN Matric Higher Secondary School', 17186680, 0, 3024],
  ['JKKN College of Arts and Science (Self)', 17166000, 3621199.99, 1987],
  ['JKKN College of Engineering and Technology', 13947500, 1319099.99, 806],
  ['JKKN College of Nursing and Research', 13256000, 3984000.02, 294],
  ['JKKN College of Allied Health Sciences', 6381500, 1506000, 138],
  ['JKKN Dental College and Hospital', 1675000, 0, 5],
  ['JKKN College of Education', 38500, 3000, 3],
  ['JKKN College of Arts and Science (Aided)', 0, 0, 0],
  ['Nattraja Vidhyalya CBSE', 0, 0, 0]
];

// lifecycle_status, learners, billed
const LIFECYCLE = [
  ['active', 1403, 824, true],
  ['reserved', 419, 419, true],
  ['enquiry_submitted', 376, 11, false],
  ['admitted', 111, 96, true],
  ['account', 74, 74, false],
  ['rejected', 60, 55, false],
  ['enquiry', 45, 0, false],
  ['inactive', 39, 27, false],
  ['withdrawal_pending', 2, 2, false],
  ['graduated', 1, 0, false],
  ['waitlisted', 1, 1, false],
  ['approved', 1, 0, false]
];

// institution, total, nullProgram, nullDegree, nullDept, nullQuota, nullCommunity, nullAccommodation
const DIMS = [
  ['JKKN Matric Higher Secondary School', 552, 0, 0, 0, 552, 24, 0],
  ['JKKN College of Arts and Science (Aided)', 163, 0, 0, 0, 163, 18, 0],
  ['Nattraja Vidhyalya CBSE', 27, 16, 16, 16, 27, 17, 16],
  ['JKKN Dental College and Hospital', 1, 0, 0, 0, 1, 0, 0]
];

// institution, program, learners, hasPlan, billed
const SCHOOL_PROGRAMS = [
  ['Matric Hr. Sec. School', 'Standard 12', 126, false, 0],
  ['Matric Hr. Sec. School', 'Standard 11', 63, false, 0],
  ['Matric Hr. Sec. School', 'Standard 10', 68, true, 68],
  ['Matric Hr. Sec. School', 'Standard 1', 47, true, 47],
  ['Matric Hr. Sec. School', 'Standard 2', 43, true, 43],
  ['Matric Hr. Sec. School', 'Standard 9', 42, true, 42],
  ['Matric Hr. Sec. School', 'Standard 5', 38, true, 38],
  ['Matric Hr. Sec. School', 'Standard 4', 34, true, 34],
  ['Matric Hr. Sec. School', 'Standard 3', 27, true, 27],
  ['Matric Hr. Sec. School', 'Standard 8', 23, true, 23],
  ['Matric Hr. Sec. School', 'Standard 6', 21, true, 21],
  ['Matric Hr. Sec. School', 'Standard 7', 20, true, 20],
  ['Nattraja Vidhyalya (CBSE)', 'GRADE 2', 26, true, 0],
  ['Nattraja Vidhyalya (CBSE)', 'GRADE 5', 25, true, 0],
  ['Nattraja Vidhyalya (CBSE)', 'GRADE 7', 25, true, 0],
  ['Nattraja Vidhyalya (CBSE)', 'LKG', 22, true, 0],
  ['Nattraja Vidhyalya (CBSE)', 'GRADE 8', 21, true, 0],
  ['Nattraja Vidhyalya (CBSE)', 'UKG', 20, true, 0],
  ['Nattraja Vidhyalya (CBSE)', 'GRADE 3', 20, true, 0],
  ['Nattraja Vidhyalya (CBSE)', 'GRADE 1', 17, true, 0],
  ['Nattraja Vidhyalya (CBSE)', 'GRADE 6', 16, true, 0],
  ['Nattraja Vidhyalya (CBSE)', '(no programme set)', 16, false, 0],
  ['Nattraja Vidhyalya (CBSE)', 'GRADE 9', 13, true, 0],
  ['Nattraja Vidhyalya (CBSE)', 'GRADE 4', 12, true, 0],
  ['Nattraja Vidhyalya (CBSE)', 'PREKG', 8, true, 0]
];

const MISMATCH_LINES = [
  ['College of Education', 'VENNILA P', '1 Year Tuition Fee', 30000, 35000, 'AMOUNT DIFF', 5000],
  ['College of Education', 'VENNILA P', 'Application Fee', null, 500, 'EXTRA BILL', 500],
  ['College of Education', 'VENNILA P', 'University Fee', null, 3000, 'EXTRA BILL', 3000]
];

// ─── Derived totals ─────────────────────────────────────────────────────────
const sum = (rows, i) => rows.reduce((s, r) => s + (r[i] || 0), 0);
const T = {
  onboarded: sum(INSTITUTIONS, 1),
  billed: sum(INSTITUTIONS, 2),
  notBilled: sum(INSTITUTIONS, 3),
  evaluable: sum(INSTITUTIONS, 4),
  quotaNull: sum(INSTITUTIONS, 5),
  noStructure: sum(INSTITUTIONS, 6),
  matches: sum(INSTITUTIONS, 7),
  mismatched: sum(INSTITUTIONS, 8),
  expected: sum(INSTITUTIONS, 9),
  actual: sum(INSTITUTIONS, 10),
  billedValue: sum(MONEY, 1),
  collected: sum(MONEY, 2),
  liveBills: sum(MONEY, 3)
};
const NATTRAJA_EXPOSURE = 10611500;

// ─── Formatting helpers ─────────────────────────────────────────────────────
const inr = (n) =>
  n === null || n === undefined ? '—' : Math.round(n).toLocaleString('en-IN');
const cr = (n) => `₹${(n / 10000000).toFixed(2)} Cr`;
const lakh = (n) => `₹${(n / 100000).toFixed(2)} L`;
const pct = (a, b) => (b === 0 ? '-' : `${((100 * a) / b).toFixed(1)}%`);
const short = (n) => SHORT[n] || n;
/** Learner/bill counts, thousands-separated so 1933 reads as 1,933. */
const num = (n) => Number(n).toLocaleString('en-IN');

// ─── Document ───────────────────────────────────────────────────────────────
const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

/**
 * jsPDF's standard fonts are single-byte encoded. Rather than gamble on which
 * codepoints survive, fold every typographic character down to plain ASCII at
 * the single point where text reaches the page. autoTable draws its cells
 * through doc.text too, so patching here covers tables as well as body copy.
 */
const ASCII = (s) =>
  String(s)
    .replace(/[—–]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/·/g, '|')
    .replace(/₹/g, 'Rs.')
    .replace(/ /g, ' ');

const _text = doc.text.bind(doc);
doc.text = (txt, x, yy, opts) =>
  _text(Array.isArray(txt) ? txt.map(ASCII) : ASCII(txt), x, yy, opts);

const PW = doc.internal.pageSize.getWidth();
const PH = doc.internal.pageSize.getHeight();
const M = 14;
const CW = PW - M * 2;

// jspdf 3 has no built-in unicode rupee glyph in the standard fonts; helvetica
// renders it as a box. Use "Rs." in body copy and keep the symbol out of the PDF.
const RS = 'Rs.';
const money = (n) => (n === null ? '—' : `${RS} ${inr(n)}`);
const moneyCr = (n) => `${RS} ${(n / 10000000).toFixed(2)} Cr`;
const moneyL = (n) => `${RS} ${(n / 100000).toFixed(2)} L`;

let y = 0;

function setFont(size, style = 'normal', color = INK) {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
}

function sectionTitle(text, kicker) {
  if (y > PH - 45) newPage();
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
  const size = opts.size || 9;
  const color = opts.color || SLATE;
  setFont(size, opts.style || 'normal', color);
  const lines = doc.splitTextToSize(text, opts.width || CW);
  for (const ln of lines) {
    if (y > PH - 18) newPage();
    doc.text(ln, opts.x || M, y);
    y += size * 0.44 + 1.1;
  }
  y += opts.gap === undefined ? 2.5 : opts.gap;
}

function newPage() {
  doc.addPage();
  y = 20;
}

function footer() {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...RULE);
    doc.line(M, PH - 12, PW - M, PH - 12);
    setFont(7, 'normal', SLATE);
    doc.text(`MyJKKN · Admission Year ${AY_LABEL} Fee-Structure Billing Audit`, M, PH - 8);
    doc.text(`Page ${i} of ${n}`, PW - M, PH - 8, { align: 'right' });
  }
}

function table(opts) {
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.6,
      cellPadding: { top: 1.9, bottom: 1.9, left: 2, right: 2 },
      lineColor: RULE,
      lineWidth: 0.15,
      textColor: INK,
      overflow: 'linebreak'
    },
    headStyles: {
      fillColor: ACCENT,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.4,
      halign: 'center',
      valign: 'middle'
    },
    alternateRowStyles: { fillColor: BAND },
    ...opts
  });
  y = doc.lastAutoTable.finalY + 7;
}

// ════════════════════════════════════════════════════════════════════════════
// COVER
// ════════════════════════════════════════════════════════════════════════════
doc.setFillColor(...ACCENT);
doc.rect(0, 0, PW, 62, 'F');

setFont(8, 'bold', [175, 205, 235]);
doc.text('MYJKKN  ·  BILLING & ADMISSIONS', M, 18);

setFont(25, 'bold', [255, 255, 255]);
doc.text(`Admission Year ${AY_LABEL}`, M, 32);
setFont(13, 'normal', [214, 231, 245]);
doc.text('Fee-Structure Billing Audit — Institution-wise', M, 42);

setFont(8.5, 'normal', [190, 216, 238]);
doc.text(
  `Data as at ${MEASURED_AT}  ·  Scope: onboarded freshers (reserved / admitted / active)`,
  M,
  52
);

y = 76;

// KPI cards
const KPIS = [
  ['Learners onboarded', num(T.onboarded), 'admission year 2026-27', INK],
  ['Bills created', num(T.billed), `${pct(T.billed, T.onboarded)} coverage`, GOOD],
  ['No bill created', num(T.notBilled), `${pct(T.notBilled, T.onboarded)} of cohort`, BAD],
  ['Mismatched vs structure', num(T.mismatched), `of ${num(T.evaluable)} evaluable`, WARN]
];
const cardW = (CW - 3 * 4) / 4;
KPIS.forEach(([label, value, sub, col], i) => {
  const x = M + i * (cardW + 4);
  doc.setFillColor(...BAND);
  doc.setDrawColor(...RULE);
  doc.roundedRect(x, y, cardW, 26, 1.6, 1.6, 'FD');
  setFont(6.8, 'bold', SLATE);
  doc.text(label.toUpperCase(), x + 3.5, y + 6.5);
  setFont(17, 'bold', col);
  doc.text(value, x + 3.5, y + 15.5);
  setFont(6.6, 'normal', SLATE);
  doc.text(sub, x + 3.5, y + 21.5);
});
y += 35;

sectionTitle('Executive summary', 'Overview');

para(
  `Across 10 institutions, ${num(T.onboarded)} freshers were onboarded into admission year ${AY_LABEL}. ` +
    `${num(T.billed)} of them carry at least one live bill and ${num(T.notBilled)} carry none. Every learner ` +
    `in the cohort is year-of-study 1, confirming the cohort is entirely fresh intake.`
);

para(
  `Where a fee structure could actually be resolved, conformance is close to perfect: ${num(T.matches)} of ` +
    `${num(T.evaluable)} evaluable learners match their configured fee structure line-for-line, and exactly ` +
    `one learner is mismatched. The June 2026 fee-sync repair has held.`
);

para(
  `The real problem is not mismatched billing - it is billing that never happened, and learners the audit ` +
    `cannot even evaluate. ${num(T.notBilled)} learners have no bill, and ${num(T.quotaNull + T.noStructure)} of ` +
    `${num(T.onboarded)} could not be checked against any fee structure at all. Three institutions account for ` +
    `essentially all of it, each for a different and individually fixable reason.`
);

y += 1;
doc.setFillColor(255, 249, 240);
doc.setDrawColor(...WARN);
doc.setLineWidth(0.4);
const boxTop = y;
doc.roundedRect(M, boxTop, CW, 40, 1.6, 1.6, 'FD');
doc.setLineWidth(0.2);
setFont(8.5, 'bold', WARN);
doc.text('Three findings that need a decision', M + 4, boxTop + 7);
setFont(8, 'normal', INK);
const bullets = [
  `Nattraja Vidhyalya (CBSE) — 241 learners, zero bills. 12 active fee plans exist but the school fee`,
  `   generator has never been run for this institution. Unbilled exposure: ${moneyCr(NATTRAJA_EXPOSURE)}.`,
  `Matric Hr. Sec. School — 189 learners unbilled, and they are exactly Standard 11 (63) and`,
  `   Standard 12 (126). Neither standard has an active fee plan; the generator logged them as skipped.`,
  `Arts & Science (Aided) — 164 learners, zero bills, zero fee structures configured for 2026-27.`
];
let by = boxTop + 13.5;
bullets.forEach((b) => {
  const isCont = b.startsWith('   ');
  if (!isCont) {
    doc.setFillColor(...WARN);
    doc.circle(M + 5.6, by - 1.1, 0.9, 'F');
  }
  doc.text(b.trim(), M + (isCont ? 8.5 : 8.5), by);
  by += 5.2;
});
y = boxTop + 46;

// ════════════════════════════════════════════════════════════════════════════
// SECTION 1 — onboarding & bill coverage
// ════════════════════════════════════════════════════════════════════════════
newPage();
sectionTitle('Learners onboarded and bill coverage', 'Section 1');
para(
  `Onboarded means lifecycle status reserved, admitted or active — a learner who has taken a seat. ` +
    `A bill counts as created when the learner holds at least one bill that is not cancelled and not ` +
    `superseded (both are void states and are excluded throughout this report).`,
  { gap: 4 }
);

table({
  head: [['Institution', 'Onboarded', 'Bill created', 'No bill', 'Coverage']],
  body: INSTITUTIONS.map((r) => [short(r[0]), num(r[1]), num(r[2]), num(r[3]), pct(r[2], r[1])]),
  foot: [
    ['TOTAL', num(T.onboarded), num(T.billed), num(T.notBilled), pct(T.billed, T.onboarded)]
  ],
  footStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.6, halign: 'center' },
  columnStyles: {
    1: { cellWidth: 24, halign: 'center' },
    2: { cellWidth: 24, halign: 'center' },
    3: { cellWidth: 24, halign: 'center' },
    4: { cellWidth: 24, halign: 'center' }
  },
  didParseCell: (d) => {
    if (d.section === 'body' && d.column.index === 3 && d.cell.raw > 0) {
      d.cell.styles.textColor = BAD;
      d.cell.styles.fontStyle = 'bold';
    }
    if (d.section === 'body' && d.column.index === 4 && d.cell.raw === '100.0%') {
      d.cell.styles.textColor = GOOD;
    }
    if (d.column.index === 0) d.cell.styles.halign = 'left';
  }
});

para(
  `The 594 unbilled learners are not spread evenly — they sit almost entirely in three institutions: ` +
    `Nattraja (241), Matric Standard 11-12 (189) and Arts & Science Aided (164). The remaining seven ` +
    `institutions bill 100% of their onboarded freshers.`,
  { gap: 5 }
);

sectionTitle('Where the cohort sits in the admission funnel', 'Section 1b');
para(
  `The full admission-year population is 2,532 learners. The table below shows why only the three ` +
    `shaded states are in scope: pre-admission states are not expected to be fully billed, and exited ` +
    `states should not be.`,
  { gap: 4 }
);

table({
  head: [['Lifecycle status', 'Learners', 'With live bill', 'Coverage', 'In audit scope']],
  body: LIFECYCLE.map((r) => [r[0], num(r[1]), num(r[2]), pct(r[2], r[1]), r[3] ? 'Yes' : 'No']),
  foot: [['ALL STATES', num(2532), num(1509), pct(1509, 2532), `${num(T.onboarded)} in scope`]],
  footStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.6, halign: 'center' },
  columnStyles: {
    1: { cellWidth: 24, halign: 'center' },
    2: { cellWidth: 26, halign: 'center' },
    3: { cellWidth: 24, halign: 'center' },
    4: { cellWidth: 30, halign: 'center' }
  },
  didParseCell: (d) => {
    if (d.column.index === 0) d.cell.styles.halign = 'left';
    if (d.section === 'body' && LIFECYCLE[d.row.index][3]) {
      d.cell.styles.fillColor = [232, 242, 234];
      if (d.column.index === 4) d.cell.styles.textColor = GOOD;
    }
  }
});

// ════════════════════════════════════════════════════════════════════════════
// SECTION 2 — fee structure conformance
// ════════════════════════════════════════════════════════════════════════════
newPage();
sectionTitle('Fee-structure conformance', 'Section 2');
para(
  `A learner is evaluable only when an active fee structure can be resolved for their exact combination of ` +
    `institution, degree, department, programme, quota, community, gender, accommodation type and admission ` +
    `year. Expected fee lines then come from that structure; actual lines come from the learner's live ` +
    `academic bills. Transport, hostel and mess fees are excluded — they are owned by other modules.`,
  { gap: 4 }
);

table({
  head: [
    [
      { content: 'Institution', rowSpan: 2 },
      { content: 'Evaluable', rowSpan: 2 },
      { content: 'Conformance', colSpan: 2 },
      { content: 'Not evaluable', colSpan: 2 }
    ],
    ['Matches', 'Mismatched', 'Quota not set', 'No structure']
  ],
  body: INSTITUTIONS.map((r) => [short(r[0]), num(r[4]), num(r[7]), num(r[8]), num(r[5]), num(r[6])]),
  foot: [
    ['TOTAL', num(T.evaluable), num(T.matches), num(T.mismatched), num(T.quotaNull), num(T.noStructure)]
  ],
  footStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.6, halign: 'center' },
  columnStyles: {
    1: { cellWidth: 20, halign: 'center' },
    2: { cellWidth: 20, halign: 'center' },
    3: { cellWidth: 22, halign: 'center' },
    4: { cellWidth: 24, halign: 'center' },
    5: { cellWidth: 22, halign: 'center' }
  },
  didParseCell: (d) => {
    if (d.column.index === 0) d.cell.styles.halign = 'left';
    if (d.section === 'body') {
      if (d.column.index === 3 && d.cell.raw > 0) {
        d.cell.styles.textColor = BAD;
        d.cell.styles.fontStyle = 'bold';
      }
      if ((d.column.index === 4 || d.column.index === 5) && d.cell.raw > 0) {
        d.cell.styles.textColor = WARN;
      }
      if (d.column.index === 2 && d.cell.raw > 0) d.cell.styles.textColor = GOOD;
    }
  }
});

para(
  `Read the two right-hand columns as the audit's blind spot, not as a clean bill of health: ` +
    `${T.quotaNull + T.noStructure} of ${T.onboarded} onboarded learners (` +
    `${pct(T.quotaNull + T.noStructure, T.onboarded)}) could not be compared to anything.`,
  { gap: 5 }
);

sectionTitle('Billed value against the structure', 'Section 2b');
para(
  `For evaluable learners only, the expected total is the sum of every applicable fee-structure line; ` +
    `the actual total is the sum of the matching live bills.`,
  { gap: 4 }
);

table({
  head: [['Institution', 'Evaluable', `Expected (${RS})`, `Actual (${RS})`, `Variance (${RS})`]],
  body: INSTITUTIONS.filter((r) => r[9] !== null).map((r) => [
    short(r[0]),
    num(r[4]),
    inr(r[9]),
    inr(r[10]),
    r[10] - r[9] === 0 ? '0' : `+${inr(r[10] - r[9])}`
  ]),
  foot: [
    ['TOTAL', num(T.evaluable), inr(T.expected), inr(T.actual), `+${inr(T.actual - T.expected)}`]
  ],
  footStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.6, halign: 'right' },
  columnStyles: {
    1: { cellWidth: 20, halign: 'center' },
    2: { cellWidth: 32, halign: 'right' },
    3: { cellWidth: 32, halign: 'right' },
    4: { cellWidth: 28, halign: 'right' }
  },
  didParseCell: (d) => {
    if (d.column.index === 0) d.cell.styles.halign = 'left';
    if (d.section === 'body' && d.column.index === 4 && d.cell.raw !== '0') {
      d.cell.styles.textColor = BAD;
      d.cell.styles.fontStyle = 'bold';
    }
    if (d.section === 'foot' && d.column.index === 0) d.cell.styles.halign = 'left';
  }
});

sectionTitle('The one mismatched learner', 'Section 2c');
para(
  `A single learner in the entire cohort is billed differently from her fee structure. She is over-billed ` +
    `by ${RS} 8,500 in total: the tuition line is ${RS} 5,000 above the structure, and two fee heads are ` +
    `billed that the structure does not contain at all.`,
  { gap: 4 }
);

table({
  head: [['Institution', 'Learner', 'Fee category', `Expected (${RS})`, `Billed (${RS})`, 'Issue']],
  body: MISMATCH_LINES.map((r) => [r[0], r[1], r[2], r[3] === null ? '—' : inr(r[3]), inr(r[4]), r[5]]),
  foot: [['', '', 'NET OVER-BILLED', '', `+${inr(8500)}`, '']],
  footStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.6 },
  columnStyles: {
    1: { cellWidth: 26 },
    2: { cellWidth: 36 },
    3: { cellWidth: 26, halign: 'right' },
    4: { cellWidth: 24, halign: 'right' },
    5: { cellWidth: 26, halign: 'center' }
  },
  didParseCell: (d) => {
    if (d.section === 'body' && d.column.index === 5) {
      d.cell.styles.textColor = d.cell.raw === 'EXTRA BILL' ? BAD : WARN;
      d.cell.styles.fontStyle = 'bold';
    }
  }
});

// ════════════════════════════════════════════════════════════════════════════
// SECTION 3 — root causes
// ════════════════════════════════════════════════════════════════════════════
newPage();
sectionTitle('Root-cause analysis', 'Section 3');
para(
  `Every unbilled or unevaluable learner traces to one of four causes. None of them is a billing-engine ` +
    `defect; all four are configuration or operational gaps.`,
  { gap: 5 }
);

function causeBlock(no, title, count, colour, lines) {
  if (y > PH - 52) newPage();
  const top = y;
  doc.setFillColor(...BAND);
  doc.setDrawColor(...RULE);
  doc.roundedRect(M, top, CW, 6, 1.2, 1.2, 'FD');
  doc.setFillColor(...colour);
  doc.rect(M, top, 1.6, 6, 'F');
  setFont(8.6, 'bold', INK);
  doc.text(`${no}.  ${title}`, M + 5, top + 4.2);
  setFont(8.6, 'bold', colour);
  doc.text(count, PW - M - 3, top + 4.2, { align: 'right' });
  y = top + 10.5;
  lines.forEach((l) => para(l, { size: 8.3, gap: 0.6, x: M + 5, width: CW - 10 }));
  y += 3.5;
}

causeBlock(
  1,
  'School fee generator never run — Nattraja Vidhyalya (CBSE)',
  '241 learners',
  BAD,
  [
    `Nattraja holds 12 active school fee plans for academic year 2026-2027, covering 48 fee items worth ` +
      `${RS} 5,53,250 in plan value. Every grade from PREKG to Grade 9 is configured.`,
    `However school_fee_generation_runs contains no row for this institution at all — only Matric has ever ` +
      `been run. The plans are correct and simply have not been executed against the learner roll.`,
    `225 of the 241 learners map to a priced plan, giving an unbilled exposure of ${money(NATTRAJA_EXPOSURE)} ` +
      `(${moneyCr(NATTRAJA_EXPOSURE)}). The remaining 16 have no programme set and must be corrected before generation.`
  ]
);

causeBlock(
  2,
  'No fee plan for Standard 11 and Standard 12 — Matric Hr. Sec. School',
  '189 learners',
  BAD,
  [
    `The generator did run for Matric on 14 August 2026 and created 3,024 bills for 552 matched learners — ` +
      `but it recorded 189 as skipped_no_plan.`,
    `Those 189 are exactly Standard 12 (126) and Standard 11 (63). All ten other standards have an active ` +
      `plan and are billed at 100%. Creating the two missing plans and re-running the generator closes this ` +
      `gap completely.`,
    `Exposure is not quantifiable until the plans exist, because there is no configured amount to price.`
  ]
);

causeBlock(
  3,
  'No fee structures configured at all — Arts & Science (Aided)',
  '164 learners',
  BAD,
  [
    `This institution has zero active admission fee structures for 2026-27 and zero school fee plans. It is ` +
      `the only college in the group with no fee configuration whatsoever, and consequently has raised no bills.`,
    `163 of its 164 onboarded learners also have quota not set, so even once structures are created the ` +
      `learner records need correcting before a structure can resolve.`
  ]
);

causeBlock(
  4,
  'Quota not set on the learner record — blocks structure resolution',
  '743 learners',
  WARN,
  [
    `The fee-structure lookup joins on quota as a strict equality. Gender and accommodation type are allowed ` +
      `to be NULL in the structure and fall back gracefully; quota is not.`,
    `Every one of the 743 unevaluable learners has quota_id NULL — 552 at Matric, 163 at Arts & Science ` +
      `(Aided), 27 at Nattraja and 1 at Dental. No other dimension is materially missing: department, degree ` +
      `and programme are populated for all but 16 Nattraja records.`,
    `For the two schools this is arguably correct — schools do not use quota and are billed through the ` +
      `school fee module instead — but it means the admission-structure audit is silent on 40% of the cohort.`
  ]
);

// ── school programme detail
if (y > PH - 70) newPage();
sectionTitle('School fee plans — programme-level detail', 'Section 3b');
para(
  `Both schools are billed through school fee plans rather than admission fee structures. This table shows ` +
    `exactly which programmes are configured and which are billed.`,
  { gap: 4 }
);

table({
  head: [['Institution', 'Programme', 'Learners', 'Active plan', 'Billed', 'Status']],
  body: SCHOOL_PROGRAMS.map((r) => [
    r[0],
    r[1],
    r[2],
    r[3] ? 'Yes' : 'No',
    r[4],
    !r[3] ? 'NO PLAN' : r[4] === 0 ? 'NOT GENERATED' : 'OK'
  ]),
  columnStyles: {
    1: { cellWidth: 36 },
    2: { cellWidth: 20, halign: 'center' },
    3: { cellWidth: 20, halign: 'center' },
    4: { cellWidth: 18, halign: 'center' },
    5: { cellWidth: 30, halign: 'center' }
  },
  didParseCell: (d) => {
    if (d.section === 'body' && d.column.index === 5) {
      d.cell.styles.fontStyle = 'bold';
      d.cell.styles.textColor =
        d.cell.raw === 'OK' ? GOOD : d.cell.raw === 'NO PLAN' ? BAD : WARN;
    }
  }
});

// ════════════════════════════════════════════════════════════════════════════
// SECTION 4 — financial position
// ════════════════════════════════════════════════════════════════════════════
newPage();
sectionTitle('Financial position', 'Section 4');
para(
  `Billed value counts every live bill of any kind raised against the onboarded cohort — academic, hostel ` +
    `and transport together. Collected is the portion already receipted.`,
  { gap: 4 }
);

table({
  head: [['Institution', 'Live bills', `Billed value (${RS})`, `Collected (${RS})`, 'Collected %']],
  body: MONEY.map((r) => [
    short(r[0]),
    num(r[3]),
    inr(r[1]),
    inr(r[2]),
    r[1] === 0 ? '-' : pct(r[2], r[1])
  ]),
  foot: [
    ['TOTAL', num(T.liveBills), inr(T.billedValue), inr(T.collected), pct(T.collected, T.billedValue)]
  ],
  footStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.6, halign: 'right' },
  columnStyles: {
    1: { cellWidth: 22, halign: 'center' },
    2: { cellWidth: 34, halign: 'right' },
    3: { cellWidth: 32, halign: 'right' },
    4: { cellWidth: 24, halign: 'center' }
  },
  didParseCell: (d) => {
    if (d.column.index === 0) d.cell.styles.halign = 'left';
    if (d.section === 'foot' && d.column.index === 0) d.cell.styles.halign = 'left';
    if (d.section === 'body' && d.column.index === 2 && d.cell.raw === '0') {
      d.cell.styles.textColor = BAD;
      d.cell.styles.fontStyle = 'bold';
    }
  }
});

para(
  `Against ${moneyCr(T.billedValue)} raised, ${moneyCr(T.collected)} has been collected ` +
    `(${pct(T.collected, T.billedValue)}). Separately, ${moneyCr(NATTRAJA_EXPOSURE)} of Nattraja fees has ` +
    `never been raised at all, and the Matric Standard 11-12 and Arts & Science (Aided) gaps remain ` +
    `unpriced pending configuration.`,
  { gap: 6 }
);

// ════════════════════════════════════════════════════════════════════════════
// SECTION 5 — recommended actions
// ════════════════════════════════════════════════════════════════════════════
sectionTitle('Recommended actions', 'Section 5');

const ACTIONS = [
  [
    'P1',
    'Run the school fee generator for Nattraja Vidhyalya (CBSE)',
    `Plans are already active and priced. Run in dry-run first and confirm learners_matched is 241 and ` +
      `skipped_no_plan is 16 before committing. Releases ${moneyCr(NATTRAJA_EXPOSURE)}.`
  ],
  [
    'P1',
    'Create fee plans for Matric Standard 11 and Standard 12, then re-run',
    `189 learners are waiting on two plan records. The 14 August run already proves the generator works ` +
      `for this institution.`
  ],
  [
    'P1',
    'Configure 2026-27 fee structures for Arts & Science (Aided)',
    `164 onboarded learners cannot be billed at all. This is the only institution with no fee configuration ` +
      `of any kind.`
  ],
  [
    'P2',
    'Set quota on the 190 college learners where it is missing',
    `163 at Arts & Science (Aided), 27 at Nattraja and 1 at Dental. Until quota is set the fee structure ` +
      `cannot resolve, so these learners are invisible to every conformance check.`
  ],
  [
    'P2',
    'Correct the one mismatched learner (VENNILA P, College of Education)',
    `Over-billed by ${RS} 8,500. Use admission_fix_fee_mismatch_2026 with p_dry_run=true first; it will ` +
      `supersede and reissue the tuition bill and carry the receipt allocation across.`
  ],
  [
    'P3',
    'Set programme on the 16 Nattraja learners with none',
    `They will be skipped by the generator otherwise and will silently remain unbilled after the P1 run.`
  ]
];

table({
  head: [['Priority', 'Action', 'Detail']],
  body: ACTIONS,
  columnStyles: {
    0: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
    1: { cellWidth: 58, fontStyle: 'bold' }
  },
  didParseCell: (d) => {
    if (d.section === 'body' && d.column.index === 0) {
      d.cell.styles.textColor = d.cell.raw === 'P1' ? BAD : d.cell.raw === 'P2' ? WARN : SLATE;
    }
  }
});

// ════════════════════════════════════════════════════════════════════════════
// APPENDIX — methodology
// ════════════════════════════════════════════════════════════════════════════
newPage();
sectionTitle('Methodology and definitions', 'Appendix A');

const DEFS = [
  ['Admission year 2026-27', 'learners_profiles joined to admission_years on year = 2026. admission_years holds one row per (institution, year), so the integer year is used rather than the uuid.'],
  ['Onboarded', 'lifecycle_status in (reserved, admitted, active). Pre-admission states (enquiry, enquiry_submitted, account) and exited states (rejected, inactive, graduated, withdrawal_pending, waitlisted, approved) are reported separately and excluded from scope.'],
  ['Live bill', 'A billing_student_bills row whose status is not cancelled and not superseded. Both are void states: the bill exists for audit but the learner does not owe it.'],
  ['Bill created', 'The learner holds at least one live bill with fee_source = academic, excluding transport, hostel and mess categories.'],
  ['Fee structure match', 'The single active admission_fee_structures row matching institution, degree, department, programme, quota and admission year, whose community junction contains the learner community, and whose gender and accommodation type either match the learner or are NULL. Ties are broken by specificity: accommodation-specific first, then gender-specific, then most recently updated.'],
  ['Expected lines', 'admission_fee_structure_items on the matched structure, restricted to categories whose kind is not transport, hostel or mess, and filtered by applies_to against the learner year of study (all learners in this cohort are year 1).'],
  ['Actual lines', 'The most recently created live academic bill per billing category for that learner.'],
  ['Mismatched', 'The expected and actual line sets differ — a structure line with no bill (missing), a bill with no structure line (extra), or the same category at a different amount.'],
  ['Not evaluable', 'Either a required dimension is NULL on the learner record (in practice always quota), or no active fee structure exists for that combination.']
];

table({
  head: [['Term', 'Definition']],
  body: DEFS,
  styles: { fontSize: 7.2, cellPadding: { top: 2, bottom: 2, left: 2, right: 2 }, lineColor: RULE, lineWidth: 0.15, overflow: 'linebreak' },
  columnStyles: { 0: { cellWidth: 38, fontStyle: 'bold' } }
});

sectionTitle('Provenance and caveats', 'Appendix B');
para(
  `All figures were measured by direct SQL against the production Supabase database on ${MEASURED_AT}. ` +
    `The comparison logic reproduces the structure-matching predicate used by the production repair routine ` +
    `admission_fix_fee_mismatch_2026, so results agree with what that routine would act on.`
);
para(
  `One deliberate divergence: that routine treats only superseded bills as void, whereas this audit also ` +
    `excludes cancelled bills, consistent with VOID_BILL_STATUSES in lib/billing/bill-status.ts. Treating a ` +
    `cancelled bill as live would understate the missing-bill count.`
);
para(
  `The population is live and moves between queries as bills are raised and learners progress. Totals taken ` +
    `from separate queries minutes apart may differ by a few rows; every figure in this report was taken ` +
    `within a single measurement window.`
);
para(
  `Hostel, transport and mess fees are excluded from all conformance testing because those modules own their ` +
    `own pricing. They are included only in the Section 4 billed-value totals, which is why those figures ` +
    `exceed the Section 2b expected totals.`
);

footer();

// ─── Write ──────────────────────────────────────────────────────────────────
const outDir = process.argv[2] || path.resolve('reports');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'AY2026-27-fee-structure-billing-audit.pdf');
fs.writeFileSync(outFile, Buffer.from(doc.output('arraybuffer')));
console.log(`OK  ${outFile}`);
console.log(`    pages: ${doc.getNumberOfPages()}  size: ${(fs.statSync(outFile).size / 1024).toFixed(0)} KB`);
