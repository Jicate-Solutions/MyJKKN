// File: lib/onemark/pdf/styles.ts
//
// OneMark — the stylesheet the board-format paper prints with, and the two
// font pipelines it depends on.
//
//   Body text   Tinos (Times-metric serif, matching board prints) + Noto Sans
//               Tamil, both embedded as data: URIs by lib/utils/bos/pdf-fonts.ts.
//               No font file is added by this lane; the faces are the ones the
//               BoS minutes already ship.
//   Notation    KaTeX's own faces, read from node_modules/katex/dist/fonts and
//               embedded the same way. Only the .woff2 variants are kept and the
//               CSS is memoised per process — the ~300KB of fonts is paid once
//               on a warm function, and Chromium subsets what the PDF embeds.
//
// Both directories must be listed in next.config.ts outputFileTracingIncludes
// for the PDF route, or the deployed function cannot read them and Chromium
// falls back to Open Sans — the exact production-only tofu this lane exists
// to prevent.

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { PDF_FONT_STACK, pdfFontFaceCss } from '@/lib/utils/bos/pdf-fonts';

let cachedKatexCss: string | null = null;

/**
 * katex.min.css with every `url(fonts/*.woff2)` replaced by an inline data:
 * URI and the .woff/.ttf fallbacks dropped. A missing font directory degrades
 * to KaTeX's structural CSS alone (layout still right, glyphs from the body
 * font) and is logged, rather than failing the whole paper.
 */
export function katexEmbeddedCss(): string {
  if (cachedKatexCss !== null) return cachedKatexCss;
  const dist = join(process.cwd(), 'node_modules', 'katex', 'dist');
  let css = '';
  try {
    css = readFileSync(join(dist, 'katex.min.css'), 'utf8');
  } catch (err) {
    console.warn('[onemark-pdf] katex.min.css not readable; notation will use body fonts:', err);
    cachedKatexCss = '';
    return cachedKatexCss;
  }
  const fonts = new Map<string, string>();
  try {
    for (const file of readdirSync(join(dist, 'fonts'))) {
      if (!file.endsWith('.woff2')) continue;
      fonts.set(file, readFileSync(join(dist, 'fonts', file)).toString('base64'));
    }
  } catch (err) {
    console.warn('[onemark-pdf] katex fonts not readable; notation will use body fonts:', err);
  }
  css = css.replace(
    /src:url\(fonts\/([^)]+\.woff2)\) format\("woff2"\)(?:,url\([^)]+\) format\("[^"]+"\))*/g,
    (whole, file: string) => {
      const b64 = fonts.get(file);
      return b64 ? `src:url(data:font/woff2;base64,${b64}) format("woff2")` : whole;
    },
  );
  cachedKatexCss = css;
  return cachedKatexCss;
}

/** The page CSS. Margins belong to the print job (render.ts), not the sheet. */
export function paperCss(): string {
  return `
${pdfFontFaceCss()}
${katexEmbeddedCss()}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: ${PDF_FONT_STACK};
  font-size: 11pt;
  line-height: 1.38;
  color: #000;
  background: #fff;
}
.ta { font-family: 'Noto Sans Tamil', ${PDF_FONT_STACK}; }
.rule { border-top: 1.2pt solid #000; margin: 6pt 0; }
.rule.double { border-top: 3pt double #000; }
.thin { border-top: 0.6pt solid #000; margin: 6pt 0; }

/* ---------- masthead ---------- */
.masthead { display: grid; grid-template-columns: 1fr auto 1fr; align-items: start; font-size: 9.5pt; }
.masthead .left { text-align: left; }
.masthead .mid { text-align: center; }
.masthead .right { text-align: right; }
.series-box {
  display: inline-block; border: 1pt solid #000; padding: 1pt 6pt; font-weight: 700;
  font-size: 12pt; min-width: 22pt; text-align: center;
}
.regno { display: inline-flex; align-items: center; gap: 4pt; margin-top: 4pt; }
.regno .cells { display: inline-flex; }
.regno .cells span { display: inline-block; width: 12pt; height: 14pt; border: 0.8pt solid #000; margin-left: -0.8pt; }
.title-block { text-align: center; margin-top: 4pt; }
.title-block .part { font-weight: 700; letter-spacing: 0.08em; }
.title-block .subject { font-weight: 700; font-size: 13pt; margin-top: 2pt; }
.title-block .medium { font-size: 10pt; }
.timebar { display: flex; justify-content: space-between; font-size: 10.5pt; margin-top: 4pt; }
.timebar div { white-space: nowrap; }
.instructions { font-size: 10pt; margin: 2pt 0; }
.instructions .label { display: inline-block; min-width: 68pt; font-weight: 700; vertical-align: top; }
.instructions ol { margin: 0; padding-left: 18pt; display: inline-block; vertical-align: top; max-width: 88%; }
.instructions li { margin: 0; }
.part-head { text-align: center; font-weight: 700; margin: 4pt 0 2pt; letter-spacing: 0.06em; }
.note { display: grid; grid-template-columns: 52pt 1fr auto; column-gap: 6pt; font-size: 10pt; }
.note .label { font-weight: 700; }
.note .score { white-space: nowrap; font-weight: 700; }
.note ol { margin: 0; padding-left: 16pt; list-style: none; }

/* ---------- questions ---------- */
.questions { margin-top: 4pt; }
.directive { margin: 8pt 0 3pt; font-style: italic; break-after: avoid; }
.q { display: grid; grid-template-columns: 22pt 1fr; column-gap: 4pt; margin-top: 7pt; break-inside: avoid; }
.q .num { text-align: right; font-weight: 700; padding-right: 2pt; }
.q .body { min-width: 0; }
.q .lang + .lang { margin-top: 5pt; }
.q .stem { text-align: left; }
.opts { margin-top: 2pt; }
.opts.inline_4 { display: grid; grid-template-columns: repeat(4, 1fr); column-gap: 8pt; }
.opts.inline_2x2 { display: grid; grid-template-columns: repeat(2, 1fr); column-gap: 12pt; row-gap: 1pt; }
.opts.stacked { display: block; }
.opts.stacked .opt { display: flex; margin-top: 1pt; }
.opt { display: flex; gap: 4pt; align-items: baseline; min-width: 0; }
.opt .code { white-space: nowrap; }
.opt .text { min-width: 0; }
u.target { text-decoration: underline; text-underline-offset: 2pt; font-weight: 600; }
.blank { display: inline-block; width: 8em; border-bottom: 0.8pt solid #000; height: 0.9em; vertical-align: baseline; }
.tex-error { font-family: 'Tinos', serif; }
/* katex.min.css sets the \`font\` shorthand, which RESETS the family to
   KaTeX_Main, Times New Roman, serif — no Tamil face in the chain. notation.ts
   keeps every non-Latin script out of KaTeX; this chain is the belt to that
   brace, so a stray \\text{} code point still meets an embedded face. */
.katex { font-size: 1.02em; font-family: KaTeX_Main, 'Tinos', 'Noto Sans Tamil', serif; }
.end-mark { text-align: center; margin-top: 16pt; letter-spacing: 0.3em; }

/* ---------- answer key ---------- */
.key-title { text-align: center; font-weight: 700; font-size: 13pt; letter-spacing: 0.04em; }
.key-sub { text-align: center; font-size: 10pt; letter-spacing: 0.06em; margin-top: 1pt; }
.key-meta { display: grid; grid-template-columns: 1fr 1fr 1fr; font-size: 10pt; row-gap: 2pt; margin: 4pt 0; }
.key-meta b { font-weight: 700; }
table.key { width: 100%; border-collapse: collapse; font-size: 10pt; margin-top: 4pt; }
table.key th { text-align: left; border-bottom: 0.8pt solid #000; padding: 2pt 4pt; font-weight: 700; }
table.key td { vertical-align: top; padding: 4pt 4pt; border-bottom: 0.4pt solid #888; }
table.key tr { break-inside: avoid; }
table.key td.n { text-align: right; width: 28pt; }
table.key td.code { white-space: nowrap; width: 62pt; }
table.key td.ans { width: 30%; }
/* Tamil answer over English answer: two display fractions (N₀/√2) stacked
   with no gap touched each other in the round-2 eyeball. */
table.key td.ans > div + div { margin-top: 3pt; }
table.key .ref { display: block; font-size: 9pt; color: #222; margin-top: 2pt; }
.coverage { margin-top: 8pt; font-size: 10pt; }
.coverage .h { font-weight: 700; letter-spacing: 0.06em; }
.coverage div { margin-top: 1pt; }
`;
}
