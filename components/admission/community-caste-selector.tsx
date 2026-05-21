'use client';

// components/admission/community-caste-selector.tsx
//
// Community + Caste pickers backed by the TN govt taxonomy in
// lib/constants/community-caste-list.ts. Exposes THREE components:
//
//   <CommunityField />      — community Select only
//   <CasteField />          — caste picker (searchable combobox) only;
//                             receives community as prop for cascade
//   <CommunityCasteSelector /> — convenience wrapper that stacks the two
//                                vertically (e.g., student form mobile)
//
// Why split: the enquiry form lays out Religion | Community | Caste as a
// 3-column grid where Community and Caste must be SIBLING cells, not nested.
// The student form stacks vertically. Splitting lets each form compose freely.
//
// Caste picker uses a Popover + cmdk Command for type-to-filter search.
// With 142 BC entries and 115 MBC entries, a plain Select scroll is painful.

import { useMemo, useState } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  COMMUNITIES,
  CASTES_BY_COMMUNITY,
  findCommunity,
  findCasteInCommunity,
  type CommunityCode,
} from '@/lib/constants/community-caste-list';

const OTHER_SENTINEL = '__OTHER__';

function Req() {
  return <span className="text-red-500 ml-0.5">*</span>;
}

// ════════════════════════════════════════════════════════════════════════════
// CommunityField — plain Select with 7 canonical communities
// ════════════════════════════════════════════════════════════════════════════

interface CommunityFieldProps {
  value: string;
  onChange: (val: string) => void;
  required?: boolean;
  bilingual?: boolean;
  /** Fires after onChange when value transitions to a different community
   *  code. Useful for resetting dependent caste state in the parent. */
  onCascadeReset?: () => void;
}

export function CommunityField({
  value,
  onChange,
  required = false,
  bilingual = false,
  onCascadeReset,
}: CommunityFieldProps) {
  const matched = findCommunity(value);
  const selectValue = matched?.code ?? '';

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        Community
        {bilingual && <span className="text-muted-foreground"> / சமூகம்</span>}
        {required && <Req />}
      </Label>
      <Select
        value={selectValue}
        onValueChange={(next) => {
          onChange(next);
          if (next !== selectValue) onCascadeReset?.();
        }}
      >
        <SelectTrigger className="h-12">
          <SelectValue
            placeholder={
              bilingual
                ? 'Select community / சமூகம் தேர்வு செய்க'
                : 'Select community'
            }
          />
        </SelectTrigger>
        <SelectContent>
          {COMMUNITIES.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CasteField — searchable combobox keyed off the selected community
// ════════════════════════════════════════════════════════════════════════════

interface CasteFieldProps {
  /** Community code (OC / BC / BC-M / MBC / SC / SC-A / ST) — drives which
   *  caste list to render. Empty disables the picker. */
  community: string;
  value: string;
  onChange: (val: string) => void;
  required?: boolean;
  bilingual?: boolean;
}

export function CasteField({
  community,
  value,
  onChange,
  required = false,
  bilingual = false,
}: CasteFieldProps) {
  const matchedCommunity = findCommunity(community);
  const communityCode = matchedCommunity?.code;

  // List of canonical castes for this community. Empty array for OC or unset.
  const casteList = useMemo(
    () => (communityCode ? CASTES_BY_COMMUNITY[communityCode] : []),
    [communityCode],
  );

  // Match logic: is the saved value a canonical caste name (or alias)?
  const matchedCaste = useMemo(() => {
    if (!communityCode || !value) return undefined;
    return findCasteInCommunity(communityCode, value);
  }, [communityCode, value]);

  // OTHER mode tracking: once set, only flips on user pick of Other or a
  // canonical option. Initialized from saved value at mount.
  const [isOtherMode, setIsOtherMode] = useState<boolean>(() => {
    if (!value || !communityCode || communityCode === 'OC') return false;
    return !findCasteInCommunity(communityCode, value);
  });

  const [open, setOpen] = useState(false);

  // OC special case: hide the caste picker entirely with explanatory helper text
  if (communityCode === 'OC') {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm font-medium text-muted-foreground">
          Caste
          {bilingual && <span> / ஜாதி</span>}
        </Label>
        <p className="text-xs text-muted-foreground rounded-md border bg-muted/30 px-3 py-2">
          Forward Castes — caste not required
          {bilingual && (
            <span className="block">திறந்த வகுப்பு — ஜாதி தேவையில்லை</span>
          )}
        </p>
      </div>
    );
  }

  function pickCanonical(name: string) {
    setIsOtherMode(false);
    onChange(name);
    setOpen(false);
  }

  function pickOther() {
    setIsOtherMode(true);
    onChange('');
    setOpen(false);
  }

  // Trigger label: show selected caste name, OR "Other (specify)" when in
  // other mode with no text yet, OR the typed text, OR placeholder.
  const triggerLabel = isOtherMode
    ? value || 'Other (specify)'
    : matchedCaste?.name ?? value ?? '';

  const disabled = !communityCode;

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        Caste
        {bilingual && <span className="text-muted-foreground"> / ஜாதி</span>}
        {required && <Req />}
      </Label>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              'h-12 w-full justify-between font-normal',
              !triggerLabel && 'text-muted-foreground',
              isOtherMode && 'bg-muted/40',
            )}
          >
            <span className="truncate">
              {triggerLabel ||
                (disabled
                  ? bilingual
                    ? 'Pick community first / முதலில் சமூகம்'
                    : 'Pick community first'
                  : bilingual
                    ? 'Select caste / ஜாதி தேர்வு செய்க'
                    : 'Select caste')}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
          <Command
            filter={(itemValue, search) => {
              // cmdk default filter scores by case-insensitive contains.
              // We extend it to also search the canonical name (the option
              // value IS the name in our case, so default behavior works).
              const haystack = itemValue.toLowerCase();
              const needle = search.toLowerCase().trim();
              if (!needle) return 1;
              return haystack.includes(needle) ? 1 : 0;
            }}
          >
            <CommandInput
              placeholder={
                bilingual
                  ? 'Search caste / தேடவும்'
                  : 'Search caste...'
              }
              className="h-10"
            />
            <CommandList className="max-h-72">
              <CommandEmpty>
                No matching caste. Try "Other (specify)" below.
              </CommandEmpty>
              <CommandGroup>
                {casteList.map((c) => (
                  <CommandItem
                    key={c.name}
                    value={c.name}
                    onSelect={() => pickCanonical(c.name)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        matchedCaste?.name === c.name ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="flex-1">{c.name}</span>
                    {c.notes && (
                      <span className="ml-2 text-xs text-muted-foreground truncate max-w-[40%]">
                        {c.notes}
                      </span>
                    )}
                  </CommandItem>
                ))}
                <CommandItem
                  value={OTHER_SENTINEL}
                  onSelect={pickOther}
                  className="border-t mt-1 pt-2"
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      isOtherMode ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="italic">Other (specify)</span>
                  {bilingual && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      / பிற
                    </span>
                  )}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Free-text input — appears below the Popover trigger when OTHER picked */}
      {isOtherMode && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            bilingual
              ? 'Specify caste / ஜாதியைக் குறிப்பிடவும்'
              : 'Specify caste'
          }
          className="h-12"
          aria-label="Specify other caste"
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CommunityCasteSelector — convenience wrapper that stacks both vertically
// ════════════════════════════════════════════════════════════════════════════

interface CommunityCasteSelectorProps {
  community: string;
  caste: string;
  onCommunityChange: (val: string) => void;
  onCasteChange: (val: string) => void;
  /** Marks BOTH community and caste fields as required. */
  required?: boolean;
  // 2026-05-21: added so the QR student form can require Community
  // (a fee-structure-matrix dimension) without also asterisking Caste
  // (which is not part of the fee resolver and is genuinely optional
  // for the OC community).
  /** Marks community required without affecting caste. Overrides `required`. */
  communityRequired?: boolean;
  bilingual?: boolean;
}

export function CommunityCasteSelector({
  community,
  caste,
  onCommunityChange,
  onCasteChange,
  required = false,
  communityRequired,
  bilingual = false,
}: CommunityCasteSelectorProps) {
  const commReq = communityRequired ?? required;
  return (
    <div className="space-y-4">
      <CommunityField
        value={community}
        onChange={onCommunityChange}
        onCascadeReset={() => onCasteChange('')}
        required={commReq}
        bilingual={bilingual}
      />
      <CasteField
        community={community}
        value={caste}
        onChange={onCasteChange}
        required={required}
        bilingual={bilingual}
      />
    </div>
  );
}
