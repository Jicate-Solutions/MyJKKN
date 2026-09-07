'use client';

// OneMark — the language switch and the question-text block.
//
// RULING 15 — the question on screen is in the language the learner picked,
// and in that language only. Two versions of the same question stacked on top
// of each other is not a bilingual paper, it is twice the reading in a room
// where the clock is running. The switch therefore has two positions, EN and
// தமிழ், and there is no "Both".
//
// The fallback is PER ITEM, not per sitting: a learner reading in Tamil sees
// the English text of any single question the bank has not been translated
// for yet, and keeps Tamil for the rest. A question is never blank and the
// switch never silently changes for the whole paper.
//
// Decision 5: each person chooses. Kept per browser in localStorage for now;
// nothing about it is stored server-side. Lane T replaces this store with
// `onemark_user_prefs.ui_locale` so the choice follows the person between
// devices — the two positions here are already the two that table allows.
//
// The chrome (buttons, labels) stays in English in this wave — Tamil chrome
// strings need native review before they ship (CLAUDE.md #24), and Lane T owns
// that extraction. The QUESTION text is bilingual from the bank, which is
// where it matters.

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export type Lang = 'ta' | 'en';

const LANG_KEY = 'jkkn.onemark.lang.v1';

/** The learner's chosen language, read from localStorage AFTER hydration.
 *
 *  The read cannot happen in the useState initialiser. The server renders 'en',
 *  and a Tamil-preferring browser would then hydrate 'ta' — a mismatch React
 *  patches over. That was survivable while the switch only toggled the
 *  visibility of a second block; under ruling 15 it swaps the whole question
 *  stem, so it would be a visible flash of the wrong language on every
 *  question, at the start of a timed paper. So: render 'en' on both sides,
 *  then move to the stored choice in an effect. */
export function useLang(): [Lang, (l: Lang) => void] {
  const [lang, setLangState] = useState<Lang>('en');
  useEffect(() => {
    try {
      // 'both' is what the previous release stored. It is no longer a
      // position, so a browser carrying it stays on English rather than
      // landing on an empty switch.
      if (window.localStorage.getItem(LANG_KEY) === 'ta') setLangState('ta');
    } catch {
      /* private browsing — the choice just does not persist */
    }
  }, []);
  function setLang(l: Lang) {
    setLangState(l);
    try {
      window.localStorage.setItem(LANG_KEY, l);
    } catch {
      /* private browsing — the choice just does not persist */
    }
  }
  return [lang, setLang];
}

export function LangSwitch({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  const options: Array<{ value: Lang; label: string }> = [
    { value: 'en', label: 'English' },
    { value: 'ta', label: 'தமிழ்' },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Question language"
      className="inline-flex rounded-full border border-border p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={lang === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition-colors',
            lang === o.value
              ? 'bg-secondary text-secondary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Which text and which language tag a single item resolves to under the
 *  learner's choice. Tamil when it was picked and the bank has it; English
 *  otherwise — per item, so one untranslated question does not switch the
 *  paper. Exported for the tests. */
export function pickLanguage(
  lang: Lang,
  en: string | null | undefined,
  ta: string | null | undefined,
): { text: string | null; lang: Lang; fellBackToEnglish: boolean } {
  const taText = ta && ta.trim() ? ta : null;
  const enText = en && en.trim() ? en : null;
  if (lang === 'ta') {
    if (taText) return { text: taText, lang: 'ta', fellBackToEnglish: false };
    return { text: enText, lang: 'en', fellBackToEnglish: Boolean(enText) };
  }
  if (enText) return { text: enText, lang: 'en', fellBackToEnglish: false };
  // English was picked and the bank has only Tamil: showing it beats showing
  // nothing, and it is the same per-item rule read the other way.
  return { text: taText, lang: 'ta', fellBackToEnglish: false };
}

/** The question text in the chosen language, with the per-item fallback. */
export function Bilingual({
  lang,
  en,
  ta,
  className,
}: {
  lang: Lang;
  en: string | null | undefined;
  ta: string | null | undefined;
  className?: string;
  /** Accepted and ignored — kept so callers written against the stacked
   *  version do not have to change while Lane T rewrites these screens. */
  taClassName?: string;
}) {
  const picked = pickLanguage(lang, en, ta);
  if (!picked.text) return null;
  return (
    <span className={cn('block', className)} lang={picked.lang}>
      {picked.text}
    </span>
  );
}

/** Option text in the chosen language(s), matched by key first, then index. */
export function optionText(
  options: Array<{ key: string; text: string }>,
  optionsTa: Array<{ key: string; text: string }> | null | undefined,
  key: string,
): { en: string | null; ta: string | null } {
  const enIdx = options.findIndex((o) => o.key === key);
  const en = enIdx >= 0 ? options[enIdx]?.text ?? null : null;
  let ta: string | null = null;
  if (optionsTa && optionsTa.length) {
    const byKey = optionsTa.find((o) => o?.key === key);
    ta = byKey?.text ?? (enIdx >= 0 ? optionsTa[enIdx]?.text ?? null : null);
  }
  return { en, ta };
}
