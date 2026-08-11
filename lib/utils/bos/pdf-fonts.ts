// lib/utils/bos/pdf-fonts.ts
// ============================================================================
// Fonts for the Chromium-rendered BoS documents (minutes, call letter).
//
// WHY THIS FILE EXISTS
// --------------------
// The stylesheets ask for 'Times New Roman', serif. Locally that resolves to
// the real Windows/macOS face, so the sheets look right. On Vercel they do not:
// @sparticuz/chromium ships its own font set and that set is exactly
//
//     fonts/Open_Sans/OpenSans-{Regular,Bold,Italic}.ttf
//
// (verify with `tar -xf node_modules/@sparticuz/chromium/bin/fonts.tar.br`).
// There is no Times, no serif of any kind, and no Indic coverage. Chromium
// silently substitutes Open Sans, whose glyphs are materially wider than
// Times', so every measured layout — column widths, the narrative's bordered
// box, the call letter's single-page budget — grows past the space it was
// designed for, and Tamil text renders as tofu. The bug is invisible in
// development and only shows up on the deployed site.
//
// The fix is to stop depending on the host's fonts: the faces below are
// embedded in the generated HTML as data: URIs, so the renderer is identical
// everywhere.
//
//   • Tinos (Apache-2.0) is metric-compatible with Times New Roman — same
//     advance widths, so a sheet laid out against Times keeps its measurements.
//   • Noto Sans Tamil (OFL) covers the Tamil the minutes editor is built to
//     type (Tamil99 / phonetic keyboards).
//
// The .woff2 files live in public/fonts/pdf/ and are pulled into the deployed
// function by outputFileTracingIncludes in next.config.ts — the same mechanism
// that ships the Chromium binary. Adding a font here means adding it there too,
// otherwise the read fails in production and we silently fall back to Open Sans
// again.
//
// Refresh the files from the pinned devDependencies:
//   node_modules/@fontsource/tinos/files/tinos-latin-{400,700}-{normal,italic}.woff2
//   node_modules/@fontsource/noto-sans-tamil/files/noto-sans-tamil-tamil-{400,700}-normal.woff2

import { readFileSync } from 'fs';
import { join } from 'path';

interface FontFace {
  /**
   * Every family name this file should answer to.
   *
   * The aliases matter as much as the real name. Body copy inherits the stack
   * below, but the minutes editor writes the ribbon's font picker straight into
   * the markup as an inline `font-family` — "Times New Roman", Georgia, Latha —
   * and an inline declaration beats any stack we set. On Vercel none of those
   * families exist, so each one silently became Open Sans no matter what the
   * body was told to use. Declaring them as aliases of the embedded bytes is
   * what carries the author's choice through: it needs no rewriting of stored
   * content, so rows saved before this fix render correctly too.
   *
   * Georgia maps to Tinos because a Times-metric serif is a far closer stand-in
   * than a sans. Inter and Courier New are left alone: a sans and a monospace
   * have no sensible substitute among these files, and Open Sans is a fair
   * fallback for the former.
   */
  families: string[];
  weight: 400 | 700;
  style: 'normal' | 'italic';
  file: string;
}

const SERIF_FAMILIES = ['Tinos', 'Times New Roman', 'Georgia'];
const TAMIL_FAMILIES = ['Noto Sans Tamil', 'Latha'];

const FACES: FontFace[] = [
  { families: SERIF_FAMILIES, weight: 400, style: 'normal', file: 'tinos-latin-400-normal.woff2' },
  { families: SERIF_FAMILIES, weight: 700, style: 'normal', file: 'tinos-latin-700-normal.woff2' },
  { families: SERIF_FAMILIES, weight: 400, style: 'italic', file: 'tinos-latin-400-italic.woff2' },
  { families: SERIF_FAMILIES, weight: 700, style: 'italic', file: 'tinos-latin-700-italic.woff2' },
  { families: TAMIL_FAMILIES, weight: 400, style: 'normal', file: 'noto-sans-tamil-tamil-400-normal.woff2' },
  { families: TAMIL_FAMILIES, weight: 700, style: 'normal', file: 'noto-sans-tamil-tamil-700-normal.woff2' },
];

/**
 * The font stack every BoS document should declare. Tinos first (embedded, so
 * always present), then the local Times for anyone who opens the HTML outside
 * the renderer, then Noto Sans Tamil to pick up Tamil runs, then generic serif.
 */
export const PDF_FONT_STACK = `'Tinos', 'Times New Roman', 'Noto Sans Tamil', serif`;

let cachedCss: string | null = null;

/**
 * `@font-face` rules with each face inlined as a base64 data: URI, ready to
 * drop at the top of a document's <style> block.
 *
 * Read once per process and memoised: the six faces are ~105KB on disk and the
 * same bytes serve every render on a warm Lambda.
 *
 * A missing or unreadable file is logged and skipped rather than thrown. Losing
 * a face degrades the sheet to the host's fallback font, which is bad; failing
 * the request means no document at all, which is worse.
 */
export function pdfFontFaceCss(): string {
  if (cachedCss !== null) return cachedCss;

  const dir = join(process.cwd(), 'public', 'fonts', 'pdf');
  const rules: string[] = [];

  for (const face of FACES) {
    try {
      const base64 = readFileSync(join(dir, face.file)).toString('base64');
      for (const family of face.families) {
        rules.push(
          `@font-face{font-family:'${family}';font-style:${face.style};` +
            `font-weight:${face.weight};font-display:block;` +
            `src:url(data:font/woff2;base64,${base64}) format('woff2');}`,
        );
      }
    } catch (err) {
      console.warn(`[pdf-fonts] could not embed ${face.file}:`, err);
    }
  }

  cachedCss = rules.join('\n');
  return cachedCss;
}
