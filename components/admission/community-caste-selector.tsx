'use client';

// components/admission/community-caste-selector.tsx
//
// FK-based Community + Caste pickers, backed by the DB tables
// `community_categories` and `castes` (seeded from the TN govt taxonomy).
// Values are UUIDs (community_category_id / caste_id) — NOT free text — so
// pre-selection on edit is an exact id match and the old text-matching
// asymmetry (community blank while caste showed) is gone.
//
// Read is open to anon (RLS), so the public QR student form gets the same DB
// data as the authenticated enquiry/profile forms — one global source.
//
// Exposes:
//   <CommunityField />          — community Select (value = community_category_id)
//   <CasteField />              — caste combobox keyed off the community id
//   <CommunityCasteSelector />  — stacks both (student form)
//
// `legacyCasteText` (optional): for rows whose caste_id couldn't be backfilled
// from the old text column, show the stored text as a hint so the operator can
// re-pick it from the now-complete list.

import { useEffect, useMemo, useState } from 'react';
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
import { LookupService } from '@/lib/services/admission/lookup-service';
import { CasteService, type Caste } from '@/lib/services/admission/caste-service';

function Req() {
  return <span className="text-red-500 ml-0.5">*</span>;
}

interface CommunityOpt {
  id: string;
  code: string;
  name: string;
}

// ════════════════════════════════════════════════════════════════════════════
// CommunityField — Select bound to community_category_id
// ════════════════════════════════════════════════════════════════════════════

interface CommunityFieldProps {
  /** community_category_id (uuid) or '' */
  value: string;
  onChange: (id: string) => void;
  required?: boolean;
  bilingual?: boolean;
  /** Fires when the community changes to a different id — reset dependent caste. */
  onCascadeReset?: () => void;
}

export function CommunityField({
  value,
  onChange,
  required = false,
  bilingual = false,
  onCascadeReset,
}: CommunityFieldProps) {
  const [options, setOptions] = useState<CommunityOpt[]>([]);

  useEffect(() => {
    LookupService.listCommunityCategories(true)
      .then((rows) =>
        setOptions(rows.map((r) => ({ id: r.id, code: r.code, name: r.name }))),
      )
      .catch(() => setOptions([]));
  }, []);

  // Exact id match — value is community_category_id.
  const selectValue = options.find((o) => o.id === value)?.id ?? '';

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
          // Radix Select can emit an empty onValueChange while the options list
          // is still loading (selectValue is '' until the fetch resolves). There
          // is no empty SelectItem, so a real user pick is ALWAYS a non-empty id.
          // Ignore '' to avoid wiping a valid pre-selected community_category_id
          // (and cascade-clearing caste_id) on the edit form's first render.
          if (!next) return;
          onChange(next);
          if (next !== selectValue) onCascadeReset?.();
        }}
      >
        <SelectTrigger className="h-12">
          <SelectValue
            placeholder={
              bilingual ? 'Select community / சமூகம் தேர்வு செய்க' : 'Select community'
            }
          />
        </SelectTrigger>
        <SelectContent>
          {options.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CasteField — searchable combobox bound to caste_id, keyed off community id
// ════════════════════════════════════════════════════════════════════════════

interface CasteFieldProps {
  /** community_category_id (uuid). Empty disables the picker. */
  communityCategoryId: string;
  /** caste_id (uuid) or '' */
  value: string;
  onChange: (id: string) => void;
  required?: boolean;
  bilingual?: boolean;
  /** Legacy caste text (when caste_id is unset) shown as a re-pick hint. */
  legacyCasteText?: string | null;
}

export function CasteField({
  communityCategoryId,
  value,
  onChange,
  required = false,
  bilingual = false,
  legacyCasteText,
}: CasteFieldProps) {
  const [castes, setCastes] = useState<Caste[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!communityCategoryId) {
      setCastes([]);
      setLoaded(true);
      return;
    }
    setLoaded(false);
    CasteService.listByCommunity(communityCategoryId, true)
      .then((rows) => {
        if (!cancelled) {
          setCastes(rows);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCastes([]);
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [communityCategoryId]);

  const selected = useMemo(() => castes.find((c) => c.id === value), [castes, value]);
  const disabled = !communityCategoryId;

  // Community with no caste list (e.g. OC) — show helper, nothing to pick.
  if (communityCategoryId && loaded && castes.length === 0) {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm font-medium text-muted-foreground">
          Caste
          {bilingual && <span> / ஜாதி</span>}
        </Label>
        <p className="text-xs text-muted-foreground rounded-md border bg-muted/30 px-3 py-2">
          No caste list for this community.
          {bilingual && <span className="block">இந்த சமூகத்திற்கு ஜாதி பட்டியல் இல்லை.</span>}
        </p>
      </div>
    );
  }

  const triggerLabel =
    selected?.name ??
    (!value && legacyCasteText ? `${legacyCasteText} — re-select to confirm` : '');

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
              !value && legacyCasteText && 'border-amber-400',
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
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command
            filter={(itemValue, search) => {
              const haystack = itemValue.toLowerCase();
              const needle = search.toLowerCase().trim();
              if (!needle) return 1;
              return haystack.includes(needle) ? 1 : 0;
            }}
          >
            <CommandInput
              placeholder={bilingual ? 'Search caste / தேடவும்' : 'Search caste...'}
              className="h-10"
            />
            <CommandList className="max-h-72">
              <CommandEmpty>No matching caste.</CommandEmpty>
              <CommandGroup>
                {castes.map((c) => (
                  <CommandItem
                    key={c.id}
                    // Search by name + aliases; value carries the id after a '|'.
                    value={`${c.name} ${(c.aliases ?? []).join(' ')}|${c.id}`}
                    onSelect={(v) => {
                      const id = v.split('|').pop() ?? c.id;
                      onChange(id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        selected?.id === c.id ? 'opacity-100' : 'opacity-0',
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
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CommunityCasteSelector — stacks both vertically (student form)
// ════════════════════════════════════════════════════════════════════════════

interface CommunityCasteSelectorProps {
  /** community_category_id */
  communityCategoryId: string;
  /** caste_id */
  casteId: string;
  onCommunityChange: (id: string) => void;
  onCasteChange: (id: string) => void;
  required?: boolean;
  /** Marks community required without affecting caste. Overrides `required`. */
  communityRequired?: boolean;
  bilingual?: boolean;
  legacyCasteText?: string | null;
}

export function CommunityCasteSelector({
  communityCategoryId,
  casteId,
  onCommunityChange,
  onCasteChange,
  required = false,
  communityRequired,
  bilingual = false,
  legacyCasteText,
}: CommunityCasteSelectorProps) {
  const commReq = communityRequired ?? required;
  return (
    <div className="space-y-4">
      <CommunityField
        value={communityCategoryId}
        onChange={onCommunityChange}
        onCascadeReset={() => onCasteChange('')}
        required={commReq}
        bilingual={bilingual}
      />
      <CasteField
        communityCategoryId={communityCategoryId}
        value={casteId}
        onChange={onCasteChange}
        required={required}
        bilingual={bilingual}
        legacyCasteText={legacyCasteText}
      />
    </div>
  );
}
