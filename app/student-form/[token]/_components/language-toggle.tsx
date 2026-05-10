'use client';

import { Button } from '@/components/ui/button';

export type Language = 'en' | 'ta';

interface Props {
  value: Language;
  onChange: (l: Language) => void;
}

export function LanguageToggle({ value, onChange }: Props) {
  return (
    <div className="flex border rounded-md overflow-hidden text-xs">
      <button
        type="button"
        className={`px-3 py-1 ${value === 'en' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
        onClick={() => onChange('en')}
      >
        English
      </button>
      <button
        type="button"
        className={`px-3 py-1 ${value === 'ta' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
        onClick={() => onChange('ta')}
      >
        தமிழ்
      </button>
    </div>
  );
}
