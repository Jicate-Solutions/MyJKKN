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
//                  whitespace-delimited token that carries a notation trigger
//                  (super/subscript, Greek, √, combining overline) is promoted
//                  to a TeX snippet and rendered by KaTeX. Everything else is
//                  HTML-escaped text in the body fonts.

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
 * Plain text (no $…$, no tags) → HTML. Notation tokens go to KaTeX, the rest
 * is escaped. Whitespace is preserved as single spaces.
 */
export function plainTextToHtml(text: string): string {
  const tokens = text.split(/(\s+)/);
  return tokens
    .map((tok) => {
      if (tok.length === 0) return '';
      if (/^\s+$/.test(tok)) return ' ';
      if (!hasNotationTrigger(tok)) return escapeHtml(tok);
      const lead = tok.match(LEAD_PUNCT)?.[0] ?? '';
      let trail = tok.match(TRAIL_PUNCT)?.[0] ?? '';
      let core = tok.slice(lead.length, tok.length - trail.length);
      // A closer that balances an opener inside the token belongs to the
      // notation, not the sentence: √(R_B/R_A). keeps its ")" and loses the ".".
      while (trail.length && /^[)\]]/.test(trail) && openCount(core) > closeCount(core)) {
        core += trail[0];
        trail = trail.slice(1);
      }
      if (!core) return escapeHtml(tok);
      return escapeHtml(lead) + renderTex(unicodeNotationToTex(core)) + escapeHtml(trail);
    })
    .join('');
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
 * Full inline-markup pass for a stem, option or explanation string.
 * Order matters: TeX runs are cut out first so a `$` never sees the escaper,
 * then `<u>` targets, then blanks, then plain text with notation promotion.
 */
export function itemTextToHtml(text: string | null | undefined): string {
  if (!text) return '';
  const pieces: string[] = [];
  const texRuns = text.split(/(\$[^$]+\$)/);
  for (const run of texRuns) {
    if (run.length === 0) continue;
    if (run.length > 2 && run.startsWith('$') && run.endsWith('$')) {
      pieces.push(renderTex(run.slice(1, -1)));
      continue;
    }
    const uRuns = run.split(/(<u>[\s\S]*?<\/u>)/i);
    for (const seg of uRuns) {
      if (seg.length === 0) continue;
      const m = seg.match(/^<u>([\s\S]*?)<\/u>$/i);
      if (m) {
        pieces.push(`<u class="target">${plainWithBlanks(m[1])}</u>`);
      } else {
        pieces.push(plainWithBlanks(seg));
      }
    }
  }
  return pieces.join('');
}

function plainWithBlanks(text: string): string {
  return text
    .split(BLANK_RULE)
    .map((part) => plainTextToHtml(part))
    .join('<span class="blank"></span>');
}

/** The text a font-coverage audit should check: what will be set in the BODY
 *  fonts after every notation token and TeX run has gone to KaTeX. */
export function bodyFontText(text: string | null | undefined): string {
  if (!text) return '';
  const withoutTex = text.replace(/\$[^$]+\$/g, ' ');
  return withoutTex
    .replace(/<\/?u>/gi, '')
    .replace(BLANK_RULE, ' ')
    .split(/\s+/)
    .filter((tok) => tok.length > 0 && !hasNotationTrigger(tok))
    .join(' ');
}
