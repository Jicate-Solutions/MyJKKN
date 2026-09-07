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

/**
 * Rotate a PNG data URL by `degrees` (clockwise, like CSS) on a canvas. 0 and
 * 360 return the input untouched; ±90 swap width and height.
 */
export async function rotateDataUrl(src: string, degrees: number): Promise<string> {
  const r = ((degrees % 360) + 360) % 360;
  if (r === 0) return src;
  const img = await loadImage(src);
  const swap = r === 90 || r === 270;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? img.naturalHeight : img.naturalWidth;
  canvas.height = swap ? img.naturalWidth : img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((r * Math.PI) / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return canvas.toDataURL('image/png');
}

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
  // A card side rotated the same way is only rasterised once.
  const rotated = new Map<string, string>();

  for (let p = 0; p < pages.length; p += 1) {
    const page = pages[p];
    if (p > 0) doc.addPage('a4', 'portrait');
    for (const { index, slot } of pageSequence(page)) {
      const src = slot.side === 'front' ? slot.card.frontDataUrl : slot.card.backDataUrl;
      if (!src) continue;
      const { x, y } = slotOrigin(page.geometry, index);
      const { cellW, cellH } = page.geometry;

      const r = ((slot.rotation % 360) + 360) % 360;
      const cacheKey = `${slot.card.learnerId}:${slot.side}:${r}`;
      let bitmap = rotated.get(cacheKey);
      if (!bitmap) {
        bitmap = await rotateDataUrl(src, r);
        rotated.set(cacheKey, bitmap);
      }
      // The bitmap is landscape 85.6 × 54; after ±90° it is upright 54 × 85.6.
      const swap = r === 90 || r === 270;
      const w = swap ? CARD_SHORT_MM : CARD_LONG_MM;
      const h = swap ? CARD_LONG_MM : CARD_SHORT_MM;
      // Centre in the cell exactly like imageStyle() does on screen.
      const ix = x + (cellW - w) / 2;
      const iy = y + (cellH - h) / 2;
      doc.addImage(bitmap, 'PNG', ix, iy, w, h, cacheKey, 'FAST');

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
        const maxWidth = cellW;
        const text = fitCaption(doc, caption, maxWidth);
        doc.text(text, x, y + cellH + ISSUE_CAPTION_FONT_MM + 0.4, { baseline: 'alphabetic' });
      }
      done += 1;
      options.onProgress?.(done, total);
    }
  }
  return doc;
}

/** Trim a caption with an ellipsis so it never runs into the next column. */
function fitCaption(doc: jsPDF, text: string, maxWidthMm: number): string {
  if (doc.getTextWidth(text) <= maxWidthMm) return text;
  let cut = text;
  while (cut.length > 1 && doc.getTextWidth(`${cut}…`) > maxWidthMm) {
    cut = cut.slice(0, -1);
  }
  return `${cut.trimEnd()}…`;
}

/** File name like `id-cards-2026-09-07-25-learners.pdf`. */
export function pdfFileName(cardCount: number, stem = 'id-cards'): string {
  const day = new Date().toISOString().slice(0, 10);
  return `${stem}-${day}-${cardCount}-learner${cardCount === 1 ? '' : 's'}.pdf`;
}
