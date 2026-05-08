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
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useFormDraftObject } from '@/hooks/use-form-draft';
import { useConsultantsForDropdown } from '@/hooks/admission/use-consultants';
import {
  useReferralInstitutions,
  useReferralDepartments,
  useReferralStudents,
  useReferralStaff,
} from '@/hooks/admission/use-referral-dropdowns-hierarchy';
import { LeadService } from '@/lib/services/admission/lead-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import type {
  GateEntryInput,
  GateEntryResult,
  ReferralType,
} from '@/types/admission';
import type { Program } from '@/types/organizations';

// ─── Form shape ───────────────────────────────────────────────────────────
interface FormData {
  first_name: string;
  last_name: string;
  phone: string;
  program_id: string; // '' or 'undecided' or actual UUID
  source: 'walk_in' | 'referral';
  // Referral sub-type. Empty when source='walk_in' or before user picks.
  // Mirrors the leads/new form so gate guards see the same UX as the
  // admission desk operators.
  referral_type: '' | ReferralType; // 'consultant' | 'student' | 'faculty'
  referred_by_id: string;     // referrer uuid (consultant / student / staff)
  referred_by_name: string;   // free-text fallback
}

const INITIAL_FORM: FormData = {
  first_name: '',
  last_name: '',
  phone: '',
  program_id: '',
  source: 'walk_in',
  referral_type: '',
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
  const { isSuperAdmin, isAdmissionGlobalUser } = usePermissions();
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();

  // Institution selection — mirrors /admission/leads/new (2026-05-07).
  // Gate security has institution_scope='own' (single institution auto-locked),
  // but super_admin / admission global / cross-institution staff may capture
  // entries on behalf of another campus, so we need a real dropdown.
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('');

  // Auto-fill institution: scoped users get their own; users with exactly one
  // accessible institution get it auto-picked; super_admin / global must pick.
  useEffect(() => {
    if (!isSuperAdmin && !isAdmissionGlobalUser && profile?.institution_id) {
      setSelectedInstitutionId(profile.institution_id);
    } else if (institutions.length === 1) {
      setSelectedInstitutionId(institutions[0].id);
    }
  }, [profile?.institution_id, isSuperAdmin, isAdmissionGlobalUser, institutions]);

  const institutionId = selectedInstitutionId;
  const institutionName = useMemo(
    () => institutions.find((i) => i.id === institutionId)?.name ?? '—',
    [institutions, institutionId],
  );
  const canSelectInstitution =
    isSuperAdmin || isAdmissionGlobalUser || institutions.length > 1;

  // Draft state — survives accidental tab close / refresh
  const draftKey = `gate-entry-draft:${profile?.id ?? 'anon'}:${institutionId}`;
  const {
    values: form,
    setValue: setDraftField,
    clearDraft,
  } = useFormDraftObject<FormData>(draftKey, INITIAL_FORM);

  // Programmes for the picker — depend on institution
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programsLoading, setProgramsLoading] = useState(false);
  useEffect(() => {
    // Clear stale program selection when the institution changes — otherwise
    // a super_admin switching institutions could submit a program_id from the
    // previous campus, which the capture RPC would reject.
    setDraftField('program_id', '');
    if (!institutionId) {
      setPrograms([]);
      return;
    }
    let cancelled = false;
    setProgramsLoading(true);
    ProgramService.getPrograms({ institution_id: institutionId, isActive: true })
      .then(({ data }) => { if (!cancelled) setPrograms(data ?? []); })
      .catch(() => { if (!cancelled) setPrograms([]); })
      .finally(() => { if (!cancelled) setProgramsLoading(false); });
    return () => { cancelled = true; };
  }, [institutionId, setDraftField]);

  // Consultants for the referral picker — fetched globally, NOT scoped to
  // the gate's institution. Reason: education_consultants are group-level
  // entities that refer students to any campus; the consultant_institutions
  // junction is only sparsely populated (1 / 28 rows in production as of
  // 2026-05-07). Passing an institution_id forces an `!inner` join that
  // silently excludes the 27 consultants without a junction row, leaving
  // the picker empty. Mirrors the /admission/leads/new pattern.
  const { data: consultants = [], isLoading: consultantsLoading } =
    useConsultantsForDropdown();
  const [consultantOpen, setConsultantOpen] = useState(false);
  const selectedConsultant = useMemo(
    () => consultants.find((c) => c.id === form.referred_by_id),
    [consultants, form.referred_by_id],
  );

  // Referrer hierarchy for student/faculty types — mirrors the leads/new form.
  // INDEPENDENT of the lead's institution: a student at Institution A may
  // refer a walk-in for Institution B, so the picker browses all institutions.
  const [referrerInstitutionId, setReferrerInstitutionId] = useState<string>('');
  const [referrerDepartmentId, setReferrerDepartmentId] = useState<string>('');
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [facultyPickerOpen, setFacultyPickerOpen] = useState(false);

  // Seed referrer institution from the lead institution the first time the
  // user picks a student/faculty referral type. They can still change it.
  useEffect(() => {
    if (
      (form.referral_type === 'student' || form.referral_type === 'faculty') &&
      !referrerInstitutionId &&
      institutionId
    ) {
      setReferrerInstitutionId(institutionId);
    }
  }, [form.referral_type, referrerInstitutionId, institutionId]);

  const { data: referrerInstitutions = [], isLoading: referrerInstitutionsLoading } =
    useReferralInstitutions();
  const { data: referrerDepartments = [], isLoading: referrerDepartmentsLoading } =
    useReferralDepartments(referrerInstitutionId || undefined);
  const { data: studentsDropdown = [], isLoading: studentsLoading } = useReferralStudents(
    referrerInstitutionId || undefined,
    referrerDepartmentId || undefined,
  );
  const { data: facultyDropdown = [], isLoading: facultyLoading } = useReferralStaff(
    referrerInstitutionId || undefined,
    referrerDepartmentId || undefined,
  );

  // Display name for whichever referrer type is active — used by submit and
  // the picker's "selected" label.
  const selectedReferrerName = useMemo(() => {
    if (form.referral_type === 'consultant') return selectedConsultant?.name ?? '';
    if (form.referral_type === 'student') {
      return studentsDropdown.find((s) => s.id === form.referred_by_id)?.name ?? '';
    }
    if (form.referral_type === 'faculty') {
      return facultyDropdown.find((f) => f.id === form.referred_by_id)?.name ?? '';
    }
    return '';
  }, [form.referral_type, form.referred_by_id, selectedConsultant, studentsDropdown, facultyDropdown]);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  // Errors keyed by form-field OR top-level surface (e.g. 'institution').
  const [errors, setErrors] = useState<Record<string, string>>({});
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
    const e: Record<string, string> = {};
    if (!form.first_name.trim()) e.first_name = 'First name is required';
    const phoneStripped = form.phone.replace(/[\s\-()]/g, '');
    if (!phoneStripped) e.phone = 'Phone is required';
    else if (!PHONE_REGEX.test(phoneStripped))
      e.phone = 'Enter a valid 10-digit Indian mobile number';
    if (!institutionId) e.institution = 'Institution is required';
    if (form.source === 'referral') {
      if (!form.referral_type) {
        e.referral_type = 'Select a referral type';
      } else if (!form.referred_by_id && !form.referred_by_name.trim()) {
        e.referred_by_name =
          form.referral_type === 'consultant'
            ? 'Pick a consultant or enter the referrer name'
            : form.referral_type === 'student'
            ? 'Pick a student or enter the referrer name'
            : 'Pick a faculty member or enter the referrer name';
      }
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
        // Persist the user-chosen referral_type when a referrer was identified
        // (either via picker or free-text); null otherwise so the RPC stores
        // an unattributed referral instead of mislabelling it as 'consultant'.
        referral_type:     form.source === 'referral' && form.referral_type
                             ? form.referral_type
                             : null,
        referred_by_id:    form.source === 'referral' ? form.referred_by_id || null : null,
        referred_by_name:  form.source === 'referral'
                             ? (selectedReferrerName || form.referred_by_name.trim() || null)
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

      // Reset the form synchronously so the gate guard sees an empty form
      // immediately and can start typing the next visitor's name. The green
      // "Saved" badge stays on screen and fades on its own after 1.5s — UX
      // and form-state are decoupled now (previously a single setTimeout
      // delayed both, which meant the form appeared "stuck" on the prior
      // entry's data for 1.5s).
      //
      // Only clearDraft() is needed — it sets values back to INITIAL_FORM
      // AND wipes sessionStorage. The redundant setDraftValues(INITIAL_FORM)
      // that used to live here was a no-op once the hook's reset ran.
      clearDraft();
      setErrors({});
      setReferrerInstitutionId('');
      setReferrerDepartmentId('');
      setCaptureCount((c) => c + 1);

      // Fade the success badge after a beat so it doesn't linger forever.
      setTimeout(() => {
        setLastResult(null);
        setLastName('');
      }, 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to log gate entry';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }, [form, institutionId, selectedConsultant, validate, clearDraft]);

  // Group programmes by degree.degree_name for nicer rendering
  const programsByDegree = useMemo(() => {
    const map = new Map<string, Program[]>();
    for (const p of programs) {
      const k = p.degree?.degree_name ?? 'Other';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    return map;
  }, [programs]);

  return (
    <div className="mx-auto space-y-6 px-4 sm:px-0">
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

        {/* Institution — selectable for super_admin / global; locked for own-scope */}
        <div className="space-y-1.5">
          <Label htmlFor="institution_id">
            Institution <span className="text-rose-500">*</span>
            <span className="text-xs text-muted-foreground ml-1">/ கல்வி நிறுவனம்</span>
          </Label>
          {canSelectInstitution ? (
            <Select
              value={selectedInstitutionId}
              onValueChange={(v) => {
                setSelectedInstitutionId(v);
                if (errors.institution) {
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.institution;
                    return next;
                  });
                }
              }}
              disabled={submitting || institutionsLoading}
            >
              <SelectTrigger
                id="institution_id"
                className={`h-12 ${errors.institution ? 'border-rose-500' : ''}`}
              >
                <SelectValue placeholder={institutionsLoading ? 'Loading…' : 'Select institution'} />
              </SelectTrigger>
              <SelectContent>
                {institutions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={institutionsLoading ? 'Loading…' : institutionName}
              disabled
              className="h-12 bg-muted/50"
            />
          )}
          {errors.institution && (
            <p className="text-xs text-rose-600">{errors.institution}</p>
          )}
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
            disabled={submitting || programsLoading || !institutionId}
          >
            <SelectTrigger id="program_id" className="h-12">
              <SelectValue
                placeholder={
                  !institutionId
                    ? 'Select an institution first'
                    : programsLoading
                    ? 'Loading…'
                    : 'Pick a programme'
                }
              />
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

        {/* Conditional referral block — mirrors /admission/leads/new:
            Step 1: Referral Type (consultant / student / faculty)
            Step 2: type-specific picker
              · consultant   → flat searchable list scoped to the institution
              · student/faculty → institution → department → person cascade
            Plus a free-text fallback for referrers not in any list. */}
        {form.source === 'referral' && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="referral_type">
                Referral type
                <span className="text-xs text-muted-foreground ml-1">/ வகை</span>
              </Label>
              <Select
                value={form.referral_type || ''}
                onValueChange={(value) => {
                  setDraftField('referral_type', value as ReferralType);
                  // Picking a different type invalidates the previously picked
                  // referrer — wipe it so the user has to choose again.
                  setDraftField('referred_by_id', '');
                  setDraftField('referred_by_name', '');
                }}
                disabled={submitting}
              >
                <SelectTrigger id="referral_type" className="h-12">
                  <SelectValue placeholder="Select referral type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="consultant">Consultant</SelectItem>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="faculty">Faculty</SelectItem>
                </SelectContent>
              </Select>
              {errors.referral_type && (
                <p className="text-xs text-rose-600">{errors.referral_type}</p>
              )}
            </div>

            {/* Consultant searchable picker */}
            {form.referral_type === 'consultant' && (
              <div className="space-y-1.5">
                <Label>
                  Select consultant
                  <span className="text-xs text-muted-foreground ml-1">/ ஆலோசகர்</span>
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
            )}

            {/* Hierarchy filters for student / faculty referrer */}
            {(form.referral_type === 'student' || form.referral_type === 'faculty') && (
              <>
                <div className="space-y-1.5">
                  <Label>Referrer institution</Label>
                  <Select
                    value={referrerInstitutionId}
                    onValueChange={(value) => {
                      setReferrerInstitutionId(value);
                      setReferrerDepartmentId('');
                      setDraftField('referred_by_id', '');
                    }}
                    disabled={submitting || referrerInstitutionsLoading}
                  >
                    <SelectTrigger className="h-12">
                      <SelectValue
                        placeholder={
                          referrerInstitutionsLoading
                            ? 'Loading institutions…'
                            : 'Select institution'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {referrerInstitutions.map((inst) => (
                        <SelectItem key={inst.id} value={inst.id}>
                          {inst.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>
                    Department <span className="text-xs text-muted-foreground">(optional)</span>
                  </Label>
                  <Select
                    value={referrerDepartmentId || '_all'}
                    onValueChange={(value) => {
                      setReferrerDepartmentId(value === '_all' ? '' : value);
                      setDraftField('referred_by_id', '');
                    }}
                    disabled={
                      submitting || !referrerInstitutionId || referrerDepartmentsLoading
                    }
                  >
                    <SelectTrigger className="h-12">
                      <SelectValue
                        placeholder={
                          !referrerInstitutionId
                            ? 'Select institution first'
                            : referrerDepartmentsLoading
                            ? 'Loading departments…'
                            : 'All departments'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">All departments</SelectItem>
                      {referrerDepartments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* Student searchable picker */}
            {form.referral_type === 'student' && (
              <div className="space-y-1.5">
                <Label>
                  Select student
                  <span className="text-xs text-muted-foreground ml-1">/ மாணவர்</span>
                </Label>
                <Popover open={studentPickerOpen} onOpenChange={setStudentPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full h-12 justify-between font-normal"
                      disabled={submitting || !referrerInstitutionId || studentsLoading}
                    >
                      {!referrerInstitutionId
                        ? 'Select institution first'
                        : studentsLoading
                        ? 'Loading students…'
                        : form.referred_by_id && selectedReferrerName
                        ? selectedReferrerName
                        : 'Search students…'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                    <Command>
                      <CommandInput placeholder="Search students" />
                      <CommandList>
                        <CommandEmpty>
                          {studentsLoading ? 'Loading…' : 'No students found.'}
                        </CommandEmpty>
                        <CommandGroup>
                          {studentsDropdown.map((s) => (
                            <CommandItem
                              key={s.id}
                              value={s.name}
                              onSelect={() => {
                                setDraftField('referred_by_id', s.id);
                                setDraftField('referred_by_name', '');
                                setStudentPickerOpen(false);
                              }}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${
                                  form.referred_by_id === s.id ? 'opacity-100' : 'opacity-0'
                                }`}
                              />
                              <span>{s.name}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {/* Faculty searchable picker */}
            {form.referral_type === 'faculty' && (
              <div className="space-y-1.5">
                <Label>
                  Select faculty
                  <span className="text-xs text-muted-foreground ml-1">/ ஆசிரியர்</span>
                </Label>
                <Popover open={facultyPickerOpen} onOpenChange={setFacultyPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full h-12 justify-between font-normal"
                      disabled={submitting || !referrerInstitutionId || facultyLoading}
                    >
                      {!referrerInstitutionId
                        ? 'Select institution first'
                        : facultyLoading
                        ? 'Loading staff…'
                        : form.referred_by_id && selectedReferrerName
                        ? selectedReferrerName
                        : 'Search faculty…'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                    <Command>
                      <CommandInput placeholder="Search faculty" />
                      <CommandList>
                        <CommandEmpty>
                          {facultyLoading ? 'Loading…' : 'No staff found.'}
                        </CommandEmpty>
                        <CommandGroup>
                          {facultyDropdown.map((f) => (
                            <CommandItem
                              key={f.id}
                              value={f.name}
                              onSelect={() => {
                                setDraftField('referred_by_id', f.id);
                                setDraftField('referred_by_name', '');
                                setFacultyPickerOpen(false);
                              }}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${
                                  form.referred_by_id === f.id ? 'opacity-100' : 'opacity-0'
                                }`}
                              />
                              <span>{f.name}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {/* Free-text fallback — visible only after a type is picked, so
                guards aren't asked to type a name before they know what kind
                of referrer it is. Disabled if a list pick is already locked
                in (mirrors the leads/new constraint). */}
            {form.referral_type && (
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
            )}
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
