'use client';

// lib/onemark/i18n/use-onemark-t.ts
// OneMark — the interface language, as a component sees it.
//
// One module-level store rather than a React context, on purpose. The learner
// surfaces that need the switch do not share a layout: the hub is its own page,
// the Mistake Vault panel is mounted by a page Lane L owns, and the runner is
// mounted somewhere else again. A provider would have to be dropped into a file
// this lane does not own; a store does not. Every consumer subscribes to the
// same value, and flipping the switch in the hub header re-renders all of them.
//
// Where the value comes from, in order:
//   1. English. Always the starting point, and the answer on the server.
//   2. localStorage, read on the first client subscribe. A hint only — it makes
//      the choice survive a reload without a round trip, which is what stops
//      the page rendering English for a beat and then flipping to Tamil.
//   3. onemark_user_prefs, via GET /api/foundation/onemark/prefs. The account's
//      answer, so the choice follows the person to another device. It wins over
//      the hint only when a row actually exists — a person who has never
//      touched the switch must not have their local pick reset by the default.
//
// Writing goes the other way: the value changes at once, the hint is written,
// and the PUT happens in the background. A failed PUT (typically the migration
// not yet applied) leaves the choice working on this device, which is the
// honest degraded state — nothing about an interface language is worth an
// error toast in a learner's face.

import { useCallback, useSyncExternalStore } from 'react';
import {
  DEFAULT_ONEMARK_LOCALE,
  makeTranslator,
  toOneMarkLocale,
  type OneMarkLocale,
  type OneMarkTranslate,
} from './index';

const STORAGE_KEY = 'jkkn.onemark.ui-locale.v1';
const PREFS_URL = '/api/foundation/onemark/prefs';

let current: OneMarkLocale = DEFAULT_ONEMARK_LOCALE;
let readHint = false;
let askedServer = false;
const listeners = new Set<() => void>();

/**
 * Which locale wins once the account's answer is in. Pure, so the rule is
 * testable without a browser: a stored row beats the local hint; no stored row
 * leaves the hint alone.
 */
export function chooseLocale(input: {
  hint: OneMarkLocale;
  server: OneMarkLocale;
  persisted: boolean;
}): OneMarkLocale {
  return input.persisted ? input.server : input.hint;
}

function readHintFromStorage(): OneMarkLocale {
  if (typeof window === 'undefined') return DEFAULT_ONEMARK_LOCALE;
  try {
    return toOneMarkLocale(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_ONEMARK_LOCALE;
  }
}

function writeHintToStorage(locale: OneMarkLocale): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* private browsing — the choice just does not survive the reload */
  }
}

function setCurrent(next: OneMarkLocale): void {
  if (next === current) return;
  current = next;
  listeners.forEach((listener) => listener());
}

async function askServer(): Promise<void> {
  try {
    const res = await fetch(PREFS_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) return; // 401 signed out, 5xx, or the table is not live yet
    const body = (await res.json()) as { uiLocale?: unknown; persisted?: unknown };
    setCurrent(
      chooseLocale({
        hint: current,
        server: toOneMarkLocale(body?.uiLocale),
        persisted: body?.persisted === true,
      }),
    );
  } catch {
    /* offline or aborted — the hint stands */
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!readHint) {
    readHint = true;
    setCurrent(readHintFromStorage());
  }
  if (!askedServer) {
    askedServer = true;
    void askServer();
  }
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = (): OneMarkLocale => current;
const getServerSnapshot = (): OneMarkLocale => DEFAULT_ONEMARK_LOCALE;

/** Set the interface language for this person, everywhere at once. */
export function setOneMarkLocale(next: OneMarkLocale): void {
  setCurrent(next);
  writeHintToStorage(next);
  void fetch(PREFS_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uiLocale: next }),
  }).catch(() => {
    /* the choice already applies on this device; the account catches up later */
  });
}

/** The current interface language, and the setter. */
export function useOneMarkLocale(): [OneMarkLocale, (next: OneMarkLocale) => void] {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const set = useCallback((next: OneMarkLocale) => setOneMarkLocale(next), []);
  return [locale, set];
}

/** What a component asks for: `t` plus the switch. */
export function useOneMarkT(): {
  locale: OneMarkLocale;
  setLocale: (next: OneMarkLocale) => void;
  t: OneMarkTranslate;
} {
  const [locale, setLocale] = useOneMarkLocale();
  const t = useCallback<OneMarkTranslate>(
    (key, vars) => makeTranslator(locale)(key, vars),
    [locale],
  );
  return { locale, setLocale, t };
}

/** Test seam: drop every cached decision so a case starts from English. */
export function __resetOneMarkLocaleForTests(): void {
  current = DEFAULT_ONEMARK_LOCALE;
  readHint = false;
  askedServer = false;
  listeners.clear();
}
