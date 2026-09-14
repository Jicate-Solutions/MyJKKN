// lib/onemark/i18n/index.ts
// OneMark — the pure half of the interface-language mechanism.
//
// Everything here is a plain function over the two dictionaries: no React, no
// network, no browser. The hook (./use-onemark-t.tsx) and the API route
// (app/api/foundation/onemark/prefs/route.ts) both build on this, and the
// tests exercise it directly.
//
// The contract, in three lines:
//   * resolveString('en', k) is always the English phrase.
//   * resolveString('ta', k) is the Tamil phrase when a reviewer has written
//     one, and the English phrase otherwise — quietly (ruling 10).
//   * A key that does not exist returns the key itself rather than an empty
//     string, so a typo shows up in review instead of rendering a blank
//     control.

import { ONEMARK_STRINGS_EN, type OneMarkStringKey } from './strings.en';
import { ONEMARK_STRINGS_TA } from './strings.ta';
import { isTamilTbd, TAMIL_TBD_PREFIX } from './tbd';

export { ONEMARK_STRINGS_EN, ONEMARK_STRINGS_TA, isTamilTbd, TAMIL_TBD_PREFIX };
export type { OneMarkStringKey };

/** The two interface languages decision 5 allows. Mirrors the CHECK constraint
 *  on onemark_user_prefs.ui_locale — 'en' or 'ta', nothing else, ever. */
export const ONEMARK_LOCALES = ['en', 'ta'] as const;
export type OneMarkLocale = (typeof ONEMARK_LOCALES)[number];

/** English is the default everywhere: for a person who has never touched the
 *  switch, for a signed-out render, and for the whole product on any day the
 *  preference table is not yet in the database. */
export const DEFAULT_ONEMARK_LOCALE: OneMarkLocale = 'en';

export function isOneMarkLocale(value: unknown): value is OneMarkLocale {
  return typeof value === 'string' && (ONEMARK_LOCALES as readonly string[]).includes(value);
}

/** Coerce anything (a query param, a stored row, a stale localStorage value)
 *  to a locale, falling back to English. */
export function toOneMarkLocale(value: unknown): OneMarkLocale {
  return isOneMarkLocale(value) ? value : DEFAULT_ONEMARK_LOCALE;
}

export type OneMarkStringVars = Record<string, string | number>;

/** Fill {slots}. A slot with no value is left as written — visible in review,
 *  never silently blank. */
export function interpolate(phrase: string, vars?: OneMarkStringVars): string {
  if (!vars) return phrase;
  return phrase.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole,
  );
}

/**
 * The phrase to render, for this locale and key.
 *
 * Ruling 10 lives in the middle branch: an unreviewed Tamil value is a
 * `[TAMIL_TBD: …]` marker, and a marker is never shown to anyone — the English
 * phrase takes its place without comment.
 */
export function resolveString(
  locale: OneMarkLocale,
  key: OneMarkStringKey,
  vars?: OneMarkStringVars,
): string {
  const english: string | undefined = ONEMARK_STRINGS_EN[key];
  if (english === undefined) return String(key);
  if (locale !== 'ta') return interpolate(english, vars);

  const tamil = ONEMARK_STRINGS_TA[key];
  const usable = typeof tamil === 'string' && tamil.length > 0 && !isTamilTbd(tamil);
  return interpolate(usable ? tamil : english, vars);
}

/** A `t` bound to one locale — what the hook hands components. */
export type OneMarkTranslate = (key: OneMarkStringKey, vars?: OneMarkStringVars) => string;

export function makeTranslator(locale: OneMarkLocale): OneMarkTranslate {
  return (key, vars) => resolveString(locale, key, vars);
}

// ---------------------------------------------------------------------------
// The reviewer's sheet
// ---------------------------------------------------------------------------

export interface TamilReviewRow {
  key: OneMarkStringKey;
  english: string;
  tamil: string;
  /** `written` — a short phrase awaiting a native tick.
   *  `pending`  — still a placeholder, rendering English today. */
  status: 'written' | 'pending';
}

/**
 * Every key with its English and Tamil sides, for the native-review sheet the
 * PR body carries (Lane 0 item 2). Sorted by key so two runs are comparable.
 */
export function tamilReviewSheet(): TamilReviewRow[] {
  return (Object.keys(ONEMARK_STRINGS_EN) as OneMarkStringKey[])
    .sort()
    .map((key) => {
      const tamil = ONEMARK_STRINGS_TA[key] ?? '';
      return {
        key,
        english: ONEMARK_STRINGS_EN[key],
        tamil,
        status: isTamilTbd(tamil) || tamil.length === 0 ? 'pending' : 'written',
      } as TamilReviewRow;
    });
}

/** Rule #24's own limit, expressed as code so a test can hold the line: a
 *  written (non-placeholder) Tamil phrase may be at most five words. */
export const TAMIL_MAX_WORDS_WITHOUT_REVIEW = 5;

export function tamilWordCount(phrase: string): number {
  return phrase.trim().split(/\s+/).filter(Boolean).length;
}
