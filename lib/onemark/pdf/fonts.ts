// File: lib/onemark/pdf/fonts.ts
//
// OneMark — the embedded faces as DATA: which code points each one has a
// glyph for, and how wide it sets a run of text.
//
// WHY THIS FILE EXISTS (reviewer finding, PR #3276 round 2)
//   The first two versions of notation.ts decided "does this glyph need KaTeX"
//   from a hand-typed regex of characters someone had noticed Tinos lacks.
//   Every character outside that list — ∴ ⊥ ∠ ∂ ⇌ ⋅ ≃ ℃, the combining hat of
//   n̂, the combining arrow of v⃗ — fell to the body fonts, which lack them, so
//   Chromium borrowed AppleSymbols / Times on the developer Mac and prints a
//   box on Vercel. A whitelist cannot be complete; the font's own cmap can.
//
//   So this module reads the cmap of EXACTLY the bytes the paper embeds: the
//   data: URIs that lib/utils/bos/pdf-fonts.ts and styles.ts put into the
//   stylesheet. Nothing is read from a directory listing, nothing is typed by
//   hand — if a face is swapped, the coverage answer changes with it.
//
//   fontkit is the parser (already a transitive dependency via
//   @react-pdf/renderer, which the permissions-audit route runs in
//   production). It is loaded lazily and every reader degrades explicitly: if
//   the parser is unavailable the coverage answer is `null`, callers treat
//   "unknown" as "route to KaTeX" and never as "safe".

import { pdfFontFaceCss } from '@/lib/utils/bos/pdf-fonts';
import { katexEmbeddedCss } from './styles';

interface Face {
  family: string;
  hasGlyph: (cp: number) => boolean;
  /** Advance width of a shaped run, in em. */
  measure: (text: string) => number;
}

interface FaceSet {
  body: Face[];
  /** KaTeX faces by family name (KaTeX_Main, KaTeX_Math, KaTeX_AMS, …). */
  katex: Map<string, Face[]>;
}

let cached: FaceSet | null | undefined;
let warned = false;

/** One @font-face block → (family, base64). pdf-fonts.ts writes
 *  `font-family:'Tinos'` first; katex.min.css writes `font-display` first and
 *  the family unquoted — so the family is found anywhere before `src`. */
const FONT_FACE_RE =
  /@font-face\{[^}]*?font-family:['"]?([^;'"]+)['"]?;[^}]*?src:url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/g;

function parseFaces(css: string, fontkit: any, seen: Map<string, Face>): Face[] {
  const faces: Face[] = [];
  for (const m of css.matchAll(FONT_FACE_RE)) {
    const family = m[1];
    const b64 = m[2];
    // pdf-fonts.ts emits the same bytes once per alias family; parse once.
    const key = `${b64.length}:${b64.slice(0, 64)}:${b64.slice(-64)}`;
    let face = seen.get(key);
    if (!face) {
      const font = fontkit.create(Buffer.from(b64, 'base64'));
      const upem: number = font.unitsPerEm;
      face = {
        family,
        hasGlyph: (cp) => font.hasGlyphForCodePoint(cp),
        measure: (text) => font.layout(text).advanceWidth / upem,
      };
      seen.set(key, face);
    }
    faces.push({ ...face, family });
  }
  return faces;
}

/** The parsed faces, or null when the parser or the CSS is unavailable. */
function faceSet(): FaceSet | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fontkit = require('fontkit');
    const seen = new Map<string, Face>();
    const body = parseFaces(pdfFontFaceCss(), fontkit, seen);
    const katex = new Map<string, Face[]>();
    for (const face of parseFaces(katexEmbeddedCss(), fontkit, seen)) {
      katex.set(face.family, [...(katex.get(face.family) ?? []), face]);
    }
    cached = body.length ? { body, katex } : null;
  } catch (err) {
    cached = null;
    if (!warned) {
      warned = true;
      console.warn('[onemark-pdf] embedded-font cmap unavailable; notation routing falls back to the repertoire rule:', err);
    }
  }
  return cached;
}

/** True when the parser could read the embedded faces. */
export function fontCoverageKnown(): boolean {
  return faceSet() !== null;
}

/** Does any embedded BODY face (Tinos, Noto Sans Tamil) have this glyph? Null = unknown. */
export function bodyFontCovers(cp: number): boolean | null {
  const set = faceSet();
  if (!set) return null;
  return set.body.some((f) => f.hasGlyph(cp));
}

/** Family names present in the embedded KaTeX CSS. */
export function katexFamilies(): string[] {
  return Array.from(faceSet()?.katex.keys() ?? []);
}

/**
 * The family (or families, in fallback order) a KaTeX HTML leaf span is set
 * in. katex.min.css binds a font class to ONE family — `.mathnormal` is
 * KaTeX_Math and nothing else — so a glyph that face lacks falls to the host,
 * not to the body fonts. A leaf with no font class inherits `.katex`, which
 * styles.ts overrides to KaTeX_Main → Tinos → Noto Sans Tamil.
 */
export function katexFamiliesForClasses(cssClassList: string[]): { katex: string[]; thenBody: boolean } {
  for (const c of cssClassList) {
    switch (c) {
      case 'mathnormal':
      case 'boldsymbol':
        return { katex: ['KaTeX_Math'], thenBody: false };
      case 'amsrm':
      case 'mathbb':
      case 'textbb':
        return { katex: ['KaTeX_AMS'], thenBody: false };
      case 'mathrm':
      case 'mathbf':
      case 'mathit':
      case 'mainrm':
      case 'textrm':
        return { katex: ['KaTeX_Main'], thenBody: false };
      case 'mathcal':
        return { katex: ['KaTeX_Caligraphic'], thenBody: false };
      case 'mathfrak':
      case 'textfrak':
      case 'mathboldfrak':
      case 'textboldfrak':
        return { katex: ['KaTeX_Fraktur'], thenBody: false };
      case 'mathsf':
      case 'textsf':
      case 'mathboldsf':
      case 'textboldsf':
      case 'mathitsf':
      case 'mathsfit':
      case 'textitsf':
        return { katex: ['KaTeX_SansSerif'], thenBody: false };
      case 'mathtt':
      case 'texttt':
        return { katex: ['KaTeX_Typewriter'], thenBody: false };
      case 'mathscr':
      case 'textscr':
        return { katex: ['KaTeX_Script'], thenBody: false };
      case 'size1':
      case 'size2':
      case 'size3':
      case 'size4':
        if (cssClassList.includes('delimsizing')) return { katex: [`KaTeX_Size${c.slice(-1)}`], thenBody: false };
        break;
      case 'small-op':
        if (cssClassList.includes('op-symbol')) return { katex: ['KaTeX_Size1'], thenBody: false };
        break;
      case 'large-op':
        if (cssClassList.includes('op-symbol')) return { katex: ['KaTeX_Size2'], thenBody: false };
        break;
    }
  }
  return { katex: ['KaTeX_Main'], thenBody: true };
}

/** Can a KaTeX leaf span with these classes set this code point from an
 *  embedded face? Null = unknown. */
export function katexSpanCovers(cssClassList: string[], cp: number): boolean | null {
  const set = faceSet();
  if (!set) return null;
  const { katex, thenBody } = katexFamiliesForClasses(cssClassList);
  for (const fam of katex) {
    if ((set.katex.get(fam) ?? []).some((f) => f.hasGlyph(cp))) return true;
  }
  if (thenBody && set.body.some((f) => f.hasGlyph(cp))) return true;
  return false;
}

/** Does ANY embedded KaTeX face have the glyph (class-agnostic; for tests). Null = unknown. */
export function katexAnyFaceCovers(cp: number): boolean | null {
  const set = faceSet();
  if (!set) return null;
  for (const faces of set.katex.values()) if (faces.some((f) => f.hasGlyph(cp))) return true;
  return false;
}

const TAMIL_RUN = /[஀-௿‌‍]/;

let latinUnit: number | null | undefined;

/** Average advance of a Tinos lowercase letter, in em — the width one
 *  "character" of the PRD's "~40 characters" rule stands for. */
export function latinCharEm(): number | null {
  if (latinUnit !== undefined) return latinUnit;
  const set = faceSet();
  const tinos = set?.body.find((f) => /tinos/i.test(f.family) || f.hasGlyph(0x61));
  latinUnit = tinos ? tinos.measure('abcdefghijklmnopqrstuvwxyz') / 26 : null;
  return latinUnit;
}

/**
 * Width of a TAMIL run in Latin-character equivalents, from the shaped advance
 * in the embedded Noto Sans Tamil divided by the Tinos lowercase average. Null
 * when the faces cannot be read. Latin text is not measured here — the PRD
 * thresholds are stated in characters and English is counted as such.
 */
export function tamilRunWidthChars(text: string): number | null {
  const set = faceSet();
  const unit = latinCharEm();
  if (!set || !unit) return null;
  const tamil = set.body.find((f) => f.hasGlyph(0x0b95)); // க
  if (!tamil) return null;
  return tamil.measure(text) / unit;
}

export function isTamilRunChar(ch: string): boolean {
  return TAMIL_RUN.test(ch);
}
