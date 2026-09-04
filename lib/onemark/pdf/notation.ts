// File: lib/onemark/pdf/notation.ts
//
// OneMark — turning a stored stem / option string into paper-safe HTML.
//
// WHY THIS FILE EXISTS
//   The PDF is printed by headless Chromium with ONLY the fonts we embed
//   (lib/utils/bos/pdf-fonts.ts): Tinos latin subset (235 glyphs) and Noto Sans
//   Tamil. Probed 2026-09-04 with fontkit: Tinos-latin has NO Greek, NO
//   superscript/subscript digits beyond ¹²³, NO √, NO combining overline.
//   On a developer Mac, Chromium quietly borrows Times New Roman for those and
//   the page looks right; on Vercel there is nothing to borrow and every one of
//   them prints as a box. That is the Smile Care failure again, one layer down.
//
//   So no notation glyph is ever asked of the body fonts. Anything mathematical
//   is routed through KaTeX (HTML output, its own embedded fonts — see
//   styles.ts), which is also what PRD Physics §5.2 requires ("All inline
//   mathematics renders via KaTeX … MUST NOT be rasterised").
//
// THE INLINE MARKUP CONTRACT (what an item string may contain)
//   $…$            an explicit TeX run, e.g. $\frac{N_0}{\sqrt 2}$ or ${}^{7}_{3}\mathrm{Li}$
//   <u>…</u>       the underlined target word of an English synonym/antonym item
//                  (PRD English §5.2 — the only tag honoured; every other '<' is text)
//   ___            three or more underscores = one fixed 8-em blank rule
//   plain Unicode  Am⁻¹, 1.0×10⁻⁵, µ₀ε₀, A̅ + B̅ + C̅, ⁷₃Li, N₀/√2 — the forms the
//                  board papers use and the ingestion lane emits. Each
//                  whitespace-delimited token is first split at script
//                  boundaries (Tamil glues a case suffix onto a unit: 10⁻⁵இல்);
//                  a notation-repertoire run that carries a trigger
//                  (super/subscript, Greek, √, combining overline) is promoted
//                  to a TeX snippet and rendered by KaTeX. Everything else —
//                  the Tamil suffix included — is HTML-escaped text in the
//                  body fonts.
//   $…$ guard      a pair whose body starts with a digit, holds whitespace and
//                  no TeX command character is prose ("costs $5 and the pen
//                  $10") and its `$` signs print as text.

import katex from 'katex';

const SUPERSCRIPTS: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')', 'ⁿ': 'n', 'ⁱ': 'i',
};

const SUBSCRIPTS: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '₊': '+', '₋': '-', '₌': '=', '₍': '(', '₎': ')',
  'ₐ': 'a', 'ₑ': 'e', 'ₒ': 'o', 'ₓ': 'x', 'ₕ': 'h', 'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm', 'ₙ': 'n',
  'ₚ': 'p', 'ₛ': 's', 'ₜ': 't',
};

const GREEK: Record<string, string> = {
  'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta', 'ε': '\\varepsilon', 'ζ': '\\zeta',
  'η': '\\eta', 'θ': '\\theta', 'ι': '\\iota', 'κ': '\\kappa', 'λ': '\\lambda', 'μ': '\\mu',
  'µ': '\\mu', 'ν': '\\nu', 'ξ': '\\xi', 'π': '\\pi', 'ρ': '\\rho', 'σ': '\\sigma', 'τ': '\\tau',
  'υ': '\\upsilon', 'φ': '\\phi', 'χ': '\\chi', 'ψ': '\\psi', 'ω': '\\omega',
  'Γ': '\\Gamma', 'Δ': '\\Delta', 'Θ': '\\Theta', 'Λ': '\\Lambda', 'Ξ': '\\Xi', 'Π': '\\Pi',
  'Σ': '\\Sigma', 'Φ': '\\Phi', 'Ψ': '\\Psi', 'Ω': '\\Omega',
};

const SYMBOLS: Record<string, string> = {
  '×': '\\times', '·': '\\cdot', '−': '-', '√': '\\sqrt', '°': '^{\\circ}', '∞': '\\infty',
  '≈': '\\approx', '≠': '\\neq', '≤': '\\le', '≥': '\\ge', '→': '\\rightarrow', '±': '\\pm',
  '÷': '\\div', 'Å': '\\text{Å}', '½': '\\tfrac{1}{2}', '¼': '\\tfrac{1}{4}', '¾': '\\tfrac{3}{4}',
  '⇒': '\\Rightarrow', '∝': '\\propto', '≡': '\\equiv', '∆': '\\Delta', '∑': '\\sum', '∫': '\\int',
};

/** Combining overline (U+0305) and macron (U+0304) — the Boolean complement bar. */
const OVERLINE_MARKS = new Set(['̅', '̄']);

/** A token needs KaTeX when it holds any glyph the embedded body fonts lack. */
const TRIGGER = /[⁰-⁹⁺⁻⁼⁽⁾ⁿⁱ₀-₉₊₋₌₍₎ₐₑₒₓₕₖₗₘₙₚₛₜͰ-Ͽ̅̄√∞≈≠≤≥→±⇒∝≡∆∑∫]/;

/** TeX-style scripts typed into plain text: R_A, v_e, T_{1/2}, x^2. A
 *  subscript needs a ONE-letter base so snake_case_words stay prose. */
const UNDERSCORE_SCRIPT = /(?:^|[^A-Za-z])[A-Za-z]_(?:[A-Za-z0-9](?![A-Za-z])|\{)/;
const CARET_SCRIPT = /[A-Za-z0-9)]\^[A-Za-z0-9{(]/;

export function hasNotationTrigger(token: string): boolean {
  return TRIGGER.test(token) || UNDERSCORE_SCRIPT.test(token) || CARET_SCRIPT.test(token);
}

function isLatinLetter(ch: string): boolean {
  return /[A-Za-z]/.test(ch);
}

/**
 * Convert one whitespace-free Unicode notation token to TeX.
 *
 *   Am⁻¹      → \mathrm{Am}^{-1}          units before a superscript are upright
 *   N₀        → N_{0}                     a variable before a subscript is italic
 *   ⁷₃Li      → {}^{7}_{3}\mathrm{Li}      isotope: leading scripts, then the symbol
 *   A̅        → \overline{A}
 *   µ₀ε₀      → \mu_{0}\varepsilon_{0}
 *   N₀/√2     → \frac{N_{0}}{\sqrt{2}}     one top-level slash = a true fraction
 *   2×10⁻⁵    → 2\times10^{-5}
 */
export function unicodeNotationToTex(token: string): string {
  const parts = splitTopLevelSlash(token);
  if (parts) {
    // Display-style so a stem's fraction is legible at 11pt; inline \frac
    // shrinks the numerals to ~7pt, which a hall printer turns to smudge.
    return `\\dfrac{${convertRun(parts[0])}}{${convertRun(parts[1])}}`;
  }
  return convertRun(token);
}

/** One slash outside every bracket pair, with something on both sides. */
function splitTopLevelSlash(token: string): [string, string] | null {
  const chars = Array.from(token);
  let depth = 0;
  let at = -1;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    else if (ch === '/' && depth === 0) {
      if (at !== -1) return null;
      at = i;
    }
  }
  if (at <= 0 || at === chars.length - 1) return null;
  return [chars.slice(0, at).join(''), chars.slice(at + 1).join('')];
}

/** `_B` / `^2` / `^{-1}` typed the TeX way inside a Unicode token. */
function takeCaretScript(chars: string[], start: number): { tex: string; next: number } {
  const marker = chars[start];
  let j = start + 1;
  let body = '';
  if (chars[j] === '{') {
    let depth = 0;
    while (j < chars.length) {
      if (chars[j] === '{') depth += 1;
      if (chars[j] === '}') depth -= 1;
      body += chars[j];
      j += 1;
      if (depth === 0) break;
    }
    body = body.slice(1, -1);
  } else if (j < chars.length) {
    body = chars[j];
    j += 1;
  }
  return { tex: `${marker}{${convertRun(body)}}`, next: j };
}

function convertRun(run: string): string {
  const chars = Array.from(run);
  let out = '';
  let i = 0;
  // Leading super/subscripts (isotope notation) attach to an empty base.
  let leadingScripts = '';
  while (i < chars.length && (SUPERSCRIPTS[chars[i]] || SUBSCRIPTS[chars[i]])) {
    const { tex, next } = takeScript(chars, i);
    leadingScripts += tex;
    i = next;
  }
  if (leadingScripts) out += `{}${leadingScripts}`;

  while (i < chars.length) {
    const ch = chars[i];
    if (isLatinLetter(ch)) {
      // Gather the whole letter run, then decide upright vs italic by what follows.
      let j = i;
      let letters = '';
      while (j < chars.length && isLatinLetter(chars[j])) {
        letters += chars[j];
        j += 1;
      }
      const next = chars[j];
      const overlined = next !== undefined && OVERLINE_MARKS.has(next);
      if (overlined) {
        // Bar every letter of the run separately: A̅B̅ is two complements.
        let k = i;
        while (k < chars.length && isLatinLetter(chars[k])) {
          const bar = chars[k + 1] !== undefined && OVERLINE_MARKS.has(chars[k + 1]);
          out += bar ? `\\overline{${chars[k]}}` : chars[k];
          k += bar ? 2 : 1;
        }
        i = k;
        continue;
      }
      const followedBySubscript = next !== undefined && SUBSCRIPTS[next] !== undefined;
      const followedBySuperscript = next !== undefined && SUPERSCRIPTS[next] !== undefined;
      if (followedBySuperscript && !followedBySubscript) {
        out += `\\mathrm{${letters}}`; // unit: Am⁻¹, NC⁻¹, m²
      } else if (letters.length > 1 && !followedBySubscript) {
        out += `\\mathrm{${letters}}`; // symbol / unit word: Li, MeV
      } else {
        out += letters; // variable: N₀, R, T
      }
      i = j;
      continue;
    }
    if (SUPERSCRIPTS[ch] || SUBSCRIPTS[ch]) {
      const { tex, next } = takeScript(chars, i);
      out += tex;
      i = next;
      continue;
    }
    if (ch === '_' || ch === '^') {
      const { tex, next } = takeCaretScript(chars, i);
      out += tex;
      i = next;
      continue;
    }
    if (GREEK[ch]) {
      out += GREEK[ch] + ' ';
      i += 1;
      continue;
    }
    if (ch === '√') {
      // Radicand: the following run of digits/letters, or a bracketed group.
      let j = i + 1;
      let radicand = '';
      if (chars[j] === '(') {
        let depth = 0;
        while (j < chars.length) {
          radicand += chars[j];
          if (chars[j] === '(') depth += 1;
          if (chars[j] === ')') depth -= 1;
          j += 1;
          if (depth === 0) break;
        }
        radicand = radicand.slice(1, -1);
      } else {
        while (j < chars.length && /[0-9A-Za-z.]/.test(chars[j])) {
          radicand += chars[j];
          j += 1;
        }
      }
      out += radicand ? `\\sqrt{${convertRun(radicand)}}` : '\\surd ';
      i = j;
      continue;
    }
    if (SYMBOLS[ch]) {
      out += SYMBOLS[ch] + ' ';
      i += 1;
      continue;
    }
    if (OVERLINE_MARKS.has(ch)) {
      i += 1; // stray mark with no base letter — drop it
      continue;
    }
    if (/[0-9.,+\-=()/[\]:]/.test(ch)) {
      out += ch;
      i += 1;
      continue;
    }
    // Anything else (a stray Unicode symbol) goes through \text so KaTeX
    // never throws; KaTeX_Main covers Latin-1 and common punctuation.
    out += `\\text{${escapeTexText(ch)}}`;
    i += 1;
  }
  return out;
}

function takeScript(chars: string[], start: number): { tex: string; next: number } {
  const isSup = SUPERSCRIPTS[chars[start]] !== undefined;
  const table = isSup ? SUPERSCRIPTS : SUBSCRIPTS;
  let j = start;
  let body = '';
  while (j < chars.length && table[chars[j]] !== undefined) {
    body += table[chars[j]];
    j += 1;
  }
  return { tex: `${isSup ? '^' : '_'}{${body}}`, next: j };
}

function escapeTexText(s: string): string {
  return s.replace(/[\\{}$&#^_%~]/g, (m) => `\\${m}`);
}

/** KaTeX HTML for one TeX string. Never throws: a bad expression prints its
 *  source in the body font rather than sinking the whole paper. */
export function renderTex(tex: string): string {
  try {
    return katex.renderToString(tex, {
      output: 'html',
      displayMode: false,
      throwOnError: true,
      strict: 'ignore',
      trust: false,
    });
  } catch {
    return `<span class="tex-error">${escapeHtml(tex)}</span>`;
  }
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Leading/trailing punctuation that belongs to the sentence, not the notation. */
const LEAD_PUNCT = /^[(\[“"']+/;
const TRAIL_PUNCT = /[)\]”"',.;:?!]+$/;

/**
 * The characters KaTeX may be handed: ASCII, Latin-1/Extended, combining
 * marks, Greek, general punctuation, super/subscripts, letterlike symbols,
 * arrows, mathematical operators, miscellaneous technical. Everything outside
 * this repertoire — Tamil above all — is BODY text even when it is glued to a
 * notation run, because Tamil is agglutinative: `10⁻⁵இல்`, `Am⁻¹ஆக`, `ε₀ஐ`
 * carry a case suffix on the unit. Inside KaTeX such a suffix would be set one
 * `\text{}` group per code point (no cluster for HarfBuzz to shape) in a font
 * chain — `.katex{font:… KaTeX_Main,Times New Roman,serif}` — that holds no
 * Tamil glyph, so the host lends a system face (TamilSangamMN on a Mac,
 * nothing on Vercel). Reviewer-B finding, 2026-09-04.
 */
const NOTATION_REPERTOIRE =
  /[\x20-\x7E\u00A0-\u024F\u0300-\u036F\u0370-\u03FF\u2000-\u206F\u2070-\u209F\u2100-\u214F\u2190-\u21FF\u2200-\u22FF\u2300-\u23FF]/;

/** Split a whitespace-free token at every script boundary. */
function splitByRepertoire(token: string): Array<{ notation: boolean; value: string }> {
  const runs: Array<{ notation: boolean; value: string }> = [];
  for (const ch of Array.from(token)) {
    const notation = NOTATION_REPERTOIRE.test(ch);
    const last = runs[runs.length - 1];
    if (last && last.notation === notation) last.value += ch;
    else runs.push({ notation, value: ch });
  }
  return runs;
}

/** One piece of an item string after the markup pass. */
export type ItemSegment =
  | { kind: 'text'; value: string }
  | { kind: 'tex'; value: string }
  | { kind: 'u-open' }
  | { kind: 'u-close' }
  | { kind: 'blank' };

/** A notation-capable run that carries a trigger → lead punctuation (text),
 *  TeX core, trail punctuation (text). Without a trigger it is plain text. */
function segmentNotationRun(tok: string, out: ItemSegment[]): void {
  if (!hasNotationTrigger(tok)) {
    out.push({ kind: 'text', value: tok });
    return;
  }
  const lead = tok.match(LEAD_PUNCT)?.[0] ?? '';
  let trail = tok.match(TRAIL_PUNCT)?.[0] ?? '';
  let core = tok.slice(lead.length, tok.length - trail.length);
  // A closer that balances an opener inside the token belongs to the
  // notation, not the sentence: √(R_B/R_A). keeps its ")" and loses the ".".
  while (trail.length && /^[)\]]/.test(trail) && openCount(core) > closeCount(core)) {
    core += trail[0];
    trail = trail.slice(1);
  }
  if (!core) {
    out.push({ kind: 'text', value: tok });
    return;
  }
  if (lead) out.push({ kind: 'text', value: lead });
  out.push({ kind: 'tex', value: unicodeNotationToTex(core) });
  if (trail) out.push({ kind: 'text', value: trail });
}

/**
 * Plain text (no $…$, no tags) → segments. Each whitespace-delimited token is
 * first split at script boundaries; only its notation-repertoire runs can be
 * promoted to TeX, the rest stays body text. Whitespace becomes single spaces.
 */
function segmentPlainText(text: string, out: ItemSegment[]): void {
  for (const tok of text.split(/(\s+)/)) {
    if (tok.length === 0) continue;
    if (/^\s+$/.test(tok)) {
      out.push({ kind: 'text', value: ' ' });
      continue;
    }
    for (const run of splitByRepertoire(tok)) {
      if (run.notation) segmentNotationRun(run.value, out);
      else out.push({ kind: 'text', value: run.value });
    }
  }
}

function openCount(s: string): number {
  return (s.match(/[([]/g) ?? []).length;
}
function closeCount(s: string): number {
  return (s.match(/[)\]]/g) ?? []).length;
}

/** Fixed 8-em blank rule, identical in both languages (PRD §5.2). A run of
 *  dots (the board's elision mark) is a different glyph and stays text. */
const BLANK_RULE = /_{3,}/g;

/**
 * Is the body of a `$…$` pair a TeX run, or two currency amounts in prose?
 * "The book costs $5 and the pen $10." pairs up as "$5 and the pen $", which
 * KaTeX would typeset as math and print as "5andthepen10". A body that starts
 * with a digit AND contains whitespace AND has no TeX command character is
 * prose, and its `$` signs are ordinary text. `$x$`, `$a + b$`, `$N_0$` and
 * `$2\times10^{-5}$` all stay TeX. Reviewer-B finding, 2026-09-04.
 */
export function isTexBody(body: string): boolean {
  if (/[\\^_{}]/.test(body)) return true;
  if (!/\s/.test(body)) return true;
  return !/^\d/.test(body.trim());
}

function segmentWithBlanks(text: string, out: ItemSegment[]): void {
  text.split(BLANK_RULE).forEach((part, i) => {
    if (i > 0) out.push({ kind: 'blank' });
    segmentPlainText(part, out);
  });
}

/**
 * Full inline-markup pass for a stem, option or explanation string.
 * Order matters: TeX runs are cut out first so a `$` never sees the escaper,
 * then `<u>` targets, then blanks, then plain text with notation promotion.
 */
export function segmentItemText(text: string | null | undefined): ItemSegment[] {
  const out: ItemSegment[] = [];
  if (!text) return out;
  for (const run of text.split(/(\$[^$]+\$)/)) {
    if (run.length === 0) continue;
    if (run.length > 2 && run.startsWith('$') && run.endsWith('$') && isTexBody(run.slice(1, -1))) {
      out.push({ kind: 'tex', value: run.slice(1, -1) });
      continue;
    }
    for (const seg of run.split(/(<u>[\s\S]*?<\/u>)/i)) {
      if (seg.length === 0) continue;
      const m = seg.match(/^<u>([\s\S]*?)<\/u>$/i);
      if (m) {
        out.push({ kind: 'u-open' });
        segmentWithBlanks(m[1], out);
        out.push({ kind: 'u-close' });
      } else {
        segmentWithBlanks(seg, out);
      }
    }
  }
  return out;
}

function renderSegment(seg: ItemSegment): string {
  switch (seg.kind) {
    case 'text':
      return escapeHtml(seg.value);
    case 'tex':
      return renderTex(seg.value);
    case 'u-open':
      return '<u class="target">';
    case 'u-close':
      return '</u>';
    case 'blank':
      return '<span class="blank"></span>';
  }
}

/** Plain text (no $…$, no tags) → HTML. */
export function plainTextToHtml(text: string): string {
  const out: ItemSegment[] = [];
  segmentPlainText(text, out);
  return out.map(renderSegment).join('');
}

export function itemTextToHtml(text: string | null | undefined): string {
  return segmentItemText(text).map(renderSegment).join('');
}

/** The text a font-coverage audit should check against the BODY fonts: every
 *  character that is not handed to KaTeX — including the Tamil suffix of a
 *  token whose other half IS notation. */
export function bodyFontText(text: string | null | undefined): string {
  return segmentItemText(text)
    .filter((s): s is { kind: 'text'; value: string } => s.kind === 'text')
    .map((s) => s.value)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The text a font-coverage audit should check against the KATEX faces: the
 *  visible characters of every KaTeX-rendered run, as KaTeX's HTML emits them
 *  (`ε` is audited as the glyph KaTeX_Math sets, a `\text{…}` payload as
 *  KaTeX_Main text). Anything here the KaTeX faces lack prints as a box. */
export function katexFontText(text: string | null | undefined): string {
  return segmentItemText(text)
    .filter((s): s is { kind: 'tex'; value: string } => s.kind === 'tex')
    .map((s) => htmlTextContent(renderTex(s.value)))
    .join(' ');
}

function htmlTextContent(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}
