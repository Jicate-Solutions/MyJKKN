// ============================================================================
// lib/id-cards/card-fonts.ts
// Created: 2026-09-19 — real font weights for the ID-card compositor.
//
// next/og ships ONE font file (Geist-Regular, weight 400). Every `fontWeight`
// in the card designs therefore rendered at the same regular weight — "bold"
// values were never bold, and headings and values looked like one flat face.
// The compositor now loads Poppins Regular / SemiBold / Bold (SIL OFL, see
// fonts/OFL.txt) — the same family the card artwork is set in — so 400 / 600 /
// 700+ resolve to real cuts. satori cannot read woff2, hence TTFs here rather
// than the woff2 files under public/fonts.
//
// Server-only (node:fs). Loaded once per server process.
// ============================================================================

import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type CardFont = {
  name: string;
  data: Buffer;
  weight: 400 | 600 | 700;
  style: 'normal';
};

export const CARD_FONT_FAMILY = 'Poppins';

let cached: Promise<CardFont[]> | null = null;

/** Literal paths so Next's file tracing bundles the TTFs with the route. */
async function load(): Promise<CardFont[]> {
  const dir = path.join(process.cwd(), 'lib', 'id-cards', 'fonts');
  const [regular, semiBold, bold] = await Promise.all([
    readFile(path.join(dir, 'Poppins-Regular.ttf')),
    readFile(path.join(dir, 'Poppins-SemiBold.ttf')),
    readFile(path.join(dir, 'Poppins-Bold.ttf'))
  ]);
  return [
    { name: CARD_FONT_FAMILY, data: regular, weight: 400, style: 'normal' },
    { name: CARD_FONT_FAMILY, data: semiBold, weight: 600, style: 'normal' },
    { name: CARD_FONT_FAMILY, data: bold, weight: 700, style: 'normal' }
  ];
}

/**
 * Fonts for `new ImageResponse(el, { fonts })`. Fail-soft: if the files cannot
 * be read the render falls back to next/og's built-in font (undefined) rather
 * than 500-ing the card.
 */
export async function loadCardFonts(): Promise<CardFont[] | undefined> {
  cached ??= load();
  try {
    return await cached;
  } catch (err) {
    cached = null;
    console.warn('[id-cards/render] card fonts unavailable, using the built-in font:', err);
    return undefined;
  }
}
