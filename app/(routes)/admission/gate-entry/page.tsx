'use client';

// ============================================================================
// app/(routes)/admission/gate-entry/page.tsx
// ----------------------------------------------------------------------------
// Gate Entry kiosk form. Gate security captures the bare minimum when a
// student arrives at the institution gate; the admission team enriches later
// from the existing leads UI. No duplication — same admission_leads row.
//
// Pattern mirrors rapid-capture-form.tsx (admission/marketing/expos):
//   - useFormDraftObject persists in-flight values across tab switches
//   - Auto-reset 1.5s after successful save (high-throughput entry)
//   - Auto-focus the first-name input on capture-count change
//   - Bilingual labels (English / Tamil)
//   - inputMode="numeric" on phone for mobile keypad
//
// Permission gate: admission.gate_entry.create
// ============================================================================

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Loader2, AlertTriangle, Check, ScanLine } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { useAuth } from '@/hooks/use-auth';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useFormDraftObject } from '@/hooks/use-form-draft';
import { useConsultantsForDropdown } from '@/hooks/admission/use-consultants';
import { LeadService } from '@/lib/services/admission/lead-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import type { GateEntryInput, GateEntryResult } from '@/types/admission';
import type { Program } from '@/types/organizations';

// ─── Form shape ───────────────────────────────────────────────────────────
interface FormData {
  first_name: string;
  last_name: string;
  phone: string;
  program_id: string; // '' or 'undecided' or actual UUID
  source: 'walk_in' | 'referral';
  referred_by_id: string;     // consultant uuid (when picked from list)
  referred_by_name: string;   // free-text fallback
}

const INITIAL_FORM: FormData = {
  first_name: '',
  last_name: '',
  phone: '',
  program_id: '',
  source: 'walk_in',
  referred_by_id: '',
  referred_by_name: '',
};

const PROGRAM_UNDECIDED = '__undecided__';
const PHONE_REGEX = /^(\+91|0)?[6-9]\d{9}$/;

// ─── Page (default export) ────────────────────────────────────────────────
export default function GateEntryPage() {
  return (
    <PermissionGuard module="admission" action="gate_entry.create">
      <ContentLayout title="Gate Entry">
        <GateEntryForm />
      </ContentLayout>
    </PermissionGuard>
  );
}

// ─── Form component ───────────────────────────────────────────────────────
function GateEntryForm() {
  const { profile } = useAuth();
  const { institutions } = useInstitutionsWithAccess();

  // Gate security has institution_scope='own' so their profile.institution_id
  // is the only institution they can log entries for. Render it disabled.
  const institutionId = profile?.institution_id ?? '';
  const institutionName = useMemo(
    () => institutions.find((i) => i.id === institutionId)?.name ?? '—',
    [institutions, institutionId],
  );

  // Draft state — survives accidental tab close / refresh
  const draftKey = `gate-entry-draft:${profile?.id ?? 'anon'}:${institutionId}`;
  const {
    values: form,
    setValue: setDraftField,
    setValues: setDraftValues,
    clearDraft,
  } = useFormDraftObject<FormData>(draftKey, INITIAL_FORM);

  // Programmes for the picker — depend on institution
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programsLoading, setProgramsLoading] = useState(false);
  useEffect(() => {
    if (!institutionId) return;
    let cancelled = false;
    setProgramsLoading(true);
    ProgramService.getPrograms({ institution_id: institutionId, is_active: true })
      .then(({ data }) => { if (!cancelled) setPrograms(data ?? []); })
      .catch(() => { if (!cancelled) setPrograms([]); })
      .finally(() => { if (!cancelled) setProgramsLoading(false); });
    return () => { cancelled = true; };
  }, [institutionId]);

  // Consultants for the referral picker (scoped to the user's institution).
  // Hook signature: useConsultantsForDropdown(institutionId?: string) →
  // { data: Array<{id, name, value, label}> }. Empty string disables the
  // query — we only fire once we have the institution.
  const { data: consultants = [], isLoading: consultantsLoading } =
    useConsultantsForDropdown(institutionId || undefined);
  const [consultantOpen, setConsultantOpen] = useState(false);
  const selectedConsultant = useMemo(
    () => consultants.find((c) => c.id === form.referred_by_id),
    [consultants, form.referred_by_id],
  );

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [lastResult, setLastResult] = useState<GateEntryResult | null>(null);
  const [lastName, setLastName] = useState('');
  const [captureCount, setCaptureCount] = useState(0);

  // Auto-focus the first-name input after each successful capture so the
  // gate guard can immediately type the next student's name.
  const firstNameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstNameRef.current?.focus();
  }, [captureCount]);

  const validate = useCallback((): boolean => {
    const e: Partial<Record<keyof FormData, string>> = {};
    if (!form.first_name.trim()) e.first_name = 'First name is required';
    const phoneStripped = form.phone.replace(/[\s\-()]/g, '');
    if (!phoneStripped) e.phone = 'Phone is required';
    else if (!PHONE_REGEX.test(phoneStripped))
      e.phone = 'Enter a valid 10-digit Indian mobile number';
    if (!institutionId) e.first_name = 'Your account is not linked to an institution';
    if (form.source === 'referral'
        && !form.referred_by_id
        && !form.referred_by_name.trim()) {
      e.referred_by_name = 'Pick a consultant or enter the referrer name';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [form, institutionId]);

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const input: GateEntryInput = {
        first_name:        form.first_name.trim(),
        last_name:         form.last_name.trim() || null,
        phone:             form.phone.replace(/[\s\-()]/g, ''),
        institution_id:    institutionId,
        program_id:        form.program_id && form.program_id !== PROGRAM_UNDECIDED
                             ? form.program_id : null,
        source:            form.source,
        referral_type:     form.source === 'referral' && form.referred_by_id
                             ? 'consultant' : null,
        referred_by_id:    form.source === 'referral' ? form.referred_by_id || null : null,
        referred_by_name:  form.source === 'referral'
                             ? (selectedConsultant?.name ?? form.referred_by_name.trim() ?? null)
                             : null,
      };

      const result = await LeadService.createGateEntry(input);
      setLastResult(result);
      setLastName(`${form.first_name.trim()} ${form.last_name.trim()}`.trim());

      if (result.action === 'merged') {
        toast.success(`Welcome back, ${form.first_name.trim()} — already registered`);
      } else {
        toast.success(`Gate entry saved for ${form.first_name.trim()}`);
      }

      // Auto-reset for high-throughput entry
      setTimeout(() => {
        clearDraft();
        setDraftValues(INITIAL_FORM);
        setErrors({});
        setCaptureCount((c) => c + 1);
      }, 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to log gate entry';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }, [form, institutionId, selectedConsultant, validate, clearDraft, setDraftValues]);

  // Group programmes by degree_name for nicer rendering
  const programsByDegree = useMemo(() => {
    const map = new Map<string, Program[]>();
    for (const p of programs) {
      const k = (p as Program & { degree_name?: string }).degree_name ?? 'Other';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    return map;
  }, [programs]);

  return (
    <div className="max-w-xl mx-auto space-y-6 px-4 sm:px-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ScanLine className="h-6 w-6" />
            Gate Entry
            <span className="text-base font-normal text-muted-foreground">
              / நுழைவு பதிவு
            </span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {institutionName}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/admission/gate-entry/today">Today&rsquo;s entries</Link>
        </Button>
      </div>

      {/* Form card */}
      <div className="rounded-lg border bg-card p-5 space-y-4 shadow-sm">
        {/* First / Last name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="first_name">
              First name <span className="text-rose-500">*</span>
              <span className="text-xs text-muted-foreground ml-1">/ முதல் பெயர்</span>
            </Label>
            <Input
              id="first_name"
              ref={firstNameRef}
              value={form.first_name}
              onChange={(e) => setDraftField('first_name', e.target.value)}
              autoComplete="off"
              autoCapitalize="words"
              className="h-12"
              disabled={submitting}
            />
            {errors.first_name && (
              <p className="text-xs text-rose-600">{errors.first_name}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="last_name">
              Last name
              <span className="text-xs text-muted-foreground ml-1">/ கடைசி பெயர்</span>
            </Label>
            <Input
              id="last_name"
              value={form.last_name}
              onChange={(e) => setDraftField('last_name', e.target.value)}
              autoComplete="off"
              autoCapitalize="words"
              className="h-12"
              disabled={submitting}
            />
          </div>
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <Label htmlFor="phone">
            Phone <span className="text-rose-500">*</span>
            <span className="text-xs text-muted-foreground ml-1">/ கைபேசி</span>
          </Label>
          <Input
            id="phone"
            type="tel"
            inputMode="numeric"
            placeholder="9876543210"
            value={form.phone}
            onChange={(e) => setDraftField('phone', e.target.value)}
            autoComplete="off"
            maxLength={15}
            className="h-12"
            disabled={submitting}
          />
          {errors.phone && (
            <p className="text-xs text-rose-600">{errors.phone}</p>
          )}
        </div>

        {/* Institution (read-only) */}
        <div className="space-y-1.5">
          <Label>
            Institution <span className="text-xs text-muted-foreground">/ கல்வி நிறுவனம்</span>
          </Label>
          <Input
            value={institutionName}
            disabled
            className="h-12 bg-muted/50"
          />
        </div>

        {/* Programme */}
        <div className="space-y-1.5">
          <Label htmlFor="program_id">
            Interested programme
            <span className="text-xs text-muted-foreground ml-1">/ ஆர்வமுள்ள படிப்பு</span>
          </Label>
          <Select
            value={form.program_id || PROGRAM_UNDECIDED}
            onValueChange={(v) => setDraftField('program_id', v === PROGRAM_UNDECIDED ? '' : v)}
            disabled={submitting || programsLoading}
          >
            <SelectTrigger id="program_id" className="h-12">
              <SelectValue placeholder={programsLoading ? 'Loading…' : 'Pick a programme'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={PROGRAM_UNDECIDED}>
                Decide later / பின்னர் தீர்மானிக்க
              </SelectItem>
              {[...programsByDegree.entries()].map(([degree, list]) => (
                <SelectGroup key={degree} label={degree} items={list} />
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Source type */}
        <div className="space-y-2">
          <Label>
            How did they hear about us?
            <span className="text-xs text-muted-foreground ml-1">/ எப்படி வந்தார்கள்?</span>
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <SourceTypeButton
              active={form.source === 'walk_in'}
              onClick={() => setDraftField('source', 'walk_in')}
              disabled={submitting}
              labelEn="Walk-in"
              labelTa="நேரடியாக"
              hint="Direct visit"
            />
            <SourceTypeButton
              active={form.source === 'referral'}
              onClick={() => setDraftField('source', 'referral')}
              disabled={submitting}
              labelEn="Referral"
              labelTa="பரிந்துரை"
              hint="Sent by a consultant"
            />
          </div>
        </div>

        {/* Conditional referral block */}
        {form.source === 'referral' && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-3">
            <div className="space-y-1.5">
              <Label>
                Referrer (consultant)
                <span className="text-xs text-muted-foreground ml-1">/ பரிந்துரைத்தவர்</span>
              </Label>
              <Popover open={consultantOpen} onOpenChange={setConsultantOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full h-12 justify-between font-normal"
                    disabled={submitting || consultantsLoading}
                  >
                    {selectedConsultant
                      ? selectedConsultant.name
                      : (consultantsLoading ? 'Loading consultants…' : 'Search consultants…')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                  <Command>
                    <CommandInput placeholder="Search consultants" />
                    <CommandList>
                      <CommandEmpty>No consultants found.</CommandEmpty>
                      <CommandGroup>
                        {consultants.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={c.name}
                            onSelect={() => {
                              setDraftField('referred_by_id', c.id);
                              setDraftField('referred_by_name', '');
                              setConsultantOpen(false);
                            }}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${
                                form.referred_by_id === c.id ? 'opacity-100' : 'opacity-0'
                              }`}
                            />
                            <span>{c.name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="referred_by_name">
                Or enter referrer name (if not in list)
              </Label>
              <Input
                id="referred_by_name"
                value={form.referred_by_name}
                onChange={(e) => {
                  setDraftField('referred_by_name', e.target.value);
                  if (e.target.value) setDraftField('referred_by_id', '');
                }}
                placeholder="e.g. Mr. Kumar"
                autoComplete="off"
                disabled={submitting || !!form.referred_by_id}
                className="h-12"
              />
              {errors.referred_by_name && (
                <p className="text-xs text-rose-600">{errors.referred_by_name}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="space-y-3">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full h-14 text-base"
        >
          {submitting && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
          {submitting ? 'Saving…' : 'Save Gate Entry'}
        </Button>
        {lastResult && (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 p-3 flex items-start gap-2 text-sm">
            {lastResult.action === 'merged' ? (
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            ) : (
              <Check className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
            )}
            <div>
              <p className="font-medium text-emerald-900 dark:text-emerald-200">
                {lastResult.action === 'merged'
                  ? `Returning visitor — ${lastName} was already registered`
                  : `Saved — ${lastName}`}
              </p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                Resetting for next entry…
              </p>
            </div>
            <Badge variant="outline" className="ml-auto shrink-0 text-xs">
              {captureCount + 1} today
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────
function SourceTypeButton({
  active, onClick, disabled, labelEn, labelTa, hint,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  labelEn: string;
  labelTa: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'rounded-md border-2 p-3 text-left transition-colors h-auto min-h-[80px]',
        active
          ? 'border-primary bg-primary/5'
          : 'border-input bg-background hover:bg-muted/50',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      <div className="font-semibold text-base">
        {labelEn}
        <span className="ml-1 font-normal text-sm text-muted-foreground">
          / {labelTa}
        </span>
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
    </button>
  );
}

function SelectGroup({ label, items }: { label: string; items: Program[] }) {
  return (
    <>
      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      {items.map((p) => (
        <SelectItem key={p.id} value={p.id}>
          {p.program_name}
        </SelectItem>
      ))}
    </>
  );
}
