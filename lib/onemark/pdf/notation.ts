// File: lib/onemark/pdf/notation.ts
//
// OneMark — turning a stored stem / option string into paper-safe HTML.
//
// WHY THIS FILE EXISTS
//   The PDF is printed by headless Chromium with ONLY the fonts we embed
//   (lib/utils/bos/pdf-fonts.ts): Tinos latin subset (233 code points) and
//   Noto Sans Tamil. Tinos-latin has NO Greek, NO superscript/subscript digits
//   beyond ¹²³, NO √, NO combining overline, NO ∴ ⊥ ∠ ∂ ⇌. On a developer Mac,
//   Chromium quietly borrows Times New Roman / AppleSymbols for those and the
//   page looks right; on Vercel there is nothing to borrow and every one of
//   them prints as a box. That is the Smile Care failure again, one layer down.
//
//   So no glyph the body fonts lack is ever asked of them. Whether a character
//   needs KaTeX is answered by the embedded faces' own cmap (fonts.ts), not by
//   a typed list — two rounds of review found the typed list incomplete both
//   times. Anything the body fonts lack is routed through KaTeX (HTML output,
//   its own embedded faces — see styles.ts), which is also what PRD Physics
//   §5.2 requires ("All inline mathematics renders via KaTeX … MUST NOT be
//   rasterised"). A character NEITHER family can set is reported by
//   uncoveredGlyphs() / paperGlyphGaps() and the render REFUSES (render.ts →
//   route 422 naming the item and the glyph) rather than printing a box.
//
// THE INLINE MARKUP CONTRACT (what an item string may contain)
//   $…$            an explicit TeX run, e.g. $\frac{N_0}{\sqrt 2}$ or ${}^{7}_{3}\mathrm{Li}$.
//                  Delimiters follow the Pandoc rule: the opening `$` must be
//                  followed by a non-space, the closing `$` must be preceded
//                  by a non-space and not followed by a digit. So "costs $5
//                  and the pen $10" and "the $ sign" are prose, and `\$` is
//                  always a literal dollar sign.
//   <u>…</u>       the underlined target word of an English synonym/antonym item
//                  (PRD English §5.2 — the only tag honoured; every other '<' is text)
//   ___            three or more underscores = one fixed 8-em blank rule
//   plain Unicode  Am⁻¹, 1.0×10⁻⁵, µ₀ε₀, A̅ + B̅ + C̅, ⁷₃Li, N₀/√2, n̂, v⃗, ∴, ⊥ — the
//                  forms the board papers use and the ingestion lane emits.
//                  Each whitespace-delimited token is first split at script
//                  boundaries (Tamil glues a case suffix onto a unit: 10⁻⁵இல்);
//                  a notation-repertoire run holding any glyph the body fonts
//                  lack (per the cmap) or a combining accent is promoted to a
//                  TeX snippet and rendered by KaTeX. Everything else — the
//                  Tamil suffix included — is HTML-escaped text in the body
//                  fonts.

import katex from 'katex';
import {
  bodyFontCovers,
  fontCoverageKnown,
  katexSpanCovers,
} from './fonts';
import type { PaperModel } from './types';

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

/** Regex-class fragments from code points — written this way so no literal
 *  invisible character (a combining mark, a zero-width space) has to live in
 *  the source. */
function cp(n: number): string {
  return String.fromCodePoint(n);
}
function cpRange(a: number, b: number): string {
  return `${cp(a)}-${cp(b)}`;
}

/** Unicode → TeX for the symbols the corpus and the reviewer's probe use.
 *  Not a coverage list — routing is decided by the cmap; this only says HOW a
 *  routed glyph is spelt in TeX when the plain code point would not do
 *  (℃ has no KaTeX glyph at all; ° must become a superscript circle). */
const SYMBOLS: Record<string, string> = {
  '×': '\\times', '·': '\\cdot', '⋅': '\\cdot', '−': '-', '√': '\\sqrt', '°': '^{\\circ}', '∞': '\\infty',
  '≈': '\\approx', '≠': '\\neq', '≤': '\\le', '≥': '\\ge', '→': '\\rightarrow', '←': '\\leftarrow',
  '↔': '\\leftrightarrow', '⇀': '\\rightharpoonup', '⇌': '\\rightleftharpoons', '±': '\\pm',
  '÷': '\\div', 'Å': '\\text{Å}', '½': '\\tfrac{1}{2}', '¼': '\\tfrac{1}{4}', '¾': '\\tfrac{3}{4}',
  '⇒': '\\Rightarrow', '⇐': '\\Leftarrow', '⇔': '\\Leftrightarrow', '∝': '\\propto', '≡': '\\equiv',
  '≃': '\\simeq', '≅': '\\cong', '∼': '\\sim', '≪': '\\ll', '≫': '\\gg',
  '∆': '\\Delta', '∑': '\\sum', '∫': '\\int', '∮': '\\oint', '∂': '\\partial', '∇': '\\nabla',
  '∴': '\\therefore', '∵': '\\because', '⊥': '\\perp', '∥': '\\parallel', '∠': '\\angle',
  '∈': '\\in', '∉': '\\notin', '⊂': '\\subset', '⊃': '\\supset', '∪': '\\cup', '∩': '\\cap',
  '⊙': '\\odot', '⊗': '\\otimes', '⊕': '\\oplus', '∘': '\\circ', 'ℏ': '\\hbar', 'ℓ': '\\ell',
  '℃': '^{\\circ}\\mathrm{C}', '℉': '^{\\circ}\\mathrm{F}',
};

/** Combining marks that are NOTATION on a letter, whatever the cmap says:
 *  the Boolean complement bar, the unit-vector hat, the vector arrow. Tinos
 *  happens to carry a macron (U+0304) and a tilde (U+0303); on a Physics
 *  paper they still mean \overline / \tilde and are set by KaTeX so the bar
 *  sits over the letter the way the board prints it. */
const ACCENT_MARKS: Record<string, string> = {
  '̅': '\\overline', // combining overline — A̅
  '̄': '\\overline', // combining macron
  '̂': '\\hat', // combining circumflex — n̂
  '⃗': '\\vec', // combining right arrow above — v⃗
  '̇': '\\dot', // combining dot above — ẋ
  '̃': '\\tilde', // combining tilde
};

/**
 * What the body fonts lack when the cmap cannot be read (fonts.ts). Used
 * ONLY as the fallback answer; with the cmap available it is never consulted.
 * Deliberately broad — a false "needs KaTeX" costs nothing, a false "body
 * can set it" prints a box.
 */
const FALLBACK_TRIGGER = new RegExp(`[^${cpRange(0x20, 0x7e)}${cpRange(0xa0, 0xff)}${cpRange(0x2010, 0x201f)}${cp(0x2026)}]`);

/** TeX-style scripts typed into plain text: R_A, v_e, T_{1/2}, x^2. A
 *  subscript needs a ONE-letter base so snake_case_words stay prose. */
const UNDERSCORE_SCRIPT = /(?:^|[^A-Za-z])[A-Za-z]_(?:[A-Za-z0-9](?![A-Za-z])|\{)/;
const CARET_SCRIPT = /[A-Za-z0-9)]\^[A-Za-z0-9{(]/;

/** Does this single character need KaTeX? True when no embedded body face
 *  has a glyph for it (per the cmap) or it is a notation accent. */
export function charNeedsKatex(ch: string): boolean {
  if (ACCENT_MARKS[ch]) return true;
  const covered = bodyFontCovers(ch.codePointAt(0)!);
  if (covered === null) return FALLBACK_TRIGGER.test(ch);
  return !covered;
}

export function hasNotationTrigger(token: string): boolean {
  for (const ch of Array.from(token)) if (charNeedsKatex(ch)) return true;
  return UNDERSCORE_SCRIPT.test(token) || CARET_SCRIPT.test(token);
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
 *   n̂  v⃗    → \hat{n}  \vec{v}
 *   µ₀ε₀      → \mu_{0}\varepsilon_{0}
 *   N₀/√2     → \frac{N_{0}}{\sqrt{2}}     one top-level slash = a true fraction
 *   2×10⁻⁵    → 2\times10^{-5}
 */
export function unicodeNotationToTex(rawToken: string): string {
  const token = expandPrecomposedAccents(rawToken);
  const parts = splitTopLevelSlash(token);
  if (parts) {
    // Display-style so a stem's fraction is legible at 11pt; inline \frac
    // shrinks the numerals to ~7pt, which a hall printer turns to smudge.
    return `\\dfrac{${convertRun(parts[0])}}{${convertRun(parts[1])}}`;
  }
  return convertRun(token);
}

/** A precomposed accented letter from Latin Extended Additional (ẋ U+1E8B,
 *  ṅ, ḃ …) is the same notation as letter + combining mark; decompose it so
 *  the accent path sets it as \dot{x}. Only that block is touched — NFD on é
 *  or Å would trade a glyph Tinos has for a combining mark it lacks. */
function expandPrecomposedAccents(token: string): string {
  return Array.from(token)
    .map((ch) => {
      const cp = ch.codePointAt(0)!;
      if (cp < 0x1e00 || cp > 0x1eff) return ch;
      const nfd = Array.from(ch.normalize('NFD'));
      return nfd.length === 2 && ACCENT_MARKS[nfd[1]] ? nfd.join('') : ch;
    })
    .join('');
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

const rawKatexCache = new Map<string, boolean>();

/**
 * Can KaTeX take this code point as-is in math mode AND set the result from an
 * embedded face? KaTeX accepts most Unicode operators directly (∴ ⊥ ∈ ⊗ …
 * map to its own symbol table); this is the long tail behind SYMBOLS.
 */
function katexSetsRaw(ch: string): boolean {
  const hit = rawKatexCache.get(ch);
  if (hit !== undefined) return hit;
  let ok = false;
  try {
    const html = katex.renderToString(ch, { output: 'html', throwOnError: true, strict: 'ignore', trust: false });
    ok = fontCoverageKnown() && uncoveredKatexGlyphs(html).length === 0;
  } catch {
    ok = false;
  }
  rawKatexCache.set(ch, ok);
  return ok;
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
      const accented = next !== undefined && ACCENT_MARKS[next] !== undefined;
      if (accented) {
        // Accent every letter of the run separately: A̅B̅ is two complements.
        let k = i;
        while (k < chars.length && isLatinLetter(chars[k])) {
          const mark = chars[k + 1] !== undefined ? ACCENT_MARKS[chars[k + 1]] : undefined;
          out += mark ? `${mark}{${chars[k]}}` : chars[k];
          k += mark ? 2 : 1;
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
    if (ACCENT_MARKS[ch]) {
      i += 1; // stray mark with no base letter — drop it
      continue;
    }
    if (/[0-9.,+\-=()/[\]:]/.test(ch)) {
      out += ch;
      i += 1;
      continue;
    }
    if (katexSetsRaw(ch)) {
      out += ch; // KaTeX knows the symbol and an embedded face has the glyph
      i += 1;
      continue;
    }
    // Anything else goes through \text so KaTeX never throws. Its leaf span has
    // no font class, so it inherits the .katex chain (KaTeX_Main → Tinos → Noto
    // Sans Tamil); a code point none of those carry is reported by
    // uncoveredGlyphs() and the render refuses.
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
 * marks, Greek, general punctuation, super/subscripts, Latin Extended
 * Additional (precomposed ẋ), combining marks for symbols (v⃗), letterlike symbols,
 * arrows, mathematical operators, miscellaneous technical. Everything outside
 * this repertoire — Tamil above all — is BODY text even when it is glued to a
 * notation run, because Tamil is agglutinative: `10⁻⁵இல்`, `Am⁻¹ஆக`, `ε₀ஐ`
 * carry a case suffix on the unit. Inside KaTeX such a suffix would be set one
 * `\text{}` group per code point (no cluster for HarfBuzz to shape) in a font
 * chain — `.katex{font:… KaTeX_Main,Times New Roman,serif}` — that holds no
 * Tamil glyph, so the host lends a system face (TamilSangamMN on a Mac,
 * nothing on Vercel). Reviewer-B finding, 2026-09-04.
 */

/** The code-point ranges above, for an audit that walks every one of them. */
export const NOTATION_REPERTOIRE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x20, 0x7e], [0xa0, 0x24f], [0x300, 0x36f], [0x370, 0x3ff], [0x2000, 0x206f], [0x2070, 0x209f],
  [0x1e00, 0x1eff], [0x20d0, 0x20ff], [0x2100, 0x214f], [0x2190, 0x21ff], [0x2200, 0x22ff], [0x2300, 0x23ff],
];

const NOTATION_REPERTOIRE = new RegExp(`[${NOTATION_REPERTOIRE_RANGES.map(([a, b]) => cpRange(a, b)).join('')}]`);

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
 * Cut the explicit `$…$` TeX runs out of an item string, Pandoc's way:
 *   • `\$` is a literal dollar sign, inside or outside a run;
 *   • an opening `$` must be followed by a non-space character;
 *   • a closing `$` must be preceded by a non-space character and must not be
 *     followed by a digit.
 * "The book costs $5 and the pen $10." therefore has NO TeX run (the only
 * candidate closer, before "10", is preceded by a space and followed by a
 * digit), "the $ sign and the $ symbol" has none (both openers are followed
 * by a space), while `$x$`, `$a + b$`, `$N_0$`, `$2\times10^{-5}$` and
 * `$t = \tfrac{1}{2}T_{1/2}$` are all TeX. Reviewer-B finding, 2026-09-04;
 * made delimiter-based (not a heuristic on the body) in round 2.
 */
export function splitTexRuns(text: string): Array<{ tex: boolean; value: string }> {
  const out: Array<{ tex: boolean; value: string }> = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ tex: false, value: buf });
    buf = '';
  };
  const n = text.length;
  let i = 0;
  while (i < n) {
    const ch = text[i];
    if (ch === '\\' && text[i + 1] === '$') {
      buf += '$';
      i += 2;
      continue;
    }
    if (ch === '$' && i + 1 < n && !/\s/.test(text[i + 1]) && text[i + 1] !== '$') {
      let j = i + 1;
      while (j < n) {
        if (text[j] === '\\' && text[j + 1] === '$') {
          j += 2;
          continue;
        }
        if (text[j] === '$') break;
        j += 1;
      }
      if (j < n && !/\s/.test(text[j - 1]) && !/\d/.test(text[j + 1] ?? '')) {
        flush();
        out.push({ tex: true, value: text.slice(i + 1, j) });
        i = j + 1;
        continue;
      }
    }
    buf += ch;
    i += 1;
  }
  flush();
  return out;
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
  for (const run of splitTexRuns(text)) {
    if (run.tex) {
      out.push({ kind: 'tex', value: run.value });
      continue;
    }
    for (const seg of run.value.split(/(<u>[\s\S]*?<\/u>)/i)) {
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
  return decodeEntities(html.replace(/<[^>]+>/g, ''));
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

/** Whitespace, controls and the characters Chromium never asks a font for. */
const IGNORABLE = new RegExp(`[\\s${cp(0xa0)}${cp(0xad)}${cpRange(0x200b, 0x200d)}${cp(0x2060)}${cp(0xfeff)}]`);

/**
 * Every text leaf of a KaTeX HTML fragment with the font-bearing classes in
 * force at that leaf (its own, then its ancestors' — `.mathnormal` on a parent
 * span still picks KaTeX_Math for the text below it).
 */
export function katexLeafRuns(html: string): Array<{ classes: string[]; text: string }> {
  const runs: Array<{ classes: string[]; text: string }> = [];
  const stack: string[][] = [];
  const tag = /<(\/?)span\b([^>]*)>|([^<]+)/g;
  for (const m of html.matchAll(tag)) {
    if (m[3] !== undefined) {
      const text = decodeEntities(m[3]);
      if (!/\S/.test(text)) continue;
      runs.push({ classes: stack.flat(), text });
      continue;
    }
    if (m[1] === '/') {
      stack.pop();
      continue;
    }
    const cls = m[2].match(/class="([^"]*)"/)?.[1] ?? '';
    stack.push(cls.split(/\s+/).filter(Boolean));
  }
  return runs;
}

function uncoveredKatexGlyphs(html: string): string[] {
  const missing: string[] = [];
  for (const run of katexLeafRuns(html)) {
    // Innermost font class wins: the stack is outer→inner, search from the end.
    const classes = run.classes.slice().reverse();
    for (const ch of Array.from(run.text)) {
      if (IGNORABLE.test(ch)) continue;
      if (katexSpanCovers(classes, ch.codePointAt(0)!) === false) missing.push(ch);
    }
  }
  return missing;
}

function label(ch: string): string {
  return `${ch} U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * The characters of an item string that NEITHER family can print: body-text
 * code points no embedded body face carries, and KaTeX leaves whose bound face
 * (fonts.ts) lacks the glyph. Empty when the cmap is unreadable — an unknown
 * is reported by fontCoverageKnown(), never invented here.
 */
export function uncoveredGlyphs(text: string | null | undefined): string[] {
  if (!fontCoverageKnown()) return [];
  const missing = new Set<string>();
  for (const seg of segmentItemText(text)) {
    if (seg.kind === 'text') {
      for (const ch of Array.from(seg.value)) {
        if (IGNORABLE.test(ch)) continue;
        if (bodyFontCovers(ch.codePointAt(0)!) === false) missing.add(label(ch));
      }
    } else if (seg.kind === 'tex') {
      const html = renderTex(seg.value);
      if (html.startsWith('<span class="tex-error">')) {
        // Rendered as source text in the body font.
        for (const ch of Array.from(seg.value)) {
          if (!IGNORABLE.test(ch) && bodyFontCovers(ch.codePointAt(0)!) === false) missing.add(label(ch));
        }
        continue;
      }
      for (const ch of uncoveredKatexGlyphs(html)) missing.add(label(ch));
    }
  }
  return Array.from(missing);
}

export interface GlyphGap {
  /** Item id, or `paper` for title / names. */
  itemId: string;
  glyphs: string[];
}

/** Every string the two documents print, per item. */
export function paperStrings(model: PaperModel): Array<{ itemId: string; text: string }> {
  const out: Array<{ itemId: string; text: string }> = [];
  for (const it of model.items) {
    for (const t of [it.stemEn, it.stemTa, it.explanationEn, it.explanationTa, it.directive, it.topicLabel]) {
      if (t) out.push({ itemId: it.id, text: t });
    }
    for (const o of it.optionsEn) out.push({ itemId: it.id, text: o.text });
    for (const o of it.optionsTa ?? []) out.push({ itemId: it.id, text: o.text });
  }
  for (const t of [model.title, model.facilitatorName, model.studioName]) {
    if (t) out.push({ itemId: 'paper', text: t });
  }
  return out;
}

/** The glyphs of a paper no embedded face can print, grouped by item. */
export function paperGlyphGaps(model: PaperModel): GlyphGap[] {
  const byItem = new Map<string, Set<string>>();
  for (const { itemId, text } of paperStrings(model)) {
    const missing = uncoveredGlyphs(text);
    if (!missing.length) continue;
    const set = byItem.get(itemId) ?? new Set<string>();
    for (const g of missing) set.add(g);
    byItem.set(itemId, set);
  }
  return Array.from(byItem.entries()).map(([itemId, glyphs]) => ({ itemId, glyphs: Array.from(glyphs) }));
}

/** Thrown by render.ts instead of printing a box. The route turns it into a
 *  422 that names the item and the glyph. */
export class GlyphCoverageError extends Error {
  readonly gaps: GlyphGap[];
  constructor(gaps: GlyphGap[]) {
    super(
      `The paper contains characters none of the embedded fonts can print: ${gaps
        .map((g) => `${g.itemId}: ${g.glyphs.join(' ')}`)
        .join('; ')}`,
    );
    this.name = 'GlyphCoverageError';
    this.gaps = gaps;
  }
}
