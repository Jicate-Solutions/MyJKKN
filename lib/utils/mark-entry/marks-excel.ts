/**
 * Excel template download + upload for CIA mark entry.
 *
 * Two templates, one per entry screen, because the two screens hold different
 * facts: the question-wise sheet has one column per QUESTION of the round's
 * paper (plus Absent), the direct sheet one column per COMPONENT of the round.
 *
 * Validation happens twice, deliberately:
 *   - In the workbook (data validation), so a wrong value is refused as it is
 *     typed. That is a convenience only — Excel validation does not fire on
 *     paste, and a custom formula is capped at 255 characters.
 *   - On upload, which is the authority. The question-wise path runs the SAME
 *     `validateLearnerMarks` the grid and the API route use, so a file can never
 *     carry in something the screen would have refused.
 *
 * An upload is all-or-nothing and only FILLS THE GRID — nothing is written to
 * the server until the user presses Save, which runs the normal save path.
 *
 * ExcelJS is loaded on demand so it stays out of the page bundle.
 */

import type ExcelJSType from 'exceljs';
import { validateLearnerMarks } from './entry-rules';
import type { EntryPart, EntryQuestion } from '@/types/mark-entry';

const MARKS_SHEET = 'Marks';
const META_SHEET = '_meta';
const HEAD = {
  sno: 'S.No',
  register: 'Register No.',
  name: 'Learner',
  absent: 'Absent',
  total: 'Total',
  /** Formula column naming the first rule a row breaks. Ignored on upload. */
  check: 'Check',
} as const;
const KIND_QUESTION_WISE = 'question-wise';
const KIND_DIRECT = 'direct';
const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Excel refuses a data-validation formula longer than this. */
const MAX_VALIDATION_FORMULA = 255;
const ABSENT_WORDS = new Set(['AB', 'A', 'ABSENT', 'Y', 'YES']);

/** Light part tints in the grid's own hue order (emerald → sky → violet → amber → rose). */
const TONES = [
  { band: 'FFA7F3D0', head: 'FFD1FAE5', cell: 'FFF0FDF4' },
  { band: 'FFBAE6FD', head: 'FFE0F2FE', cell: 'FFF0F9FF' },
  { band: 'FFDDD6FE', head: 'FFEDE9FE', cell: 'FFF5F3FF' },
  { band: 'FFFDE68A', head: 'FFFEF3C7', cell: 'FFFFFBEB' },
  { band: 'FFFECDD3', head: 'FFFFE4E6', cell: 'FFFFF1F2' },
] as const;
const NEUTRAL = { band: 'FFE2E8F0', head: 'FFF1F5F9', cell: 'FFFFFFFF' } as const;
const BORDER = { style: 'thin', color: { argb: 'FFCBD5E1' } } as const;

// ── Public types ────────────────────────────────────────────────────────────

export interface MarksImportIssue {
  /** Excel row number, when the problem belongs to one row. */
  row?: number;
  register?: string;
  message: string;
}

export interface MarksImportRow {
  learnerId: string;
  marks: Record<string, number>;
  isAbsent: boolean;
}

export interface MarksImportResult {
  /** Empty = clean. Any issue means NOTHING should be applied. */
  issues: MarksImportIssue[];
  rows: MarksImportRow[];
  /** Rows in the file with no marks and no Absent flag — left untouched. */
  blankRows: number;
}

export interface TemplateLearner {
  id: string;
  register_number: string;
  name: string;
  marks: Record<string, number>;
  is_absent?: boolean;
}

export interface DirectComponent {
  code: string;
  name: string;
  max_marks: number;
}

// ── Shared building blocks ──────────────────────────────────────────────────

interface MarkColumn {
  /** Question id or component code — the key marks are stored under. */
  key: string;
  header: string;
  max: number;
  sub?: string;
  band?: string;
  tone: number | null;
}

function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function toneOf(tone: number | null) {
  return tone == null ? NEUTRAL : TONES[tone % TONES.length];
}

function fill(argb: string): ExcelJSType.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function safeFileName(parts: Array<string | undefined>): string {
  return parts
    .filter(Boolean)
    .join('_')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-');
}

interface RowContext {
  row: number;
  /** Cell reference for another mark column on the same row, e.g. `$L7`. */
  ref: (key: string) => string;
  /** All mark cells on the row, e.g. `$D7:$N7`. */
  range: string;
  /** Absent cell on the row, or null when the sheet has no Absent column. */
  absent: string | null;
}

interface ClauseContext extends RowContext {
  /** The cell being validated, e.g. `F7`. */
  cell: string;
  col: MarkColumn;
}

interface TemplateSpec {
  kind: string;
  fileName: string;
  title: string;
  note: string;
  columns: MarkColumn[];
  learners: TemplateLearner[];
  withAbsent: boolean;
  totalMax: number;
  /** Rule clauses for one cell, MOST important first — the tail is dropped if the formula would exceed Excel's limit. */
  clauses: (ctx: ClauseContext) => string[];
  /**
   * Conditions that are TRUE when a mark cell breaks a rule BEYOND type and
   * range (those two are built in). Drives the red highlight, which — unlike
   * data validation — also reacts to pasted values.
   */
  violations: (ctx: ClauseContext) => string[];
  /** Row-level rules for the Check column: [condition TRUE when broken, message]. No double quotes in messages. */
  rowChecks: (ctx: RowContext) => Array<[string, string]>;
  errorMessage: (col: MarkColumn) => string;
  instructions: string[];
  meta: Record<string, string>;
}

async function loadExcelJS(): Promise<typeof ExcelJSType> {
  const mod = await import('exceljs');
  return (mod.default ?? mod) as typeof ExcelJSType;
}

async function buildAndDownload(spec: TemplateSpec): Promise<void> {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(MARKS_SHEET);

  const { columns, learners, withAbsent } = spec;
  const firstMarkCol = 4;
  const lastMarkCol = firstMarkCol + columns.length - 1;
  const absentCol = withAbsent ? lastMarkCol + 1 : null;
  const totalCol = lastMarkCol + (withAbsent ? 2 : 1);
  const checkCol = totalCol + 1;
  const hasBands = columns.some((c) => c.band);
  const hasSub = columns.some((c) => c.sub);

  // The Check column is a formula; make sure it is computed the moment the file opens.
  wb.calcProperties.fullCalcOnLoad = true;

  let r = 1;
  ws.mergeCells(r, 1, r, checkCol);
  ws.getCell(r, 1).value = spec.title;
  ws.getCell(r, 1).font = { bold: true, size: 12 };
  r++;
  ws.mergeCells(r, 1, r, checkCol);
  ws.getCell(r, 1).value = spec.note;
  ws.getCell(r, 1).font = { size: 9, italic: true, color: { argb: 'FF475569' } };
  ws.getCell(r, 1).alignment = { wrapText: true, vertical: 'top' };
  ws.getRow(r).height = 30;
  r++;

  if (hasBands) {
    let start = 0;
    while (start < columns.length) {
      let end = start;
      while (end + 1 < columns.length && columns[end + 1].band === columns[start].band) end++;
      const c1 = firstMarkCol + start;
      const c2 = firstMarkCol + end;
      if (c2 > c1) ws.mergeCells(r, c1, r, c2);
      const cell = ws.getCell(r, c1);
      cell.value = columns[start].band ?? '';
      cell.font = { bold: true, size: 10 };
      cell.alignment = { horizontal: 'center' };
      for (let c = c1; c <= c2; c++) {
        ws.getCell(r, c).fill = fill(toneOf(columns[start].tone).band);
        ws.getCell(r, c).border = { top: BORDER, left: BORDER, right: BORDER, bottom: BORDER };
      }
      start = end + 1;
    }
    r++;
  }

  const headerRow = r;
  const headers = [
    HEAD.sno,
    HEAD.register,
    HEAD.name,
    ...columns.map((c) => c.header),
    ...(withAbsent ? [HEAD.absent] : []),
    HEAD.total,
    HEAD.check,
  ];
  headers.forEach((h, i) => {
    const cell = ws.getCell(headerRow, i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10 };
    cell.alignment = { horizontal: i < 3 ? 'left' : 'center', vertical: 'middle', wrapText: true };
    const col = columns[i - 3];
    cell.fill = fill(col ? toneOf(col.tone).head : NEUTRAL.head);
    cell.border = { top: BORDER, left: BORDER, right: BORDER, bottom: BORDER };
  });
  r++;

  // Max-marks row. Its Register cell is blank, which is how upload skips it.
  const maxRow = r;
  ws.getCell(r, 3).value = 'Max marks';
  columns.forEach((c, i) => {
    ws.getCell(r, firstMarkCol + i).value = c.max;
  });
  if (spec.totalMax > 0) ws.getCell(r, totalCol).value = spec.totalMax;
  for (let c = 1; c <= checkCol; c++) {
    const cell = ws.getCell(r, c);
    cell.font = { size: 9, color: { argb: 'FF475569' } };
    cell.alignment = { horizontal: c <= 3 ? 'right' : 'center' };
    const col = columns[c - firstMarkCol];
    cell.fill = fill(col ? toneOf(col.tone).head : NEUTRAL.head);
    cell.border = { top: BORDER, left: BORDER, right: BORDER, bottom: BORDER };
  }
  r++;

  if (hasSub) {
    ws.getCell(r, 3).value = 'CO · K-level';
    columns.forEach((c, i) => {
      ws.getCell(r, firstMarkCol + i).value = c.sub ?? '';
    });
    for (let c = 1; c <= checkCol; c++) {
      const cell = ws.getCell(r, c);
      cell.font = { size: 8, color: { argb: 'FF64748B' } };
      cell.alignment = { horizontal: c <= 3 ? 'right' : 'center' };
      const col = columns[c - firstMarkCol];
      cell.fill = fill(col ? toneOf(col.tone).head : NEUTRAL.head);
      cell.border = { top: BORDER, left: BORDER, right: BORDER, bottom: BORDER };
    }
    r++;
  }

  const firstDataRow = r;
  const keyToCol = new Map(columns.map((c, i) => [c.key, firstMarkCol + i]));

  learners.forEach((learner, i) => {
    const row = firstDataRow + i;
    const range = `$${colLetter(firstMarkCol)}${row}:$${colLetter(lastMarkCol)}${row}`;
    const absentRef = absentCol ? `$${colLetter(absentCol)}${row}` : null;

    ws.getCell(row, 1).value = i + 1;
    ws.getCell(row, 2).value = learner.register_number;
    ws.getCell(row, 3).value = learner.name;
    ws.getCell(row, 1).alignment = { horizontal: 'center' };

    let sum = 0;
    let entered = 0;
    columns.forEach((col, ci) => {
      const c = firstMarkCol + ci;
      const cell = ws.getCell(row, c);
      const value = learner.is_absent ? undefined : learner.marks[col.key];
      if (value != null) {
        cell.value = value;
        sum += value;
        entered++;
      }
      cell.alignment = { horizontal: 'center' };
      cell.fill = fill(toneOf(col.tone).cell);
      cell.protection = { locked: false };

      const address = `${colLetter(c)}${row}`;
      const clauses = spec.clauses({
        cell: address,
        row,
        col,
        ref: (key) => `$${colLetter(keyToCol.get(key) ?? c)}${row}`,
        range,
        absent: absentRef,
      });
      // Keep as many clauses as fit; whatever is dropped is still enforced by the
      // red highlight, the Check column and the upload.
      let formula = '';
      for (let n = clauses.length; n > 0; n--) {
        const candidate = `OR(${address}="",AND(${clauses.slice(0, n).join(',')}))`;
        if (candidate.length <= MAX_VALIDATION_FORMULA) {
          formula = candidate;
          break;
        }
      }
      if (formula) {
        cell.dataValidation = {
          type: 'custom',
          // MUST be false. With "Ignore blank" on, Excel skips a custom rule
          // entirely whenever the formula touches an empty cell — and every one
          // of these reads the row's other (mostly empty) mark cells, so nothing
          // would ever be refused. Clearing a cell stays legal via the OR above.
          allowBlank: false,
          formulae: [formula],
          showErrorMessage: true,
          errorStyle: 'stop',
          errorTitle: `${col.header} — not allowed`,
          error: spec.errorMessage(col).slice(0, 250),
        };
      }
    });

    if (absentCol) {
      const cell = ws.getCell(row, absentCol);
      if (learner.is_absent) cell.value = 'AB';
      cell.alignment = { horizontal: 'center' };
      cell.protection = { locked: false };
      cell.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"AB"'],
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: 'Absent',
        error: 'Type AB if the learner did not sit the assessment, otherwise leave this blank.',
      };
    }

    const sumExpr = `IF(COUNT(${range})=0,"",SUM(${range}))`;
    ws.getCell(row, totalCol).value = {
      formula: absentRef ? `IF(${absentRef}<>"","AB",${sumExpr})` : sumExpr,
      result: learner.is_absent ? 'AB' : entered > 0 ? sum : '',
    };
    ws.getCell(row, totalCol).alignment = { horizontal: 'center' };
    ws.getCell(row, totalCol).font = { bold: true };

    // Check column — names the first rule the row breaks, or OK. It is a plain
    // formula, so it catches pasted values that data validation never sees.
    const maxRange = `$${colLetter(firstMarkCol)}$${maxRow}:$${colLetter(lastMarkCol)}$${maxRow}`;
    const rowCtx: RowContext = {
      row,
      ref: (key) => `$${colLetter(keyToCol.get(key) ?? firstMarkCol)}${row}`,
      range,
      absent: absentRef,
    };
    const checks: Array<[string, string]> = [
      // Order matters: the later tests would error on text, and IF only
      // evaluates the branch it takes.
      [`COUNTA(${range})<>COUNT(${range})`, 'Marks must be numbers'],
      [`SUMPRODUCT(--(${range}>${maxRange}))+COUNTIF(${range},"<0")>0`, 'Mark outside 0 to max'],
      [`SUMPRODUCT(--(MOD(${range},1)<>0))>0`, 'Whole numbers only'],
      ...spec.rowChecks(rowCtx),
      ...(spec.totalMax > 0
        ? ([[`SUM(${range})>${spec.totalMax}`, `Total over ${spec.totalMax}`]] as Array<[string, string]>)
        : []),
    ];
    let checkFormula = '"OK"';
    for (let n = checks.length - 1; n >= 0; n--) {
      checkFormula = `IF(${checks[n][0]},"${checks[n][1]}",${checkFormula})`;
    }
    const untouched = absentRef
      ? `AND(COUNTA(${range})=0,${absentRef}="")`
      : `COUNTA(${range})=0`;
    ws.getCell(row, checkCol).value = { formula: `IF(${untouched},"",${checkFormula})` };
    ws.getCell(row, checkCol).font = { size: 9 };

    for (let c = 1; c <= checkCol; c++) {
      ws.getCell(row, c).border = { top: BORDER, left: BORDER, right: BORDER, bottom: BORDER };
    }
  });

  const lastDataRow = firstDataRow + Math.max(learners.length, 1) - 1;
  // A conditional-format fill takes its colour from bgColor — fgColor (what a
  // normal cell fill uses) is silently ignored there.
  const BAD = {
    fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFECACA' } } as ExcelJSType.Fill,
    font: { bold: true, color: { argb: 'FFB91C1C' } },
  };
  let priority = 1;

  // Red highlight on any mark cell that breaks a rule. Conditional formatting
  // re-evaluates on paste and fill-down, which is exactly where data validation
  // is blind. References are relative to the first data row; Excel shifts them.
  columns.forEach((col, ci) => {
    const c = firstMarkCol + ci;
    const letter = colLetter(c);
    const cell = `${letter}${firstDataRow}`;
    const extra = spec.violations({
      cell,
      row: firstDataRow,
      col,
      ref: (key) => `$${colLetter(keyToCol.get(key) ?? c)}${firstDataRow}`,
      range: `$${colLetter(firstMarkCol)}${firstDataRow}:$${colLetter(lastMarkCol)}${firstDataRow}`,
      absent: absentCol ? `$${colLetter(absentCol)}${firstDataRow}` : null,
    });
    const broken = [`${cell}<>INT(${cell})`, `${cell}<0`, `${cell}>${col.max}`, ...extra].join(',');
    ws.addConditionalFormatting({
      ref: `${letter}${firstDataRow}:${letter}${lastDataRow}`,
      rules: [
        {
          type: 'expression',
          priority: priority++,
          // Text in a mark cell is itself a violation; the numeric tests only run on numbers.
          formulae: [`IF(ISNUMBER(${cell}),OR(${broken}),${cell}<>"")`],
          style: BAD,
        },
      ],
    });
  });

  if (spec.totalMax > 0) {
    const t = colLetter(totalCol);
    ws.addConditionalFormatting({
      ref: `${t}${firstDataRow}:${t}${lastDataRow}`,
      rules: [
        {
          type: 'expression',
          priority: priority++,
          formulae: [`AND(ISNUMBER($${t}${firstDataRow}),$${t}${firstDataRow}>${spec.totalMax})`],
          style: BAD,
        },
      ],
    });
  }

  const k = colLetter(checkCol);
  ws.addConditionalFormatting({
    ref: `${k}${firstDataRow}:${k}${lastDataRow}`,
    rules: [
      {
        type: 'expression',
        priority: priority++,
        formulae: [`$${k}${firstDataRow}="OK"`],
        style: { font: { bold: true, color: { argb: 'FF15803D' } } },
      },
      {
        type: 'expression',
        priority: priority++,
        formulae: [`AND($${k}${firstDataRow}<>"",$${k}${firstDataRow}<>"OK")`],
        style: BAD,
      },
    ],
  });

  ws.getColumn(1).width = 7;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 30;
  columns.forEach((c, i) => {
    ws.getColumn(firstMarkCol + i).width = Math.max(8, Math.min(c.header.length + 3, 22));
  });
  if (absentCol) ws.getColumn(absentCol).width = 9;
  ws.getColumn(totalCol).width = 9;
  ws.getColumn(checkCol).width = 30;
  ws.views =[{ state: 'frozen', xSplit: 3, ySplit: firstDataRow - 1 }];

  // Only the mark and Absent cells are unlocked: register numbers and headers
  // are what the upload matches on, so they must not be edited.
  await ws.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatColumns: true,
    formatRows: true,
  });

  const info = wb.addWorksheet('Instructions');
  info.getColumn(1).width = 110;
  spec.instructions.forEach((line, i) => {
    info.getCell(i + 1, 1).value = line;
    info.getCell(i + 1, 1).alignment = { wrapText: true, vertical: 'top' };
  });
  info.getCell(1, 1).font = { bold: true, size: 13 };

  const meta = wb.addWorksheet(META_SHEET, { state: 'veryHidden' });
  const columnMap: Record<string, string> = {};
  columns.forEach((c, i) => {
    columnMap[String(firstMarkCol + i)] = c.key;
  });
  Object.entries({ ...spec.meta, kind: spec.kind, columns: JSON.stringify(columnMap) }).forEach(
    ([key, value], i) => {
      meta.getCell(i + 1, 1).value = key;
      meta.getCell(i + 1, 2).value = value;
    }
  );

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = spec.fileName;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Reading ─────────────────────────────────────────────────────────────────

function plain(v: ExcelJSType.CellValue | undefined): string | number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' ? null : t;
  }
  if (typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    const o = v as unknown as Record<string, unknown>;
    if ('formula' in o || 'sharedFormula' in o) {
      return plain((o.result ?? null) as ExcelJSType.CellValue);
    }
    if (Array.isArray(o.richText)) {
      return plain((o.richText as Array<{ text?: string }>).map((t) => t.text ?? '').join(''));
    }
    if ('text' in o) return plain(String(o.text ?? ''));
    if ('error' in o) return String(o.error);
  }
  return String(v);
}

interface SheetRow {
  rowNumber: number;
  register: string;
  at: (col: number) => string | number | null;
}

interface ParsedSheet {
  meta: Record<string, string>;
  /** Mark-column index → key, as written at download. Empty when _meta is gone. */
  metaColumns: Record<string, string>;
  headers: Array<{ col: number; text: string }>;
  rows: SheetRow[];
}

async function readSheet(file: File): Promise<ParsedSheet | { fatal: string }> {
  if (!/\.xlsx$/i.test(file.name)) {
    return { fatal: 'Upload the .xlsx template downloaded from this page (.xls and .csv are not accepted).' };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { fatal: 'The file is larger than 5 MB — upload the template, not a workbook with other sheets.' };
  }

  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    return { fatal: 'The file could not be read. Download a fresh template and fill that in.' };
  }

  const ws =
    wb.getWorksheet(MARKS_SHEET) ??
    wb.worksheets.find((w) => w.name !== META_SHEET && w.name !== 'Instructions');
  if (!ws) return { fatal: `The file has no "${MARKS_SHEET}" sheet.` };

  let headerRow = 0;
  for (let r = 1; r <= Math.min(ws.rowCount, 25) && !headerRow; r++) {
    ws.getRow(r).eachCell((cell) => {
      const text = plain(cell.value);
      if (typeof text === 'string' && text.toLowerCase() === HEAD.register.toLowerCase()) {
        headerRow = r;
      }
    });
  }
  if (!headerRow) {
    return { fatal: `No "${HEAD.register}" header found — the header rows of the template must be kept.` };
  }

  const headers: ParsedSheet['headers'] = [];
  ws.getRow(headerRow).eachCell((cell, col) => {
    const text = plain(cell.value);
    if (text != null) headers.push({ col, text: String(text) });
  });
  const registerCol = headers.find((h) => h.text.toLowerCase() === HEAD.register.toLowerCase())!.col;

  const rows: SheetRow[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const register = plain(row.getCell(registerCol).value);
    // The Max-marks and CO rows have no register number, so they fall out here.
    if (register == null) continue;
    rows.push({
      rowNumber: r,
      register: String(register).trim(),
      at: (col) => plain(row.getCell(col).value),
    });
  }

  const meta: Record<string, string> = {};
  const metaWs = wb.getWorksheet(META_SHEET);
  metaWs?.eachRow((row) => {
    const key = plain(row.getCell(1).value);
    const value = plain(row.getCell(2).value);
    if (key != null && value != null) meta[String(key)] = String(value);
  });
  let metaColumns: Record<string, string> = {};
  try {
    if (meta.columns) metaColumns = JSON.parse(meta.columns) as Record<string, string>;
  } catch {
    metaColumns = {};
  }

  return { meta, metaColumns, headers, rows };
}

type MarkCell = { kind: 'empty' } | { kind: 'value'; value: number } | { kind: 'bad'; raw: string };

function readMark(raw: string | number | null): MarkCell {
  if (raw == null) return { kind: 'empty' };
  if (typeof raw === 'number') return { kind: 'value', value: raw };
  if (/^-?\d+(\.\d+)?$/.test(raw)) return { kind: 'value', value: Number(raw) };
  return { kind: 'bad', raw };
}

interface ResolvedColumn {
  col: number;
  key: string;
  header: string;
}

interface CollectedRow {
  rowNumber: number;
  register: string;
  learnerId: string;
  marks: Record<string, number>;
  isAbsent: boolean;
}

/**
 * Walks the data rows once: matches each to a learner, reads the mark cells and
 * the Absent flag, and reports everything that is wrong with the row's SHAPE.
 * Whether the marks obey the paper is the caller's job.
 */
function collectRows(
  sheet: ParsedSheet,
  learners: TemplateLearner[],
  markCols: ResolvedColumn[],
  absentCol: number | null,
  issues: MarksImportIssue[]
): CollectedRow[] {
  const byRegister = new Map(learners.map((l) => [l.register_number.trim().toUpperCase(), l]));
  const seen = new Map<string, number>();
  const out: CollectedRow[] = [];

  for (const row of sheet.rows) {
    const key = row.register.toUpperCase();
    const where = { row: row.rowNumber, register: row.register };

    const learner = byRegister.get(key);
    if (!learner) {
      issues.push({ ...where, message: 'is not in the learner list for this course — remove the row' });
      continue;
    }
    const firstSeen = seen.get(key);
    if (firstSeen) {
      issues.push({ ...where, message: `appears twice (also on row ${firstSeen})` });
      continue;
    }
    seen.set(key, row.rowNumber);

    const marks: Record<string, number> = {};
    for (const mc of markCols) {
      const cell = readMark(row.at(mc.col));
      if (cell.kind === 'value') marks[mc.key] = cell.value;
      else if (cell.kind === 'bad') {
        const looksAbsent = ABSENT_WORDS.has(cell.raw.toUpperCase());
        issues.push({
          ...where,
          message: looksAbsent && absentCol
            ? `${mc.header} holds "${cell.raw}" — record absence in the ${HEAD.absent} column, not in a mark cell`
            : `${mc.header} holds "${cell.raw}" — a mark must be a whole number`,
        });
      }
    }

    let isAbsent = false;
    if (absentCol) {
      const raw = row.at(absentCol);
      if (raw != null) {
        if (ABSENT_WORDS.has(String(raw).toUpperCase())) isAbsent = true;
        else {
          issues.push({
            ...where,
            message: `${HEAD.absent} holds "${raw}" — use AB, or leave it blank`,
          });
        }
      }
    }

    out.push({ rowNumber: row.rowNumber, register: row.register, learnerId: learner.id, marks, isAbsent });
  }
  return out;
}

function findHeader(sheet: ParsedSheet, text: string): number | null {
  const hit = sheet.headers.find((h) => h.text.trim().toLowerCase() === text.toLowerCase());
  return hit ? hit.col : null;
}

/** File-level problems first, then top to bottom, so the list reads like the sheet. */
function inRowOrder(issues: MarksImportIssue[]): MarksImportIssue[] {
  return [...issues].sort((a, b) => (a.row ?? 0) - (b.row ?? 0));
}

const RESERVED_HEADERS = new Set(Object.values(HEAD).map((h) => h.toLowerCase()));

// ── Question-wise ───────────────────────────────────────────────────────────

interface QuestionWiseContext {
  paper: {
    id: string;
    course_code?: string;
    subject_title?: string;
    set_label?: string;
    set_number?: number;
    questions: EntryQuestion[];
    parts: EntryPart[];
  };
  roundName: string;
  componentCode: string;
  componentName: string;
  componentMax: number;
  learners: TemplateLearner[];
}

function questionHeader(q: EntryQuestion): string {
  return `Q${q.label}`;
}

export async function downloadQuestionWiseTemplate(ctx: QuestionWiseContext): Promise<void> {
  const { paper, componentMax } = ctx;
  const partIndex = new Map(paper.parts.map((p, i) => [p.part_label, i]));
  const partByLabel = new Map(paper.parts.map((p) => [p.part_label, p]));

  const columns: MarkColumn[] = paper.questions.map((q) => {
    const part = partByLabel.get(q.part_label);
    return {
      key: q.id,
      header: questionHeader(q),
      max: q.marks,
      sub: [q.co_code, q.k_level].filter(Boolean).join(' · '),
      band:
        `PART ${q.part_label}` +
        (part?.num_to_answer != null ? ` — any ${part.num_to_answer} of ${part.group_count}` : ''),
      tone: partIndex.get(q.part_label) ?? 0,
    };
  });

  const byId = new Map(paper.questions.map((q) => [q.id, q]));
  const siblingsOf = (q: EntryQuestion) =>
    paper.questions.filter((o) => o.id !== q.id && o.choice_group === q.choice_group);

  const restrictions = paper.parts
    .filter((p) => p.num_to_answer != null)
    .map((p) => `Part ${p.part_label}: answer any ${p.num_to_answer} of ${p.group_count} (an OR pair counts as one).`);
  const orGroups = [...new Set(paper.questions.map((q) => q.choice_group))]
    .map((g) => paper.questions.filter((q) => q.choice_group === g))
    .filter((group) => group.length > 1);
  const orPairs = orGroups.map((group) => group.map(questionHeader).join(' / '));

  /** Number of choice groups in a part that hold a mark — an OR pair counts once. */
  const answeredGroupsExpr = (partLabel: string, ref: (key: string) => string): string => {
    const groups = new Map<string, string[]>();
    for (const o of paper.questions) {
      if (o.part_label !== partLabel) continue;
      groups.set(o.choice_group, [...(groups.get(o.choice_group) ?? []), ref(o.id)]);
    }
    // SIGN, not `(COUNT(..)>0)`: with a single group that would leave a bare
    // boolean, and Excel ranks TRUE above every number — `TRUE<=1` is FALSE.
    return [...groups.values()].map((cells) => `SIGN(COUNT(${cells.join(',')}))`).join('+');
  };

  await buildAndDownload({
    kind: KIND_QUESTION_WISE,
    fileName: `${safeFileName([paper.course_code, ctx.roundName, 'question-wise-marks'])}.xlsx`,
    title:
      `${paper.course_code ?? ''} ${paper.subject_title ?? ''} · ${ctx.roundName}` +
      (paper.set_label || paper.set_number ? ` · Set ${paper.set_label ?? paper.set_number}` : '') +
      ` · Marks go to ${ctx.componentName} (max ${componentMax})`,
    note:
      'Blank = not attempted. 0 = attempted and scored zero. Type AB in the Absent column for a learner who did not sit. ' +
      'Fill only the coloured mark cells — do not edit register numbers or headers.',
    columns,
    learners: ctx.learners,
    withAbsent: true,
    totalMax: componentMax,
    clauses: ({ cell, col, ref, range, absent }) => {
      const q = byId.get(col.key)!;
      const out = [`ISNUMBER(${cell})`, `${cell}=INT(${cell})`, `${cell}>=0`, `${cell}<=${q.marks}`];
      if (absent) out.push(`${absent}=""`);
      const siblings = siblingsOf(q);
      if (siblings.length) out.push(`COUNT(${siblings.map((s) => ref(s.id)).join(',')})=0`);
      if (componentMax > 0) out.push(`SUM(${range})<=${componentMax}`);
      const part = partByLabel.get(q.part_label);
      if (part?.num_to_answer != null) {
        out.push(`${answeredGroupsExpr(q.part_label, ref)}<=${part.num_to_answer}`);
      }
      return out;
    },
    violations: ({ col, ref, absent }) => {
      const q = byId.get(col.key)!;
      const out: string[] = [];
      if (absent) out.push(`${absent}<>""`);
      const siblings = siblingsOf(q);
      if (siblings.length) out.push(`COUNT(${siblings.map((s) => ref(s.id)).join(',')})>0`);
      const part = partByLabel.get(q.part_label);
      if (part?.num_to_answer != null) {
        out.push(`${answeredGroupsExpr(q.part_label, ref)}>${part.num_to_answer}`);
      }
      return out;
    },
    rowChecks: ({ ref, range, absent }) => {
      const out: Array<[string, string]> = [];
      if (absent) out.push([`AND(${absent}<>"",COUNTA(${range})>0)`, 'AB but has marks']);
      for (const group of orGroups) {
        out.push([
          `COUNT(${group.map((o) => ref(o.id)).join(',')})>1`,
          `Only one of ${group.map(questionHeader).join(' / ')}`,
        ]);
      }
      for (const part of paper.parts) {
        if (part.num_to_answer == null) continue;
        out.push([
          `${answeredGroupsExpr(part.part_label, ref)}>${part.num_to_answer}`,
          `Part ${part.part_label}: answer any ${part.num_to_answer}`,
        ]);
      }
      return out;
    },
    errorMessage: (col) => {
      const q = byId.get(col.key)!;
      const part = partByLabel.get(q.part_label);
      const siblings = siblingsOf(q);
      return [
        `Whole number from 0 to ${q.marks}.`,
        siblings.length ? `Only one of ${[q, ...siblings].map(questionHeader).join(' / ')} may be answered.` : '',
        part?.num_to_answer != null ? `Part ${q.part_label}: answer any ${part.num_to_answer}.` : '',
        componentMax > 0 ? `Row total cannot exceed ${componentMax}.` : '',
        'No marks for a learner marked AB.',
      ]
        .filter(Boolean)
        .join(' ');
    },
    instructions: [
      'Question-wise mark entry — how to fill this sheet',
      '',
      `Course: ${paper.course_code ?? ''} ${paper.subject_title ?? ''}`,
      `Assessment: ${ctx.roundName} · marks go to ${ctx.componentName} (max ${componentMax})`,
      '',
      '1. Enter marks on the "Marks" sheet, one learner per row, one question per column.',
      '2. Each mark is a whole number from 0 up to that question\'s max (shown in the "Max marks" row).',
      '3. Leave a cell blank when the question was not attempted. Enter 0 only when it was attempted and scored zero.',
      ...(orPairs.length
        ? [`4. OR choices — only one question of each pair may hold a mark: ${orPairs.join('; ')}.`]
        : ['4. This paper has no OR choices.']),
      ...(restrictions.length ? restrictions.map((t, i) => `${5 + i}. ${t}`) : ['5. Every part is answer-all.']),
      `${5 + Math.max(restrictions.length, 1)}. A learner's total cannot exceed the component max (${componentMax}); an over-limit total turns red.`,
      `${6 + Math.max(restrictions.length, 1)}. For a learner who did not sit, type AB in the Absent column and leave every mark blank.`,
      `${7 + Math.max(restrictions.length, 1)}. Rows left completely blank are ignored on upload — those learners keep whatever is on screen.`,
      '',
      'Checking your work in this sheet: a mark that breaks a rule turns red, and the Check column on the right names the problem (or says OK).',
      'Typing a wrong value is refused outright. Pasted values are not refused by Excel, so look for red cells and the Check column after pasting.',
      'Upload checks every rule again. If anything is wrong, nothing is imported and each problem is listed with its row.',
      'An upload only fills the on-screen grid — press Save there to store the marks.',
      'This file is tied to one question paper. If the paper or its set changes, download a fresh template.',
    ],
    meta: { paper_id: paper.id, component_code: ctx.componentCode },
  });
}

export async function parseQuestionWiseUpload(
  file: File,
  ctx: Pick<QuestionWiseContext, 'paper' | 'componentMax' | 'learners'>
): Promise<MarksImportResult> {
  const sheet = await readSheet(file);
  if ('fatal' in sheet) return { issues: [{ message: sheet.fatal }], rows: [], blankRows: 0 };

  const { paper } = ctx;
  const fatal = (message: string): MarksImportResult => ({ issues: [{ message }], rows: [], blankRows: 0 });

  if (sheet.meta.kind && sheet.meta.kind !== KIND_QUESTION_WISE) {
    return fatal('This is a direct-entry template. Download the question-wise template from this screen.');
  }
  if (sheet.meta.paper_id && sheet.meta.paper_id !== paper.id) {
    return fatal(
      'This file was downloaded for a different question paper (another course, round or set). Download a fresh template.'
    );
  }

  const issues: MarksImportIssue[] = [];
  const byId = new Map(paper.questions.map((q) => [q.id, q]));
  const byLabel = new Map<string, EntryQuestion[]>();
  for (const q of paper.questions) {
    const k = questionHeader(q).toUpperCase();
    byLabel.set(k, [...(byLabel.get(k) ?? []), q]);
  }

  const markCols: ResolvedColumn[] = [];
  const mapped = new Set<string>();
  for (const h of sheet.headers) {
    const text = h.text.trim();
    if (RESERVED_HEADERS.has(text.toLowerCase())) continue;
    // Prefer the position recorded at download; fall back to the header label
    // for a file whose hidden sheet was lost in a round-trip through another app.
    const viaMeta = byId.get(sheet.metaColumns[String(h.col)] ?? '');
    const viaLabel = byLabel.get(text.toUpperCase()) ?? [];
    const q = viaMeta && questionHeader(viaMeta).toUpperCase() === text.toUpperCase()
      ? viaMeta
      : viaLabel.length === 1
        ? viaLabel[0]
        : undefined;
    if (!q) {
      issues.push({ message: `Column "${text}" is not a question in this paper — the header row must not be edited` });
      continue;
    }
    if (mapped.has(q.id)) {
      issues.push({ message: `Column "${text}" appears more than once` });
      continue;
    }
    mapped.add(q.id);
    markCols.push({ col: h.col, key: q.id, header: questionHeader(q) });
  }
  const missing = paper.questions.filter((q) => !mapped.has(q.id)).map(questionHeader);
  if (missing.length) {
    issues.push({ message: `Missing question column(s): ${missing.join(', ')} — download a fresh template` });
  }
  if (issues.length) return { issues, rows: [], blankRows: 0 };

  const collected = collectRows(sheet, ctx.learners, markCols, findHeader(sheet, HEAD.absent), issues);

  const rows: MarksImportRow[] = [];
  let blankRows = 0;
  for (const row of collected) {
    const where = { row: row.rowNumber, register: row.register };
    const hasMarks = Object.keys(row.marks).length > 0;
    if (!hasMarks && !row.isAbsent) {
      blankRows++;
      continue;
    }
    if (row.isAbsent && hasMarks) {
      issues.push({ ...where, message: 'is marked AB but also has marks — clear one or the other' });
      continue;
    }
    if (!row.isAbsent) {
      // The same function the grid and the API route use — one definition of "valid".
      for (const message of validateLearnerMarks(row.marks, paper.questions, paper.parts, ctx.componentMax)) {
        issues.push({ ...where, message });
      }
    }
    rows.push({ learnerId: row.learnerId, marks: row.isAbsent ? {} : row.marks, isAbsent: row.isAbsent });
  }

  if (!issues.length && rows.length === 0) {
    issues.push({ message: 'The file has no marks in it — fill the template in before uploading.' });
  }
  return { issues: inRowOrder(issues), rows: issues.length ? [] : rows, blankRows };
}

// ── Direct (component-wise) ─────────────────────────────────────────────────

interface DirectContext {
  courseCode?: string;
  roundName: string;
  components: DirectComponent[];
  /** Round total — the ceiling a learner's components may sum to. */
  maxInternalMarks: number;
  learners: TemplateLearner[];
}

export async function downloadDirectTemplate(ctx: DirectContext): Promise<void> {
  const { components, maxInternalMarks } = ctx;
  const byCode = new Map(components.map((c) => [c.code, c]));

  await buildAndDownload({
    kind: KIND_DIRECT,
    fileName: `${safeFileName([ctx.courseCode, ctx.roundName, 'direct-marks'])}.xlsx`,
    title:
      `${ctx.courseCode ? `${ctx.courseCode} · ` : ''}${ctx.roundName} · component totals` +
      (maxInternalMarks > 0 ? ` (round max ${maxInternalMarks})` : ''),
    note:
      'Enter one total per component. Blank = not entered yet. ' +
      'Fill only the mark cells — do not edit register numbers or headers.',
    columns: components.map((c) => ({
      key: c.code,
      header: c.name,
      max: Number(c.max_marks) || 0,
      tone: null,
    })),
    learners: ctx.learners,
    withAbsent: false,
    totalMax: maxInternalMarks,
    clauses: ({ cell, col, range }) => {
      const out = [
        `ISNUMBER(${cell})`,
        `${cell}=INT(${cell})`,
        `${cell}>=0`,
        `${cell}<=${Number(byCode.get(col.key)?.max_marks) || 0}`,
      ];
      if (maxInternalMarks > 0) out.push(`SUM(${range})<=${maxInternalMarks}`);
      return out;
    },
    // Type, range and the row total are all built in — a component has no other rules.
    violations: () => [],
    rowChecks: () => [],
    errorMessage: (col) =>
      [
        `Whole number from 0 to ${col.max}.`,
        maxInternalMarks > 0 ? `Row total cannot exceed ${maxInternalMarks}.` : '',
      ]
        .filter(Boolean)
        .join(' '),
    instructions: [
      'Direct mark entry — how to fill this sheet',
      '',
      `Assessment: ${ctx.courseCode ? `${ctx.courseCode} · ` : ''}${ctx.roundName}`,
      '',
      '1. Enter marks on the "Marks" sheet, one learner per row, one component per column.',
      '2. Each mark is a whole number from 0 up to that component\'s max (shown in the "Max marks" row).',
      maxInternalMarks > 0
        ? `3. A learner's total across components cannot exceed ${maxInternalMarks}; an over-limit total turns red.`
        : '3. Leave a cell blank when that component is not entered yet.',
      '4. Rows left completely blank are ignored on upload — those learners keep whatever is on screen.',
      '',
      'Checking your work in this sheet: a mark that breaks a rule turns red, and the Check column on the right names the problem (or says OK).',
      'Typing a wrong value is refused outright. Pasted values are not refused by Excel, so look for red cells and the Check column after pasting.',
      'Upload checks every rule again. If anything is wrong, nothing is imported and each problem is listed with its row.',
      'An upload only fills the on-screen grid — press Save there to store the marks.',
    ],
    meta: {},
  });
}

export async function parseDirectUpload(
  file: File,
  ctx: Pick<DirectContext, 'components' | 'maxInternalMarks' | 'learners'>
): Promise<MarksImportResult> {
  const sheet = await readSheet(file);
  if ('fatal' in sheet) return { issues: [{ message: sheet.fatal }], rows: [], blankRows: 0 };

  if (sheet.meta.kind && sheet.meta.kind !== KIND_DIRECT) {
    return {
      issues: [{ message: 'This is a question-wise template. Download the direct-entry template from this screen.' }],
      rows: [],
      blankRows: 0,
    };
  }

  const issues: MarksImportIssue[] = [];
  const byCode = new Map(ctx.components.map((c) => [c.code, c]));
  const byName = new Map<string, DirectComponent[]>();
  for (const c of ctx.components) {
    const k = c.name.trim().toLowerCase();
    byName.set(k, [...(byName.get(k) ?? []), c]);
  }

  const markCols: ResolvedColumn[] = [];
  const mapped = new Set<string>();
  for (const h of sheet.headers) {
    const text = h.text.trim();
    if (RESERVED_HEADERS.has(text.toLowerCase())) continue;
    const viaMeta = byCode.get(sheet.metaColumns[String(h.col)] ?? '');
    const viaName = byName.get(text.toLowerCase()) ?? [];
    const comp = viaMeta && viaMeta.name.trim().toLowerCase() === text.toLowerCase()
      ? viaMeta
      : viaName.length === 1
        ? viaName[0]
        : undefined;
    if (!comp) {
      issues.push({ message: `Column "${text}" is not a component of this round — the header row must not be edited` });
      continue;
    }
    if (mapped.has(comp.code)) {
      issues.push({ message: `Column "${text}" appears more than once` });
      continue;
    }
    mapped.add(comp.code);
    markCols.push({ col: h.col, key: comp.code, header: comp.name });
  }
  const missing = ctx.components.filter((c) => !mapped.has(c.code)).map((c) => c.name);
  if (missing.length) {
    issues.push({ message: `Missing component column(s): ${missing.join(', ')} — download a fresh template` });
  }
  if (issues.length) return { issues, rows: [], blankRows: 0 };

  const collected = collectRows(sheet, ctx.learners, markCols, null, issues);

  const rows: MarksImportRow[] = [];
  let blankRows = 0;
  for (const row of collected) {
    const where = { row: row.rowNumber, register: row.register };
    const entries = Object.entries(row.marks);
    if (entries.length === 0) {
      blankRows++;
      continue;
    }
    let total = 0;
    for (const [code, value] of entries) {
      const comp = byCode.get(code)!;
      const max = Number(comp.max_marks) || 0;
      total += value;
      if (!Number.isInteger(value)) {
        issues.push({ ...where, message: `${comp.name} mark (${value}) must be a whole number` });
      } else if (value < 0) {
        issues.push({ ...where, message: `${comp.name} mark cannot be negative` });
      } else if (value > max) {
        issues.push({ ...where, message: `${comp.name} mark (${value}) exceeds its max (${max})` });
      }
    }
    if (ctx.maxInternalMarks > 0 && total > ctx.maxInternalMarks) {
      issues.push({ ...where, message: `total (${total}) exceeds the round max (${ctx.maxInternalMarks})` });
    }
    rows.push({ learnerId: row.learnerId, marks: row.marks, isAbsent: false });
  }

  if (!issues.length && rows.length === 0) {
    issues.push({ message: 'The file has no marks in it — fill the template in before uploading.' });
  }
  return { issues: inRowOrder(issues), rows: issues.length ? [] : rows, blankRows };
}
