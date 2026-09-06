// ============================================
// LEGACY TAMIL FONT → UNICODE CONVERSION
// ============================================
// Created: 2026-08-06
// Purpose: Let staff who type with a Bamini or SunTommy keyboard enter Tamil
// names that still land in the database as Unicode.
//
// WHY THIS EXISTS
// Bamini and SunTommy are 8-bit "glyph fonts", not Unicode fonts. Typing
// முத்து on a Bamini layout produces the ASCII bytes `Kj;J` — the Tamil exists
// only in the font's glyph table, never in the data. Storing those bytes in a
// UTF-8 column would break search, ORDER BY, Excel export and every PDF
// renderer that does not embed that exact licensed font. So we convert at the
// edge and keep the column pure Unicode.
//
// TABLE PROVENANCE
// Mappings transcribed from ag-sanjjeev/app-tamil-fonts-unicode-converter
// (MIT licensed), src/tamilFontsUnicode.json, which publishes both fonts.
// The upstream table is Unicode→legacy; it is inverted here.
//
// TWO NON-OBVIOUS PROPERTIES OF THE DATA
//
// 1. Bamini and SunTommy are 296/299 identical. They differ in exactly three
//    syllables (ளூ, சூ, ஙூ), which is why SUNTOMMY_DELTA below is five lines
//    rather than a second full table. Picking the "wrong" one of the two fonts
//    therefore mis-converts only those three glyphs.
//
// 2. Legacy encodings store the pre-base vowel signs ெ ே ை BEFORE their
//    consonant (visual order), while Unicode stores them AFTER (logical
//    order): Bamini `nf` is கெ, not ெக. No reordering pass is needed here
//    because every such pair is enumerated as its own multi-character key —
//    which only works if lookups are LONGEST-MATCH-FIRST. Matching `n` before
//    `nf` would split the syllable and silently corrupt the name.
//
// KNOWN UPSTREAM AMBIGUITY
// The source table maps five distinct syllables (ழூ ஞூ ஞு ஙூ ஙு) to the single
// Bamini code `*`, so that byte cannot be round-tripped. We resolve it to ழூ —
// first-in-source-order, matching the reference converter's behaviour — and
// accept that the other four are unreachable from `*`. All five are rare in
// names; a mis-converted one is visible in the preview before saving.
// ============================================

export const TAMIL_LEGACY_ENCODINGS = ['bamini', 'suntommy'] as const;
export type TamilLegacyEncoding = (typeof TAMIL_LEGACY_ENCODINGS)[number];

/** Longest legacy sequence in either table. Drives the match window below. */
const MAX_SEQUENCE_LENGTH = 3;

/** Tamil block, incl. the combining vowel signs and pulli. */
const TAMIL_UNICODE_RANGE = /[஀-௿]/;

/**
 * Bamini legacy sequence → Unicode. Ordering in this literal is cosmetic
 * (longest-first, then lexicographic, for readable diffs); the converter sorts
 * by length at module load, so entries may be added anywhere.
 */
const BAMINI_TO_UNICODE: Record<string, string> = {
  "NQh": "ஞோ",
  "N[h": "ஜோ",
  "N\\h": "ஷோ",
  "N]h": "ஸோ",
  "N`h": "ஹோ",
  "Nah": "யோ",
  "Ndh": "னோ",
  "Neh": "நோ",
  "Nfh": "கோ",
  "Ngh": "போ",
  "Njh": "தோ",
  "Nkh": "மோ",
  "Nlh": "டோ",
  "Noh": "ழோ",
  "Nqh": "ஙோ",
  "Nrh": "சோ",
  "Nsh": "ளோ",
  "Nth": "வோ",
  "Nuh": "ரோ",
  "Nwh": "றோ",
  "Nyh": "லோ",
  "Nzh": "ணோ",
  "nQh": "ஞொ",
  "nQs": "ஞௌ",
  "n[h": "ஜொ",
  "n[s": "ஜௌ",
  "n\\h": "ஷொ",
  "n\\s": "ஷௌ",
  "n]h": "ஸொ",
  "n]s": "ஸௌ",
  "n`h": "ஹொ",
  "n`s": "ஹௌ",
  "nah": "யொ",
  "nas": "யௌ",
  "ndh": "னொ",
  "nds": "னௌ",
  "neh": "நொ",
  "nes": "நௌ",
  "nfh": "கொ",
  "nfs": "கௌ",
  "ngh": "பொ",
  "ngs": "பௌ",
  "njh": "தொ",
  "njs": "தௌ",
  "nkh": "மொ",
  "nks": "மௌ",
  "nlh": "டொ",
  "nls": "டௌ",
  "noh": "ழொ",
  "nos": "ழௌ",
  "nqh": "ஙொ",
  "nqs": "ஙௌ",
  "nrh": "சொ",
  "nrs": "சௌ",
  "nsh": "ளொ",
  "nss": "ளௌ",
  "nth": "வொ",
  "nts": "வௌ",
  "nuh": "ரொ",
  "nus": "ரௌ",
  "nwh": "றொ",
  "nws": "றௌ",
  "nyh": "லொ",
  "nys": "லௌ",
  "nzh": "ணொ",
  "nzs": "ணௌ",
  "A+": "யூ",
  "D}": "னூ",
  "E}": "நூ",
  "G+": "பூ",
  "J}": "தூ",
  "NQ": "ஞே",
  "N[": "ஜே",
  "N\\": "ஷே",
  "N]": "ஸே",
  "N`": "ஹே",
  "Na": "யே",
  "Nd": "னே",
  "Ne": "நே",
  "Nf": "கே",
  "Ng": "பே",
  "Nj": "தே",
  "Nk": "மே",
  "Nl": "டே",
  "No": "ழே",
  "Nq": "ஙே",
  "Nr": "சே",
  "Ns": "ளே",
  "Nt": "வே",
  "Nu": "ரே",
  "Nw": "றே",
  "Ny": "லே",
  "Nz": "ணே",
  "Q;": "ஞ்",
  "QP": "ஞீ",
  "Qh": "ஞா",
  "Qp": "ஞி",
  "R+": "சூ",
  "Sh": "ளூ",
  "T+": "வூ",
  "W}": "றூ",
  "Y}": "லூ",
  "Z}": "ணூ",
  "[;": "ஜ்",
  "[P": "ஜீ",
  "[_": "ஜூ",
  "[h": "ஜா",
  "[p": "ஜி",
  "[{": "ஜு",
  "\\;": "ஷ்",
  "\\P": "ஷீ",
  "\\_": "ஷூ",
  "\\h": "ஷா",
  "\\p": "ஷி",
  "\\{": "ஷு",
  "];": "ஸ்",
  "]P": "ஸீ",
  "]_": "ஸூ",
  "]h": "ஸா",
  "]p": "ஸி",
  "]{": "ஸு",
  "`;": "ஹ்",
  "`P": "ஹீ",
  "`_": "ஹூ",
  "`h": "ஹா",
  "`p": "ஹி",
  "`{": "ஹு",
  "a;": "ய்",
  "aP": "யீ",
  "ah": "யா",
  "ap": "யி",
  "d;": "ன்",
  "dP": "னீ",
  "dh": "னா",
  "dp": "னி",
  "e;": "ந்",
  "eP": "நீ",
  "eh": "நா",
  "ep": "நி",
  "f;": "க்",
  "fP": "கீ",
  "fh": "கா",
  "fp": "கி",
  "g;": "ப்",
  "gP": "பீ",
  "gh": "பா",
  "gp": "பி",
  "h;": "ர்",
  "iQ": "ஞை",
  "i[": "ஜை",
  "i\\": "ஷை",
  "i]": "ஸை",
  "i`": "ஹை",
  "ia": "யை",
  "id": "னை",
  "ie": "நை",
  "if": "கை",
  "ig": "பை",
  "ij": "தை",
  "ik": "மை",
  "il": "டை",
  "io": "ழை",
  "iq": "ஙை",
  "ir": "சை",
  "is": "ளை",
  "it": "வை",
  "iu": "ரை",
  "iw": "றை",
  "iy": "லை",
  "iz": "ணை",
  "j;": "த்",
  "jP": "தீ",
  "jh": "தா",
  "jp": "தி",
  "k;": "ம்",
  "kP": "மீ",
  "kh": "மா",
  "kp": "மி",
  "l;": "ட்",
  "lh": "டா",
  "nQ": "ஞெ",
  "n[": "ஜெ",
  "n\\": "ஷெ",
  "n]": "ஸெ",
  "n`": "ஹெ",
  "na": "யெ",
  "nd": "னெ",
  "ne": "நெ",
  "nf": "கெ",
  "ng": "பெ",
  "nj": "தெ",
  "nk": "மெ",
  "nl": "டெ",
  "no": "ழெ",
  "nq": "ஙெ",
  "nr": "செ",
  "ns": "ளெ",
  "nt": "வெ",
  "nu": "ரெ",
  "nw": "றெ",
  "ny": "லெ",
  "nz": "ணெ",
  "o;": "ழ்",
  "oP": "ழீ",
  "oh": "ழா",
  "op": "ழி",
  "q;": "ங்",
  "qP": "ஙீ",
  "qh": "ஙா",
  "qp": "ஙி",
  "r;": "ச்",
  "rP": "சீ",
  "rh": "சா",
  "rp": "சி",
  "s;": "ள்",
  "sP": "ளீ",
  "sh": "ளா",
  "sp": "ளி",
  "t;": "வ்",
  "tP": "வீ",
  "th": "வா",
  "tp": "வி",
  "u;": "ர்",
  "uP": "ரீ",
  "uh": "ரா",
  "up": "ரி",
  "w;": "ற்",
  "wP": "றீ",
  "wh": "றா",
  "wp": "றி",
  "xs": "ஔ",
  "y;": "ல்",
  "yP": "லீ",
  "yh": "லா",
  "yp": "லி",
  "z;": "ண்",
  "zP": "ணீ",
  "zh": "ணா",
  "zp": "ணி",
  "$": "கூ",
  "%": "மூ",
  "&": "ரூ",
  "*": "ழூ",
  ",": "இ",
  "<": "ஈ",
  "=": "ஸ்ரீ",
  ">": ",",
  "A": "யு",
  "B": "டீ",
  "C": "ஊ",
  "D": "னு",
  "E": "நு",
  "F": "கு",
  "G": "பு",
  "H": "ர்",
  "I": "ஐ",
  "J": "து",
  "K": "மு",
  "L": "டு",
  "M": "ஆ",
  "O": "ழு",
  "Q": "ஞ",
  "R": "சு",
  "S": "ளு",
  "T": "வு",
  "U": "ரு",
  "V": "ஏ",
  "W": "று",
  "X": "ஓ",
  "Y": "லு",
  "Z": "ணு",
  "[": "ஜ",
  "\\": "ஷ",
  "]": "ஸ",
  "^": "டூ",
  "`": "ஹ",
  "a": "ய",
  "b": "டி",
  "c": "உ",
  "d": "ன",
  "e": "ந",
  "f": "க",
  "g": "ப",
  "j": "த",
  "k": "ம",
  "l": "ட",
  "m": "அ",
  "o": "ழ",
  "q": "ங",
  "r": "ச",
  "s": "ள",
  "t": "வ",
  "u": "ர",
  "v": "எ",
  "w": "ற",
  "x": "ஒ",
  "y": "ல",
  "z": "ண",
};

/**
 * The complete SunTommy difference: three syllables use different codes, and
 * the two Bamini codes they displace (`Sh`, `R+`) are not SunTommy sequences
 * at all — null deletes them so the scanner falls through to shorter matches.
 */
const SUNTOMMY_DELTA: Record<string, string | null> = {
  "R+": null,
  "Sh": null,
  "q+": "ஙூ",
  "#": "சூ",
  "@": "ளூ",
};

function buildSuntommyTable(): Record<string, string> {
  const table: Record<string, string> = { ...BAMINI_TO_UNICODE };
  for (const [sequence, unicode] of Object.entries(SUNTOMMY_DELTA)) {
    if (unicode === null) delete table[sequence];
    else table[sequence] = unicode;
  }
  return table;
}

const TABLES: Record<TamilLegacyEncoding, Record<string, string>> = {
  bamini: BAMINI_TO_UNICODE,
  suntommy: buildSuntommyTable(),
};

/**
 * Convert one legacy-encoded string to Unicode Tamil.
 *
 * Single left-to-right pass with a longest-match-first window. This is
 * deliberately NOT a chain of String.replaceAll calls (the shape the reference
 * converter uses): that approach is correct only while the mapping object
 * happens to be ordered longest-first, and re-scans its own output. A windowed
 * scan can never split a syllable or re-convert what it just emitted.
 *
 * Characters with no mapping (spaces, digits, punctuation, unrecognised ASCII)
 * pass through untouched, so a half-legacy string degrades visibly rather than
 * being silently dropped.
 */
export function convertLegacyTamilToUnicode(
  text: string,
  encoding: TamilLegacyEncoding,
): string {
  if (!text) return text;
  const table = TABLES[encoding];
  let out = '';
  let i = 0;

  while (i < text.length) {
    let matched = false;
    // Longest window first — see "pre-base vowel signs" in the header comment.
    const window = Math.min(MAX_SEQUENCE_LENGTH, text.length - i);
    for (let len = window; len >= 1; len--) {
      const candidate = text.slice(i, i + len);
      const unicode = table[candidate];
      if (unicode !== undefined) {
        out += unicode;
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += text[i];
      i += 1;
    }
  }

  return out;
}

/** True if the string already contains at least one Tamil Unicode codepoint. */
export function containsTamilUnicode(text: string): boolean {
  return TAMIL_UNICODE_RANGE.test(text ?? '');
}

/**
 * True when the string looks like it needs conversion: it has letters but no
 * Tamil codepoints at all. Used to decide whether to auto-convert on blur, so
 * that re-editing an already-converted Unicode name is never double-converted
 * (Unicode Tamil has no ASCII in the table, but re-running the pass on mixed
 * text would still mangle any stray Latin initials).
 */
export function looksLikeLegacyTamil(text: string): boolean {
  const value = (text ?? '').trim();
  if (!value) return false;
  if (containsTamilUnicode(value)) return false;
  return /[A-Za-z]/.test(value);
}

/** Human-facing labels for the encoding picker. */
export const TAMIL_LEGACY_ENCODING_LABELS: Record<TamilLegacyEncoding, string> = {
  bamini: 'Bamini',
  suntommy: 'SunTommy',
};
