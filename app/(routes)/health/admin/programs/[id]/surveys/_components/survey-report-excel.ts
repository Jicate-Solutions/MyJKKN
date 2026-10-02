// Styled two-sheet Excel export for a wellness survey (ExcelJS, loaded on
// demand so it never weighs down the report page):
//   1. Summary & Analytics — title banner, how-to-read note, KPI cards,
//      colour-coded tables, text bars, best answers in green, heat map.
//   2. Individual Responses — S.No, Name, Designation, Institution, Email ID,
//      Mobile Number, Response … with per-question ✓ / ✗ colouring.
// Colour rule everywhere: GREEN ≥ 70 % · AMBER 40–69 % · RED < 40 %.

import type ExcelJSType from 'exceljs';

import {
  RESPONDENT_TYPE_LABEL,
  type HealthSurvey,
  type HealthSurveyResponse,
} from '@/types/health-surveys';
import { computeAnalytics, responseSummary } from './survey-analytics';

const C = {
  teal: 'FF0F766E',
  tealDark: 'FF115E59',
  tealSoft: 'FFE6F4F1',
  tealSofter: 'FFF3FAF8',
  green: 'FFDCFCE7',
  greenText: 'FF166534',
  amber: 'FFFEF3C7',
  amberText: 'FF92400E',
  red: 'FFFEE2E2',
  redText: 'FF991B1B',
  slate: 'FF475569',
  slateSoft: 'FFF8FAFC',
  border: 'FFD7E3E0',
  white: 'FFFFFFFF',
};

type Cell = ExcelJSType.Cell;
type Worksheet = ExcelJSType.Worksheet;

const fill = (argb: string): ExcelJSType.Fill => ({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb },
});
const thin = { style: 'thin' as const, color: { argb: C.border } };
const boxBorder = { top: thin, left: thin, bottom: thin, right: thin };

const pct = (n: number, d: number) => (d > 0 ? Math.round((1000 * n) / d) / 10 : 0);

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function scoreTone(value: number | null): { bg: string; fg: string } {
  if (value == null) return { bg: C.slateSoft, fg: C.slate };
  if (value >= 70) return { bg: C.green, fg: C.greenText };
  if (value >= 40) return { bg: C.amber, fg: C.amberText };
  return { bg: C.red, fg: C.redText };
}

function toneCell(cell: Cell, value: number | null, size?: number) {
  const tone = scoreTone(value);
  cell.fill = fill(tone.bg);
  cell.font = { bold: true, size, color: { argb: tone.fg } };
}

/** Text bar ("█████░░░░░") — renders in Excel, Google Sheets and phone viewers. */
function bar(value: number, width = 20): string {
  const n = Math.round((Math.max(0, Math.min(100, value)) / 100) * width);
  return '█'.repeat(n) + '░'.repeat(width - n);
}

function sectionHeader(ws: Worksheet, title: string, subtitle?: string) {
  ws.addRow([]);
  const r = ws.addRow([title]);
  ws.mergeCells(r.number, 1, r.number, 6);
  r.height = 24;
  const c = r.getCell(1);
  c.fill = fill(C.tealDark);
  c.font = { bold: true, size: 12, color: { argb: C.white } };
  c.alignment = { vertical: 'middle', indent: 1 };
  if (subtitle) {
    const s = ws.addRow([subtitle]);
    ws.mergeCells(s.number, 1, s.number, 6);
    s.getCell(1).font = { italic: true, size: 9, color: { argb: C.slate } };
    s.getCell(1).alignment = { indent: 1, wrapText: true };
  }
}

function tableHeader(ws: Worksheet, labels: string[]) {
  const r = ws.addRow(labels);
  r.height = 20;
  for (let col = 1; col <= labels.length; col++) {
    const c = r.getCell(col);
    c.fill = fill(C.tealSoft);
    c.font = { bold: true, color: { argb: C.tealDark } };
    c.border = boxBorder;
    c.alignment = {
      vertical: 'middle',
      horizontal: col === 1 ? 'left' : 'center',
      indent: col === 1 ? 1 : 0,
      wrapText: true,
    };
  }
}

function bodyRow(ws: Worksheet, values: (string | number)[], zebra = false) {
  const r = ws.addRow(values);
  for (let col = 1; col <= values.length; col++) {
    const c = r.getCell(col);
    c.border = boxBorder;
    c.alignment = {
      vertical: 'middle',
      wrapText: true,
      horizontal: col === 1 ? 'left' : 'center',
      indent: col === 1 ? 1 : 0,
    };
    if (zebra) c.fill = fill(C.slateSoft);
  }
  return r;
}

function barCell(cell: Cell) {
  cell.font = { color: { argb: C.teal } };
  cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
}

async function download(wb: ExcelJSType.Workbook, fileName: string) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildSummarySheet(
  wb: ExcelJSType.Workbook,
  survey: HealthSurvey,
  programTitle: string | undefined,
  responses: HealthSurveyResponse[]
) {
  const a = computeAnalytics(survey, responses);
  const nQ = survey.questions.length;
  const ws = wb.addWorksheet('Summary & Analytics', {
    views: [{ showGridLines: false }],
    properties: { tabColor: { argb: C.teal } },
  });
  ws.columns = [
    { width: 38 },
    { width: 14 },
    { width: 58 },
    { width: 12 },
    { width: 14 },
    { width: 18 },
  ];

  // Title banner + meta
  const title = ws.addRow([`${survey.title} — Summary & Analytics`]);
  ws.mergeCells(title.number, 1, title.number, 6);
  title.height = 34;
  title.getCell(1).fill = fill(C.teal);
  title.getCell(1).font = { bold: true, size: 16, color: { argb: C.white } };
  title.getCell(1).alignment = { vertical: 'middle', indent: 1 };

  const meta = ws.addRow([
    `${programTitle ? `Program: ${programTitle}   •   ` : ''}Generated: ${formatDateTime(
      new Date().toISOString()
    )}`,
  ]);
  ws.mergeCells(meta.number, 1, meta.number, 6);
  meta.getCell(1).fill = fill(C.tealSofter);
  meta.getCell(1).font = { size: 10, color: { argb: C.slate } };
  meta.getCell(1).alignment = { indent: 1 };

  const how = ws.addRow([
    'How to read: the "Best answer" is the constructive choice for each scenario, and Score = share of best answers. ' +
      'Colours: GREEN 70% and above (strong) · AMBER 40–69% (needs attention) · RED below 40% (focus area).',
  ]);
  ws.mergeCells(how.number, 1, how.number, 6);
  how.height = 32;
  how.getCell(1).font = { size: 9, italic: true, color: { argb: C.slate } };
  how.getCell(1).alignment = { wrapText: true, vertical: 'middle', indent: 1 };

  // KPI cards: Total | Questions | Average score (C:E merged) | Categories
  sectionHeader(ws, 'OVERVIEW');
  const labels = ws.addRow(['Total responses', 'Questions', 'Average score', '', '', 'User categories']);
  const values = ws.addRow([a.total, nQ, a.total ? a.avgScorePct / 100 : '–', '', '', a.byType.length]);
  ws.mergeCells(labels.number, 3, labels.number, 5);
  ws.mergeCells(values.number, 3, values.number, 5);
  values.height = 36;
  for (const col of [1, 2, 3, 6]) {
    const l = labels.getCell(col);
    const v = values.getCell(col);
    l.fill = fill(C.tealSofter);
    l.font = { size: 9, bold: true, color: { argb: C.slate } };
    l.alignment = { horizontal: 'center', vertical: 'middle' };
    l.border = { top: thin, left: thin, right: thin };
    v.fill = fill(C.tealSofter);
    v.font = { size: 20, bold: true, color: { argb: C.teal } };
    v.alignment = { horizontal: 'center', vertical: 'middle' };
    v.border = { bottom: thin, left: thin, right: thin };
  }
  if (a.total) {
    values.getCell(3).numFmt = '0%';
    toneCell(values.getCell(3), a.avgScorePct, 20);
  }

  // By user category
  sectionHeader(ws, 'BY USER CATEGORY');
  tableHeader(ws, ['Category', 'Responses', 'Share of responses', '% of total', 'Avg score']);
  a.byType.forEach((x, i) => {
    const share = pct(x.count, a.total);
    const r = bodyRow(
      ws,
      [RESPONDENT_TYPE_LABEL[x.type], x.count, bar(share), share / 100, x.avgScorePct / 100],
      i % 2 === 1
    );
    barCell(r.getCell(3));
    r.getCell(4).numFmt = '0%';
    r.getCell(5).numFmt = '0%';
    toneCell(r.getCell(5), x.avgScorePct);
  });

  // By institution
  sectionHeader(ws, 'BY INSTITUTION');
  tableHeader(ws, ['Institution', 'Responses', 'Share of responses', '% of total', 'Avg score']);
  a.byInstitution.forEach((x, i) => {
    const share = pct(x.count, a.total);
    const r = bodyRow(ws, [x.name, x.count, bar(share), share / 100, x.avgScorePct / 100], i % 2 === 1);
    barCell(r.getCell(3));
    r.getCell(4).numFmt = '0%';
    r.getCell(5).numFmt = '0%';
    toneCell(r.getCell(5), x.avgScorePct);
  });

  // Score distribution
  sectionHeader(ws, 'SCORE DISTRIBUTION', 'How many people got 0, 1, 2 … best answers.');
  tableHeader(ws, ['Best answers', 'People', 'Distribution', '% of total']);
  a.scoreDistribution.forEach((d, i) => {
    const share = pct(d.people, a.total);
    const r = bodyRow(ws, [`${d.constructive} / ${nQ}`, d.people, bar(share), share / 100], i % 2 === 1);
    barCell(r.getCell(3));
    r.getCell(4).numFmt = '0%';
    toneCell(r.getCell(1), nQ ? (100 * d.constructive) / nQ : null);
  });

  // Question-wise
  sectionHeader(
    ws,
    'QUESTION-WISE RESPONSE DISTRIBUTION',
    'Green row = best answer. The bar shows how many respondents chose each option.'
  );
  for (const q of a.questions) {
    const qr = ws.addRow([q.label, '', '', '', 'Best-answer rate', q.answered ? q.constructiveRate / 100 : '–']);
    ws.mergeCells(qr.number, 1, qr.number, 4);
    qr.height = 22;
    for (let col = 1; col <= 6; col++) {
      const c = qr.getCell(col);
      c.fill = fill(C.tealSoft);
      c.font = { bold: true, color: { argb: C.tealDark } };
      c.border = boxBorder;
      c.alignment = { vertical: 'middle', indent: 1 };
    }
    qr.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
    qr.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
    if (q.answered) {
      qr.getCell(6).numFmt = '0%';
      toneCell(qr.getCell(6), q.constructiveRate);
    }

    tableHeader(ws, ['Chosen by', 'Option', 'Answer', 'Count', '%', '']);
    for (const o of q.options) {
      const r = bodyRow(ws, [
        bar(o.pct, 16),
        o.id,
        o.text,
        o.count,
        o.pct / 100,
        o.constructive ? '✓ Best answer' : '',
      ]);
      r.getCell(1).font = { color: { argb: o.constructive ? C.greenText : C.amberText } };
      r.getCell(3).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 };
      r.getCell(5).numFmt = '0%';
      if (o.constructive) {
        for (let col = 1; col <= 6; col++) r.getCell(col).fill = fill(C.green);
        r.getCell(6).font = { bold: true, color: { argb: C.greenText } };
      }
    }
  }

  // Heat map by user category (only categories this survey is open to)
  const types = (['student', 'staff', 'public'] as const).filter((tp) => survey.audience.includes(tp));
  sectionHeader(
    ws,
    'BEST-ANSWER RATE BY USER CATEGORY',
    'Heat map — green is strong, red is a focus area. "–" means no responses from that category yet.'
  );
  tableHeader(ws, ['Question', 'Overall', ...types.map((tp) => RESPONDENT_TYPE_LABEL[tp])]);
  a.questions.forEach((q, i) => {
    const r = bodyRow(
      ws,
      [
        q.label,
        q.answered ? q.constructiveRate / 100 : '–',
        ...types.map((tp) => {
          const v = q.byType[tp];
          return v == null ? '–' : v / 100;
        }),
      ],
      i % 2 === 1
    );
    for (let col = 2; col <= 2 + types.length; col++) {
      const cell = r.getCell(col);
      if (typeof cell.value === 'number') {
        cell.numFmt = '0%';
        toneCell(cell, cell.value * 100);
      }
    }
  });
}

function buildResponsesSheet(
  wb: ExcelJSType.Workbook,
  survey: HealthSurvey,
  responses: HealthSurveyResponse[]
) {
  const ws = wb.addWorksheet('Individual Responses', {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }],
    properties: { tabColor: { argb: C.tealDark } },
  });
  ws.columns = [
    { header: 'S.No', key: 'sno', width: 7 },
    { header: 'Name', key: 'name', width: 26 },
    { header: 'Designation', key: 'designation', width: 26 },
    { header: 'Institution', key: 'institution', width: 30 },
    { header: 'Email ID', key: 'email', width: 30 },
    { header: 'Mobile Number', key: 'mobile', width: 15 },
    { header: 'Response', key: 'response', width: 52 },
    { header: 'User Type', key: 'type', width: 13 },
    { header: 'Best Answers', key: 'best', width: 12 },
    { header: 'Score', key: 'score', width: 10 },
    { header: 'Language', key: 'lang', width: 10 },
    { header: 'Submitted At', key: 'at', width: 20 },
    ...survey.questions.map((q, i) => ({ header: `Q${i + 1}`, key: `q_${q.id}`, width: 7 })),
  ];
  const nCols = ws.columns.length;

  const head = ws.getRow(1);
  head.height = 26;
  for (let col = 1; col <= nCols; col++) {
    const c = head.getCell(col);
    c.fill = fill(C.teal);
    c.font = { bold: true, color: { argb: C.white } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = boxBorder;
  }

  responses.forEach((r, i) => {
    const row: Record<string, string | number> = {
      sno: i + 1,
      name: r.name,
      designation: r.designation ?? '',
      institution: r.institution_name ?? '',
      email: r.email,
      mobile: r.mobile ?? '',
      response: responseSummary(survey, r),
      type: RESPONDENT_TYPE_LABEL[r.respondent_type],
      best: `${r.constructive_count}/${r.total_questions}`,
      score: Number(r.score_pct ?? 0) / 100,
      lang: r.language.toUpperCase(),
      at: formatDateTime(r.submitted_at),
    };
    survey.questions.forEach((q) => {
      row[`q_${q.id}`] = r.answers?.[q.id] ?? '';
    });

    const xr = ws.addRow(row);
    for (let col = 1; col <= nCols; col++) {
      const c = xr.getCell(col);
      c.border = boxBorder;
      c.alignment = { vertical: 'middle', wrapText: true };
      if (i % 2 === 1) c.fill = fill(C.slateSoft);
    }
    for (const key of ['sno', 'best', 'type', 'lang']) {
      xr.getCell(key).alignment = { horizontal: 'center', vertical: 'middle' };
    }
    const score = xr.getCell('score');
    score.numFmt = '0%';
    score.alignment = { horizontal: 'center', vertical: 'middle' };
    toneCell(score, Number(r.score_pct ?? 0));

    survey.questions.forEach((q) => {
      const c = xr.getCell(`q_${q.id}`);
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      if (!c.value) return;
      const good = c.value === q.constructive;
      c.fill = fill(good ? C.green : C.amber);
      c.font = { bold: true, color: { argb: good ? C.greenText : C.amberText } };
    });
  });

  if (responses.length) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: nCols } };
  }
}

export async function exportSurveyReport(
  survey: HealthSurvey,
  programTitle: string | undefined,
  responses: HealthSurveyResponse[]
): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MyJKKN — Health & Wellness';
  wb.created = new Date();

  // Summary first so the file opens on the overview.
  buildSummarySheet(wb, survey, programTitle, responses);
  buildResponsesSheet(wb, survey, responses);

  const safe = survey.title.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
  const date = new Date().toISOString().slice(0, 10);
  await download(wb, `${safe || 'Wellness_Survey'}_Report_${date}.xlsx`);
}
