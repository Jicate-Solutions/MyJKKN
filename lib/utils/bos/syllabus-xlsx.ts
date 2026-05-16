/**
 * Build multi-sheet XLSX workbooks for the BOS syllabus module.
 * Reads use SheetJS — see syllabus-parser.ts. Writes go through excel-compat.
 *
 * Course_Info sheet intentionally omitted — institution / composition /
 * meeting / course_code etc. are picked manually in the Basic Info tab.
 */

import XLSX from '@/lib/utils/excel-compat';
import type { BosCourseSyllabus } from '@/types/bos';

export const SHEET_NAMES = {
  objectives: 'Objectives',
  clos: 'COs',
  units: 'Units',
  textbooks: 'Textbooks',
  references: 'References',
  webResources: 'WebResources',
  pedagogy: 'Pedagogy',
  poMapping: 'PO_Mapping',
  referenceCodes: 'Reference Codes',
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

  addSheet(wb, SHEET_NAMES.units, {
    headers: ['Unit *', 'Title', 'Chapter', 'Sub-topic', 'Remarks'],
    rows: [
      ['I', 'Reciprocal Equations', 'Reciprocal Equations - Standard form', '', 'Book 1 - Chapter 6'],
      ['I', '', '', 'Definition and properties of reciprocal equations', ''],
      ['I', '', '', 'Roots of standard reciprocal equations', ''],
      ['I', 'Reciprocal Equations', "Horner's method for roots of polynomials", '', ''],
      ['II', 'Series', 'Summation of Series: Binomial-Exponential-Logarithmic', '', 'Book 1 - Chapter 3'],
      ['II', '', '', 'Binomial series expansion', ''],
      ['II', '', '', 'Exponential and logarithmic series', ''],
      ['III', 'Matrices', 'Inverse of a square matrix, Characteristic equation', '', 'Book 2 - Chapter 2'],
      ['IV', 'Trigonometry', 'Expansions of sinθ, cosθ in powers of sinθ, cosθ', '', 'Book 3 - Chapter 3'],
      ['V', 'Hyperbolic Functions', 'Relation between circular and hyperbolic functions', '', 'Book 3 - Chapter 4'],
    ],
    colWidths: [10, 28, 50, 40, 30],
    validations: [{ sqref: 'A2:A60', values: ROMAN_NUMERALS, errorTitle: 'Invalid unit', error: 'Pick a Roman numeral I-X.' }],
  });

  addSheet(wb, SHEET_NAMES.textbooks, {
    headers: ['Title', 'Author'],
    rows: [
      ['Algebra Vol-I, Viswanathan Publishers, 2008', 'Manickavasagam Pillai, T.K.'],
      ['Algebra Vol-II, Viswanathan Publishers, 2008', 'Manickavasagam Pillai, T.K.'],
    ],
    colWidths: [60, 35],
  });

  addSheet(wb, SHEET_NAMES.references, {
    headers: ['Title', 'Author'],
    rows: [
      ['Theory of Equations', 'W.S. Burnstine and A.W. Panton'],
      ['Linear Algebra and its Applications, 3rd Ed., Pearson, 2007', 'David C. Lay'],
    ],
    colWidths: [60, 35],
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

  const objectives = (syllabus.course_objectives as any)?.objectives ?? [];
  const objRowCount = Math.max(objectives.length + 5, 30);
  addSheet(wb, SHEET_NAMES.objectives, {
    headers: ['Number *', 'Description *'],
    rows: objectives.map((o: any) => [o.number ?? '', o.description ?? '']),
    colWidths: [10, 80],
    validations: [{ sqref: `A2:A${objRowCount}`, values: NUMBER_LIST_1_10 }],
  });

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

  const units = (syllabus.course_content as any)?.units ?? [];
  const unitRows: (string | number)[][] = [];
  for (const u of units) {
    const chapters = u.chapters ?? [];
    if (chapters.length === 0) {
      unitRows.push([u.unit_id ?? '', u.unit_title ?? '', '', '', u.remarks ?? '']);
    } else {
      chapters.forEach((ch: any, idx: number) => {
        unitRows.push([
          u.unit_id ?? '', u.unit_title ?? '', ch.title ?? '', '',
          idx === 0 ? (u.remarks ?? '') : '',
        ]);
        const subtopics = ch.subtopics ?? [];
        for (const st of subtopics) {
          unitRows.push([u.unit_id ?? '', '', '', st.title ?? '', '']);
        }
      });
    }
  }
  const unitRowCount = Math.max(unitRows.length + 5, 60);
  addSheet(wb, SHEET_NAMES.units, {
    headers: ['Unit *', 'Title', 'Chapter', 'Sub-topic', 'Remarks'],
    rows: unitRows,
    colWidths: [10, 28, 50, 40, 30],
    validations: [{ sqref: `A2:A${unitRowCount}`, values: ROMAN_NUMERALS }],
  });

  const primary = (syllabus.textbooks as any)?.primary ?? [];
  addSheet(wb, SHEET_NAMES.textbooks, {
    headers: ['Title', 'Author'],
    rows: primary.map((b: any) => [b.title ?? '', b.author ?? '']),
    colWidths: [60, 35],
  });

  const refs = (syllabus.textbooks as any)?.references ?? [];
  addSheet(wb, SHEET_NAMES.references, {
    headers: ['Title', 'Author'],
    rows: refs.map((b: any) => [b.title ?? '', b.author ?? '']),
    colWidths: [60, 35],
  });

  const webRes = (syllabus.web_resources as any)?.resources ?? [];
  addSheet(wb, SHEET_NAMES.webResources, {
    headers: ['Title', 'URL'],
    rows: webRes.map((r: any) => [r.title ?? '', r.url ?? '']),
    colWidths: [22, 50],
  });

  const methods = (syllabus.pedagogy as any)?.methods ?? [];
  const methodRowCount = Math.max(methods.length + 5, 40);
  addSheet(wb, SHEET_NAMES.pedagogy, {
    headers: ['Method'],
    rows: methods.map((m: string) => [m]),
    colWidths: [40],
    validations: [{ sqref: `A2:A${methodRowCount}`, values: PEDAGOGY_METHODS }],
  });

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
