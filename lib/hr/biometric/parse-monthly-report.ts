/**
 * Parser for the biometric machine's "Monthly_Performance_Report" export.
 * Created: 2026-08-06.
 * Plan: docs/superpowers/plans/2026-08-06-biometric-attendance-ingestion.md
 *
 * The export is a PIVOTED MATRIX, not one row per punch:
 *
 *   +0  Dept. Name │ <institution code> │ … │ CompName │ <institution name>
 *                                            │ … │ Report Month │ July-2026
 *   +1  Empcode │ 00002 │ Name │ Gunasekaran S │ Present │ 27 │ WO │ 0
 *                                │ Absent │ 4 │ Total Work │ 212:30 │ Total OT │ 20:50
 *   +2  (day)     │  1  │  2  │ …  │ 31
 *   +3  (weekday) │ Wed │ Thu │ …  │ Fri
 *   +4  IN        │08:58│09:00│ …  │ --:--
 *   +5  OUT       │18:15│18:06│ …  │ --:--
 *   +6  WORK      │08:30│08:30│ …  │ 00:00
 *   +7  Break     │00:00│00:00│ …
 *   +8  OT        │00:46│00:36│ …
 *   +9  Status    │  P  │  P  │ A  │ …
 *
 * …repeating every 10 rows, once per employee.
 *
 * Read with SheetJS, NOT ExcelJS: the real exports are legacy BIFF `.xls`
 * (OLE2 magic d0cf11e0) which ExcelJS cannot open at all. SheetJS reads both
 * `.xls` and `.xlsx`.
 *
 * The grid parser is pure so it can be unit-tested offline against the real
 * file without a Supabase client or a running server.
 */

import * as XLSX from 'xlsx';

export interface BiometricDayCell {
  /** Day of month, 1-31. */
  day: number;
  /** 'Mon'..'Sun' as printed by the machine. */
  weekday: string;
  /** ISO date, resolved from the report month. */
  workDate: string;
  /** 'HH:MM', or null when the machine printed '--:--'. */
  inTime: string | null;
  outTime: string | null;
  workMinutes: number | null;
  breakMinutes: number | null;
  overtimeMinutes: number | null;
  /** The machine's own verdict, verbatim. Typically 'P' or 'A'. */
  deviceStatus: string;
}

export interface BiometricEmployee {
  /** Empcode — the machine's enrolment code, verbatim (e.g. '00002', '605'). */
  code: string;
  /** Name as held by the machine. Display only — never used for matching. */
  name: string;
  summary: {
    present: number | null;
    weeklyOff: number | null;
    absent: number | null;
    totalWorkMinutes: number | null;
    totalOvertimeMinutes: number | null;
  };
  days: BiometricDayCell[];
}

export interface BiometricReport {
  /** Dept. Name — configured on the machine to hold the institution code. */
  institutionCode: string;
  /** CompName — configured to hold the institution name. Tiebreaker when the code is ambiguous. */
  institutionName: string;
  /** 'July-2026' as printed. */
  monthLabel: string;
  year: number;
  /** 1-12. */
  month: number;
  employees: BiometricEmployee[];
  /**
   * First and last day-of-month carrying a punch ANYWHERE in the file, or null
   * when the file holds no punch at all.
   *
   * This DECIDES NOTHING. The importer processes the range the user chose; this
   * pair only lets it say "you asked for all 30 days but this export stops on
   * the 15th" before it marks half a month absent. A mid-month export is the
   * normal case here — the report is pulled fortnightly — so the tail of blank
   * columns is expected, not a fault.
   */
  punchDayFrom: number | null;
  punchDayTo: number | null;
  /** Non-fatal problems worth showing the user. */
  warnings: string[];
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

const S = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

/** '--:--', '', '-' and friends all mean "no punch". */
function parseClock(raw: string): string | null {
  const v = raw.trim();
  if (v === '' || /^-+:?-*$/.test(v)) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(v);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

/**
 * Durations are 'H:MM' and may exceed 24h ('212:30' for a month).
 * Tolerant of the malformed single-digit minutes the machine emits ('219:4').
 */
function parseDuration(raw: string): number | null {
  const v = raw.trim();
  if (v === '' || /^-+:?-*$/.test(v)) return null;
  const m = /^(\d+):(\d{1,2})$/.exec(v);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function parseIntOrNull(raw: string): number | null {
  const v = raw.trim();
  if (!/^\d+$/.test(v)) return null;
  return Number(v);
}

/**
 * Find a labelled value by scanning right from the label rather than trusting
 * a fixed column. The machine pads with merged cells, so the value sits 1-3
 * columns after its label and the offset is not constant between labels.
 */
function valueAfterLabel(row: unknown[], label: string, maxAhead = 4): string {
  const want = label.toLowerCase();
  for (let c = 0; c < row.length; c++) {
    if (S(row[c]).toLowerCase() !== want) continue;
    for (let k = c + 1; k <= Math.min(c + maxAhead, row.length - 1); k++) {
      const v = S(row[k]);
      if (v !== '') return v;
    }
    return '';
  }
  return '';
}

function parseMonthLabel(label: string): { year: number; month: number } | null {
  const m = /^\s*([A-Za-z]+)\s*[-/ ]\s*(\d{4})\s*$/.exec(label);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo) return { year: Number(m[2]), month: mo };
    return null;
  }
  const n = /^\s*(\d{1,2})\s*[-/ ]\s*(\d{4})\s*$/.exec(label);
  if (n) {
    const mo = Number(n[1]);
    if (mo >= 1 && mo <= 12) return { year: Number(n[2]), month: mo };
  }
  return null;
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Last day of a 1-based month. Day 0 of month m+1 is the last day of month m. */
export const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Rows +4..+9 are labelled in column A; match on the label, never on order. */
const METRIC_ROWS = ['in', 'out', 'work', 'break', 'ot', 'status'] as const;
type MetricRow = (typeof METRIC_ROWS)[number];

/**
 * Parse an already-decoded sheet grid. Pure — no I/O, no Supabase.
 * `aoa` is the sheet as an array of row arrays (SheetJS `header: 1`).
 */
export function parseMonthlyReportGrid(aoa: unknown[][]): BiometricReport {
  const warnings: string[] = [];
  const employees: BiometricEmployee[] = [];

  let institutionCode = '';
  let institutionName = '';
  let monthLabel = '';

  for (let base = 0; base + 9 < aoa.length; base++) {
    const hdr = aoa[base] ?? [];
    const meta = aoa[base + 1] ?? [];
    if (S(hdr[0]).toLowerCase() !== 'dept. name') continue;
    if (S(meta[0]).toLowerCase() !== 'empcode') continue;

    // Report-level fields repeat on every block; take the first and warn if
    // a later block disagrees (that would mean two machines in one file).
    const blockCode = valueAfterLabel(hdr, 'Dept. Name');
    const blockName = valueAfterLabel(hdr, 'CompName');
    const blockMonth = valueAfterLabel(hdr, 'Report Month');

    if (!institutionCode) institutionCode = blockCode;
    else if (blockCode && blockCode !== institutionCode) {
      warnings.push(`Block at row ${base + 1} reports a different Dept. Name ("${blockCode}") than the first block ("${institutionCode}").`);
    }
    if (!institutionName) institutionName = blockName;
    if (!monthLabel) monthLabel = blockMonth;
    else if (blockMonth && blockMonth !== monthLabel) {
      warnings.push(`Block at row ${base + 1} reports a different Report Month ("${blockMonth}") than the first block ("${monthLabel}").`);
    }

    const code = valueAfterLabel(meta, 'Empcode');
    const name = valueAfterLabel(meta, 'Name');
    if (!code) {
      warnings.push(`Block at row ${base + 1} has no Empcode and was skipped.`);
      base += 9;
      continue;
    }

    const dayRow = aoa[base + 2] ?? [];
    const dowRow = aoa[base + 3] ?? [];

    // Index the six metric rows by their column-A label.
    const metric: Partial<Record<MetricRow, unknown[]>> = {};
    for (let r = base + 4; r <= base + 9 && r < aoa.length; r++) {
      const row = aoa[r] ?? [];
      const key = S(row[0]).toLowerCase() as MetricRow;
      if ((METRIC_ROWS as readonly string[]).includes(key)) metric[key] = row;
    }
    const missing = METRIC_ROWS.filter((k) => !metric[k]);
    if (missing.length > 0) {
      warnings.push(`Employee ${code} at row ${base + 1} is missing the ${missing.join('/').toUpperCase()} row(s) and was skipped.`);
      base += 9;
      continue;
    }

    employees.push({
      code,
      name,
      summary: {
        present: parseIntOrNull(valueAfterLabel(meta, 'Present')),
        weeklyOff: parseIntOrNull(valueAfterLabel(meta, 'WO')),
        absent: parseIntOrNull(valueAfterLabel(meta, 'Absent')),
        totalWorkMinutes: parseDuration(valueAfterLabel(meta, 'Total Work')),
        totalOvertimeMinutes: parseDuration(valueAfterLabel(meta, 'Total OT')),
      },
      // workDate is filled in below, once the month is known.
      days: buildDays(dayRow, dowRow, metric as Record<MetricRow, unknown[]>),
    });

    base += 9; // consume the block
  }

  const parsedMonth = parseMonthLabel(monthLabel);
  if (!parsedMonth) {
    warnings.push(`Could not read the Report Month ("${monthLabel}"). Dates cannot be resolved.`);
  } else {
    // The machine prints a FIXED 31 day-columns whatever the month is, so a
    // 30-day month arrives with a day-31 column (blank metrics) and a 28-day
    // February with three. Formatting those blind produced '2026-09-31', which
    // the importer sends straight to fn_resolve_shift_timings_bulk(p_to date)
    // and Postgres rejects with 22008 — killing the whole preview before a
    // single row is written. Only July and August had ever been imported, so
    // every 30-day month failed from the start (2026-09-19).
    //
    // DROP, never clamp: clamping day 31 onto the 30th would give that date two
    // cells and let the phantom one win the upsert on (employee_id, work_date).
    const lastDay = lastDayOfMonth(parsedMonth.year, parsedMonth.month);
    let droppedCells = 0;
    let droppedWithPunches = 0;
    for (const e of employees) {
      const real = e.days.filter((d) => d.day <= lastDay);
      for (const d of e.days) {
        if (d.day <= lastDay) continue;
        droppedCells += 1;
        if (d.inTime || d.outTime) droppedWithPunches += 1;
      }
      e.days = real;
      for (const d of e.days) d.workDate = iso(parsedMonth.year, parsedMonth.month, d.day);
    }
    if (droppedCells > 0) {
      warnings.push(
        `${monthLabel} has ${lastDay} days — ignored ${droppedCells} cell(s) in day columns past ${lastDay}.` +
          (droppedWithPunches > 0
            ? ` ${droppedWithPunches} of them carried punches, which cannot belong to this month.`
            : ''),
      );
    }
  }

  // After the month-length filter, so a punch in a column that cannot exist
  // (day 31 of September) can never widen the detected span.
  let punchDayFrom: number | null = null;
  let punchDayTo: number | null = null;
  for (const e of employees) {
    for (const d of e.days) {
      if (!d.inTime && !d.outTime) continue;
      if (punchDayFrom === null || d.day < punchDayFrom) punchDayFrom = d.day;
      if (punchDayTo === null || d.day > punchDayTo) punchDayTo = d.day;
    }
  }

  return {
    institutionCode,
    institutionName,
    monthLabel,
    year: parsedMonth?.year ?? 0,
    month: parsedMonth?.month ?? 0,
    punchDayFrom,
    punchDayTo,
    employees,
    warnings,
  };
}

function buildDays(
  dayRow: unknown[],
  dowRow: unknown[],
  metric: Record<MetricRow, unknown[]>,
): BiometricDayCell[] {
  const out: BiometricDayCell[] = [];
  for (let c = 1; c < Math.max(dayRow.length, 33); c++) {
    const day = parseIntOrNull(S(dayRow[c]));
    if (day === null || day < 1 || day > 31) continue;
    out.push({
      day,
      weekday: S(dowRow[c]),
      workDate: '',
      inTime: parseClock(S(metric.in[c])),
      outTime: parseClock(S(metric.out[c])),
      workMinutes: parseDuration(S(metric.work[c])),
      breakMinutes: parseDuration(S(metric.break[c])),
      overtimeMinutes: parseDuration(S(metric.ot[c])),
      deviceStatus: S(metric.status[c]),
    });
  }
  return out;
}

/**
 * Read a `.xls` or `.xlsx` biometric export.
 * Prefers a sheet literally named Monthly_Performance_Report, else the first.
 */
export function parseMonthlyReportFile(data: ArrayBuffer | Uint8Array): BiometricReport {
  const wb = XLSX.read(data, { type: 'array', raw: false, cellDates: false });
  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase().replace(/[^a-z]/g, '') === 'monthlyperformancereport') ??
    wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    return {
      institutionCode: '', institutionName: '', monthLabel: '', year: 0, month: 0,
      employees: [], punchDayFrom: null, punchDayTo: null,
      warnings: ['The workbook has no readable sheet.'],
    };
  }
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1, raw: false, defval: null, blankrows: true,
  });
  return parseMonthlyReportGrid(aoa);
}
