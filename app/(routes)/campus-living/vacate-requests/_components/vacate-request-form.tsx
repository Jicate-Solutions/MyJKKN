'use client';

// Vacate request form, shared by the two entry points:
//   - /campus-living/my-hostel/vacate-request            (learner, own allocation)
//   - /campus-living/vacate-requests/new?allocation=<id> (warden / hostel office on behalf)
//
// 3 steps: reason -> documents -> review + submit. Nothing here decides whether
// the request may be approved; the warden step re-checks bills and the checklist
// in the database. The bill summary on the review step is a heads-up for the
// requester only.

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
import {
  useVacateRequest,
  useCreateVacateDraft,
  useSubmitVacateDraft,
  useVacateBillStatus,
} from '@/hooks/campus-living/use-hostel-vacate';
import { DocumentUploader } from './document-uploader';
import { ArrowLeft, ArrowRight, Check, Loader2, AlertTriangle } from 'lucide-react';
import { VACATE_REASONS, VACATE_REASON_LABELS } from '@/types/hostel-vacate';
import type { VacateReason } from '@/types/hostel-vacate';

const formatInr = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`;
const todayIso = () => new Date().toISOString().split('T')[0]!;

interface VacateRequestFormProps {
  /** Set when raising on behalf of a resident; omitted = the signed-in learner's own allocation. */
  allocationId?: string;
  backHref: string;
  backLabel: string;
}

export function VacateRequestForm({ allocationId, backHref, backLabel }: VacateRequestFormProps) {
  const router = useRouter();
  const { profile } = useAuth();
  const userId = profile?.id ?? '';
  const onBehalf = !!allocationId;

  // hostel_allocations.learner_id is a profiles.id, so the signed-in user's own
  // allocation is looked up by profile.id.
  const { data: allocation, isLoading: allocLoading } = useQuery({
    queryKey: ['vacate-form-allocation', allocationId ?? `own:${userId}`],
    queryFn: async () => {
      if (allocationId) return HostelAllocationService.getAllocation(allocationId);
      const rows = await HostelAllocationService.getAllocationByLearner(userId, true);
      return (rows ?? [])[0] ?? null;
    },
    enabled: onBehalf || !!userId,
  });

  const residentName =
    ((allocation as { learner?: { full_name?: string | null } } | null)?.learner?.full_name) ?? null;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [reasonType, setReasonType] = useState<VacateReason | ''>('');
  const [reasonText, setReasonText] = useState('');
  const [requestedDate, setRequestedDate] = useState<string>(todayIso());
  const [medicalNotes, setMedicalNotes] = useState('');

  const createMut = useCreateVacateDraft();
  const submitMut = useSubmitVacateDraft();

  const isMedical = reasonType === 'medical';

  const { data: draftRequest, refetch: refetchDraft } = useVacateRequest(draftId ?? '');
  const { data: bills } = useVacateBillStatus(draftId ?? '', step === 3);

  const step1Valid = !!reasonType && reasonText.trim().length >= 10 && !!requestedDate;
  const step2Valid =
    !isMedical ||
    (draftRequest?.documents ?? []).some((d) => d.document_type === 'medical_certificate');

  async function handleStep1Next() {
    if (!step1Valid || !allocation) return;
    if (!draftId) {
      const created = await createMut.mutateAsync({
        allocation_id: (allocation as { id: string }).id,
        reason_type: reasonType as VacateReason,
        reason_text: reasonText,
        requested_vacate_date: requestedDate,
        medical_notes: isMedical ? medicalNotes || null : null,
      });
      setDraftId(created.id);
    }
    setStep(2);
  }

  async function handleSubmit() {
    if (!draftId) return;
    await submitMut.mutateAsync(draftId);
    router.push(`/campus-living/vacate-requests/${draftId}`);
  }

  useEffect(() => {
    if (step === 2 && draftId) refetchDraft();
  }, [step, draftId, refetchDraft]);

  const title = onBehalf ? 'Raise Vacate Request' : 'Request Vacate';

  if (allocLoading) {
    return (
      <ContentLayout title={title}>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin text-primary' />
        </div>
      </ContentLayout>
    );
  }

  if (!allocation || (allocation as { status?: string }).status !== 'active') {
    return (
      <ContentLayout title={title}>
        <Card>
          <CardContent className='p-8 text-center space-y-3'>
            <p>
              {onBehalf
                ? 'This allocation is not active, so it cannot be vacated.'
                : "You don't have an active hostel allocation to vacate."}
            </p>
            <Button asChild variant='outline'>
              <Link href={backHref}>{backLabel}</Link>
            </Button>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={title}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: backLabel, href: backHref },
          { label: title },
        ]}
      />

      <div className='space-y-6 mt-4 max-w-3xl'>
        <div className='flex items-center gap-3'>
          <Button asChild variant='ghost' size='icon'>
            <Link href={backHref}>
              <ArrowLeft className='h-4 w-4' />
            </Link>
          </Button>
          <div>
            <h1 className='text-2xl font-bold py-1'>{title}</h1>
            <p className='text-sm text-muted-foreground'>
              Step {step} of 3{onBehalf && residentName ? ` · for ${residentName}` : ''}
            </p>
          </div>
        </div>

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

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Reason for Vacate</CardTitle>
              <CardDescription>Why the hostel is being vacated, and from when.</CardDescription>
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
                    {VACATE_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {VACATE_REASON_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-2'>
                <Label htmlFor='reason-text'>
                  Describe the reason <span className='text-destructive'>*</span>
                </Label>
                <Textarea
                  id='reason-text'
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value.slice(0, 1000))}
                  rows={4}
                  placeholder='Provide context (minimum 10 characters). The warden will read this.'
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
                  min={todayIso()}
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
                    placeholder='Anything else the warden should know.'
                  />
                  <p className='text-xs text-amber-700'>
                    A <strong>medical certificate</strong> is required in the next step.
                  </p>
                </div>
              )}

              <div className='flex justify-end gap-2'>
                <Button onClick={handleStep1Next} disabled={!step1Valid || createMut.isPending}>
                  {createMut.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                  Next: Documents
                  <ArrowRight className='ml-2 h-4 w-4' />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Supporting Documents</CardTitle>
              <CardDescription>
                Up to 3 files (PDF / JPG / PNG, max 5 MB each).
                {isMedical ? ' Medical certificate required.' : ' Optional.'}
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

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Review & Submit</CardTitle>
              <CardDescription>
                Once submitted, the warden reviews the hostel bills and the clearance checklist. You can
                cancel until the warden acts on it.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <ReviewRow label='Reason'>
                <Badge variant='outline'>{reasonType ? VACATE_REASON_LABELS[reasonType] : ''}</Badge>
              </ReviewRow>
              <ReviewRow label='Description'>
                <p className='text-sm whitespace-pre-wrap'>{reasonText}</p>
              </ReviewRow>
              <ReviewRow label='Requested date'>{requestedDate}</ReviewRow>
              <ReviewRow label='Documents'>
                <span className='text-sm'>{(draftRequest?.documents ?? []).length} attached</span>
              </ReviewRow>
              {isMedical && medicalNotes && (
                <ReviewRow label='Medical notes'>
                  <p className='text-sm whitespace-pre-wrap'>{medicalNotes}</p>
                </ReviewRow>
              )}

              {bills && bills.total_outstanding > 0 ? (
                <div className='p-3 rounded-md bg-amber-50 border border-amber-200 text-xs space-y-1'>
                  <p className='font-medium text-amber-900 flex items-center gap-1'>
                    <AlertTriangle className='h-3.5 w-3.5' />
                    {formatInr(bills.total_outstanding)} unpaid across {bills.unpaid_count} hostel / mess
                    bill(s)
                  </p>
                  <p className='text-amber-900'>
                    The warden cannot approve this request until every hostel and mess bill is paid.
                    Clear them with the accounts office.
                  </p>
                </div>
              ) : (
                <div className='p-3 rounded-md bg-blue-50 border border-blue-200 text-xs space-y-1'>
                  <p className='font-medium text-blue-900'>What happens after submit:</p>
                  <ul className='list-disc list-inside text-blue-900 space-y-0.5'>
                    <li>The warden checks that all hostel and mess bills are cleared.</li>
                    <li>The warden ticks the clearance checklist.</li>
                    <li>On approval the bed is released and you are moved to Day Scholar.</li>
                    <li>
                      The bed is marked <em>pending vacate</em> until then.
                    </li>
                  </ul>
                </div>
              )}

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
