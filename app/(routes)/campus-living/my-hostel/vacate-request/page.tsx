'use client';

// Student-initiated vacate request form — 3 steps:
// 1. Reason (type + text + requested date + medical notes if medical)
// 2. Documents (upload medical cert if reason=medical; other docs optional)
// 3. Review + Submit (creates draft if not yet, then calls submitDraft)

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { HostelAllocationService } from '@/lib/services/campus-living/hostel-allocation-service';
import { HostelResidentService } from '@/lib/services/campus-living/hostel-resident-service';
import { useVacateRequest, useCreateVacateDraft, useSubmitVacateDraft } from '@/hooks/campus-living/use-hostel-vacate';
import { DocumentUploader } from '../../vacate-requests/_components/document-uploader';
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import type { VacateReason } from '@/types/hostel-vacate';
import type { HostelResidentType } from '@/types/hostel-residents';

/**
 * navMeta — documents that this page is invoked via a button click on the
 * parent listing page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/campus-living/my-hostel',
} as const;

const REASON_OPTIONS: { value: VacateReason; label: string; needsMedical?: boolean }[] = [
  { value: 'medical', label: 'Medical grounds', needsMedical: true },
  { value: 'graduation', label: 'Graduation / course completion' },
  { value: 'withdrawal', label: 'Withdrawal from programme' },
  { value: 'transfer', label: 'Transfer to another institution' },
  { value: 'voluntary', label: 'Voluntary (personal reasons)' },
  { value: 'semester_end', label: 'Semester end' },
  { value: 'disciplinary', label: 'Disciplinary' },
];

export default function VacateRequestFormPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const userId = profile?.id ?? '';
  const institutionId = profile?.institution_id ?? '';

  // Active allocation lookup
  const { data: allocations, isLoading: allocLoading } = useQuery({
    queryKey: ['hostel-allocations', 'by-learner', userId],
    queryFn: () => HostelAllocationService.getAllocationByLearner(userId, true),
    enabled: !!userId,
  });
  const allocation = (allocations ?? [])[0] as any;

  // Resolve resident record (or treat as learner if none exists)
  const { data: existingResident } = useQuery({
    queryKey: ['hostel-residents', 'by-profile', institutionId, userId],
    queryFn: () => HostelResidentService.findByProfile(institutionId, userId),
    enabled: !!institutionId && !!userId,
  });

  const residentType: HostelResidentType = existingResident?.resident_type ?? 'learner';

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [reasonType, setReasonType] = useState<VacateReason | ''>('');
  const [reasonText, setReasonText] = useState('');
  const [requestedDate, setRequestedDate] = useState<string>(
    new Date().toISOString().split('T')[0]!
  );
  const [medicalNotes, setMedicalNotes] = useState('');

  const createMut = useCreateVacateDraft();
  const submitMut = useSubmitVacateDraft();

  const isMedical = reasonType === 'medical';
  const needsScheduling =
    reasonType === 'graduation' || reasonType === 'semester_end' || reasonType === 'transfer';

  // Load draft document list once the draft exists
  const { data: draftRequest, refetch: refetchDraft } = useVacateRequest(draftId ?? '');

  const step1Valid = !!reasonType && reasonText.trim().length >= 10 && requestedDate;
  const step2Valid = !isMedical || (draftRequest?.documents ?? []).some(
    (d) => d.document_type === 'medical_certificate'
  );

  async function handleStep1Next() {
    if (!step1Valid || !allocation || !profile) return;
    if (!draftId) {
      const created = await createMut.mutateAsync({
        payload: {
          institution_id: institutionId,
          allocation_id: allocation.id,
          resident_id: existingResident?.id ?? null,
          learner_id: residentType === 'learner' ? userId : null,
          resident_type: residentType,
          reason_type: reasonType as VacateReason,
          reason_text: reasonText,
          requested_vacate_date: requestedDate,
          is_permanent: reasonType !== 'semester_end',
          is_scheduled: needsScheduling,
          has_medical_grounds: isMedical,
          medical_notes: isMedical ? medicalNotes || null : null,
        },
        submittedById: profile.id,
      });
      setDraftId(created.id);
    }
    setStep(2);
  }

  async function handleSubmit() {
    if (!draftId || !profile) return;
    await submitMut.mutateAsync({ requestId: draftId, submitterId: profile.id });
    router.push(`/campus-living/vacate-requests/${draftId}`);
  }

  // Reload draft when step 2 shows to get fresh docs
  useEffect(() => {
    if (step === 2 && draftId) refetchDraft();
  }, [step, draftId, refetchDraft]);

  if (allocLoading) {
    return (
      <ContentLayout title='Request Vacate'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin text-primary' />
        </div>
      </ContentLayout>
    );
  }

  if (!allocation) {
    return (
      <ContentLayout title='Request Vacate'>
        <Card>
          <CardContent className='p-8 text-center space-y-3'>
            <p>You don't have an active hostel allocation to vacate.</p>
            <Button asChild variant='outline'>
              <Link href='/campus-living/my-hostel'>Back to My Hostel</Link>
            </Button>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Request Vacate'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'My Hostel', href: '/campus-living/my-hostel' },
          { label: 'Request Vacate' },
        ]}
      />

      <div className='space-y-6 mt-4 max-w-3xl'>
        <div className='flex items-center gap-3'>
          <Button asChild variant='ghost' size='icon'>
            <Link href='/campus-living/my-hostel'>
              <ArrowLeft className='h-4 w-4' />
            </Link>
          </Button>
          <div>
            <h1 className='text-2xl font-bold py-1'>Request Vacate</h1>
            <p className='text-sm text-muted-foreground'>
              Step {step} of 3
            </p>
          </div>
        </div>

        {/* Step indicator */}
        <div className='flex items-center gap-2'>
          {([1, 2, 3] as const).map((n) => (
            <div key={n} className='flex items-center gap-2'>
              <div
                className={
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ' +
                  (step > n
                    ? 'bg-green-600 text-white'
                    : step === n
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground')
                }
              >
                {step > n ? <Check className='h-4 w-4' /> : n}
              </div>
              {n < 3 && <div className='h-0.5 w-8 bg-border' />}
            </div>
          ))}
        </div>

        {/* Step 1: Reason */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Reason for Vacate</CardTitle>
              <CardDescription>Tell us why you want to vacate and when.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='space-y-2'>
                <Label htmlFor='reason'>
                  Reason type <span className='text-destructive'>*</span>
                </Label>
                <Select value={reasonType} onValueChange={(v) => setReasonType(v as VacateReason)}>
                  <SelectTrigger id='reason'>
                    <SelectValue placeholder='Pick a reason' />
                  </SelectTrigger>
                  <SelectContent>
                    {REASON_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-2'>
                <Label htmlFor='reason-text'>
                  Describe your reason <span className='text-destructive'>*</span>
                </Label>
                <Textarea
                  id='reason-text'
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  rows={4}
                  placeholder='Provide context (minimum 10 characters). Warden and chief warden will read this.'
                />
                <p className='text-xs text-muted-foreground'>{reasonText.length} / 1000 characters</p>
              </div>

              <div className='space-y-2'>
                <Label htmlFor='requested-date'>
                  Requested vacate date <span className='text-destructive'>*</span>
                </Label>
                <Input
                  id='requested-date'
                  type='date'
                  value={requestedDate}
                  onChange={(e) => setRequestedDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>

              {isMedical && (
                <div className='space-y-2'>
                  <Label htmlFor='medical-notes'>Medical notes (optional)</Label>
                  <Textarea
                    id='medical-notes'
                    value={medicalNotes}
                    onChange={(e) => setMedicalNotes(e.target.value)}
                    rows={3}
                    placeholder='Any additional context your warden or chief warden should know.'
                  />
                  <p className='text-xs text-amber-700'>
                    A <strong>medical certificate</strong> document is required in the next step.
                  </p>
                </div>
              )}

              <div className='flex justify-end gap-2'>
                <Button
                  onClick={handleStep1Next}
                  disabled={!step1Valid || createMut.isPending}
                >
                  {createMut.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                  Next: Documents
                  <ArrowRight className='ml-2 h-4 w-4' />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Documents */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Supporting Documents</CardTitle>
              <CardDescription>
                Upload up to 3 files (PDF / JPG / PNG, max 5 MB each).
                {isMedical && ' Medical certificate required.'}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              {draftId && (
                <DocumentUploader
                  vacateRequestId={draftId}
                  documents={draftRequest?.documents ?? []}
                  requireMedicalCert={isMedical}
                />
              )}
              <div className='flex justify-between gap-2'>
                <Button variant='outline' onClick={() => setStep(1)}>
                  <ArrowLeft className='mr-2 h-4 w-4' />
                  Back
                </Button>
                <Button onClick={() => setStep(3)} disabled={!step2Valid}>
                  Next: Review
                  <ArrowRight className='ml-2 h-4 w-4' />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Review + Submit */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Review & Submit</CardTitle>
              <CardDescription>
                After you submit, this request enters the approval chain. You can still cancel
                until the warden acts on it.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <ReviewRow label='Reason'>
                <Badge variant='outline' className='capitalize'>
                  {reasonType.replace(/_/g, ' ')}
                </Badge>
              </ReviewRow>
              <ReviewRow label='Description'>
                <p className='text-sm whitespace-pre-wrap'>{reasonText}</p>
              </ReviewRow>
              <ReviewRow label='Requested date'>{requestedDate}</ReviewRow>
              <ReviewRow label='Resident type'>
                <Badge variant='secondary' className='capitalize'>
                  {residentType}
                </Badge>
              </ReviewRow>
              <ReviewRow label='Documents'>
                <span className='text-sm'>
                  {(draftRequest?.documents ?? []).length} attached
                </span>
              </ReviewRow>
              {isMedical && medicalNotes && (
                <ReviewRow label='Medical notes'>
                  <p className='text-sm whitespace-pre-wrap'>{medicalNotes}</p>
                </ReviewRow>
              )}

              <div className='p-3 rounded-md bg-blue-50 border border-blue-200 text-xs space-y-1'>
                <p className='font-medium text-blue-900'>What happens after submit:</p>
                <ul className='list-disc list-inside text-blue-900 space-y-0.5'>
                  {residentType === 'learner' ? (
                    <li>Your parent receives an OTP SMS for consent.</li>
                  ) : (
                    <li>Request goes straight to warden (non-learner residents skip parent consent).</li>
                  )}
                  <li>Warden reviews and approves / rejects.</li>
                  <li>Chief warden gives final approval.</li>
                  <li>Hostel office marks dues clearance.</li>
                  <li>Your bed is marked <em>pending vacate</em> throughout this process.</li>
                </ul>
              </div>

              <div className='flex justify-between gap-2'>
                <Button variant='outline' onClick={() => setStep(2)}>
                  <ArrowLeft className='mr-2 h-4 w-4' />
                  Back
                </Button>
                <Button onClick={handleSubmit} disabled={submitMut.isPending}>
                  {submitMut.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                  Submit Request
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}

function ReviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='grid grid-cols-[120px_1fr] gap-3 items-start'>
      <span className='text-xs text-muted-foreground uppercase tracking-wide pt-1'>{label}</span>
      <div>{children}</div>
    </div>
  );
}
