'use client';
// ============================================================================
// REFERRAL PICKER
// ============================================================================
// One control for "who referred this person", shared by lead capture and the
// learner Reference Details editor.
//
// THE RULE IT ENCODES (and why it is asymmetric)
//   consultant → ALWAYS resolves to an education_consultants row. If the agency
//                is missing it is created here and selected immediately. A
//                consultant is never left as free text, because a name-only
//                consultant is invisible to the commission ledger — the exact
//                bug this control exists to prevent.
//   student     → link to learners_profiles if found, else a typed name.
//   faculty     → link to staff if found, else a typed name.
//   Staff and learners are owned by HR and Admissions; minting a record for
//   them from here would corrupt payroll/org data, so plain text is the honest
//   fallback and is what the schema expects (referred_by_id is nullable).
//
// referred_by_id is POLYMORPHIC and has NO foreign key — its target table is
// decided by referral_type. A wrong-table uuid writes silently with no 23503,
// so every code path here clears the id when the type changes.
// ============================================================================

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChevronsUpDown, Plus, Loader2 } from 'lucide-react';
import { useConsultantsForDropdown } from '@/hooks/admission/use-consultants';
import {
  useReferralInstitutions,
  useReferralDepartments,
  useReferralStudents,
  useReferralStaff,
} from '@/hooks/admission/use-referral-dropdowns-hierarchy';
import { ConsultantService } from '@/lib/services/admission/consultant-service';

export type ReferralPickerType = 'consultant' | 'student' | 'faculty';

export interface ReferralValue {
  referral_type: ReferralPickerType | null;
  referred_by_id: string | null;
  referred_by_name: string | null;
}

/** The Excel/UI label "Staff" stores `faculty` — the CHECK constraint on
 *  learners_profiles.referral_type accepts consultant|student|faculty|
 *  learner_ambassador and has no 'staff' value. */
const TYPE_OPTIONS: Array<{ value: ReferralPickerType; label: string }> = [
  { value: 'consultant', label: 'Consultant' },
  { value: 'student', label: 'Student' },
  { value: 'faculty', label: 'Staff / Faculty' },
];

const NONE = '__none__';

interface ReferralPickerProps {
  value: ReferralValue;
  onChange: (value: ReferralValue) => void;
  /** Seeds the referrer hierarchy filters; the operator can still browse away. */
  defaultInstitutionId?: string;
  disabled?: boolean;
}

export function ReferralPicker({
  value,
  onChange,
  defaultInstitutionId,
  disabled = false,
}: ReferralPickerProps) {
  const queryClient = useQueryClient();

  const [institutionId, setInstitutionId] = useState<string>(defaultInstitutionId ?? '');
  const [departmentId, setDepartmentId] = useState<string>('');

  const [consultantOpen, setConsultantOpen] = useState(false);
  const [referrerOpen, setReferrerOpen] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [creating, setCreating] = useState(false);

  const type = value.referral_type;
  const isPerson = type === 'student' || type === 'faculty';

  const { data: consultants = [] } = useConsultantsForDropdown();
  const { data: institutions = [] } = useReferralInstitutions();
  const { data: departments = [] } = useReferralDepartments(institutionId || undefined);
  const { data: students = [], isLoading: studentsLoading } = useReferralStudents(
    type === 'student' ? institutionId || undefined : undefined,
    departmentId || undefined
  );
  const { data: staff = [], isLoading: staffLoading } = useReferralStaff(
    type === 'faculty' ? institutionId || undefined : undefined,
    departmentId || undefined
  );

  const people = type === 'student' ? students : staff;
  const peopleLoading = type === 'student' ? studentsLoading : staffLoading;

  // Seed the hierarchy filter once the caller knows the institution.
  useEffect(() => {
    if (defaultInstitutionId && !institutionId) setInstitutionId(defaultInstitutionId);
  }, [defaultInstitutionId, institutionId]);

  const setType = (next: ReferralPickerType | null) => {
    // Always drop the id: it points at a different table now.
    onChange({ referral_type: next, referred_by_id: null, referred_by_name: null });
    setDepartmentId('');
  };

  const handleCreateConsultant = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error('Consultant name is required');
      return;
    }
    setCreating(true);
    try {
      const created = await ConsultantService.createConsultant({
        name,
        phone: newPhone.trim() || null,
        consultant_type: 'external',
      } as any);

      queryClient.setQueryData(['consultants-dropdown', 'all'], (old: any[] = []) => [
        ...old,
        { id: created.id, name: created.name, value: created.id, label: created.name },
      ]);
      queryClient.invalidateQueries({ queryKey: ['consultants-dropdown'] });

      onChange({
        referral_type: 'consultant',
        referred_by_id: created.id,
        referred_by_name: created.name,
      });
      setCreateOpen(false);
      setNewName('');
      setNewPhone('');
      toast.success(`Consultant "${created.name}" created and selected`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create consultant');
    } finally {
      setCreating(false);
    }
  };

  const selectedLabel =
    value.referred_by_name ||
    (type === 'consultant'
      ? consultants.find((c: any) => c.id === value.referred_by_id)?.name
      : people.find((p: any) => p.id === value.referred_by_id)?.name) ||
    '';

  return (
    <div className="space-y-4">
      {/* ── Referral type ─────────────────────────────────────────────── */}
      <div className="space-y-2">
        <Label>Referral Type</Label>
        <Select
          value={type ?? NONE}
          onValueChange={(v) => setType(v === NONE ? null : (v as ReferralPickerType))}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select referral type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>
              <span className="text-muted-foreground">— None / Direct —</span>
            </SelectItem>
            {TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Consultant: pick or create, never free text ───────────────── */}
      {type === 'consultant' && (
        <div className="space-y-2">
          <Label>Consultant</Label>
          <Popover open={consultantOpen} onOpenChange={setConsultantOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={consultantOpen}
                className="w-full justify-between font-normal"
                disabled={disabled}
              >
                <span className="truncate">
                  {selectedLabel || `Search & select consultant (${consultants.length})`}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput placeholder="Type to search consultants..." />
                <CommandList>
                  <CommandEmpty>
                    <button
                      type="button"
                      className="flex w-full items-center justify-center gap-1.5 px-2 py-3 text-sm font-medium text-primary hover:underline"
                      onClick={() => {
                        setConsultantOpen(false);
                        setCreateOpen(true);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Add this consultant
                    </button>
                  </CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="__add-new-consultant"
                      onSelect={() => {
                        setConsultantOpen(false);
                        setCreateOpen(true);
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4 text-primary" />
                      <span className="font-medium text-primary">Add new consultant</span>
                    </CommandItem>
                    {consultants.map((c: any) => (
                      <CommandItem
                        key={c.id}
                        value={c.name}
                        onSelect={() => {
                          onChange({
                            referral_type: 'consultant',
                            referred_by_id: c.id,
                            referred_by_name: c.name,
                          });
                          setConsultantOpen(false);
                        }}
                      >
                        {c.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* ── Student / Staff: institution → department → person ────────── */}
      {isPerson && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Institution</Label>
              <Select
                value={institutionId}
                onValueChange={(v) => {
                  setInstitutionId(v);
                  setDepartmentId('');
                  onChange({ ...value, referred_by_id: null });
                }}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select institution" />
                </SelectTrigger>
                <SelectContent>
                  {institutions.map((i: any) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>
                Department <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Select
                value={departmentId || NONE}
                onValueChange={(v) => {
                  setDepartmentId(v === NONE ? '' : v);
                  onChange({ ...value, referred_by_id: null });
                }}
                disabled={disabled || !institutionId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={institutionId ? 'All departments' : 'Select institution first'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>All departments</SelectItem>
                  {departments.map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{type === 'student' ? 'Student' : 'Staff member'}</Label>
            <Popover open={referrerOpen} onOpenChange={setReferrerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={referrerOpen}
                  className="w-full justify-between font-normal"
                  disabled={disabled || !institutionId || peopleLoading}
                >
                  <span className="truncate">
                    {!institutionId
                      ? 'Select institution first'
                      : peopleLoading
                      ? 'Loading...'
                      : value.referred_by_id
                      ? selectedLabel
                      : `Search & select (${people.length})`}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Type to search..." />
                  <CommandList>
                    <CommandEmpty>
                      No match — type the name below instead.
                    </CommandEmpty>
                    <CommandGroup>
                      {people.map((p: any) => (
                        <CommandItem
                          key={p.id}
                          value={p.name}
                          onSelect={() => {
                            onChange({
                              referral_type: type,
                              referred_by_id: p.id,
                              referred_by_name: p.name,
                            });
                            setReferrerOpen(false);
                          }}
                        >
                          {p.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Plain-text fallback — staff/students only. */}
          <div className="space-y-2 rounded-md border border-dashed p-3">
            <Label htmlFor="referral-manual-name">
              Not in the list?{' '}
              <span className="font-normal text-muted-foreground">
                Type the {type === 'student' ? 'student' : 'staff'} name
              </span>
            </Label>
            <Input
              id="referral-manual-name"
              placeholder="e.g. M.KRISHNAVENI / AP / Nursing"
              value={value.referred_by_id ? '' : value.referred_by_name ?? ''}
              onChange={(e) =>
                onChange({
                  referral_type: type,
                  referred_by_id: null,
                  referred_by_name: e.target.value || null,
                })
              }
              disabled={disabled || !!value.referred_by_id}
            />
            <p className="text-xs text-muted-foreground">
              {value.referred_by_id
                ? 'Clear the selection above to type a name instead.'
                : 'Saved as a name only — no linked record, so this referral will not appear in referrer reports.'}
            </p>
          </div>
        </>
      )}

      {/* ── Create consultant ─────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add new consultant</DialogTitle>
            <DialogDescription>
              Creates a record in the Consultants module and selects it here, so the
              referral is properly attributed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="new-consultant-name">
                Consultant / agency name<span className="ml-0.5 text-destructive">*</span>
              </Label>
              <Input
                id="new-consultant-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. SMET"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-consultant-phone">
                Phone <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="new-consultant-phone"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="10-digit mobile"
                inputMode="numeric"
              />
              <p className="text-xs text-muted-foreground">
                Recommended — the phone number is what tells two consultants with the
                same name apart later.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleCreateConsultant} disabled={creating || !newName.trim()}>
              {creating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create & select'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
