// lib/pdf/pde-meq-paper.ts
// ============================================================================
// Renders the three printable MEQ documents from a MeqPaperModel:
//
//   paper       — the question paper a learner sits, marks per question, total.
//   answer-key  — the same questions with model answers + key concepts. FACULTY
//                 ONLY; every page is watermarked and footed as such.
//   rubric      — marks by OSCE competency against the case's domain weights.
//
// Library choice: jsPDF, which is what this repo already reaches for when it
// lays a document out itself — lib/utils/certificate-pdf.ts (also PDE, also
// JKKN-branded), lib/utils/ims-receipt-pdf.ts, lib/id-cards/sheet-pdf.ts and
// app/api/internal-marks/report/export-pdf/route.ts all build documents this
// way. The Puppeteer path (lib/pdf/bos-meeting-notice.ts) exists for sheets
// that need embedded web fonts and a Chromium binary in the deployed function;
// an exam paper does not, and taking it on would drag in the font-tracing
// machinery documented in lib/utils/bos/pdf-fonts.ts for no gain.
//
// Typeface: jsPDF's built-in Helvetica, which is metric-compatible with Arial.
// House style names Montserrat for headings and Open Sans for body, and allows
// Arial for official documents — a question paper and its key are official
// documents. Embedding Montserrat would mean adding font binaries to the repo
// and a runtime read path; not worth it to set an exam paper.
//
// Brand rules applied on every page: JKKN Cream #fbfbee background, JKKN Yellow
// #ffde59 accents, and "JKKN Institutions" ALWAYS in JKKN Green #0b6d41.
// ============================================================================

import jsPDF from 'jspdf';
import {
  OSCE_DOMAIN_ORDER,
  type MeqDocumentKind,
  type MeqPaperModel,
  type MeqPaperQuestion,
} from '@/lib/pde/meq-export';

// ── JKKN Brand Colours (RGB) ────────────────────────────────────────────────
const JKKN_CREAM = { r: 251, g: 251, b: 238 }; // #fbfbee
const JKKN_GREEN = { r: 11, g: 109, b: 65 }; // #0b6d41
const JKKN_YELLOW = { r: 255, g: 222, b: 89 }; // #ffde59
const DARK_TEXT = { r: 30, g: 30, b: 30 };
const MUTED_TEXT = { r: 100, g: 100, b: 100 };
const WARN_TEXT = { r: 150, g: 60, b: 10 };
const RULE_GREY = { r: 205, g: 205, b: 195 };

// ── A4 portrait geometry (mm) ───────────────────────────────────────────────
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_X = 18;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const BODY_TOP = 46; // below the brand header band
const BODY_BOTTOM = PAGE_H - 16; // above the footer rule

/**
 * jsPDF's standard fonts encode WinAnsi (CP1252). A character outside it does
 * not fail loudly — it renders as a wrong glyph, which is exactly the class of
 * defect nobody catches by reading a test log. Map the few we are likely to
 * meet in clinical prose; anything else (Tamil, Devanagari) would need an
 * embedded font and is out of scope for this export.
 */
function toWinAnsi(input: string): string {
  return (input || '')
    .replace(/[→⇒]/g, '->')
    .replace(/[←⇐]/g, '<-')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/≠/g, '!=')
    .replace(/₹/g, 'Rs')
    .replace(/[─-╿]/g, '-')
    .replace(/ /g, ' ');
}

interface Cursor {
  y: number;
  page: number;
}

interface DocChrome {
  documentTitle: string;
  /** Rendered as a red-brown band under the header on every page. */
  confidential: string | null;
}

function paintPageFurniture(doc: jsPDF, model: MeqPaperModel, chrome: DocChrome): void {
  // Cream page
  doc.setFillColor(JKKN_CREAM.r, JKKN_CREAM.g, JKKN_CREAM.b);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

  // Yellow accent bar down the left edge
  doc.setFillColor(JKKN_YELLOW.r, JKKN_YELLOW.g, JKKN_YELLOW.b);
  doc.rect(0, 0, 4, PAGE_H, 'F');

  // "JKKN Institutions" — ALWAYS JKKN Green. Non-negotiable house style.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(JKKN_GREEN.r, JKKN_GREEN.g, JKKN_GREEN.b);
  doc.text('JKKN Institutions', MARGIN_X, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
  doc.text('Principal-Driven Education', MARGIN_X, 23);

  // Document title, right aligned against the header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
  doc.text(toWinAnsi(chrome.documentTitle), PAGE_W - MARGIN_X, 18, { align: 'right' });

  if (model.courseCode || model.courseName) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
    const line = [model.courseCode, model.courseName].filter(Boolean).join(' — ');
    doc.text(toWinAnsi(line).slice(0, 70), PAGE_W - MARGIN_X, 23, { align: 'right' });
  }

  // Yellow rule under the header
  doc.setDrawColor(JKKN_YELLOW.r, JKKN_YELLOW.g, JKKN_YELLOW.b);
  doc.setLineWidth(1.2);
  doc.line(MARGIN_X, 28, PAGE_W - MARGIN_X, 28);

  if (chrome.confidential) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(WARN_TEXT.r, WARN_TEXT.g, WARN_TEXT.b);
    doc.text(toWinAnsi(chrome.confidential), MARGIN_X, 34);
  }
}

function paintFooters(doc: jsPDF, model: MeqPaperModel, chrome: DocChrome): void {
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(RULE_GREY.r, RULE_GREY.g, RULE_GREY.b);
    doc.setLineWidth(0.3);
    doc.line(MARGIN_X, PAGE_H - 14, PAGE_W - MARGIN_X, PAGE_H - 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);

    const left = chrome.confidential
      ? 'Faculty copy — not to be issued to learners.'
      : `Case v${model.version}`;
    doc.text(toWinAnsi(left), MARGIN_X, PAGE_H - 9);
    doc.text(`Page ${p} of ${pages}`, PAGE_W - MARGIN_X, PAGE_H - 9, { align: 'right' });
  }
}

function newDoc(model: MeqPaperModel, chrome: DocChrome): { doc: jsPDF; cursor: Cursor } {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  paintPageFurniture(doc, model, chrome);
  return { doc, cursor: { y: chrome.confidential ? BODY_TOP + 2 : BODY_TOP, page: 1 } };
}

/** Break to a new page when `needed` mm will not fit, re-painting the chrome. */
function ensureSpace(
  doc: jsPDF,
  cursor: Cursor,
  needed: number,
  model: MeqPaperModel,
  chrome: DocChrome
): void {
  if (cursor.y + needed <= BODY_BOTTOM) return;
  doc.addPage();
  cursor.page += 1;
  paintPageFurniture(doc, model, chrome);
  cursor.y = chrome.confidential ? BODY_TOP + 2 : BODY_TOP;
}

interface ParagraphOptions {
  size?: number;
  style?: 'normal' | 'bold' | 'italic';
  color?: { r: number; g: number; b: number };
  width?: number;
  x?: number;
  lineHeight?: number;
  gapAfter?: number;
}

function paragraph(
  doc: jsPDF,
  cursor: Cursor,
  model: MeqPaperModel,
  chrome: DocChrome,
  text: string,
  opts: ParagraphOptions = {}
): void {
  const size = opts.size ?? 10;
  const width = opts.width ?? CONTENT_W;
  const x = opts.x ?? MARGIN_X;
  const lineHeight = opts.lineHeight ?? size * 0.48;

  doc.setFont('helvetica', opts.style ?? 'normal');
  doc.setFontSize(size);
  const c = opts.color ?? DARK_TEXT;
  doc.setTextColor(c.r, c.g, c.b);

  const lines: string[] = doc.splitTextToSize(toWinAnsi(text), width);
  for (const line of lines) {
    ensureSpace(doc, cursor, lineHeight, model, chrome);
    doc.setFont('helvetica', opts.style ?? 'normal');
    doc.setFontSize(size);
    doc.setTextColor(c.r, c.g, c.b);
    doc.text(line, x, cursor.y);
    cursor.y += lineHeight;
  }
  cursor.y += opts.gapAfter ?? 1.5;
}

function sectionHeading(
  doc: jsPDF,
  cursor: Cursor,
  model: MeqPaperModel,
  chrome: DocChrome,
  label: string
): void {
  ensureSpace(doc, cursor, 12, model, chrome);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(JKKN_GREEN.r, JKKN_GREEN.g, JKKN_GREEN.b);
  doc.text(toWinAnsi(label.toUpperCase()), MARGIN_X, cursor.y);
  cursor.y += 2.2;
  doc.setDrawColor(JKKN_YELLOW.r, JKKN_YELLOW.g, JKKN_YELLOW.b);
  doc.setLineWidth(0.8);
  doc.line(MARGIN_X, cursor.y, MARGIN_X + 34, cursor.y);
  cursor.y += 5;
}

/**
 * The marks-mismatch notice. Printed on the paper deliberately: a paper whose
 * questions do not add up to its stated total is not safe to photocopy, and a
 * warning that lives only in the browser is a warning nobody sees at the
 * photocopier.
 */
function marksWarningBlock(
  doc: jsPDF,
  cursor: Cursor,
  model: MeqPaperModel,
  chrome: DocChrome
): void {
  if (!model.marksWarning) return;
  // Measure at the size this block actually renders at. splitTextToSize uses
  // the doc's CURRENT font state, so splitting before setting it silently
  // produces lines too wide for the space they are drawn into.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const lines: string[] = doc.splitTextToSize(toWinAnsi(model.marksWarning), CONTENT_W - 8);
  const boxH = 9 + lines.length * 4.2;
  ensureSpace(doc, cursor, boxH + 4, model, chrome);

  doc.setFillColor(JKKN_YELLOW.r, JKKN_YELLOW.g, JKKN_YELLOW.b);
  doc.rect(MARGIN_X, cursor.y, CONTENT_W, boxH, 'F');
  doc.setDrawColor(WARN_TEXT.r, WARN_TEXT.g, WARN_TEXT.b);
  doc.setLineWidth(0.4);
  doc.rect(MARGIN_X, cursor.y, CONTENT_W, boxH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(WARN_TEXT.r, WARN_TEXT.g, WARN_TEXT.b);
  doc.text('CHECK BEFORE PRINTING - MARKS DO NOT ADD UP', MARGIN_X + 4, cursor.y + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
  lines.forEach((line, i) => {
    doc.text(line, MARGIN_X + 4, cursor.y + 10.5 + i * 4.2);
  });

  cursor.y += boxH + 5;
}

/** Title block + the facts a paper must state: total marks, duration, pass mark. */
function paperMetaBlock(
  doc: jsPDF,
  cursor: Cursor,
  model: MeqPaperModel,
  chrome: DocChrome,
  headline: string
): void {
  paragraph(doc, cursor, model, chrome, headline, { size: 14, style: 'bold', gapAfter: 1 });
  paragraph(doc, cursor, model, chrome, model.caseTitle, {
    size: 11,
    style: 'bold',
    color: JKKN_GREEN,
    gapAfter: 3,
  });

  const facts: string[] = [`Maximum marks: ${model.declaredTotalMarks}`];
  if (model.durationMinutes) facts.push(`Time: ${model.durationMinutes} minutes`);
  facts.push(`Pass mark: ${model.passMarks} (${model.passThreshold}%)`);
  if (model.discipline) facts.push(`Discipline: ${model.discipline}`);

  doc.setDrawColor(RULE_GREY.r, RULE_GREY.g, RULE_GREY.b);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_X, cursor.y, PAGE_W - MARGIN_X, cursor.y);
  cursor.y += 4.5;

  paragraph(doc, cursor, model, chrome, facts.join('    |    '), {
    size: 9,
    style: 'bold',
    gapAfter: 2,
  });

  doc.setDrawColor(RULE_GREY.r, RULE_GREY.g, RULE_GREY.b);
  doc.line(MARGIN_X, cursor.y, PAGE_W - MARGIN_X, cursor.y);
  cursor.y += 6;
}

function scenarioBlock(
  doc: jsPDF,
  cursor: Cursor,
  model: MeqPaperModel,
  chrome: DocChrome
): void {
  if (model.scenarioLines.length === 0) return;
  sectionHeading(doc, cursor, model, chrome, 'Case vignette');
  for (const line of model.scenarioLines) {
    paragraph(doc, cursor, model, chrome, line, { size: 9.5, gapAfter: 1.2 });
  }
  cursor.y += 3;
}

/** "Q3." on the left, the wrapped question body in the middle, "[8 marks]" right. */
function questionBlock(
  doc: jsPDF,
  cursor: Cursor,
  model: MeqPaperModel,
  chrome: DocChrome,
  q: MeqPaperQuestion,
  opts: { showOptionKey: boolean }
): void {
  const numberW = 11;
  const marksW = 24;
  const textW = CONTENT_W - numberW - marksW;
  const textX = MARGIN_X + numberW;

  // Measure at the size the body renders at (10pt). splitTextToSize reads the
  // doc's CURRENT font state, so measuring while a 9pt caption is still set
  // yields lines that overrun into the marks column on the right — a defect
  // that renders happily and is invisible to every assertion in the suite.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const bodyLines: string[] = doc.splitTextToSize(toWinAnsi(q.text), textW);
  ensureSpace(doc, cursor, Math.min(bodyLines.length, 4) * 4.6 + 8, model, chrome);

  const startY = cursor.y;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(JKKN_GREEN.r, JKKN_GREEN.g, JKKN_GREEN.b);
  doc.text(`Q${q.number}.`, MARGIN_X, startY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
  doc.text(
    `[${q.marks} ${q.marks === 1 ? 'mark' : 'marks'}]`,
    PAGE_W - MARGIN_X,
    startY,
    { align: 'right' }
  );

  for (const line of bodyLines) {
    ensureSpace(doc, cursor, 4.6, model, chrome);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
    doc.text(line, textX, cursor.y);
    cursor.y += 4.6;
  }

  if (q.options.length > 0) {
    cursor.y += 1;
    for (const opt of q.options) {
      const mark = opts.showOptionKey && opt.isCorrect ? ' (correct)' : '';
      paragraph(doc, cursor, model, chrome, `${opt.label}) ${opt.text}${mark}`, {
        size: 9.5,
        x: textX + 4,
        width: textW - 4,
        style: opts.showOptionKey && opt.isCorrect ? 'bold' : 'normal',
        gapAfter: 0.4,
      });
    }
  }

  cursor.y += 5;
}

// ── Document 1 — the question paper ─────────────────────────────────────────

export function renderMeqQuestionPaper(model: MeqPaperModel): jsPDF {
  const chrome: DocChrome = {
    documentTitle: 'Modified Essay Question Paper',
    confidential: null,
  };
  const { doc, cursor } = newDoc(model, chrome);

  paperMetaBlock(doc, cursor, model, chrome, 'Modified Essay Question Paper');
  marksWarningBlock(doc, cursor, model, chrome);

  sectionHeading(doc, cursor, model, chrome, 'Instructions');
  paragraph(
    doc,
    cursor,
    model,
    chrome,
    'Read the case vignette before attempting any question. Answer every question in the order given. ' +
      'Marks for each question are shown against it. Write legibly; reasoning is marked, not recall alone.',
    { size: 9.5, gapAfter: 4 }
  );

  scenarioBlock(doc, cursor, model, chrome);

  sectionHeading(doc, cursor, model, chrome, 'Questions');
  for (const q of model.questions) {
    questionBlock(doc, cursor, model, chrome, q, { showOptionKey: false });
  }

  ensureSpace(doc, cursor, 14, model, chrome);
  doc.setDrawColor(JKKN_GREEN.r, JKKN_GREEN.g, JKKN_GREEN.b);
  doc.setLineWidth(0.6);
  doc.line(MARGIN_X, cursor.y, PAGE_W - MARGIN_X, cursor.y);
  cursor.y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(JKKN_GREEN.r, JKKN_GREEN.g, JKKN_GREEN.b);
  doc.text(
    `Total: ${model.questionMarksTotal} of ${model.declaredTotalMarks} marks`,
    PAGE_W - MARGIN_X,
    cursor.y,
    { align: 'right' }
  );

  paintFooters(doc, model, chrome);
  return doc;
}

// ── Document 2 — the answer key (faculty only) ──────────────────────────────

export function renderMeqAnswerKey(model: MeqPaperModel): jsPDF {
  const chrome: DocChrome = {
    documentTitle: 'Answer Key',
    confidential: 'CONFIDENTIAL - FACULTY COPY. Do not circulate to learners.',
  };
  const { doc, cursor } = newDoc(model, chrome);

  paperMetaBlock(doc, cursor, model, chrome, 'Answer Key');
  marksWarningBlock(doc, cursor, model, chrome);

  paragraph(
    doc,
    cursor,
    model,
    chrome,
    'Model answers and the concepts an answer must contain to earn its marks. Award marks for reasoning ' +
      'that reaches the key concepts, not for wording that matches the model answer.',
    { size: 9, color: MUTED_TEXT, gapAfter: 5 }
  );

  for (const q of model.questions) {
    questionBlock(doc, cursor, model, chrome, q, { showOptionKey: true });

    // Pull the key material in under the question, indented and tinted so it
    // is unmistakably the key and not part of the question.
    const keyX = MARGIN_X + 11;
    const keyW = CONTENT_W - 11;

    paragraph(doc, cursor, model, chrome, `Competency: ${q.domainLabel}`, {
      size: 8.5,
      style: 'bold',
      color: MUTED_TEXT,
      x: keyX,
      width: keyW,
      gapAfter: 1.5,
    });

    paragraph(doc, cursor, model, chrome, 'Model answer', {
      size: 9,
      style: 'bold',
      color: JKKN_GREEN,
      x: keyX,
      width: keyW,
      gapAfter: 1,
    });
    paragraph(doc, cursor, model, chrome, q.groundTruth || 'No model answer recorded for this question.', {
      size: 9.5,
      x: keyX,
      width: keyW,
      gapAfter: 2,
      style: q.groundTruth ? 'normal' : 'italic',
      color: q.groundTruth ? DARK_TEXT : WARN_TEXT,
    });

    if (q.correctAnswer) {
      paragraph(doc, cursor, model, chrome, `Expected answer: ${q.correctAnswer}`, {
        size: 9,
        style: 'bold',
        x: keyX,
        width: keyW,
        gapAfter: 2,
      });
    }

    if (q.keyConcepts.length > 0) {
      paragraph(doc, cursor, model, chrome, 'Key concepts (must be present)', {
        size: 9,
        style: 'bold',
        color: JKKN_GREEN,
        x: keyX,
        width: keyW,
        gapAfter: 1,
      });
      for (const concept of q.keyConcepts) {
        paragraph(doc, cursor, model, chrome, `-  ${concept}`, {
          size: 9.5,
          x: keyX + 3,
          width: keyW - 3,
          gapAfter: 0.4,
        });
      }
    }

    cursor.y += 4;
    ensureSpace(doc, cursor, 6, model, chrome);
    doc.setDrawColor(RULE_GREY.r, RULE_GREY.g, RULE_GREY.b);
    doc.setLineWidth(0.3);
    doc.line(MARGIN_X, cursor.y, PAGE_W - MARGIN_X, cursor.y);
    cursor.y += 6;
  }

  paintFooters(doc, model, chrome);
  return doc;
}

// ── Document 3 — the competency rubric ──────────────────────────────────────

export function renderMeqCompetencyRubric(model: MeqPaperModel): jsPDF {
  const chrome: DocChrome = {
    documentTitle: 'Competency Rubric',
    confidential: null,
  };
  const { doc, cursor } = newDoc(model, chrome);

  paperMetaBlock(doc, cursor, model, chrome, 'OSCE Competency Rubric');
  marksWarningBlock(doc, cursor, model, chrome);

  paragraph(
    doc,
    cursor,
    model,
    chrome,
    "How this paper's marks spread across the five OSCE competency domains. " +
      '"Weighted" is the share this case is configured to give each domain; "on this paper" is what the ' +
      'questions actually carry. A large gap means the paper does not examine the case the way it was designed to.',
    { size: 9, color: MUTED_TEXT, gapAfter: 5 }
  );

  // ── Table ────────────────────────────────────────────────────────────────
  const cols = [
    { label: 'Competency domain', w: 56, align: 'left' as const },
    { label: 'Questions', w: 20, align: 'right' as const },
    { label: 'Weighted %', w: 24, align: 'right' as const },
    { label: 'Target marks', w: 26, align: 'right' as const },
    { label: 'On this paper', w: 26, align: 'right' as const },
    { label: 'Variance', w: 22, align: 'right' as const },
  ];

  const drawRow = (
    cells: string[],
    o: { header?: boolean; bold?: boolean; color?: { r: number; g: number; b: number } } = {}
  ) => {
    ensureSpace(doc, cursor, 8, model, chrome);
    if (o.header) {
      doc.setFillColor(JKKN_GREEN.r, JKKN_GREEN.g, JKKN_GREEN.b);
      doc.rect(MARGIN_X, cursor.y - 4.5, CONTENT_W, 7, 'F');
    }
    let x = MARGIN_X;
    doc.setFont('helvetica', o.header || o.bold ? 'bold' : 'normal');
    doc.setFontSize(8.5);
    cells.forEach((cell, i) => {
      const col = cols[i];
      const c = o.header ? { r: 255, g: 255, b: 255 } : o.color ?? DARK_TEXT;
      doc.setTextColor(c.r, c.g, c.b);
      const tx = col.align === 'right' ? x + col.w - 2 : x + 2;
      doc.text(toWinAnsi(cell), tx, cursor.y, { align: col.align });
      x += col.w;
    });
    cursor.y += 7;
    if (!o.header) {
      doc.setDrawColor(RULE_GREY.r, RULE_GREY.g, RULE_GREY.b);
      doc.setLineWidth(0.2);
      doc.line(MARGIN_X, cursor.y - 4.6, PAGE_W - MARGIN_X, cursor.y - 4.6);
    }
  };

  cursor.y += 3;
  drawRow(cols.map((c) => c.label), { header: true });

  for (const domain of OSCE_DOMAIN_ORDER) {
    const row = model.domains.find((d) => d.domain === domain);
    if (!row) continue;
    const variance =
      row.varianceMarks === 0
        ? 'on target'
        : `${row.varianceMarks > 0 ? '+' : ''}${row.varianceMarks}`;
    drawRow(
      [
        row.label,
        String(row.questionCount),
        `${row.weightPercent}%`,
        String(row.targetMarks),
        String(row.actualMarks),
        variance,
      ],
      { color: row.questionCount === 0 && row.weightPercent > 0 ? WARN_TEXT : DARK_TEXT }
    );
  }

  const totalWeight = model.domains.reduce((s, d) => s + d.weightPercent, 0);
  const totalTarget = model.domains.reduce((s, d) => s + d.targetMarks, 0);
  drawRow(
    [
      'Total',
      String(model.questions.length),
      `${Math.round(totalWeight)}%`,
      String(Math.round(totalTarget * 100) / 100),
      String(model.questionMarksTotal),
      '',
    ],
    { bold: true, color: JKKN_GREEN }
  );

  cursor.y += 6;

  // ── Uncovered domains ────────────────────────────────────────────────────
  const uncovered = model.domains.filter((d) => d.questionCount === 0 && d.weightPercent > 0);
  if (uncovered.length > 0) {
    sectionHeading(doc, cursor, model, chrome, 'Competencies not examined');
    paragraph(
      doc,
      cursor,
      model,
      chrome,
      `This case gives weight to ${uncovered
        .map((d) => d.label)
        .join(', ')} but no question on this paper carries ${
        uncovered.length === 1 ? 'that competency' : 'those competencies'
      }. A learner cannot demonstrate ${
        uncovered.length === 1 ? 'it' : 'them'
      } on this paper.`,
      { size: 9.5, color: WARN_TEXT, gapAfter: 5 }
    );
  }

  // ── Question → domain map ────────────────────────────────────────────────
  sectionHeading(doc, cursor, model, chrome, 'Question to competency map');
  for (const q of model.questions) {
    paragraph(
      doc,
      cursor,
      model,
      chrome,
      `Q${q.number}  (${q.marks} ${q.marks === 1 ? 'mark' : 'marks'})  -  ${q.domainLabel}`,
      { size: 9.5, gapAfter: 0.6 }
    );
  }

  paintFooters(doc, model, chrome);
  return doc;
}

// ── Entry point ─────────────────────────────────────────────────────────────

export function renderMeqDocument(model: MeqPaperModel, kind: MeqDocumentKind): jsPDF {
  if (kind === 'answer-key') return renderMeqAnswerKey(model);
  if (kind === 'rubric') return renderMeqCompetencyRubric(model);
  return renderMeqQuestionPaper(model);
}

/** Bytes ready for a NextResponse body. */
export function renderMeqDocumentBuffer(model: MeqPaperModel, kind: MeqDocumentKind): Buffer {
  return Buffer.from(renderMeqDocument(model, kind).output('arraybuffer'));
}
