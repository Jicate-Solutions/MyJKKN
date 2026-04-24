'use client';

// Edit drawer for the Learners tab on /campus-living/residents.
//
// Scope: the 5 hostel fields on the side-table `learner_hostel_profiles`
// + the `hostel_type` column on `learners_profiles`. NOT admission fields,
// NOT personal details — those are owned by admission/academics and shown
// here as read-only context only.
//
// See specs/warden-edit-hostel-fields-spec.md for the full contract.
//
// Coordination with parallel agents:
//   - Agent A' ships the `learner_hostel_profiles` migration. Until that
//     PR lands, Save will error with a PostgreSQL "relation not found"
//     message and the toast will surface it. That's the agreed interim.

import { useEffect, useMemo, useState } from 'react';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useAuth } from '@/hooks/use-auth';
import {
  useLearnerHostelProfile,
  useSaveLearnerHostelFields,
} from '@/hooks/campus-living/use-learner-hostel-profile';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type {
  LearnerHostelite,
  LearnerHostelType,
} from '@/types/campus-living';

interface Props {
  learner: LearnerHostelite | null;
  onClose: () => void;
}

// Sentinel used by the hostel_type Select because Radix Select refuses
// empty-string values. '__none__' maps to null on save.
const HOSTEL_TYPE_NONE = '__none__';

interface FormState {
  hostel_type: LearnerHostelType;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relation: string;
  medical_notes: string;
  parent_phone: string;
}

function emptyForm(): FormState {
  return {
    hostel_type: null,
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relation: '',
    medical_notes: '',
    parent_phone: '',
  };
}

function fullName(l: LearnerHostelite): string {
  const parts = [l.first_name, l.last_name].filter(Boolean).map((s) => s!.trim());
  return parts.join(' ') || '(unnamed)';
}

// Strip non-digits for phone validation. We keep the formatted value in
// state while the user is typing, but validate against the stripped form.
function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function isValidPhone(value: string): boolean {
  if (!value.trim()) return true; // optional
  return digitsOnly(value).length === 10;
}

export function EditHosteliteDrawer({ learner, onClose }: Props) {
  const open = !!learner;
  const { profile } = useAuth();
  const { institutions } = useInstitutionsWithAccess();

  const {
    data: hostelProfile,
    isLoading: loadingProfile,
  } = useLearnerHostelProfile(learner?.id, { enabled: open });
  const saveMut = useSaveLearnerHostelFields();

  const [form, setForm] = useState<FormState>(emptyForm());

  // Reset + hydrate form whenever a new learner is selected OR the profile
  // row arrives from the query. We re-seed on every open so stale state
  // from a previous learner never leaks across.
  useEffect(() => {
    if (!learner) {
      setForm(emptyForm());
      return;
    }
    setForm({
      hostel_type: learner.hostel_type ?? null,
      emergency_contact_name: hostelProfile?.hostel_emergency_contact_name ?? '',
      emergency_contact_phone: hostelProfile?.hostel_emergency_contact_phone ?? '',
      emergency_contact_relation:
        hostelProfile?.hostel_emergency_contact_relation ?? '',
      medical_notes: hostelProfile?.hostel_medical_notes ?? '',
      parent_phone: hostelProfile?.hostel_parent_phone ?? '',
    });
  }, [learner, hostelProfile]);

  const institutionName = useMemo(() => {
    if (!learner) return '—';
    const match = institutions.find(
      (i: { id: string; name: string }) => i.id === learner.institution_id,
    );
    return match?.name ?? '—';
  }, [institutions, learner]);

  function handleOpenChange(next: boolean) {
    if (!next && !saveMut.isPending) onClose();
  }

  async function handleSave() {
    if (!learner) return;

    // Phone validations — toast and bail before hitting the service.
    if (!isValidPhone(form.emergency_contact_phone)) {
      toast.error('Emergency contact phone must be 10 digits.');
      return;
    }
    if (!isValidPhone(form.parent_phone)) {
      toast.error('Parent phone must be 10 digits.');
      return;
    }

    try {
      await saveMut.mutateAsync({
        learnerId: learner.id,
        hostelType: form.hostel_type,
        profileFields: {
          hostel_emergency_contact_name: form.emergency_contact_name,
          // Stripped of non-digits — DB stores digits only.
          hostel_emergency_contact_phone: form.emergency_contact_phone
            ? digitsOnly(form.emergency_contact_phone)
            : null,
          hostel_emergency_contact_relation: form.emergency_contact_relation,
          hostel_medical_notes: form.medical_notes,
          hostel_parent_phone: form.parent_phone
            ? digitsOnly(form.parent_phone)
            : null,
        },
        updatedBy: profile?.id ?? null,
      });
      onClose();
    } catch {
      // Toast is surfaced by the mutation hook; leave drawer open.
    }
  }

  // Select value sentinel mapping — hostel_type null/'' → __none__ for Radix.
  const selectValue =
    !form.hostel_type || form.hostel_type === '' ? HOSTEL_TYPE_NONE : form.hostel_type;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className='w-full sm:max-w-xl overflow-y-auto'>
        <SheetHeader>
          <SheetTitle>Edit hostel details</SheetTitle>
          <SheetDescription>
            Warden-scoped edits. Personal, academic, and admission details remain
            read-only here — they&apos;re owned by their respective modules.
          </SheetDescription>
        </SheetHeader>

        {learner && (
          <div className='mt-6 space-y-6'>
            {/* ── Read-only context ─────────────────────────────────────── */}
            <section className='rounded-md border bg-muted/30 p-4'>
              <div className='mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                Learner
              </div>
              <dl className='grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2'>
                <div>
                  <dt className='text-xs text-muted-foreground'>Full name</dt>
                  <dd className='font-medium'>{fullName(learner)}</dd>
                </div>
                <div>
                  <dt className='text-xs text-muted-foreground'>Roll number</dt>
                  <dd className='font-mono text-xs'>{learner.roll_number ?? '—'}</dd>
                </div>
                <div className='sm:col-span-2'>
                  <dt className='text-xs text-muted-foreground'>Email</dt>
                  <dd className='text-xs'>
                    {learner.student_email ?? learner.college_email ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className='text-xs text-muted-foreground'>Institution</dt>
                  <dd className='text-xs'>{institutionName}</dd>
                </div>
                <div>
                  <dt className='text-xs text-muted-foreground'>Gender</dt>
                  <dd className='text-xs capitalize'>
                    {learner.gender?.toLowerCase() ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className='text-xs text-muted-foreground'>Accommodation</dt>
                  <dd>
                    <Badge variant='outline' className='text-xs'>
                      {learner.accommodation_type ?? 'Not set'}
                    </Badge>
                  </dd>
                </div>
              </dl>
            </section>

            {/* ── Editable fields ───────────────────────────────────────── */}
            <section className='space-y-4'>
              <div className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                Hostel fields
              </div>

              <div className='space-y-2'>
                <Label htmlFor='ehd-hostel-type'>Hostel type</Label>
                <Select
                  value={selectValue}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      hostel_type:
                        v === HOSTEL_TYPE_NONE ? null : (v as LearnerHostelType),
                    }))
                  }
                  disabled={saveMut.isPending}
                >
                  <SelectTrigger id='ehd-hostel-type'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={HOSTEL_TYPE_NONE}>Not set</SelectItem>
                    <SelectItem value='AC HOSTEL'>AC HOSTEL</SelectItem>
                    <SelectItem value='NON-AC HOSTEL'>NON-AC HOSTEL</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
                <div className='space-y-2'>
                  <Label htmlFor='ehd-ec-name'>Emergency contact name</Label>
                  <Input
                    id='ehd-ec-name'
                    value={form.emergency_contact_name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, emergency_contact_name: e.target.value }))
                    }
                    placeholder='Optional'
                    disabled={saveMut.isPending}
                    maxLength={120}
                  />
                </div>

                <div className='space-y-2'>
                  <Label htmlFor='ehd-ec-relation'>Relationship</Label>
                  <Input
                    id='ehd-ec-relation'
                    value={form.emergency_contact_relation}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        emergency_contact_relation: e.target.value,
                      }))
                    }
                    placeholder='e.g. father, local guardian'
                    disabled={saveMut.isPending}
                    maxLength={60}
                  />
                </div>

                <div className='space-y-2'>
                  <Label htmlFor='ehd-ec-phone'>Emergency contact phone</Label>
                  <Input
                    id='ehd-ec-phone'
                    value={form.emergency_contact_phone}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        emergency_contact_phone: e.target.value,
                      }))
                    }
                    placeholder='10 digits'
                    inputMode='tel'
                    disabled={saveMut.isPending}
                    maxLength={15}
                  />
                </div>

                <div className='space-y-2'>
                  <Label htmlFor='ehd-parent-phone'>Parent phone (hostel)</Label>
                  <Input
                    id='ehd-parent-phone'
                    value={form.parent_phone}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, parent_phone: e.target.value }))
                    }
                    placeholder='10 digits'
                    inputMode='tel'
                    disabled={saveMut.isPending}
                    maxLength={15}
                  />
                  <p className='text-[11px] text-muted-foreground'>
                    The number the warden actually calls — may differ from admission&apos;s
                    record.
                  </p>
                </div>
              </div>

              <div className='space-y-2'>
                <Label htmlFor='ehd-medical'>Medical notes</Label>
                <Textarea
                  id='ehd-medical'
                  value={form.medical_notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, medical_notes: e.target.value }))
                  }
                  placeholder='Allergies, chronic conditions, dietary restrictions, inhaler location…'
                  rows={4}
                  disabled={saveMut.isPending}
                  maxLength={2000}
                />
              </div>

              {loadingProfile && (
                <p className='flex items-center gap-2 text-xs text-muted-foreground'>
                  <Loader2 className='h-3 w-3 animate-spin' />
                  Loading saved values…
                </p>
              )}
            </section>
          </div>
        )}

        <SheetFooter className='mt-6 gap-2 sm:gap-2'>
          <Button
            variant='outline'
            onClick={onClose}
            disabled={saveMut.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saveMut.isPending || !learner}>
            {saveMut.isPending && (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            )}
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
