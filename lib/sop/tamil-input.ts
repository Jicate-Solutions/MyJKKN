// lib/sop/tamil-input.ts
// Tamil typing helpers for the SOP editor. Supports three input modes:
//
//   1. 'english'        — pass-through; the OS / IME handles characters.
//   2. 'phonetic'       — type Roman letters, get Tamil (transliteration).
//                         e.g. "vaazhga" → "வாழ்க"
//   3. 'tamil99'        — Tamil99 keyboard layout. Each physical key maps to
//                         a Tamil character. Used for native typists.
//
// All maps are keyed by the *raw input character* the user types and produce
// a Tamil string (which may be multi-codepoint). The editor's onKeyDown
// handler calls applyTamilInput() to translate keystrokes before insertion.
//
// References:
//   - https://en.wikipedia.org/wiki/Tamil99 (layout)
//   - Common phonetic mappings used by Google Tamil Input.

export type TamilInputMode = 'english' | 'phonetic' | 'tamil99';

// ── Tamil99 layout ─────────────────────────────────────────────────────────
// One mapping per QWERTY key. Both lower and upper case are defined; SHIFT
// switches to the upper map exactly like Windows Tamil99 IME.

const TAMIL99_LOWER: Record<string, string> = {
  q: 'ஆ', w: 'ஈ', e: 'ஊ', r: 'ஐ', t: 'ஏ', y: 'ள', u: 'ற',
  i: 'ன', o: 'ட', p: 'ண', '[': 'ச', ']': 'ஞ',
  a: 'அ', s: 'இ', d: 'உ', f: '்', g: 'எ', h: 'க', j: 'ப', k: 'ம',
  l: 'த', ';': 'ந', "'": 'ய',
  z: 'ஔ', x: 'ஓ', c: 'ஒ', v: 'வ', b: 'ங', n: 'ல', m: 'ர',
  ',': ',', '.': '.', '/': '/',
  '1': '௧', '2': '௨', '3': '௩', '4': '௪', '5': '௫',
  '6': '௬', '7': '௭', '8': '௮', '9': '௯', '0': '௦',
};

const TAMIL99_UPPER: Record<string, string> = {
  Q: 'ஆ', W: 'ஈ', E: 'ஊ', R: 'ஐ', T: 'ஏ', Y: 'ளை', U: 'றை',
  I: 'னை', O: 'டை', P: 'ணை',
  A: 'அ', S: 'இ', D: 'உ', F: '்', G: 'எ',
  H: 'கை', J: 'பை', K: 'மை', L: 'தை',
  Z: 'ஔ', X: 'ஓ', C: 'ஒ', V: 'வை', B: 'ஙை', N: 'லை', M: 'ரை',
};

// ── Phonetic transliteration ───────────────────────────────────────────────
// Order matters — multi-character matches (e.g. "zh", "ng") must be tried
// before their single-letter prefixes. The map below is iterated as a list.

const PHONETIC_PAIRS: Array<[string, string]> = [
  // Vowels
  ['aa', 'ஆ'], ['ee', 'ஈ'], ['oo', 'ஊ'], ['ai', 'ஐ'], ['au', 'ஔ'],
  ['a', 'அ'], ['i', 'இ'], ['u', 'உ'], ['e', 'எ'], ['o', 'ஒ'],
  // Consonant clusters (must precede single letters)
  ['kh', 'க்'], ['gh', 'க்'], ['ng', 'ங'],
  ['ch', 'ச'], ['sh', 'ஷ'], ['nj', 'ஞ'], ['ny', 'ஞ'],
  ['zh', 'ழ'],
  ['th', 'த'], ['dh', 'த'], ['nd', 'ந்த'],
  // Single consonants
  ['k', 'க'], ['g', 'க'],
  ['s', 'ச'], ['j', 'ஜ'],
  ['t', 'ட'], ['d', 'ட'],
  ['n', 'ன'], ['p', 'ப'], ['b', 'ப'],
  ['m', 'ம'], ['y', 'ய'], ['r', 'ர'],
  ['l', 'ல'], ['v', 'வ'], ['w', 'வ'],
  ['L', 'ள'], ['R', 'ற'], ['N', 'ண'],
  // Pulli (vowel-killer): 'q' commits the previous consonant as pure
  ['q', '்'],
];

/**
 * Convert a Roman buffer to Tamil. We greedily match the longest pair from
 * PHONETIC_PAIRS, advancing the cursor by the matched key length.
 * Anything that doesn't match passes through unchanged (so spaces, punctuation,
 * digits, and Tamil characters already in the buffer are preserved).
 */
export function transliteratePhonetic(input: string): string {
  let i = 0;
  let out = '';
  const N = input.length;
  while (i < N) {
    let matched = false;
    // Try longest keys first; the PAIRS list above is mostly ordered already
    // but we explicitly check 2-char keys before 1-char keys for safety.
    for (const [from, to] of PHONETIC_PAIRS) {
      if (from.length <= N - i && input.slice(i, i + from.length) === from) {
        out += to;
        i += from.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += input[i];
      i++;
    }
  }
  return out;
}

/**
 * Resolve a single keystroke against the Tamil99 layout. Returns the Tamil
 * character to insert, or `null` to fall through to default behavior.
 */
export function tamil99Lookup(key: string, shift: boolean): string | null {
  if (shift && TAMIL99_UPPER[key.toUpperCase()]) {
    return TAMIL99_UPPER[key.toUpperCase()];
  }
  if (TAMIL99_LOWER[key.toLowerCase()]) {
    return TAMIL99_LOWER[key.toLowerCase()];
  }
  return null;
}

// ── Virtual keyboard layout ────────────────────────────────────────────────
// Display order for the on-screen keyboard. Each row is an array of keys;
// a key is either a Tamil string or a special token ('SPACE' | 'BACKSPACE').

export const TAMIL_VIRTUAL_KEYBOARD: Array<Array<string | 'SPACE' | 'BACKSPACE'>> = [
  ['அ', 'ஆ', 'இ', 'ஈ', 'உ', 'ஊ', 'எ', 'ஏ', 'ஐ', 'ஒ', 'ஓ', 'ஔ'],
  ['க', 'ங', 'ச', 'ஞ', 'ட', 'ண', 'த', 'ந', 'ப', 'ம'],
  ['ய', 'ர', 'ல', 'வ', 'ழ', 'ள', 'ற', 'ன', 'ஜ', 'ஷ', 'ஸ', 'ஹ'],
  ['்', 'ா', 'ி', 'ீ', 'ு', 'ூ', 'ெ', 'ே', 'ை', 'ொ', 'ோ', 'ௌ'],
  ['௧', '௨', '௩', '௪', '௫', '௬', '௭', '௮', '௯', '௦'],
  ['SPACE', 'BACKSPACE'],
];

// ── English → Tamil translation stub (extension point) ─────────────────────
// We expose the function signature so feature flags / providers can hook in
// later (Google Translate, Bhashini, OpenAI). Returning the input unchanged
// keeps the UI working when no provider is configured.

export async function translateEnToTa(text: string): Promise<string> {
  // Hook for future translation provider. See docs/plans/* for integration.
  return text;
}

export async function translateTaToEn(text: string): Promise<string> {
  return text;
}
