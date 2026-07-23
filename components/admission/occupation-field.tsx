'use client';

// components/admission/occupation-field.tsx
//
// Shared dropdown component for father_occupation / mother_occupation used by
// the student self-fill form AND the enquiry/learner-profile form. Lifts the
// 'OTHER + specify' pattern out of both call sites so the behaviour stays
// identical and the option list stays single-sourced.
//
// Storage contract: this component writes a STRING to the parent via onChange.
//   - If user picks a predefined category, the string is the code (e.g. 'DRIVER').
//   - If user picks 'Other (specify)' + types something, the string is the typed
//     text (the literal 'OTHER' sentinel is NEVER stored).
//
// Form hydration: on initial render, if `value` is one of the codes, the Select
// snaps to that option. If `value` is anything else (legacy free-text), the
// Select snaps to 'OTHER' and the text input pre-fills with the raw value.
// This gracefully handles all existing rows without a data migration — though
// the optional accompanying migration normalises ~94% to category codes anyway.

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  OCCUPATION_OPTIONS,
  findOccupationOption,
} from '@/lib/constants/learner-dropdown-values';

interface OccupationFieldProps {
  label: React.ReactNode;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  required?: boolean;
  /** Optional helper text rendered below the input(s). */
  helper?: string;
  /**
   * Render option labels and placeholders with Tamil + English. When false
   * (default), shows English-only — matches the enquiry/learner-profile forms.
   * The student form passes `bilingual` to match its bilingual UX everywhere
   * else.
   */
  bilingual?: boolean;
}

export function OccupationField({
  label,
  value,
  onChange,
  placeholder,
  required,
  helper,
  bilingual = false,
}: OccupationFieldProps) {
  // Lazy initializer — runs once on mount. Computes whether to start in
  // "option mode" (value matches a code) or "other mode" (value is custom).
  // Subsequent value changes (typing in the text input, parent re-renders)
  // do NOT reset this — mode only flips on user-driven Select interaction.
  const [isOtherMode, setIsOtherMode] = useState<boolean>(() => {
    return !!value && !findOccupationOption(value);
  });

  // Compute the value the Select component shows:
  //   - In other mode → 'OTHER' (the sentinel matches the option's value)
  //   - In option mode → the matched code, or '' if value is empty
  const matchedOption = findOccupationOption(value);
  const selectValue = isOtherMode ? 'OTHER' : (matchedOption?.value ?? '');

  function handleSelectChange(next: string) {
    if (next === 'OTHER') {
      setIsOtherMode(true);
      // Reset the stored value when switching INTO other mode so the text
      // input starts empty. Otherwise the placeholder is misleading and
      // submitting the form without typing would save the previous category
      // code as if it were free text.
      onChange('');
    } else {
      setIsOtherMode(false);
      onChange(next);
    }
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      <Select value={selectValue} onValueChange={handleSelectChange}>
        <SelectTrigger className="h-12">
          <SelectValue
            placeholder={
              placeholder ??
              (bilingual
                ? 'Select occupation / தொழில் தேர்வு செய்க'
                : 'Select occupation')
            }
          />
        </SelectTrigger>
        <SelectContent>
          {OCCUPATION_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
              {bilingual && (
                <>
                  {' '}
                  <span className="text-muted-foreground">/ {o.tamil}</span>
                </>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isOtherMode && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            bilingual
              ? 'Specify occupation / தொழிலைக் குறிப்பிடவும்'
              : 'Specify occupation'
          }
          className="h-12"
          aria-label="Specify other occupation"
        />
      )}

      {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
    </div>
  );
}
