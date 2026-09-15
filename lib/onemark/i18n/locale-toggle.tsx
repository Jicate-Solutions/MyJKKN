'use client';

// lib/onemark/i18n/locale-toggle.tsx
// OneMark — the interface-language switch (decision 5).
//
// Two buttons, each labelled in its own language, which is how a person who
// cannot read the current one still finds their way out. Shaped like the
// question-language switch the practice runner already carries
// (practice/_components/bilingual.tsx) so the two read as one family — but they
// are DIFFERENT switches and must not be confused:
//
//   this one   — the interface: headings, buttons, empty states.
//   that one   — the question itself, which is bilingual in the bank.
//
// Ruling 15 keeps them separate on purpose: question text follows the picked
// language on screen, while the printed paper stays bilingual.

import { cn } from '@/lib/utils';
import { ONEMARK_LOCALES, type OneMarkLocale } from './index';
import { useOneMarkT } from './use-onemark-t';

const BUTTON_LABEL: Record<OneMarkLocale, string> = {
  en: 'EN',
  ta: 'தமிழ்',
};

export function OneMarkLocaleToggle({ className }: { className?: string }) {
  const { locale, setLocale, t } = useOneMarkT();

  return (
    <div
      role="radiogroup"
      aria-label={t('locale.label')}
      className={cn('inline-flex rounded-full border border-border p-0.5', className)}
    >
      {ONEMARK_LOCALES.map((value) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={locale === value}
          aria-label={t(value === 'ta' ? 'locale.ta' : 'locale.en')}
          lang={value}
          onClick={() => setLocale(value)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition-colors',
            locale === value
              ? 'bg-secondary text-secondary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {BUTTON_LABEL[value]}
        </button>
      ))}
    </div>
  );
}
