'use client';

// OneMark — the language switch and the bilingual text block.
//
// Decision 5: each person chooses. Kept per browser in localStorage; nothing
// about it is stored server-side. PRD §1.2: when both are shown, the Tamil
// block comes first, then the English one.
//
// The chrome (buttons, labels) stays in English in this wave — Tamil chrome
// strings need native review before they ship (CLAUDE.md #24). The QUESTION
// text is bilingual from the bank, which is where it matters.

import { useState } from 'react';
import { cn } from '@/lib/utils';

export type Lang = 'ta' | 'en' | 'both';

const LANG_KEY = 'jkkn.onemark.lang.v1';

export function useLang(): [Lang, (l: Lang) => void] {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window === 'undefined') return 'both';
    try {
      const raw = window.localStorage.getItem(LANG_KEY);
      return raw === 'ta' || raw === 'en' || raw === 'both' ? raw : 'both';
    } catch {
      return 'both';
    }
  });
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
    { value: 'ta', label: 'தமிழ்' },
    { value: 'en', label: 'English' },
    { value: 'both', label: 'Both' },
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

/** Tamil first, then English, honouring the switch. Falls back to whichever
 *  language the bank has when the other is missing, so a question is never
 *  blank. */
export function Bilingual({
  lang,
  en,
  ta,
  className,
  taClassName,
}: {
  lang: Lang;
  en: string | null | undefined;
  ta: string | null | undefined;
  className?: string;
  taClassName?: string;
}) {
  const showTa = (lang === 'ta' || lang === 'both' || !en) && Boolean(ta);
  const showEn = (lang === 'en' || lang === 'both' || !ta) && Boolean(en);
  return (
    <span className={cn('block', className)}>
      {showTa && (
        <span lang="ta" className={cn('block', taClassName)}>
          {ta}
        </span>
      )}
      {showEn && (
        <span lang="en" className={cn('block', showTa && 'mt-1.5')}>
          {en}
        </span>
      )}
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
