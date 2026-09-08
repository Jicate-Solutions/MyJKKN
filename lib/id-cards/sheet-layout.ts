// ============================================================================
// lib/id-cards/sheet-layout.ts
// Created: 2026-09-05 — A4 sheet layout shared by the preview dialog, the
// print document and the PDF download, so every output is the SAME geometry
// the user saw on screen.
// Updated: 2026-09-07 — student-wise layout + red issue annotations.
//
// Geometry (all in mm, so the browser prints at true size):
//   • CR80 card: 85.6 × 54 mm (the render PNG is 1014×638 = CR80 @ 300 dpi)
//   • A4 portrait: 210 × 297 mm
//
// Two layout modes:
//   • 'pairs'  (default) — STUDENT-WISE. Every row of the sheet is one
//     learner: front on the left, back on the right, single-sided paper. Read
//     row by row the sheet is exactly "Student 1 front, Student 1 back,
//     Student 2 front, Student 2 back …", so a reviewer checks both sides of a
//     record together and the printed stack comes out in learner order.
//       landscape cards: 2 columns × 5 rows = 5 learners per sheet
//       portrait cards:  2 columns × 3 rows = 3 learners per sheet
//     (A template with no back side lays the fronts out in the same order.)
//   • 'duplex' — fronts fill sheet N, backs fill sheet N+1 MIRRORED so each
//     back lands behind its own front when the paper is turned over:
//       landscape: 2 × 5 = 10 per sheet · portrait: 3 × 3 = 9 per sheet
//       long-edge flip (portrait A4 default): columns swap, no extra turn.
//       short-edge flip: rows swap AND the back turns a further 180°.
//
// Orientation: the render canvas is ALWAYS landscape (card-printer invariant).
// A portrait template is rotated into it, so every slot carries the degrees
// to turn the bitmap back upright; every surface applies the same transform.
//
// Issue annotations: a card with missing or wrong data is framed in red with a
// red caption naming the fields. The Director's rule (2026-09-07) is that the
// preview is the single source of truth, so the SAME annotation is part of the
// print document and the PDF — a flagged card can never leave the office
// looking clean.
// ============================================================================

import type { RenderedCard } from '@/lib/services/id-cards/card-preview-client';

export const CARD_LONG_MM = 85.6;
export const CARD_SHORT_MM = 54;
export const SHEET_W_MM = 210;
export const SHEET_H_MM = 297;

/** Red used for every issue mark, on screen, on paper and in the PDF. */
export const ISSUE_RED = '#dc2626';
export const ISSUE_FRAME_MM = 0.8;
export const ISSUE_CAPTION_FONT_MM = 2.6;

export type DuplexFlip = 'long' | 'short';
export type LayoutMode = 'pairs' | 'duplex';

export interface SheetGeometry {
  /** Cards stand upright (portrait templates) or lie landscape. */
  portrait: boolean;
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  colGap: number;
  rowGap: number;
  padX: number;
  padY: number;
}

function centred(cols: number, rows: number, cellW: number, cellH: number, colGap: number, rowGap: number): SheetGeometry {
  const padX = (SHEET_W_MM - (cols * cellW + (cols - 1) * colGap)) / 2;
  const padY = (SHEET_H_MM - (rows * cellH + (rows - 1) * rowGap)) / 2;
  return { portrait: cellH > cellW, cols, rows, cellW, cellH, colGap, rowGap, padX, padY };
}

/** Grid for the duplex (fronts sheet / backs sheet) layout. */
export function sheetGeometry(portrait: boolean): SheetGeometry {
  return portrait
    ? centred(3, 3, CARD_SHORT_MM, CARD_LONG_MM, 8, 6)
    : centred(2, 5, CARD_LONG_MM, CARD_SHORT_MM, 8, 4);
}

/**
 * Grid for the student-wise layout: always two columns (front | back), so a
 * row is one learner. The column gap is wider than the duplex grid so the
 * front | back pair reads as two cards; the row gap stays at the duplex value
 * (the red caption under a flagged card fits inside it).
 */
export function pairsGeometry(portrait: boolean): SheetGeometry {
  return portrait
    ? centred(2, 3, CARD_SHORT_MM, CARD_LONG_MM, 10, 8)
    : centred(2, 5, CARD_LONG_MM, CARD_SHORT_MM, 10, 4);
}

export interface SheetSlot {
  card: RenderedCard;
  side: 'front' | 'back';
  /** Learner's 1-based position in the batch (UI label only). */
  ordinal: number;
  /** Total degrees to rotate the landscape bitmap in this slot. */
  rotation: number;
}

export interface SheetPage {
  /** 1-based sheet number as printed. */
  number: number;
  /** 'pairs' = both sides of each learner on one face. */
  side: 'front' | 'back' | 'pairs';
  geometry: SheetGeometry;
  /** cols×rows cells, row-major (index = row * cols + col); null = empty. */
  slots: Array<SheetSlot | null>;
}

export interface BuildSheetOptions {
  mode?: LayoutMode;
  flip?: DuplexFlip;
}

/**
 * Lay the rendered cards out on A4 sheets. Portrait geometry is chosen when
 * any card is a portrait template (a batch normally shares one template).
 * `cards` order is the learner order; both modes preserve it.
 */
export function buildSheetPages(
  cards: RenderedCard[],
  options: BuildSheetOptions | DuplexFlip = {}
): SheetPage[] {
  // Back-compat: the first version took the flip alone.
  const opts: BuildSheetOptions = typeof options === 'string' ? { mode: 'duplex', flip: options } : options;
  const mode = opts.mode ?? 'pairs';
  const flip = opts.flip ?? 'long';
  const portrait = cards.some((c) => c.frontRotation !== 0);
  const hasBacks = cards.some((c) => c.backDataUrl !== null);

  if (mode === 'pairs') return buildPairPages(cards, portrait, hasBacks);
  return buildDuplexPages(cards, portrait, hasBacks, flip);
}

function buildPairPages(cards: RenderedCard[], portrait: boolean, hasBacks: boolean): SheetPage[] {
  // No back side anywhere → plain fronts grid, still in learner order.
  const geo = hasBacks ? pairsGeometry(portrait) : sheetGeometry(portrait);
  const perSheet = hasBacks ? geo.rows : geo.cols * geo.rows;
  const pages: SheetPage[] = [];
  let number = 0;
  for (let start = 0; start < cards.length; start += perSheet) {
    const batch = cards.slice(start, start + perSheet);
    const slots: Array<SheetSlot | null> = new Array(geo.cols * geo.rows).fill(null);
    batch.forEach((card, i) => {
      const ordinal = start + i + 1;
      if (hasBacks) {
        slots[i * 2] = { card, side: 'front', ordinal, rotation: card.frontRotation };
        if (card.backDataUrl !== null) {
          slots[i * 2 + 1] = { card, side: 'back', ordinal, rotation: card.backRotation };
        }
      } else {
        slots[i] = { card, side: 'front', ordinal, rotation: card.frontRotation };
      }
    });
    pages.push({ number: ++number, side: hasBacks ? 'pairs' : 'front', geometry: geo, slots });
  }
  return pages;
}

function buildDuplexPages(
  cards: RenderedCard[],
  portrait: boolean,
  hasBacks: boolean,
  flip: DuplexFlip
): SheetPage[] {
  const geo = sheetGeometry(portrait);
  const perSheet = geo.cols * geo.rows;
  const pages: SheetPage[] = [];
  let number = 0;
  for (let start = 0; start < cards.length; start += perSheet) {
    const batch = cards.slice(start, start + perSheet);

    const frontSlots: Array<SheetSlot | null> = new Array(perSheet).fill(null);
    batch.forEach((card, i) => {
      frontSlots[i] = { card, side: 'front', ordinal: start + i + 1, rotation: card.frontRotation };
    });
    pages.push({ number: ++number, side: 'front', geometry: geo, slots: frontSlots });

    if (!hasBacks) continue;

    const backSlots: Array<SheetSlot | null> = new Array(perSheet).fill(null);
    batch.forEach((card, i) => {
      const row = Math.floor(i / geo.cols);
      const col = i % geo.cols;
      const target =
        flip === 'long'
          ? row * geo.cols + (geo.cols - 1 - col) // mirror columns
          : (geo.rows - 1 - row) * geo.cols + col; // mirror rows
      backSlots[target] = {
        card,
        side: 'back',
        ordinal: start + i + 1,
        rotation: card.backRotation + (flip === 'short' ? 180 : 0)
      };
    });
    pages.push({ number: ++number, side: 'back', geometry: geo, slots: backSlots });
  }
  return pages;
}

/** Top-left corner (mm from the sheet's top-left) of slot `index`. */
export function slotOrigin(geo: SheetGeometry, index: number): { x: number; y: number } {
  const row = Math.floor(index / geo.cols);
  const col = index % geo.cols;
  return {
    x: geo.padX + col * (geo.cellW + geo.colGap),
    y: geo.padY + row * (geo.cellH + geo.rowGap)
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Issue annotations — one definition, three surfaces.
// ──────────────────────────────────────────────────────────────────────────────

/** True when this card must be framed red (missing/wrong data or wrong template). */
export function isFlagged(card: RenderedCard): boolean {
  return card.missing.length > 0 || card.problems.length > 0 || card.institutionMismatch;
}

/**
 * The red caption under a slot: which values are blank or wrong on THIS side
 * (the wrong-template warning rides on the front). Empty string = no caption.
 */
export function slotCaption(slot: SheetSlot): string {
  const parts: string[] = [];
  if (slot.side === 'front' && slot.card.institutionMismatch) parts.push('Wrong institution template.');
  const missing = slot.card.missing.filter((m) => m.side === slot.side).map((m) => m.label);
  if (missing.length > 0) parts.push(`Missing: ${missing.join(', ')}`);
  const wrong = slot.card.problems.filter((p) => p.side === slot.side).map((p) => `${p.label} (${p.problem})`);
  if (wrong.length > 0) parts.push(`Check: ${wrong.join('; ')}`);
  return parts.join(' ');
}

/** Ordered reading sequence of a page — used by the PDF and the print doc. */
export function pageSequence(page: SheetPage): Array<{ index: number; slot: SheetSlot }> {
  const out: Array<{ index: number; slot: SheetSlot }> = [];
  page.slots.forEach((slot, index) => {
    if (slot) out.push({ index, slot });
  });
  return out;
}

/** Inline style for a sheet — geometry differs between portrait/landscape batches. */
export function sheetStyle(geo: SheetGeometry): string {
  return (
    `width:${SHEET_W_MM}mm;height:${SHEET_H_MM}mm;` +
    `padding:${geo.padY}mm ${geo.padX}mm;` +
    `grid-template-columns:repeat(${geo.cols},${geo.cellW}mm);` +
    `grid-template-rows:repeat(${geo.rows},${geo.cellH}mm);` +
    `column-gap:${geo.colGap}mm;row-gap:${geo.rowGap}mm;`
  );
}

/** Inline style for a cell/card box of the batch's geometry. */
export function cellStyle(geo: SheetGeometry): string {
  return `width:${geo.cellW}mm;height:${geo.cellH}mm;`;
}

/**
 * Inline style for the bitmap inside its box. The bitmap is always landscape
 * (85.6 × 54); when rotated ±90° it is centered in the upright box and turned.
 */
export function imageStyle(rotation: number): string {
  const r = ((rotation % 360) + 360) % 360;
  return (
    `position:absolute;left:50%;top:50%;` +
    `width:${CARD_LONG_MM}mm;height:${CARD_SHORT_MM}mm;` +
    `transform:translate(-50%,-50%) rotate(${r}deg);`
  );
}

/** Inline style for the red caption under a flagged slot. */
export function captionStyle(): string {
  return (
    `position:absolute;left:0;right:0;bottom:-${ISSUE_CAPTION_FONT_MM + 1}mm;` +
    `font-size:${ISSUE_CAPTION_FONT_MM}mm;line-height:${ISSUE_CAPTION_FONT_MM + 0.6}mm;` +
    `color:${ISSUE_RED};font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;` +
    `font-family:Arial,Helvetica,sans-serif;`
  );
}

/**
 * The one stylesheet both surfaces use. Class names are prefixed `idc-` so
 * they can sit inside the app without colliding with Tailwind utilities.
 */
export const SHEET_CSS = `
.idc-sheet {
  position: relative;
  box-sizing: border-box;
  display: grid;
  align-content: start;
  justify-content: start;
  background: #ffffff;
  color: #111111;
  overflow: hidden;
}
.idc-cell {
  position: relative;
}
.idc-card {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  overflow: hidden;
  /* No radius, no frame: the uploaded artwork is the whole card, edge to edge.
     Cut lines come from the artwork itself (or the printer's die). */
  background: #ffffff;
}
.idc-card img {
  display: block;
  object-fit: fill;
}
.idc-card.idc-flagged {
  outline: ${ISSUE_FRAME_MM}mm solid ${ISSUE_RED};
  outline-offset: 0;
}
`;

/**
 * Stand-alone HTML for the print frame. Pure string so it can be written into
 * an iframe's srcdoc; images are data URLs, so no network is involved. Flagged
 * cards carry the same red frame + caption as the preview.
 */
export function buildPrintDocument(pages: SheetPage[], title = 'ID Cards'): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const body = pages
    .map((page, idx) => {
      const cells = page.slots
        .map((slot) => {
          const cs = cellStyle(page.geometry);
          if (!slot) return `<div class="idc-cell" style="${cs}"></div>`;
          const src = slot.side === 'front' ? slot.card.frontDataUrl : slot.card.backDataUrl;
          if (!src) return `<div class="idc-cell" style="${cs}"></div>`;
          const flagged = isFlagged(slot.card);
          const caption = slotCaption(slot);
          return (
            `<div class="idc-cell" style="${cs}"><div class="idc-card${flagged ? ' idc-flagged' : ''}">` +
            `<img src="${src}" alt="${esc(slot.card.name)} ${slot.side}" style="${imageStyle(slot.rotation)}">` +
            `</div>` +
            (caption ? `<div style="${captionStyle()}">${esc(caption)}</div>` : '') +
            `</div>`
          );
        })
        .join('');
      const last = idx === pages.length - 1;
      const brk = last ? '' : 'break-after:page;page-break-after:always;';
      return `<section class="idc-sheet" style="${sheetStyle(page.geometry)}${brk}">${cells}</section>`;
    })
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
@page { size: A4 portrait; margin: 0; }
html, body { margin: 0; padding: 0; background: #ffffff; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
${SHEET_CSS}
</style></head><body>${body}</body></html>`;
}
