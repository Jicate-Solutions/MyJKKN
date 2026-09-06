'use client';

import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GroupSelectionState } from '@/lib/campus-living/attendance-selection';

/**
 * Tri-state checkbox for the Room / Floor / Block headings on the Mark
 * Attendance page: empty when none of the group is selected, a dash when part
 * of it is, a tick when all of it is.
 *
 * Built on Radix directly rather than on `components/ui/checkbox`. That shared
 * primitive hardcodes a check icon in its Indicator, and Radix renders the
 * Indicator for `indeterminate` as well as `checked` — so a partial selection
 * would draw a full tick, which is exactly the state we need to distinguish.
 * Fixing the shared component would change the look of every data table in the
 * app, so the fix stays local.
 */
export function GroupCheckbox({
  state,
  onToggle,
  label,
  className,
}: {
  state: GroupSelectionState;
  onToggle: () => void;
  /** Announced to screen readers, e.g. "Select all in Room 101". */
  label: string;
  className?: string;
}) {
  return (
    <CheckboxPrimitive.Root
      checked={state === 'all' ? true : state === 'some' ? 'indeterminate' : false}
      onCheckedChange={onToggle}
      aria-label={label}
      // Stop the click from reaching a heading that may itself be clickable.
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        'data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground',
        className
      )}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        {state === 'some' ? <Minus className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
