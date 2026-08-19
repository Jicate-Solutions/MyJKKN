/**
 * Build multi-sheet XLSX workbooks for the BOS syllabus module.
 * Reads use SheetJS — see syllabus-parser.ts. Writes go through excel-compat.
 *
 * Course_Info sheet intentionally omitted — institution / composition /
 * meeting / course_code etc. are picked manually in the Basic Info tab.
 */

import XLSX from '@/lib/utils/excel-compat';
import type { BosCourseSyllabus, BosExamScheme, BosInternshipPostings } from '@/types/bos';
import { isPharmacyModel } from '@/lib/services/bos/academic-model';

export const SHEET_NAMES = {
  objectives: 'Objectives',
  clos: 'COs',
  units: 'Units',
  practicalTopics: 'Practical Topics',
  textbooks: 'Textbooks',
  references: 'References',
  webResources: 'WebResources',
  pedagogy: 'Pedagogy',
  poMapping: 'PO_Mapping',
  referenceCodes: 'Reference Codes',
  // Pharmacy (COP) models — no CO/PO/Bloom; these replace them.
  scope: 'Scope',
  examScheme: 'Exam Scheme',
  internship: 'Internship',
} as const;

const PEDAGOGY_METHODS = [
  'Chalk and talk', 'PowerPoint presentation', 'E-content / Digital learning',
  'Group discussion', 'Case study', 'Problem-based learning (PBL)',
  'Project-based learning', 'Simulation', 'Seminar presentation',
  'Tutorial method', 'Brainstorming sessions', 'Role play',
  'Experiential learning', 'Collaborative learning', 'Peer learning / Peer teaching',
  'Flipped classroom', 'Inquiry-based learning', 'Activity-based learning',
  'Demonstration method', 'Workshop method', 'Field visit / Industrial visit',
  'Laboratory experiments', 'Quiz and gamification', 'Team-based learning',
  'Concept mapping', 'Think–Pair–Share', 'Debate method', 'Blended learning',
  'Self-directed learning', 'MOOC / Online learning integration',
  'Interactive whiteboard teaching', 'Storytelling method', 'Reflective learning',
  'Design thinking approach', 'Hands-on training', 'Competency-based learning',
  'Microlearning', 'Mentoring and coaching sessions',
];

const K_VALUE_DESCRIPTIONS: Record<string, string> = {
  K1: 'Remember', K2: 'Understand', K3: 'Apply',
  K4: 'Analyze', K5: 'Evaluate', K6: 'Create',
};

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const NUMBER_LIST_1_10 = Array.from({ length: 10 }, (_, i) => String(i + 1));
const PO_LEVELS = ['H', 'M', 'L'];
const CO_K_HEADERS = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'];

interface SheetData {
  headers: string[];
  rows: (string | number)[][];
  colWidths?: number[];
  validations?: Array<{
    sqref: string;
    values: string[];
    errorTitle?: string;
    error?: string;
  }>;
}

function addSheet(
  wb: ReturnType<typeof XLSX.utils.book_new>,
  sheetName: string,
  data: SheetData,
) {
  const aoa: (string | number)[][] = [data.headers, ...data.rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = (data.colWidths ?? data.headers.map(() => 22)).map((w) => ({ wch: w }));
  ws['!freeze'] = { ySplit: 1 };
  if (data.validations) {
    ws['!dataValidation'] = data.validations.map((v) => ({
      type: 'list' as const,
      sqref: v.sqref,
      formula1: `"${v.values.join(',')}"`,
      showDropDown: true,
      showErrorMessage: true,
      errorTitle: v.errorTitle ?? 'Invalid value',
      error: v.error ?? 'Please pick from the dropdown.',
    }));
  }
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
}

function addReferenceCodesSheet(wb: ReturnType<typeof XLSX.utils.book_new>) {
  const rows: (string | number)[][] = [];
  const section = (label: string) => rows.push([`═══ ${label} ═══`, '', '']);
  const entry = (type: string, code: string, desc: string) => rows.push([type, code, desc]);

  section('PEDAGOGY METHODS');
  PEDAGOGY_METHODS.forEach((m) => entry('Pedagogy', m, ''));
  section("K-VALUES (Bloom's Taxonomy)");
  CO_K_HEADERS.forEach((k) => entry('K-Value', k, K_VALUE_DESCRIPTIONS[k] ?? ''));
  section('UNIT ROMAN NUMERALS');
  ROMAN_NUMERALS.forEach((r, i) => entry('Unit', r, `Unit ${i + 1}`));
  section('PO MAPPING LEVELS');
  entry('Level', 'H', 'High');
  entry('Level', 'M', 'Medium');
  entry('Level', 'L', 'Low');
  entry('Level', '(blank)', 'No mapping');
  section('CO/OBJECTIVE NUMBERS');
  NUMBER_LIST_1_10.forEach((n) => entry('Number', n, ''));
  section('CHECKMARK (K-Value columns)');
  entry('Mark', '✓', 'Selected — K-value applies to this CO');
  entry('Mark', '(blank)', 'Not selected');

  const ws = XLSX.utils.aoa_to_sheet([
    ['Type', 'Code', 'Description'],
    ...rows,
  ]);
  ws['!cols'] = [{ wch: 26 }, { wch: 22 }, { wch: 50 }];
  ws['!freeze'] = { ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, ws, SHEET_NAMES.referenceCodes);
}

// ── Pharmacy (COP) sheets — replace the CO/PO/Bloom/Pedagogy sheets ────

function addScopeSheet(wb: ReturnType<typeof XLSX.utils.book_new>, scope?: string) {
  addSheet(wb, SHEET_NAMES.scope, {
    headers: ['Scope'],
    rows: scope ? [[scope]] : [],
    colWidths: [100],
  });
}

function addExamSchemeSheet(wb: ReturnType<typeof XLSX.utils.book_new>, scheme?: BosExamScheme) {
  const rows: (string | number)[][] = [];
  // Components (name, max, min, duration)
  (scheme?.components ?? []).forEach((c) => {
    rows.push([c.name ?? '', c.max ?? '', c.min ?? '', c.duration_hours ?? '']);
    (c.sub ?? []).forEach((s) => rows.push([`  • ${s.name ?? ''}`, s.max ?? '', '', '']));
  });
  // Totals / pass rule
  const totalsBits: string[] = [];
  if (scheme?.total_marks != null) totalsBits.push(`Total: ${scheme.total_marks}`);
  if (scheme?.pass_pct != null) totalsBits.push(`Pass: ${scheme.pass_pct}%`);
  if (scheme?.distinction_pct != null) totalsBits.push(`Distinction: ${scheme.distinction_pct}%`);
  if (totalsBits.length) { rows.push(['', '', '', '']); rows.push([totalsBits.join('  ·  '), '', '', '']); }
  // Question-paper pattern (B.Pharm)
  const qp = scheme?.question_pattern;
  if (qp?.sections?.length) {
    rows.push(['', '', '', '']);
    rows.push([`Question-paper pattern${qp.variant ? ` (${qp.variant} marks)` : ''}`, 'Marks', '', '']);
    qp.sections.forEach((s) => rows.push([s.name ?? '', s.marks ?? '', '', '']));
  }
  if (scheme?.notes) { rows.push(['', '', '', '']); rows.push([`Notes: ${scheme.notes}`, '', '', '']); }
  addSheet(wb, SHEET_NAMES.examScheme, {
    headers: ['Component / Section', 'Max / Marks', 'Min', 'Duration (h)'],
    rows,
    colWidths: [48, 14, 8, 12],
  });
}

function addInternshipSheet(wb: ReturnType<typeof XLSX.utils.book_new>, data?: BosInternshipPostings) {
  const rows: (string | number)[][] = [];
  if (data?.total_duration) rows.push([`Total duration: ${data.total_duration}`, '', '']);
  (data?.postings ?? []).forEach((p) => rows.push([p.area ?? '', p.duration ?? '', p.repeat ?? '']));
  if (data?.notes) rows.push([`Notes: ${data.notes}`, '', '']);
  addSheet(wb, SHEET_NAMES.internship, {
    headers: ['Area / Department', 'Duration', 'Repeat ×'],
    rows,
    colWidths: [48, 16, 10],
  });
}

export async function buildSyllabusTemplate(): Promise<ArrayBuffer> {
  const wb = XLSX.utils.book_new();

  addSheet(wb, SHEET_NAMES.objectives, {
    headers: ['Number *', 'Description *'],
    rows: [
      [1, 'To learn the basic ideas on the Theory of Equations and Matrices.'],
      [2, 'To gain knowledge to find expansions of trigonometric functions.'],
    ],
    colWidths: [10, 80],
    validations: [{ sqref: 'A2:A30', values: NUMBER_LIST_1_10, errorTitle: 'Invalid number', error: 'Pick a number between 1 and 10.' }],
  });

  addSheet(wb, SHEET_NAMES.clos, {
    headers: ['CO *', 'Description *', ...CO_K_HEADERS],
    rows: [
      [1, 'Classify and solve reciprocal equations.', '', '✓', '✓', '', '', ''],
      [2, 'Find the sum of binomial, exponential and logarithmic series.', '✓', '', '', '', '', ''],
      [3, 'Find eigenvalues, eigenvectors and verify Cayley-Hamilton theorem.', '', '✓', '', '', '', ''],
    ],
    colWidths: [8, 60, 6, 6, 6, 6, 6, 6],
    validations: [
      { sqref: 'A2:A30', values: NUMBER_LIST_1_10, errorTitle: 'Invalid CO number' },
      ...CO_K_HEADERS.map((_, i) => ({
        sqref: `${String.fromCharCode(67 + i)}2:${String.fromCharCode(67 + i)}30`,
        values: ['✓'],
        errorTitle: 'Use ✓ or leave blank',
        error: 'Type ✓ to select this K-value, or leave the cell blank.',
      })),
    ],
  });

  // Units sheet shape mirrors buildSyllabusWorkbook so template + export are
  // visually identical. 'Sections' (e.g. "6.1, 6.2, 6.3") is a chapter-level
  // detail field, separate from the chapter 'title'.
  //
  // 'Hours' is the per-unit period marker (BosUnit.hours) — read only from a
  // unit's FIRST row, like Title and Remarks. Accepts an Anna-University
  // "9 + 3" theory+tutorial split or a plain "9"; printed by the CET/
  // Engineering PDF renderer. Appended last so sheets authored before it
  // shipped still import (the parser matches on header name, not position).
  addSheet(wb, SHEET_NAMES.units, {
    headers: ['Unit *', 'Title', 'Chapter', 'Sections', 'Sub-topic', 'Remarks', 'Hours'],
    rows: [
      ['I', 'Reciprocal Equations', 'Reciprocal Equations - Standard form', '1.1, 1.2', '', 'Book 1 - Chapter 6', '9'],
      ['I', '', '', '', 'Definition and properties of reciprocal equations', '', ''],
      ['I', '', '', '', 'Roots of standard reciprocal equations', '', ''],
      ['I', 'Reciprocal Equations', "Horner's method for roots of polynomials", '1.3', '', '', ''],
      ['II', 'Series', 'Summation of Series: Binomial-Exponential-Logarithmic', '2.1, 2.2', '', 'Book 1 - Chapter 3', '9'],
      ['II', '', '', '', 'Binomial series expansion', '', ''],
      ['II', '', '', '', 'Exponential and logarithmic series', '', ''],
      ['III', 'Matrices', 'Inverse of a square matrix, Characteristic equation', '3.1', '', 'Book 2 - Chapter 2', '9'],
      ['IV', 'Trigonometry', 'Expansions of sinθ, cosθ in powers of sinθ, cosθ', '4.1', '', 'Book 3 - Chapter 3', '9'],
      ['V', 'Hyperbolic Functions', 'Relation between circular and hyperbolic functions', '5.1', '', 'Book 3 - Chapter 4', '9'],
    ],
    colWidths: [10, 28, 50, 22, 40, 30, 10],
    validations: [{ sqref: 'A2:A60', values: ROMAN_NUMERALS, errorTitle: 'Invalid unit', error: 'Pick a Roman numeral I-X.' }],
  });

  // Practical Topics sheet — only consumed when the syllabus is_practical=true.
  // Present in the template (with example rows) so the shape matches the
  // export side; harmless for regular-mode papers that just leave it empty.
  addSheet(wb, SHEET_NAMES.practicalTopics, {
    headers: ['S.No', 'Experiment / Topic'],
    rows: [
      [1, 'Introduction to the laboratory and safety protocols'],
      [2, 'Experiment 1: Basic measurements and observations'],
      [3, 'Experiment 2: Data collection and analysis'],
    ],
    colWidths: [8, 80],
  });

  const bookHeaders = ['Title', 'Author', 'Publication Year', 'Publisher'];
  // 18 wch fits the 16-char 'Publication Year' header with breathing room.
  const bookColWidths = [60, 35, 18, 30];

  addSheet(wb, SHEET_NAMES.textbooks, {
    headers: bookHeaders,
    rows: [
      ['Algebra Vol-I', 'Manickavasagam Pillai, T.K.', 2008, 'Viswanathan Publishers'],
      ['Algebra Vol-II', 'Manickavasagam Pillai, T.K.', 2008, 'Viswanathan Publishers'],
    ],
    colWidths: bookColWidths,
  });

  addSheet(wb, SHEET_NAMES.references, {
    headers: bookHeaders,
    rows: [
      ['Theory of Equations', 'W.S. Burnstine and A.W. Panton', '', ''],
      ['Linear Algebra and its Applications, 3rd Ed.', 'David C. Lay', 2007, 'Pearson'],
    ],
    colWidths: bookColWidths,
  });

  addSheet(wb, SHEET_NAMES.webResources, {
    headers: ['Title', 'URL'],
    rows: [['NPTEL', 'https://nptel.ac.in']],
    colWidths: [22, 50],
  });

  addSheet(wb, SHEET_NAMES.pedagogy, {
    headers: ['Method'],
    rows: [
      ['Chalk and talk'], ['PowerPoint presentation'],
      ['E-content / Digital learning'], ['Group discussion'],
    ],
    colWidths: [40],
    validations: [{ sqref: 'A2:A40', values: PEDAGOGY_METHODS, errorTitle: 'Invalid method', error: 'Pick a teaching method from the dropdown.' }],
  });

  const poHeaders = ['CO', 'PSO1', 'PSO2', 'PSO3', 'PSO4', 'PSO5', 'PO1', 'PO2', 'PO3', 'PO4', 'PO5'];
  addSheet(wb, SHEET_NAMES.poMapping, {
    headers: poHeaders,
    rows: [
      ['CO1', 'H', 'L', 'H', 'H', 'H', 'H', 'L', 'H', '', ''],
      ['CO2', 'M', 'M', 'M', 'H', 'M', 'M', 'L', 'H', 'L', ''],
    ],
    colWidths: [8, ...Array(10).fill(6)],
    validations: poHeaders.slice(1).map((_, i) => ({
      sqref: `${String.fromCharCode(66 + i)}2:${String.fromCharCode(66 + i)}30`,
      values: PO_LEVELS,
      errorTitle: 'Invalid level',
      error: 'Pick H, M, or L (or leave blank).',
    })),
  });

  addReferenceCodesSheet(wb);
  return XLSX.writeBuffer(wb);
}

export async function buildSyllabusWorkbook(syllabus: BosCourseSyllabus): Promise<ArrayBuffer> {
  const wb = XLSX.utils.book_new();

  // Pharmacy (COP) models carry no CO/PO/PSO/Bloom or pedagogy — those sheets
  // are skipped below and replaced by Scope / Exam Scheme / Internship.
  const pharmacy = isPharmacyModel(syllabus.academic_model);
  const isBPharm = syllabus.academic_model === 'pci_pharm';
  if (pharmacy && isBPharm) addScopeSheet(wb, syllabus.scope);

  const objectives = (syllabus.course_objectives as any)?.objectives ?? [];
  const objRowCount = Math.max(objectives.length + 5, 30);
  addSheet(wb, SHEET_NAMES.objectives, {
    headers: ['Number *', 'Description *'],
    rows: objectives.map((o: any) => [o.number ?? '', o.description ?? '']),
    colWidths: [10, 80],
    validations: [{ sqref: `A2:A${objRowCount}`, values: NUMBER_LIST_1_10 }],
  });

  // Course Outcomes (CO/Bloom) — Anna models only; pharmacy has none.
  if (!pharmacy) {
    const clos = (syllabus.course_learning_outcomes as any)?.clos ?? [];
    const cloRowCount = Math.max(clos.length + 5, 30);
    addSheet(wb, SHEET_NAMES.clos, {
      headers: ['CO *', 'Description *', ...CO_K_HEADERS],
      rows: clos.map((c: any) => {
        const ks = new Set<string>((c.k_values ?? []).map((k: string) => k.toUpperCase()));
        return [
          c.clo_number ?? '',
          c.description ?? '',
          ...CO_K_HEADERS.map((k) => (ks.has(k) ? '✓' : '')),
        ];
      }),
      colWidths: [8, 60, 6, 6, 6, 6, 6, 6],
      validations: [
        { sqref: `A2:A${cloRowCount}`, values: NUMBER_LIST_1_10 },
        ...CO_K_HEADERS.map((_, i) => ({
          sqref: `${String.fromCharCode(67 + i)}2:${String.fromCharCode(67 + i)}${cloRowCount}`,
          values: ['✓'],
        })),
      ],
    });
  }

  // course_content has two mutually exclusive shapes (see types/bos.ts):
  //   • units[]  — regular papers
  //   • topics[] with is_practical=true — lab/practical papers
  // Earlier versions of this exporter only handled the units[] shape, silently
  // dropping the body of every practical paper. See memory:
  // project_bos_practical_topics_shape.
  const content = syllabus.course_content as any;
  const units = content?.units ?? [];
  const isPractical = !!content?.is_practical;
  const practicalTopics: Array<{ number?: number; title?: string }> = content?.topics ?? [];

  const unitRows: (string | number)[][] = [];
  for (const u of units) {
    const chapters = u.chapters ?? [];
    // Per-unit period marker. Written on the unit's FIRST row only — the same
    // convention Title and Remarks already follow, and what parseUnitsSheet
    // reads back. Without this column the hours authored in the form were lost
    // on every export → edit → re-import cycle.
    const hours = u.hours ?? '';
    if (chapters.length === 0) {
      unitRows.push([u.unit_id ?? '', u.unit_title ?? '', '', '', '', u.remarks ?? '', hours]);
    } else {
      chapters.forEach((ch: any, idx: number) => {
        // 'Sections' (e.g. "6.1, 6.2, 6.3") is a separate field from 'title' —
        // form writes both, PDF reads both, but this exporter used to drop it.
        unitRows.push([
          u.unit_id ?? '', u.unit_title ?? '', ch.title ?? '', ch.sections ?? '', '',
          idx === 0 ? (u.remarks ?? '') : '',
          idx === 0 ? hours : '',
        ]);
        const subtopics = ch.subtopics ?? [];
        for (const st of subtopics) {
          unitRows.push([u.unit_id ?? '', '', '', '', st.title ?? '', '', '']);
        }
      });
    }
  }
  const unitRowCount = Math.max(unitRows.length + 5, 60);
  addSheet(wb, SHEET_NAMES.units, {
    headers: ['Unit *', 'Title', 'Chapter', 'Sections', 'Sub-topic', 'Remarks', 'Hours'],
    rows: unitRows,
    colWidths: [10, 28, 50, 22, 40, 30, 10],
    validations: [{ sqref: `A2:A${unitRowCount}`, values: ROMAN_NUMERALS }],
  });

  if (isPractical && practicalTopics.length > 0) {
    addSheet(wb, SHEET_NAMES.practicalTopics, {
      headers: ['S.No', 'Experiment / Topic'],
      rows: practicalTopics.map((t, i) => [t.number ?? i + 1, t.title ?? '']),
      colWidths: [8, 80],
    });
  }

  // BosTextbook has 4 fields (title, author, publication_year, publisher) —
  // exporter used to write only the first two, silently dropping year/publisher.
  // The importer only reads title+author back, so year/publisher are
  // export-only (not round-trip-safe) until the parser is extended.
  const bookRow = (b: any) => [
    b.title ?? '',
    b.author ?? '',
    b.publication_year ?? '',
    b.publisher ?? '',
  ];
  const bookHeaders = ['Title', 'Author', 'Publication Year', 'Publisher'];
  // 18 wch fits the 16-char 'Publication Year' header with breathing room.
  const bookColWidths = [60, 35, 18, 30];

  const primary = (syllabus.textbooks as any)?.primary ?? [];
  addSheet(wb, SHEET_NAMES.textbooks, {
    headers: bookHeaders,
    rows: primary.map(bookRow),
    colWidths: bookColWidths,
  });

  const refs = (syllabus.textbooks as any)?.references ?? [];
  addSheet(wb, SHEET_NAMES.references, {
    headers: bookHeaders,
    rows: refs.map(bookRow),
    colWidths: bookColWidths,
  });

  const webRes = (syllabus.web_resources as any)?.resources ?? [];
  addSheet(wb, SHEET_NAMES.webResources, {
    headers: ['Title', 'URL'],
    rows: webRes.map((r: any) => [r.title ?? '', r.url ?? '']),
    colWidths: [22, 50],
  });

  // Pedagogy — Anna models only.
  if (!pharmacy) {
    const methods = (syllabus.pedagogy as any)?.methods ?? [];
    const methodRowCount = Math.max(methods.length + 5, 40);
    addSheet(wb, SHEET_NAMES.pedagogy, {
      headers: ['Method'],
      rows: methods.map((m: string) => [m]),
      colWidths: [40],
      validations: [{ sqref: `A2:A${methodRowCount}`, values: PEDAGOGY_METHODS }],
    });
  }

  // ── Pharmacy: Exam Scheme + Internship replace PO Mapping + Reference Codes ──
  if (pharmacy) {
    addExamSchemeSheet(wb, syllabus.exam_scheme);
    if (syllabus.academic_model === 'mgr_pharmd') {
      addInternshipSheet(wb, syllabus.internship_postings);
    }
    return XLSX.writeBuffer(wb);
  }

  const mappings = (syllabus.po_mappings as any)?.mappings ?? [];
  const psoCodes = new Set<string>();
  const poCodes = new Set<string>();
  for (const m of mappings) {
    Object.keys(m.psos ?? {}).forEach((k) => psoCodes.add(k));
    Object.keys(m.pos ?? {}).forEach((k) => poCodes.add(k));
  }
  const numSort = (a: string, b: string) =>
    parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10);
  const psoSorted = Array.from(psoCodes).sort(numSort);
  const poSorted = Array.from(poCodes).sort(numSort);

  const poHeaders =
    psoSorted.length > 0 || poSorted.length > 0
      ? ['CO', ...psoSorted, ...poSorted]
      : ['CO', 'PSO1', 'PSO2', 'PSO3', 'PSO4', 'PSO5', 'PO1', 'PO2', 'PO3', 'PO4', 'PO5'];

  const poRows: (string | number)[][] = mappings.map((m: any) => {
    const row: (string | number)[] = [m.co_id ?? ''];
    psoSorted.forEach((code) => row.push(m.psos?.[code] ?? ''));
    poSorted.forEach((code) => row.push(m.pos?.[code] ?? ''));
    return row;
  });
  const poRowCount = Math.max(poRows.length + 5, 30);
  addSheet(wb, SHEET_NAMES.poMapping, {
    headers: poHeaders,
    rows: poRows,
    colWidths: [8, ...Array(poHeaders.length - 1).fill(6)],
    validations: poHeaders.slice(1).map((_, i) => ({
      sqref: `${String.fromCharCode(66 + i)}2:${String.fromCharCode(66 + i)}${poRowCount}`,
      values: PO_LEVELS,
    })),
  });

  addReferenceCodesSheet(wb);
  return XLSX.writeBuffer(wb);
}
