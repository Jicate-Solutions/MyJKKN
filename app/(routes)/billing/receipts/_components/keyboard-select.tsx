'use client';

import * as React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

export interface KeyboardSelectOption {
  value: string;
  label: string;
}

interface KeyboardSelectProps {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: KeyboardSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

/**
 * A Radix Select that also answers to the keyboard the way a NATIVE `<select>`
 * does.
 *
 * WHY THIS EXISTS
 * ---------------
 * Radix treats ArrowUp / ArrowDown on a closed trigger as *open* keys
 * (`OPEN_KEYS` in @radix-ui/react-select): the listbox pops open and the value
 * only changes after a second arrow press plus Enter. A native `<select>`
 * instead moves straight to the previous/next option in place. Counter clerks
 * driving the receipt form without a mouse expect the native behaviour —
 * "arrow down once = Cash becomes Online" — and reported the Radix version as
 * simply not working.
 *
 * HOW THE INTERCEPT IS SAFE
 * -------------------------
 * Radix composes the caller's `onKeyDown` BEFORE its own
 * (`composeEventHandlers(props.onKeyDown, ...)`) and, with the default
 * `checkForDefaultPrevented`, skips its own handler entirely once the event is
 * defaultPrevented. So calling `preventDefault()` here suppresses Radix's
 * open-on-arrow without patching the primitive or forking the component.
 *
 * Everything else is left to Radix on purpose:
 *   Enter / Space / Alt+ArrowDown  open the list (unchanged)
 *   typing a letter                jumps to the matching option (unchanged)
 *   Escape                         closes (unchanged)
 * Mouse users see exactly the same dropdown as before.
 */
export function KeyboardSelect({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy
}: KeyboardSelectProps) {
  const [open, setOpen] = React.useState(false);

  const move = React.useCallback(
    (delta: number) => {
      if (options.length === 0) return;
      const currentIndex = options.findIndex((o) => o.value === value);
      // No selection yet: ArrowDown lands on the first option, ArrowUp on the
      // last — same as a native select with no value.
      const nextIndex =
        currentIndex === -1
          ? delta > 0
            ? 0
            : options.length - 1
          : Math.min(Math.max(currentIndex + delta, 0), options.length - 1);
      const next = options[nextIndex];
      if (next && next.value !== value) onValueChange(next.value);
    },
    [options, value, onValueChange]
  );

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    // Only take over while the list is CLOSED. Once it is open the popup owns
    // the arrows and Radix's own roving focus is exactly right.
    if (open) return;
    // Alt+Arrow is the platform gesture for "open the list" on a native select;
    // leave it to Radix.
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        move(1);
        event.preventDefault();
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        move(-1);
        event.preventDefault();
        break;
      case 'Home':
        if (options[0]) onValueChange(options[0].value);
        event.preventDefault();
        break;
      case 'End':
        if (options[options.length - 1]) {
          onValueChange(options[options.length - 1].value);
        }
        event.preventDefault();
        break;
      default:
        break;
    }
  };

  return (
    <Select
      value={value}
      onValueChange={onValueChange}
      open={open}
      onOpenChange={setOpen}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        className={className}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        onKeyDown={handleTriggerKeyDown}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
