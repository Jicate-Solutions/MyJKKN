/**
 * OneMark — the interface dictionaries and the rules that keep them honest.
 *
 * Three things are being held in place here, and each one has burned somebody
 * before:
 *
 *   1. PARITY. Every English key has a Tamil answer, placeholder or not. The
 *      Record type already refuses to compile without it; this test says so at
 *      runtime too, because a `Partial<>` slipped in during a refactor would
 *      silently reopen the hole.
 *   2. RULE #24. A Tamil phrase that was actually written may be at most five
 *      words. Anything longer must be a `[TAMIL_TBD: …]` placeholder, because
 *      long non-Latin text generated in a prompt looks plausible to a reader
 *      who cannot read it and wrong to one who can.
 *   3. RULING 10. A placeholder is never rendered. Asking for Tamil on an
 *      unreviewed key returns the English phrase, quietly — no marker, no empty
 *      control.
 */
import { describe, it, expect } from 'vitest';

import {
  DEFAULT_ONEMARK_LOCALE,
  ONEMARK_LOCALES,
  ONEMARK_STRINGS_EN,
  ONEMARK_STRINGS_TA,
  TAMIL_MAX_WORDS_WITHOUT_REVIEW,
  interpolate,
  isOneMarkLocale,
  isTamilTbd,
  makeTranslator,
  resolveString,
  tamilReviewSheet,
  tamilWordCount,
  toOneMarkLocale,
  type OneMarkStringKey,
} from '@/lib/onemark/i18n';
import { chooseLocale } from '@/lib/onemark/i18n/use-onemark-t';

const KEYS = Object.keys(ONEMARK_STRINGS_EN) as OneMarkStringKey[];

describe('the two dictionaries agree', () => {
  it('has at least one key (a dictionary nobody filled is not a pass)', () => {
    expect(KEYS.length).toBeGreaterThan(0);
  });

  it('answers every English key in Tamil, placeholder or phrase', () => {
    const missing = KEYS.filter((k) => {
      const value = ONEMARK_STRINGS_TA[k];
      return typeof value !== 'string' || value.trim().length === 0;
    });
    expect(missing).toEqual([]);
  });

  it('adds no Tamil key the English side does not have', () => {
    const extra = Object.keys(ONEMARK_STRINGS_TA).filter(
      (k) => !(k in ONEMARK_STRINGS_EN),
    );
    expect(extra).toEqual([]);
  });

  it('leaves no English phrase blank', () => {
    const blank = KEYS.filter((k) => ONEMARK_STRINGS_EN[k].trim().length === 0);
    expect(blank).toEqual([]);
  });
});

describe('rule #24 — no long unreviewed Tamil ships', () => {
  it('keeps every written Tamil phrase to five words or fewer', () => {
    const tooLong = KEYS.filter((k) => {
      const value = ONEMARK_STRINGS_TA[k];
      if (isTamilTbd(value)) return false;
      return tamilWordCount(value) > TAMIL_MAX_WORDS_WITHOUT_REVIEW;
    }).map((k) => `${k} (${tamilWordCount(ONEMARK_STRINGS_TA[k])} words)`);
    expect(tooLong).toEqual([]);
  });

  it('carries the English phrase inside every placeholder, for the reviewer', () => {
    const orphaned = KEYS.filter((k) => {
      const value = ONEMARK_STRINGS_TA[k];
      return isTamilTbd(value) && !value.includes(ONEMARK_STRINGS_EN[k]);
    });
    expect(orphaned).toEqual([]);
  });

  it('recognises a placeholder and does not mistake a real phrase for one', () => {
    expect(isTamilTbd('[TAMIL_TBD: Nothing due yet]')).toBe(true);
    expect(isTamilTbd('தவறுகள் பெட்டகம்')).toBe(false);
    expect(isTamilTbd('')).toBe(false);
    expect(isTamilTbd(undefined)).toBe(false);
    // Opens like a placeholder, never closes — not one.
    expect(isTamilTbd('[TAMIL_TBD: unterminated')).toBe(false);
  });
});

describe('ruling 10 — an unreviewed phrase shows English quietly', () => {
  it('never returns a placeholder marker to a caller', () => {
    const leaked = KEYS.filter((k) => isTamilTbd(resolveString('ta', k)));
    expect(leaked).toEqual([]);
  });

  it('returns the English phrase for a key with no reviewed Tamil', () => {
    const pending = KEYS.find((k) => isTamilTbd(ONEMARK_STRINGS_TA[k]));
    expect(pending).toBeDefined();
    expect(resolveString('ta', pending as OneMarkStringKey)).toBe(
      ONEMARK_STRINGS_EN[pending as OneMarkStringKey],
    );
  });

  it('returns the Tamil phrase where one was written', () => {
    expect(resolveString('ta', 'vault.title')).toBe(ONEMARK_STRINGS_TA['vault.title']);
    expect(resolveString('en', 'vault.title')).toBe('Mistake Vault');
  });

  it('never returns an empty phrase, in either language', () => {
    for (const locale of ONEMARK_LOCALES) {
      const blank = KEYS.filter((k) => resolveString(locale, k).trim().length === 0);
      expect(blank).toEqual([]);
    }
  });

  it('returns the key itself for a key that does not exist, rather than nothing', () => {
    expect(resolveString('en', 'nope.not.a.key' as OneMarkStringKey)).toBe('nope.not.a.key');
  });
});

describe('interpolation', () => {
  it('fills a slot in either language', () => {
    expect(resolveString('en', 'vault.reviewDue', { count: 4 })).toBe('Review 4 due now');
    expect(resolveString('ta', 'vault.reviewDue', { count: 4 })).toContain('4');
  });

  it('leaves an unfilled slot visible instead of blanking it', () => {
    expect(interpolate('Review {count} due now')).toBe('Review {count} due now');
    expect(interpolate('Review {count} due now', { other: 1 })).toBe('Review {count} due now');
  });

  it('gives both languages the same slots, so neither drops a number', () => {
    const slots = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();
    const mismatched = KEYS.filter((k) => {
      const ta = ONEMARK_STRINGS_TA[k];
      if (isTamilTbd(ta)) return false; // the placeholder quotes the English verbatim
      return JSON.stringify(slots(ONEMARK_STRINGS_EN[k])) !== JSON.stringify(slots(ta));
    });
    expect(mismatched).toEqual([]);
  });

  it('binds a translator to one locale', () => {
    const t = makeTranslator('en');
    expect(t('vault.nothingDue')).toBe('Nothing due yet');
    expect(t('vault.reviewDue', { count: 1 })).toBe('Review 1 due now');
  });
});

describe('the locale value itself', () => {
  it('accepts only the two the CHECK constraint allows', () => {
    expect(ONEMARK_LOCALES).toEqual(['en', 'ta']);
    expect(isOneMarkLocale('en')).toBe(true);
    expect(isOneMarkLocale('ta')).toBe(true);
    expect(isOneMarkLocale('ta-IN')).toBe(false);
    expect(isOneMarkLocale('hi')).toBe(false);
    expect(isOneMarkLocale(null)).toBe(false);
  });

  it('falls back to English for anything else', () => {
    expect(DEFAULT_ONEMARK_LOCALE).toBe('en');
    expect(toOneMarkLocale('ta')).toBe('ta');
    expect(toOneMarkLocale('klingon')).toBe('en');
    expect(toOneMarkLocale(undefined)).toBe('en');
  });
});

describe('which locale wins after the account answers', () => {
  it('lets a stored row override the local hint', () => {
    expect(chooseLocale({ hint: 'en', server: 'ta', persisted: true })).toBe('ta');
    expect(chooseLocale({ hint: 'ta', server: 'en', persisted: true })).toBe('en');
  });

  it('leaves a local pick alone when the account has no row yet', () => {
    // The table is empty for everyone until someone touches the switch, and the
    // route answers English + persisted:false. That must not undo a choice the
    // person just made on this device.
    expect(chooseLocale({ hint: 'ta', server: 'en', persisted: false })).toBe('ta');
  });
});

describe('the native reviewer sheet', () => {
  it('lists every key exactly once, sorted', () => {
    const sheet = tamilReviewSheet();
    expect(sheet).toHaveLength(KEYS.length);
    expect(sheet.map((r) => r.key)).toEqual([...KEYS].sort());
  });

  it('marks a placeholder pending and a written phrase written', () => {
    const sheet = tamilReviewSheet();
    const byKey = new Map(sheet.map((r) => [r.key, r]));
    expect(byKey.get('vault.title')?.status).toBe('written');
    expect(byKey.get('vault.intro')?.status).toBe('pending');
  });

  it('carries both sides of every row, so the sheet stands alone', () => {
    for (const row of tamilReviewSheet()) {
      expect(row.english.length).toBeGreaterThan(0);
      expect(row.tamil.length).toBeGreaterThan(0);
    }
  });
});
