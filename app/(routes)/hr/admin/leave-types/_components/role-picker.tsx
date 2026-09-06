'use client';

/**
 * One role, chosen from all of them, with a search box.
 *
 * WHY THIS EXISTS. Every role field in the approval-flow modal used to be a
 * bare <Select> over hr_leave_approver_role_options(), which returns EVERY
 * active custom role — 104 of them on 2026-09-03 — ordered by grants_approve,
 * then holder count, then name. Finding "Principal" meant scrolling a list
 * whose order gives no clue where it sits, while the person picker in the very
 * next field has had a search box all along.
 *
 * FILTERING IS CLIENT-SIDE, and that is the opposite of ApproverPersonPicker on
 * purpose. Candidates are capped at 100 rows by the RPC, so that search has to
 * be sent to the server or it searches a truncated page. Roles arrive whole and
 * sit in React Query for five minutes, so there is nothing to round-trip for.
 *
 * The holder count travels WITH each option instead of only appearing as a
 * warning under the field, because a role nobody holds is this screen's one
 * genuine dead end — a step routed to it can never be approved — and the moment
 * to see that is while choosing, not afterwards. Whether the role grants
 * hr.leave.approve is deliberately NOT shown: fn_is_designated_leave_approver
 * admits a step's role holder without that key, which is exactly what lets a
 * ladder route to HOD, Principal and CAO, none of which have it.
 *
 * Items are searched on "<role name> <role_key>" so a key like `hod` finds it
 * too, and so the holder counts — which are not part of the search value —
 * cannot match a typed digit.
 */

import { useRef, useState, type ReactNode } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { LeaveApproverRoleOption } from '@/types/hr-leave-types';

/** cmdk needs a non-empty item value, and '' is this component's "nothing". */
const CLEAR = '__clear__';

interface Props {
  roles: LeaveApproverRoleOption[] | undefined;
  /** A role_key, or '' for nothing chosen. */
  value: string;
  onChange: (roleKey: string) => void;
  /** Shown on the trigger while nothing is chosen. */
  placeholder?: string;
  /**
   * Label for an entry that clears the selection ("Any role", "No role").
   * Omitted entirely when the field has no meaningful empty state.
   */
  clearLabel?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  /** Rendered before the trigger label — the ladder's "Add a rung" affordance. */
  icon?: ReactNode;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

export function RolePicker({
  roles,
  value,
  onChange,
  placeholder = 'Select a role',
  clearLabel,
  searchPlaceholder = 'Search roles…',
  emptyMessage = 'No role matches that.',
  icon,
  className,
  disabled = false,
  'aria-label': ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  /*
   * The popover has to be portalled INTO the dialog, not into document.body.
   * Outside it, the Dialog's focus trap eats keystrokes (dead search box) and
   * react-remove-scroll eats wheel events (the list will not scroll). This
   * component is only ever used inside the approval-flow modal, so it always
   * resolves a container rather than taking a `modal` prop the way the shared
   * SearchableSelect does. Below 768px that modal is a vaul Drawer, which wraps
   * @radix-ui/react-dialog and so carries role="dialog" just the same.
   *
   * Resolved in the open handler rather than in an effect, to avoid the
   * set-state-in-effect cascade.
   */
  const [container, setContainer] = useState<HTMLElement | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setContainer(
        (triggerRef.current?.closest('[role="dialog"],[role="alertdialog"]') as
          | HTMLElement
          | null) ?? null
      );
    }
    setOpen(next);
  };

  const list = roles ?? [];
  const selected = list.find((r) => r.role_key === value);

  const pick = (roleKey: string) => {
    onChange(roleKey);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !selected && 'text-muted-foreground',
            className
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {icon}
            {/* A stored role_key whose role has since been deactivated is not in
                `roles`, so fall back to the key itself rather than silently
                showing the placeholder as if nothing were configured. */}
            <span className="truncate">{selected?.role_name ?? (value || placeholder)}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      {/* data-vaul-no-drag: below 768px this sits inside a vaul Drawer, whose
          drag handler would otherwise read a downward swipe over the list as a
          pull-to-dismiss and close the whole modal mid-search. */}
      <PopoverContent
        ref={contentRef}
        container={container ?? undefined}
        data-vaul-no-drag
        align="start"
        className="w-full p-0"
        style={{ width: 'var(--radix-popover-trigger-width)', minWidth: '250px' }}
        onOpenAutoFocus={(e) => {
          // Portalled into a scrollable DialogContent, the popover's DOM sits at
          // the end of the container, so default focus scrolls the dialog to the
          // bottom and the dropdown appears to jump. Focus without scrolling.
          e.preventDefault();
          contentRef.current
            ?.querySelector<HTMLInputElement>('[cmdk-input]')
            ?.focus({ preventScroll: true });
        }}
      >
        <Command
          filter={(cmdValue, search) =>
            cmdValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {clearLabel && (
                <CommandItem value={CLEAR} onSelect={() => pick('')}>
                  <Check
                    className={cn('mr-2 h-4 w-4 shrink-0', value ? 'opacity-0' : 'opacity-100')}
                  />
                  <span className="text-muted-foreground">{clearLabel}</span>
                </CommandItem>
              )}

              {list.map((r) => (
                <CommandItem
                  key={r.role_key}
                  value={`${r.role_name} ${r.role_key}`}
                  onSelect={() => pick(r.role_key)}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4 shrink-0',
                      value === r.role_key ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{r.role_name}</span>
                  {r.user_count === 0 ? (
                    <span className="ml-2 shrink-0 text-xs font-medium text-destructive">
                      nobody holds this
                    </span>
                  ) : (
                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                      {r.user_count} {r.user_count === 1 ? 'person' : 'people'}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
