// ============================================================================
// lib/id-cards/sheet-pdf.ts
// Created: 2026-09-07 — "Download PDF" for the ID-card print preview.
//
// Builds an A4 PDF from the SAME SheetPage[] the preview renders and the print
// frame prints: same page order, same slot geometry in mm, same rotation, same
// red frame + caption on flagged cards. The three outputs cannot drift because
// they share lib/id-cards/sheet-layout.ts.
//
// Rotation: jsPDF's addImage rotation pivots in PDF space and is easy to get
// mirrored, so a rotated slot is drawn from a bitmap pre-rotated on a canvas
// with the SAME sign convention as CSS rotate() (positive = clockwise). The
// canvas step is the only reason this module is browser-only.
// ============================================================================

import { jsPDF } from 'jspdf';
import {
  CARD_LONG_MM,
  CARD_SHORT_MM,
  ISSUE_CAPTION_FONT_MM,
  ISSUE_CAPTION_LINE_MM,
  ISSUE_CAPTION_TOP_MM,
  captionLines,
  ISSUE_FRAME_MM,
  ISSUE_RED,
  isFlagged,
  pageSequence,
  slotCaption,
  slotOrigin,
  type SheetPage
} from './sheet-layout';

const PT_PER_MM = 72 / 25.4;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode a card image for the PDF.'));
    img.src = src;
  });
}

/** JPEG quality for card bitmaps inside the PDF (print-quality, ~8× smaller than PNG). */
const PDF_JPEG_QUALITY = 0.9;

// One canvas reused for every card: allocating 1,100 canvases was the fastest
// way to run Chrome out of memory on a 552-learner batch.
let scratch: HTMLCanvasElement | null = null;
function scratchCanvas(w: number, h: number): CanvasRenderingContext2D {
  scratch ??= document.createElement('canvas');
  if (scratch.width !== w) scratch.width = w;
  if (scratch.height !== h) scratch.height = h;
  const ctx = scratch.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  return ctx;
}

/**
 * Rotate a card bitmap by `degrees` (clockwise, like CSS) and return it as a
 * JPEG data URL sized for the PDF. 0/360 = no rotation (still re-encoded as
 * JPEG: jsPDF decodes PNGs in JavaScript, which is both slow and the largest
 * memory cost of the old build); ±90 swap width and height.
 */
export async function rotateDataUrl(src: string, degrees: number): Promise<string> {
  const r = ((degrees % 360) + 360) % 360;
  const img = await loadImage(src);
  const swap = r === 90 || r === 270;
  const ctx = scratchCanvas(swap ? img.naturalHeight : img.naturalWidth, swap ? img.naturalWidth : img.naturalHeight);
  ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2);
  ctx.rotate((r * Math.PI) / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return ctx.canvas.toDataURL('image/jpeg', PDF_JPEG_QUALITY);
}

/** Let the event loop breathe so progress paints and the GC can run. */
const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export interface BuildPdfOptions {
  title?: string;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Build the PDF document. Returns the jsPDF instance so callers can `save()`
 * or `output('blob')`.
 */
export async function buildSheetPdf(pages: SheetPage[], options: BuildPdfOptions = {}): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title: options.title ?? 'ID Cards' });

  const total = pages.reduce((n, p) => n + pageSequence(p).length, 0);
  let done = 0;

  for (let p = 0; p < pages.length; p += 1) {
    const page = pages[p];
    if (p > 0) doc.addPage('a4', 'portrait');
    for (const { index, slot } of pageSequence(page)) {
      const src = slot.side === 'front' ? slot.card.frontDataUrl : slot.card.backDataUrl;
      if (!src) continue;
      const { x, y } = slotOrigin(page.geometry, index);
      const { cellW, cellH } = page.geometry;

      const r = ((slot.rotation % 360) + 360) % 360;
      // Each card side appears once per document — no cross-page cache (the old
      // Map kept every bitmap alive for the whole build: 1,104 × ~1 MB).
      const bitmap = await rotateDataUrl(src, r);
      const cacheKey = `${slot.card.learnerId}:${slot.side}:${r}`;
      // The bitmap is landscape 85.6 × 54; after ±90° it is upright 54 × 85.6.
      const swap = r === 90 || r === 270;
      const w = swap ? CARD_SHORT_MM : CARD_LONG_MM;
      const h = swap ? CARD_LONG_MM : CARD_SHORT_MM;
      // Centre in the cell exactly like imageStyle() does on screen.
      const ix = x + (cellW - w) / 2;
      const iy = y + (cellH - h) / 2;
      doc.addImage(bitmap, 'JPEG', ix, iy, w, h, cacheKey, 'FAST');

      if (isFlagged(slot.card)) {
        doc.setDrawColor(ISSUE_RED);
        doc.setLineWidth(ISSUE_FRAME_MM);
        // CSS outline sits OUTSIDE the box; stroke centred on the edge + half width.
        const half = ISSUE_FRAME_MM / 2;
        doc.rect(x - half, y - half, cellW + ISSUE_FRAME_MM, cellH + ISSUE_FRAME_MM, 'S');
      }
      const caption = slotCaption(slot);
      if (caption) {
        doc.setTextColor(ISSUE_RED);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(ISSUE_CAPTION_FONT_MM * PT_PER_MM);
        // Wrap like the CSS caption: as many lines as the row gap holds, then clip.
        const lines = (doc.splitTextToSize(caption, cellW) as string[]).slice(0, captionLines(page.geometry));
        doc.text(lines, x, y + cellH + ISSUE_CAPTION_TOP_MM + ISSUE_CAPTION_FONT_MM, {
          baseline: 'alphabetic',
          lineHeightFactor: ISSUE_CAPTION_LINE_MM / ISSUE_CAPTION_FONT_MM
        });
      }
      done += 1;
      options.onProgress?.(done, total);
      if (done % 6 === 0) await yieldToBrowser();
    }
  }
  return doc;
}

/**
 * Cards per PDF file when a batch is split. ~120 cards = up to 240 sides =
 * ~40 A4 sheets ≈ 20–25 MB of JPEG: comfortable for jsPDF and for Chrome.
 */
export const PDF_CHUNK_CARDS = 120;

export function chunkCards<T>(cards: readonly T[], size = PDF_CHUNK_CARDS): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < cards.length; i += size) out.push(cards.slice(i, i + size));
  return out;
}

/** File name like `id-cards-2026-09-07-25-learners.pdf`. */
export function pdfFileName(cardCount: number, stem = 'id-cards'): string {
  const day = new Date().toISOString().slice(0, 10);
  return `${stem}-${day}-${cardCount}-learner${cardCount === 1 ? '' : 's'}.pdf`;
}
