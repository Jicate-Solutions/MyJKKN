'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MultiSemesterPickerProps {
  /** All available semester codes (already filtered to ones with regular registrations) */
  options: string[];
  /** Currently selected semester codes */
  value: string[];
  /** Called when the selection changes */
  onChange: (next: string[]) => void;
  disabled?: boolean;
  isLoading?: boolean;
}

/**
 * Multi-select semester picker — opens a popover with checkboxes.
 * Displays "N selected" in the trigger button, with "All" and "Clear" shortcuts.
 * Each option is labelled "Semester X (PCM-X)" for human-readable display.
 */
export function MultiSemesterPicker({
  options,
  value,
  onChange,
  disabled,
  isLoading,
}: MultiSemesterPickerProps) {
  // Extract the numeric part from semester codes like "PCM-2" → "2"
  const decorated = useMemo(
    () =>
      options.map((code) => {
        const match = code.match(/(\d+)\s*$/);
        const num = match?.[1] ?? code;
        return { code, label: `Semester ${num}`, number: num };
      }),
    [options]
  );

  const toggle = (code: string) => {
    if (value.includes(code)) {
      onChange(value.filter((c) => c !== code));
    } else {
      onChange([...value, code]);
    }
  };

  const selectAll = () => onChange([...options]);
  const clearAll = () => onChange([]);

  const triggerLabel = isLoading
    ? 'Loading...'
    : value.length === 0
    ? 'Select Semester'
    : value.length === 1
    ? `Semester ${decorated.find((d) => d.code === value[0])?.number ?? value[0]}`
    : `${value.length} semesters`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          role='combobox'
          disabled={disabled || isLoading}
          className={cn(
            'w-full justify-between font-normal',
            value.length > 0 && 'border-amber-400 bg-amber-50 dark:bg-amber-950/30'
          )}
        >
          <span className='truncate text-left'>{triggerLabel}</span>
          <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-[260px] p-0' align='start'>
        <div className='flex items-center justify-between border-b px-3 py-2 text-xs'>
          <span className='text-muted-foreground'>
            {value.length} selected
          </span>
          <div className='flex items-center gap-2'>
            <button
              type='button'
              className='text-emerald-600 hover:underline font-medium'
              onClick={selectAll}
            >
              All
            </button>
            <span className='text-muted-foreground'>|</span>
            <button
              type='button'
              className='text-red-500 hover:underline font-medium'
              onClick={clearAll}
            >
              Clear
            </button>
          </div>
        </div>
        <div className='max-h-[260px] overflow-y-auto py-1'>
          {decorated.length === 0 && (
            <p className='px-3 py-4 text-xs text-muted-foreground text-center'>
              No semesters available
            </p>
          )}
          {decorated.map((opt) => {
            const checked = value.includes(opt.code);
            return (
              <Label
                key={opt.code}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 text-sm font-normal',
                  checked && 'bg-emerald-50 dark:bg-emerald-950/30'
                )}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(opt.code)}
                />
                <span>{opt.label}</span>
                <span className='ml-auto text-xs text-muted-foreground'>
                  {opt.code}
                </span>
              </Label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
